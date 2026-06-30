#!/usr/bin/env node
/**
 * UI wiring QA — gates visible on wizard open, AI buttons, Google Readiness, Strategy Room.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const URL = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'ui-wiring-phase');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), commit: HEAD, stagingUrl: URL.split('&t=')[0], checks: {}, pass: 0, fail: 0 };

function add(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1; else report.fail += 1;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() =>
      window.BusinessStrategyWizard && window.AiStrategyRoom && window.GooglePageQualityStandard &&
      window.GooglePageQualityStandard.mountPanel && window.StrategicBriefing && window.AiConsultant,
      { timeout: 90000 });

    await page.evaluate(() => goScreen('screen-hub'));
    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    const panelsOnOpen = await page.evaluate(() => {
      var exported = document.getElementById('exported');
      var roots = [
        'business-summary-approval-root', 'strategic-briefing-root', 'materials-gate-root',
        'seo-strategy-root', 'pre-build-report-root', 'google-readiness-root', 'ai-strategy-room-root',
      ];
      var visible = exported && exported.style.display !== 'none';
      var mounted = roots.every(function (id) {
        var el = document.getElementById(id);
        return el && el.innerHTML && el.innerHTML.trim().length > 20;
      });
      return { visible: visible, mounted: mounted, exportedDisplay: exported ? exported.style.display : null };
    });
    add('exported_visible_on_open', panelsOnOpen.visible, panelsOnOpen.exportedDisplay);
    add('all_gate_panels_mounted', panelsOnOpen.mounted, JSON.stringify(panelsOnOpen));

    const aiBtnBriefing = await page.evaluate(() => {
      var root = document.getElementById('strategic-briefing-root');
      return !!(root && root.querySelector('#ac-btn-briefing'));
    });
    add('ai_button_in_briefing', aiBtnBriefing, 'ac-btn-briefing');

    const aiButtonsAll = await page.evaluate(() => {
      var ids = ['ac-btn-briefing', 'ac-btn-materials', 'ac-btn-seo', 'ac-btn-report', 'ac-btn-google-readiness', 'ac-btn-strategy-room'];
      var found = ids.filter(function (id) { return !!document.getElementById(id); });
      return { count: found.length, found: found };
    });
    add('ai_buttons_multi_stage', aiButtonsAll.count >= 4, JSON.stringify(aiButtonsAll.found));

    const gateBlocking = await page.evaluate(() => {
      localStorage.removeItem('coco-business-summary-approved-v1');
      localStorage.removeItem('coco-strategic-briefing-approved-v1');
      var blocked = {
        summary: window.BusinessSummaryApproval ? !BusinessSummaryApproval.assertGate() : false,
        briefing: window.StrategicBriefing ? !StrategicBriefing.assertGate() : false,
        materials: window.MaterialsReadinessGate ? !MaterialsReadinessGate.assertGate() : false,
        seo: window.SeoStrategy ? !SeoStrategy.assertGate() : false,
        build: window.PreBuildWorkReport ? !PreBuildWorkReport.assertBuildGate() : false,
      };
      return blocked;
    });
    add('gates_block_incomplete', gateBlocking.summary && gateBlocking.briefing && gateBlocking.materials && gateBlocking.seo && gateBlocking.build, JSON.stringify(gateBlocking));

    const googlePanel = await page.evaluate(() => {
      var root = document.getElementById('google-readiness-root');
      return !!(root && root.textContent && root.textContent.indexOf('Google Readiness') >= 0);
    });
    add('google_readiness_panel', googlePanel, 'google-readiness-root');

    const strategyRoom = await page.evaluate(() => {
      var root = document.getElementById('ai-strategy-room-root');
      return !!(root && root.textContent && root.textContent.indexOf('חדר אסטרטגיה') >= 0);
    });
    add('ai_strategy_room_panel', strategyRoom, 'ai-strategy-room-root');

    const briefingFields = await page.evaluate(() => {
      var root = document.getElementById('strategic-briefing-root');
      if (!root) return { ok: false };
      var text = root.textContent || '';
      var has = ['מילות מפתח', 'מתחרים', 'קהל', 'אזורים', 'שירותים', 'תוכנות', 'אפליקצ'].every(function (k) {
        return text.indexOf(k) >= 0 || (k === 'תוכנות' && text.indexOf('תוכנ') >= 0);
      });
      return { ok: has };
    });
    add('briefing_mandatory_fields_visible', briefingFields.ok, 'software/app/services/etc');

    const regionIdeas = await page.evaluate(() => {
      if (!window.AiConsultant || !AiConsultant.buildRegionIdeas) return { ok: false };
      var ctx = AiConsultant.collectContext();
      var r = AiConsultant.buildRegionIdeas(ctx);
      return { ok: !!(r.suggested && (Array.isArray(r.suggested) ? r.suggested.length : r.suggested !== 'חסר מידע')) };
    });
    add('ai_region_recommendations', regionIdeas.ok, 'buildRegionIdeas');

    const navAnchors = await page.evaluate(() => {
      return document.querySelectorAll('#exported button[onclick*="scrollGate"]').length >= 5;
    });
    add('gate_nav_anchors', navAnchors, 'scrollGate buttons');

    const step1Validation = await page.evaluate(() => {
      if (typeof goT === 'function') goT(1);
      var name = document.getElementById('b-name');
      var sector = document.getElementById('b-sector');
      if (name) name.value = '';
      if (sector) sector.value = '';
      if (typeof nextT === 'function') nextT();
      return !!document.getElementById('p1') && document.getElementById('p1').classList.contains('on');
    });
    add('step1_mandatory_blocks', step1Validation, 'b-name + b-sector');

  } catch (e) {
    add('scenario_complete', false, e.message || String(e));
  } finally {
    await browser.close();
  }
}

await run();
report.ok = report.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, pass: report.pass, fail: report.fail, stagingUrl: report.stagingUrl }, null, 2));
process.exit(report.ok ? 0 : 1);
