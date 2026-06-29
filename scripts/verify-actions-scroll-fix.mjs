/**
 * Post-fix verification — actions screen DOM + scroll + workbench lazy.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, devices } from 'playwright';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const VER = process.env.QA_UI_VERSION || 'v3-final-strict-8';
const BASE = process.env.STAGING_PAGES_URL || `http://127.0.0.1:8765/ai-marketing-platform.html?v=${VER}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'actions-scroll-fix-v8');

mkdirSync(OUT, { recursive: true });

async function runViewport(name, ctxOpts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const networkFails = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => networkFails.push(r.url().slice(0, 100)));

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 60000 });

  const beforeActions = await page.evaluate(() => ({
    totalDom: document.querySelectorAll('*').length,
    legacyTabs: ['tab-act-new', 'tab-act-pending', 'tab-act-progress', 'tab-act-done',
      'tab-act-rejected', 'tab-act-history', 'tab-act-summary', 'actions-legacy-filters']
      .filter((id) => !!document.getElementById(id)).length,
    screenActionsNodes: document.querySelectorAll('#screen-actions *').length,
  }));

  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { state: 'attached', timeout: 90000 });
  await page.waitForSelector('.coco-act-lite-card, .coco-act-page-card', { state: 'attached', timeout: 30000 }).catch(() => null);
  const loadMs = Date.now() - t0;

  const afterList = await page.evaluate(() => {
    const scrollEl = document.querySelector('#screen-actions .content');
    const legacyLeft = ['tab-act-new', 'tab-act-pending', 'tab-act-progress', 'tab-act-done',
      'tab-act-rejected', 'tab-act-history', 'tab-act-summary', 'actions-legacy-filters']
      .filter((id) => !!document.getElementById(id)).length;
    return {
      totalDom: document.querySelectorAll('*').length,
      screenActionsNodes: document.querySelectorAll('#screen-actions *').length,
      legacyTabsRemaining: legacyLeft,
      cards: document.querySelectorAll('.coco-act-lite-card').length,
      pendingHtml: (document.getElementById('coco-live-actions-pending')?.innerHTML.length) || 0,
      iframeCount: document.querySelectorAll('#screen-actions iframe').length,
      scrollEl: scrollEl ? scrollEl.tagName + '.' + scrollEl.className : null,
    };
  });

  const scrollPerf = await page.evaluate(async () => {
    const el = document.querySelector('#screen-actions .content');
    if (!el) return { ok: false, reason: 'no scroll el' };
    const down = [];
    for (let i = 0; i < 15; i++) {
      const t = performance.now();
      el.scrollTop += 280;
      down.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(r));
    }
    for (let i = 0; i < 15; i++) {
      el.scrollTop -= 280;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return {
      ok: true,
      scrollTop: el.scrollTop,
      maxMs: Math.max(...down),
      avgMs: down.reduce((a, b) => a + b, 0) / down.length,
    };
  });

  await page.click('[data-act-open-wb]').catch(() => null);
  await page.waitForSelector('.coco-act-lite-wb', { timeout: 15000 }).catch(() => null);
  const workbenchList = await page.evaluate(() => ({
    accItems: document.querySelectorAll('.coco-act-lite-acc-item').length,
    accBodies: document.querySelectorAll('.coco-act-work-card-body').length,
    pendingHtml: (document.getElementById('coco-live-actions-pending')?.innerHTML.length) || 0,
    screenActionsNodes: document.querySelectorAll('#screen-actions *').length,
  }));

  await page.click('[data-act-acc-toggle]').catch(() => null);
  await page.waitForTimeout(300);
  const workbenchOneOpen = await page.evaluate(() => ({
    accBodies: document.querySelectorAll('.coco-act-work-card-body').length,
    pendingHtml: (document.getElementById('coco-live-actions-pending')?.innerHTML.length) || 0,
  }));

  await page.click('[data-act-lite-preview]').catch(() => null);
  await page.waitForTimeout(400);
  const preview = await page.evaluate(() => {
    const modal = document.getElementById('coco-act-lite-preview-modal');
    return {
      modalVisible: modal && modal.style.display !== 'none',
      iframeCount: document.querySelectorAll('#coco-act-lite-preview-modal iframe').length,
    };
  });

  const hubOk = await page.evaluate(() => {
    goScreen('screen-hub');
    return document.querySelectorAll('#screen-hub .hub-card, #screen-hub .bnav-btn').length >= 10;
  });

  await browser.close();

  return {
    viewport: name,
    loadMs,
    beforeActions,
    afterList,
    scrollPerf,
    workbenchList,
    workbenchOneOpen,
    preview,
    hubOk,
    consoleErrors,
    networkFails,
  };
}

const desktop = await runViewport('desktop', { viewport: { width: 1440, height: 900 } });
const mobile = await runViewport('mobile', { ...devices['iPhone 13'] });

const report = {
  at: new Date().toISOString(),
  version: VER,
  url: BASE,
  baselineTotalDom: 15466,
  desktop,
  mobile,
  domReduction: {
    totalDom: 15466 - (mobile.afterList?.totalDom || 0),
    screenActionsNodes: mobile.afterList?.screenActionsNodes,
    legacyPurged: mobile.afterList?.legacyTabsRemaining === 0,
    lazyWorkbench: mobile.workbenchList?.accBodies === 0 && mobile.workbenchOneOpen?.accBodies === 1,
  },
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('Actions scroll fix v8 verification →', OUT);
console.log('Mobile totalDom:', mobile.afterList?.totalDom, '(baseline 15466)');
console.log('Legacy tabs left:', mobile.afterList?.legacyTabsRemaining);
console.log('Lazy WB bodies closed/open:', mobile.workbenchList?.accBodies, '/', mobile.workbenchOneOpen?.accBodies);
console.log('Preview on demand:', preview?.modalVisible ?? mobile.preview?.modalVisible);
console.log('Console errors:', (mobile.consoleErrors?.length || 0) + (desktop.consoleErrors?.length || 0));
