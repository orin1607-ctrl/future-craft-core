#!/usr/bin/env node
/**
 * Full marketing flow QA — end-to-end including report, builder, site hub.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const URL = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'full-marketing-flow-qa');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), commit: HEAD, stagingUrl: URL.split('&t=')[0], checks: {}, pass: 0, fail: 0 };

function add(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1; else report.fail += 1;
}

async function runFlow(name, opts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  function isBenignConsoleError(t) {
    return /favicon|404.*\.(png|ico|svg|woff|webp)|net::ERR.*font|Failed to load resource.*\.(png|ico|svg|woff|webp)/i.test(t)
      || /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError/i.test(t)
      || (/Failed to load resource/i.test(t) && /404/i.test(t));
  }
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isBenignConsoleError(t)) return;
    consoleErrors.push(t.slice(0, 200));
  });

  const p = (k) => `${name}_${k}`;

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.PreBuildWorkReport && window.SiteMarketingHub && window.WebsiteBuilderWizard, { timeout: 90000 });

    // Hub scroll smoke
    await page.evaluate(() => goScreen('screen-hub'));
    await page.waitForTimeout(400);
    const hubActive = await page.evaluate(() => document.getElementById('screen-hub')?.classList.contains('active'));
    add(p('hub_active'), hubActive, 'hub');

    // Strategy flow
    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    for (let i = 0; i < 3; i++) await page.locator('#btn-next').click();
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
    for (let i = 0; i < 3; i++) await page.locator('#btn-next').click();
    await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });

    // Report data check
    const reportData = await page.evaluate(() => {
      if (!window.PreBuildWorkReport) return null;
      const m = PreBuildWorkReport.buildPreBuildReportModel();
      return {
        company: m.company,
        hasProfile: !!(m.businessProfile && m.businessProfile.name),
        keywords: (m.businessProfile && m.businessProfile.keywords || []).length,
        pages: (m.newSiteSitemap || []).length,
        hasFleet: (m.newSiteSitemap || []).some((x) => String(x.title).indexOf('צי') >= 0),
        competitors: (m.businessProfile && m.businessProfile.competitors || []).length,
      };
    });
    add(p('report_has_company'), !!(reportData && reportData.company), reportData?.company);
    add(p('report_has_profile'), !!(reportData && reportData.hasProfile), 'businessProfile');
    add(p('report_has_keywords'), (reportData?.keywords || 0) > 0, String(reportData?.keywords));
    add(p('report_has_pages'), (reportData?.pages || 0) >= 5, String(reportData?.pages));
    add(p('report_has_fleet_page'), !!reportData?.hasFleet, 'fleet');

    await page.evaluate(() => {
      PreBuildWorkReport.exportPreBuildReportArtifacts();
      PreBuildWorkReport.approveReport();
      PreBuildWorkReport.updateBuildButtonsGate();
    });

    // Flow screens
    for (const sid of ['screen-agents', 'screen-goals', 'screen-actions', 'screen-history']) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(350);
      add(p(`flow_${sid}`), await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid), sid);
    }

    await page.evaluate(() => goScreen('screen-business-strategy'));
    await page.locator('#exported button', { hasText: 'צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });

    for (let i = 0; i < 7; i++) { await page.locator('#wb-next').click(); await page.waitForTimeout(120); }
    await page.locator('#wb-next').click();
    await page.waitForSelector('#wb-complete', { state: 'visible', timeout: 30000 });

    const preview = await page.evaluate(() => {
      const raw = localStorage.getItem('coco-website-builder-preview-site-v1');
      let d = null; try { d = raw ? JSON.parse(raw) : null; } catch (e) {}
      return { pages: d?.pages?.length || 0, hasNav: !!(d?.pages?.length > 1) };
    });
    add(p('preview_multipage'), preview.pages >= 4, JSON.stringify(preview));

    await page.evaluate(() => {
      const cb = document.getElementById('wb-approval-check');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof wbToggleApproval === 'function') wbToggleApproval(true);
    });
    await page.waitForTimeout(200);

    const hubActive2 = await page.evaluate(() => {
      const h = localStorage.getItem('coco-site-marketing-hub-v1');
      return h ? JSON.parse(h).active : false;
    });
    add(p('site_hub_activated'), hubActive2, 'hub after approval');

    const lifecycle = await page.evaluate(() => window.MarketingLifecycle && MarketingLifecycle.get());
    add(p('lifecycle_active'), !!(lifecycle && lifecycle.stages), 'lifecycle');

    const blueprint = await page.evaluate(() => window.SiteBlueprint && SiteBlueprint.get());
    add(p('blueprint_created'), !!(blueprint && blueprint.pages && blueprint.pages.length), String(blueprint?.pageCount));

    const permanentUrl = await page.evaluate(() => localStorage.getItem('coco-client-preview-permanent-url-v1'));
    add(p('permanent_preview_url'), !!permanentUrl, permanentUrl || 'missing (static: /client-previews/dalia-c-official/)');

    const activityLog = await page.evaluate(() => (window.MarketingActivityLog && MarketingActivityLog.getRecent(3).length) || 0);
    add(p('activity_log'), activityLog > 0, String(activityLog));

    const aiAdvice = await page.evaluate(() => !!(window.AiStageAdvisor && AiStageAdvisor.getLatest()));
    add(p('ai_advisor'), aiAdvice, 'advisor');

    const progress = await page.evaluate(() => {
      const p = localStorage.getItem('coco-marketing-progress-v1');
      return p ? JSON.parse(p) : null;
    });
    add(p('progress_tracked'), !!(progress && progress.aiRecommendation), progress?.aiRecommendation);

    const tasksAdded = await page.evaluate(() => {
      const a = localStorage.getItem('coco-business-strategy-actions-v1');
      const arr = a ? JSON.parse(a) : [];
      return arr.filter((x) => x.source === 'site-marketing-hub').length;
    });
    add(p('tasks_generated'), tasksAdded > 0, String(tasksAdded));

    await page.evaluate(() => {
      var btn = document.getElementById('wb-continue-btn');
      if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      if (typeof wbContinueToAgents === 'function') wbContinueToAgents();
      else if (typeof goScreen === 'function') goScreen('screen-agents');
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 20000 });
    add(p('return_to_agents'), true, 'ok');

    // Post-hub flow still works
    for (const sid of ['screen-goals', 'screen-actions', 'screen-history']) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(300);
      add(p(`post_${sid}`), await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid), sid);
    }

    // Stability
    const fabCount = await page.evaluate(() => document.querySelectorAll('#cocoAiFab').length);
    add(p('single_fab'), fabCount === 1, String(fabCount));

    add(p('console_clean'), consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  } catch (e) {
    add(p('scenario_complete'), false, e.message || String(e));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

await runFlow('desktop', { viewport: { width: 1366, height: 900 } });
await runFlow('iphone13', { ...devices['iPhone 13'], locale: 'he-IL' });

report.ok = report.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, pass: report.pass, fail: report.fail, stagingUrl: report.stagingUrl }, null, 2));
process.exit(report.ok ? 0 : 1);
