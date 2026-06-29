import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, devices } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || 'v3-final-strict-9';
const URL = process.env.STAGING_PAGES_URL || `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'actions-scroll-fix-v9');
mkdirSync(OUT, { recursive: true });

console.log('Verify', URL);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ...devices['iPhone 13'] });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
await page.evaluate(() => goScreen('screen-actions'));
await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { timeout: 90000, state: 'attached' });
await page.waitForSelector('.coco-act-lite-card', { timeout: 60000, state: 'attached' });
const loadMs = Date.now() - t0;

const metrics = await page.evaluate(() => {
  const legacyIds = ['tab-act-new', 'tab-act-pending', 'tab-act-progress', 'tab-act-done',
    'tab-act-rejected', 'tab-act-history', 'tab-act-summary', 'actions-legacy-filters'];
  const el = document.querySelector('#screen-actions .content');
  return {
    totalDom: document.querySelectorAll('*').length,
    screenActionsNodes: document.querySelectorAll('#screen-actions *').length,
    legacyRemaining: legacyIds.filter((id) => document.getElementById(id)).length,
    legacyIds: legacyIds.filter((id) => document.getElementById(id)),
    navTabs: !!document.querySelector('#screen-actions .nav-tabs'),
    cards: document.querySelectorAll('.coco-act-lite-card').length,
    pendingHtml: document.getElementById('coco-live-actions-pending')?.innerHTML.length || 0,
    iframes: document.querySelectorAll('#screen-actions iframe').length,
  };
});

const scroll = await page.evaluate(async () => {
  const el = document.querySelector('#screen-actions .content');
  if (!el) return { ok: false };
  const ms = [];
  for (let i = 0; i < 12; i++) {
    const t = performance.now();
    el.scrollTop += 300;
    ms.push(performance.now() - t);
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { ok: true, maxMs: Math.max(...ms), avgMs: ms.reduce((a, b) => a + b, 0) / ms.length };
});

await page.click('[data-act-open-wb]', { timeout: 15000 });
await page.waitForSelector('.coco-act-lite-wb', { timeout: 20000 });
const wbClosed = await page.evaluate(() => ({
  accItems: document.querySelectorAll('.coco-act-lite-acc-item').length,
  accBodies: document.querySelectorAll('.coco-act-work-card-body').length,
  pendingHtml: document.getElementById('coco-live-actions-pending')?.innerHTML.length || 0,
}));

await page.locator('[data-act-acc-toggle]').first().click({ timeout: 10000 });
await page.waitForTimeout(400);
const wbOpen = await page.evaluate(() => ({
  accBodies: document.querySelectorAll('.coco-act-work-card-body').length,
  pendingHtml: document.getElementById('coco-live-actions-pending')?.innerHTML.length || 0,
}));

await page.click('[data-act-lite-preview]', { timeout: 10000 });
await page.waitForTimeout(500);
const preview = await page.evaluate(() => ({
  modal: !!document.getElementById('coco-act-lite-preview-modal'),
  iframe: document.querySelectorAll('#coco-act-lite-preview-modal iframe').length,
}));

await page.evaluate(() => goScreen('screen-hub'));
const hubBtns = await page.evaluate(() => document.querySelectorAll('#screen-hub .hub-card, .bnav-btn').length);

await browser.close();

const report = {
  at: new Date().toISOString(),
  version: VER,
  url: URL,
  loadMs,
  baselineTotalDom: 15466,
  metrics,
  domReducedBy: 15466 - metrics.totalDom,
  scroll,
  workbench: { closed: wbClosed, open: wbOpen, lazyOk: wbClosed.accBodies === 0 && wbOpen.accBodies === 1 },
  preview,
  hubButtons: hubBtns,
  consoleErrors,
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  loadMs, totalDom: metrics.totalDom, domReducedBy: report.domReducedBy,
  legacyRemaining: metrics.legacyRemaining, lazyOk: report.workbench.lazyOk,
  scrollMaxMs: scroll.maxMs, consoleErrors: consoleErrors.length, hubButtons: hubBtns,
}, null, 2));
