#!/usr/bin/env node
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_FOUNDATION_VERSION || 'companies-foundation-stabilization';
const URL = process.env.STAGING_PAGES_URL || `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'companies-foundation-stabilization');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  version: VER,
  stagingUrl: URL.split('&t=')[0],
  checks: {},
  scenarios: {},
  pass: 0,
  fail: 0,
};

function addCheck(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1;
  else report.fail += 1;
}

async function runScenario(name, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/favicon|Failed to load resource.*\.(png|ico|svg|woff)/i.test(txt)) return;
    consoleErrors.push(txt.slice(0, 240));
  });
  const out = { consoleErrors };

  function scoped(key) {
    return `${name}_${key}`;
  }

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard && window.WebsiteBuilderWizard, { timeout: 90000 });

    await page.evaluate(() => goScreen('screen-hub'));
    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    const flowScreens = ['screen-agents', 'screen-goals', 'screen-actions', 'screen-history'];
    for (const sid of flowScreens) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(450);
      const active = await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid);
      addCheck(scoped(`flow_${sid}`), active, sid);
    }
    await page.evaluate(() => goScreen('screen-business-strategy'));
    await page.waitForTimeout(450);
    const backToStrategy = await page.evaluate(() => !!document.getElementById('screen-business-strategy')?.classList.contains('active'));
    addCheck(scoped('flow_back_business_strategy'), backToStrategy, 'returned');

    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });

    const reportModule = await page.evaluate(() => !!(window.PreBuildWorkReport && PreBuildWorkReport.VERSION));
    addCheck(scoped('pre_build_report_module'), reportModule, 'PreBuildWorkReport');

    const panelVisible = await page.evaluate(() => !!document.getElementById('pre-build-report-root')?.innerHTML?.length);
    addCheck(scoped('pre_build_report_panel'), panelVisible, 'panel mounted');

    const gatedBeforeApprove = await page.evaluate(() => {
      const btn = document.querySelector('#exported button[data-pbr-gated="true"]');
      return !!btn && btn.disabled === true;
    });
    addCheck(scoped('builder_gated_before_approve'), gatedBeforeApprove, 'disabled until approve');

    await page.evaluate(() => {
      if (window.PreBuildWorkReport) {
        PreBuildWorkReport.exportPreBuildReportArtifacts();
        PreBuildWorkReport.approveReport();
        PreBuildWorkReport.updateBuildButtonsGate();
      }
    });
    await page.waitForTimeout(200);

    const approved = await page.evaluate(() => localStorage.getItem('coco-pre-build-report-approved-v1') === 'true');
    addCheck(scoped('pre_build_report_approved'), approved, 'approval stored');

    const fleetInSitemap = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('coco-pre-build-sitemap-v1');
        const map = raw ? JSON.parse(raw) : [];
        return map.some((p) => String(p.title || '').indexOf('צי רכב') >= 0);
      } catch (e) { return false; }
    });
    addCheck(scoped('fleet_page_in_sitemap'), fleetInSitemap, 'FleetOS page');

    await page.locator('#exported button', { hasText: 'צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });

    const builderVersion = await page.evaluate(() => window.WebsiteBuilderWizard?.VERSION || '');
    addCheck(scoped('builder_version_new'), /^2\./.test(builderVersion), builderVersion);

    for (let i = 0; i < 6; i += 1) {
      await page.locator('#wb-next').click();
      await page.waitForTimeout(150);
    }
    const summaryVisible = await page.evaluate(() => !!document.querySelector('#w7.pane.on #wb-summary'));
    addCheck(scoped('prebuild_summary_step'), summaryVisible, 'step7');

    await page.locator('#wb-next').click();
    await page.waitForTimeout(200);
    await page.locator('#wb-next').click();
    await page.waitForSelector('#wb-complete', { state: 'visible', timeout: 30000 });

    const previewData = await page.evaluate(() => {
      const raw = localStorage.getItem('coco-website-builder-preview-site-v1');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      return {
        hasPreviewData: !!parsed,
        pages: parsed?.pages?.length || 0,
        hasIndex: !!parsed?.pages?.find((p) => p.fileName === 'index.html'),
      };
    });
    addCheck(scoped('preview_multipage_created'), previewData.hasPreviewData && previewData.pages >= 4 && previewData.hasIndex, JSON.stringify(previewData));

    const continueDisabledBeforeApproval = await page.evaluate(() => !!document.getElementById('wb-continue-btn')?.disabled);
    addCheck(scoped('approval_gate_enabled'), continueDisabledBeforeApproval, 'continue disabled before approval');

    await page.evaluate(() => {
      const cb = document.getElementById('wb-approval-check');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(150);
    const continueEnabledAfterApproval = await page.evaluate(() => !document.getElementById('wb-continue-btn')?.disabled);
    addCheck(scoped('approval_gate_unlocks'), continueEnabledAfterApproval, 'continue enabled after approval');

    await page.locator('#wb-continue-btn').click();
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 12000 });
    addCheck(scoped('continue_to_agents_after_approval'), true, 'navigated');

    addCheck(scoped('console_clean'), consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } catch (e) {
    addCheck(scoped('scenario_completed'), false, e.message || String(e));
  } finally {
    await context.close();
    await browser.close();
  }

  report.scenarios[name] = out;
}

await runScenario('desktop', { viewport: { width: 1366, height: 900 } });
await runScenario('iphone13', { ...devices['iPhone 13'], locale: 'he-IL' });

report.ok = report.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  pass: report.pass,
  fail: report.fail,
  stagingUrl: report.stagingUrl,
}, null, 2));
process.exit(report.ok ? 0 : 1);
