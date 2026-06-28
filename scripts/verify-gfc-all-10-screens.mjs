/**
 * Verify GFC bar on all 10 marketing hub screens.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'global-filter-all-10-screens');
const BASE = process.env.STAGING_PAGES_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';
const URL = BASE.includes('?') ? BASE : BASE + '?v=v3-global-filter-all';

const SCREENS = [
  { id: 'screen-hub', label: 'מרכז שיווק' },
  { id: 'screen-status', label: 'מצב נוכחי' },
  { id: 'screen-clients', label: 'חברות ולקוחות' },
  { id: 'screen-goals', label: 'מטרות' },
  { id: 'screen-actions', label: 'פעולות' },
  { id: 'screen-history', label: 'היסטוריה' },
  { id: 'screen-assets', label: 'נכסים דיגיטליים' },
  { id: 'screen-ai-center', label: 'קבלת החלטות AI' },
  { id: 'screen-reports', label: 'דוחות' },
  { id: 'screen-crm', label: 'CRM' },
];

mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), url: URL, screens: {}, errors: [], ok: false };

function fail(name, detail) {
  report.errors.push({ name, detail });
  console.error('❌', name, detail || '');
}

function pass(name, detail) {
  console.log('✅', name, detail || '');
}

async function auditViewport(browser, label, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);

  if (label === 'mobile') {
    await page.evaluate(() => {
      document.getElementById('coco-unified-context-bar')?.classList.add('is-expanded');
    });
  }

  await page.evaluate(async () => {
    if (window.CocoUnified && CocoUnified.init) CocoUnified.init();
    if (window.GlobalFilterBar && GlobalFilterBar.init) await GlobalFilterBar.init();
    await (window.GlobalFilterContext && GlobalFilterContext.whenReady
      ? GlobalFilterContext.whenReady()
      : Promise.resolve());
    await new Promise((r) => setTimeout(r, 2000));
  });

  for (const screen of SCREENS) {
    const result = await page.evaluate(async (screenId) => {
      if (typeof goScreen === 'function') goScreen(screenId);
      if (window.GlobalFilterBar && GlobalFilterBar.place) GlobalFilterBar.place(screenId);
      if (screenId === 'screen-crm' && window.CocoMarketingCrm && CocoMarketingCrm.init) {
        await CocoMarketingCrm.init();
        if (GlobalFilterBar.place) GlobalFilterBar.place(screenId);
      }
      await new Promise((r) => setTimeout(r, screenId === 'screen-crm' ? 2500 : 900));

      var sc = document.getElementById(screenId);
      var bar = document.getElementById('coco-unified-context-bar');
      var gfc = document.getElementById('gfc-client');
      var topbar = sc && sc.querySelector('.topbar');
      var barInScreen = !!(sc && bar && sc.contains(bar));
      var afterTopbar = false;
      if (topbar && bar && topbar.nextElementSibling === bar) afterTopbar = true;
      if (screenId === 'screen-crm' && barInScreen && !afterTopbar && topbar && bar) {
        afterTopbar = topbar.compareDocumentPosition(bar) === Node.DOCUMENT_POSITION_FOLLOWING;
      }
      var legacyVisible = sc ? Array.from(sc.querySelectorAll('.legacy-marketing-filter')).some(function (el) {
        return getComputedStyle(el).display !== 'none';
      }) : false;
      var primary = document.querySelectorAll('.gfc-primary .gfc-select').length;
      var resetBtn = !!document.getElementById('gfc-reset');
      return {
        barInScreen,
        afterTopbar,
        hasGfc: !!gfc,
        primary,
        legacyVisible,
        resetBtn,
      };
    }, screen.id);

    const key = label + ':' + screen.id;
    report.screens[key] = { label: screen.label, ...result };

    if (!result.hasGfc) fail(key, 'no gfc-client');
    else pass(key, screen.label + ' — GFC mounted');

    if (!result.barInScreen) fail(key, 'bar not inside ' + screen.id);
    else pass(key, 'bar inside screen');

    if (!result.afterTopbar) fail(key, 'bar not after topbar');
    else pass(key, 'bar after topbar');

    if (result.legacyVisible) fail(key, 'legacy filter still visible');
    else pass(key, 'legacy hidden');

    if (result.primary < 4) fail(key, 'primary cascade ' + result.primary);
    if (!result.resetBtn) fail(key, 'missing reset button');
  }

  const persist = await page.evaluate(async () => {
    GlobalFilterContext.set({
      specificItem: { type: 'page', id: 'page-01', label: 'בית', path: '/' },
    }, { skipCascade: true, source: 'verify', allowInvalid: true });
    await new Promise((r) => setTimeout(r, 400));
    var a = GlobalFilterContext.get().specificItem?.id;
    if (typeof goScreen === 'function') goScreen('screen-reports');
    if (GlobalFilterBar.place) GlobalFilterBar.place('screen-reports');
    await new Promise((r) => setTimeout(r, 800));
    var b = GlobalFilterContext.get().specificItem?.id;
    GlobalFilterContext.set({ specificItem: null }, { skipCascade: true, source: 'verify', allowInvalid: true });
    return { a, b, persisted: a === 'page-01' && b === 'page-01' };
  });

  report.screens[label + ':persistence'] = persist;
  if (!persist.persisted) fail(label + ':persistence', JSON.stringify(persist));
  else pass(label + ':persistence', 'context kept hub→reports');

  await ctx.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await auditViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await auditViewport(browser, 'mobile', devices['iPhone 13']);
  report.ok = report.errors.length === 0;
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'report.json'));
process.exit(report.ok ? 0 : 1);
