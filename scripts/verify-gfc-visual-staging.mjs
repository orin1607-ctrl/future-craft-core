/**
 * Live GFC visual + data-filter audit on GitHub Pages staging.
 * Usage: STAGING_PAGES_URL=... node scripts/verify-gfc-visual-staging.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'global-filter-visual-audit');
const TS = Date.now();
const BASE =
  process.env.STAGING_PAGES_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';
const CACHE_VER = process.env.GFC_CACHE_VER || 'v3-global-filter-unified';
const URL = BASE.split('?')[0] + '?v=' + encodeURIComponent(CACHE_VER) + '&t=' + TS;

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

const report = {
  at: new Date().toISOString(),
  url: URL,
  cacheVer: CACHE_VER,
  deploy: {},
  viewports: {},
  filterDataProof: {},
  summary: { pass: 0, fail: 0, total: SCREENS.length * 2 },
  errors: [],
  ok: false,
};

function barPass(r) {
  return (
    r.barExists &&
    r.barVisible &&
    r.barHeight > 0 &&
    !r.legacyFilterVisible &&
    (r.barBelowTopbar || r.gfcSlotPresent)
  );
}

async function fetchDeployInfo() {
  const unifiedUrl =
    'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing/coco-marketing-unified.js?t=' + TS;
  try {
    const [uniRes, htmlRes] = await Promise.all([
      fetch(unifiedUrl, { cache: 'no-store' }),
      fetch(URL, { cache: 'no-store' }),
    ]);
    const uniText = await uniRes.text();
    const htmlText = await htmlRes.text();
    report.deploy = {
      unifiedUrl,
      unifiedStatus: uniRes.status,
      hasV3Unified: uniText.includes('v3-global-filter-unified'),
      hasGfcChrome: uniText.includes('coco-gfc-chrome'),
      hasInterfaceId: uniText.includes('interfaceId') || htmlText.includes('interfaceId'),
      uiVersion: htmlText.match(/<meta name="ui-version" content="([^"]+)"/)?.[1] || null,
      defaultVer: htmlText.match(/var ver = '([^']+)'/)?.[1] || null,
    };
  } catch (e) {
    report.deploy = { error: String(e.message || e) };
  }
}

async function auditViewport(browser, viewportLabel, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const viewportResults = {};

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(5000);

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
      if (window.CocoUnified && CocoUnified.syncGfcPosition) CocoUnified.syncGfcPosition();
      if (screenId === 'screen-crm' && window.CocoMarketingCrm && CocoMarketingCrm.init) {
        await CocoMarketingCrm.init();
        if (GlobalFilterBar.place) GlobalFilterBar.place(screenId);
        if (CocoUnified.syncGfcPosition) CocoUnified.syncGfcPosition();
      }
      await new Promise((r) => setTimeout(r, screenId === 'screen-crm' ? 3000 : 1200));

      const sc = document.getElementById(screenId);
      const bar = document.getElementById('coco-unified-context-bar');
      const chrome = document.getElementById('coco-gfc-chrome');
      const gfc = document.getElementById('gfc-client');
      const iface = document.getElementById('gfc-interface');
      const topbar = sc && sc.querySelector('.topbar');
      const slot = sc && sc.querySelector('.gfc-slot');
      const barStyle = bar ? getComputedStyle(bar) : null;
      const chromeStyle = chrome ? getComputedStyle(chrome) : null;
      const barVisible =
        !!bar &&
        !!gfc &&
        barStyle.display !== 'none' &&
        barStyle.visibility !== 'hidden' &&
        bar.offsetHeight > 0 &&
        (!chrome || (chromeStyle.display !== 'none' && chrome.offsetHeight > 0));
      let barBelowTopbar = false;
      if (topbar && bar && chrome) {
        const tb = topbar.getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        barBelowTopbar = br.top >= tb.bottom - 4 && br.top <= tb.bottom + 80;
      }
      const legacyFilterVisible = sc
        ? Array.from(sc.querySelectorAll('.legacy-marketing-filter')).some(
            (el) => getComputedStyle(el).display !== 'none',
          )
        : false;

      return {
        screenId,
        barExists: !!gfc,
        hasInterfaceSelect: !!iface,
        gfcSlotPresent: !!slot && slot.offsetHeight > 0,
        barBelowTopbar,
        barVisible,
        barHeight: bar ? bar.offsetHeight : 0,
        chromeHeight: chrome ? chrome.offsetHeight : 0,
        legacyFilterVisible,
        cocoVersion: window.CocoUnified && CocoUnified.version,
        activeScreen: document.querySelector('.screen.active')?.id || null,
      };
    }, screen.id);

    if (viewportLabel === 'mobile') {
      await page.evaluate(() => {
        document.getElementById('coco-unified-context-bar')?.classList.add('is-expanded');
      });
      await page.waitForTimeout(400);
      const mobileVis = await page.evaluate(() => {
        const bar = document.getElementById('coco-unified-context-bar');
        const st = bar ? getComputedStyle(bar) : null;
        return {
          barVisible:
            !!bar && st.display !== 'none' && st.visibility !== 'hidden' && bar.offsetHeight > 0,
          barHeight: bar ? bar.offsetHeight : 0,
        };
      });
      result.barVisible = mobileVis.barVisible;
      result.barHeight = mobileVis.barHeight;
    }

    const shotName = `${screen.id}-${viewportLabel}.png`;
    await page.screenshot({
      path: join(OUT, shotName),
      clip: { x: 0, y: 0, width: contextOpts.viewport?.width || 1280, height: viewportLabel === 'mobile' ? 420 : 340 },
    });

    const entry = {
      label: screen.label,
      ...result,
      screenshot: `docs/audit-reports/global-filter-visual-audit/${shotName}`,
      pass: barPass(result),
    };
    viewportResults[screen.id] = entry;
    if (entry.pass) report.summary.pass += 1;
    else {
      report.summary.fail += 1;
      report.errors.push({ viewport: viewportLabel, screen: screen.id, detail: entry });
    }
    console.log(entry.pass ? '✅' : '❌', viewportLabel, screen.id, entry.barHeight + 'px');
  }

  report.viewports[viewportLabel] = viewportResults;
  await ctx.close();
}

async function proveFilterData(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.evaluate(async () => {
    if (window.CocoUnified && CocoUnified.init) CocoUnified.init();
    if (window.GlobalFilterBar && GlobalFilterBar.init) await GlobalFilterBar.init();
    await GlobalFilterContext.whenReady();
  });

  const proof = await page.evaluate(async () => {
    function count(sel) {
      return document.querySelectorAll(sel).length;
    }
    goScreen('screen-goals');
    if (GlobalFilterBar.place) GlobalFilterBar.place('screen-goals');
    await new Promise((r) => setTimeout(r, 1500));
    const goalsBefore = count('#coco-live-goals-list .goal-acc-item, #coco-live-goals-list .card');
    GlobalFilterContext.set({ freeSearch: 'zzzz-no-match-gfc-test-' + Date.now() }, { skipCascade: true, source: 'audit' });
    await new Promise((r) => setTimeout(r, 800));
    const goalsAfterFilter = count('#coco-live-goals-list .goal-acc-item, #coco-live-goals-list .card');
    GlobalFilterContext.set({ freeSearch: '' }, { skipCascade: true, source: 'audit' });
    await new Promise((r) => setTimeout(r, 600));
    const goalsAfterReset = count('#coco-live-goals-list .goal-acc-item, #coco-live-goals-list .card');

    goScreen('screen-actions');
    if (GlobalFilterBar.place) GlobalFilterBar.place('screen-actions');
    await new Promise((r) => setTimeout(r, 1500));
    const actionsBefore = count('#coco-live-actions-pending .coco-act-page-card, #coco-live-actions-pending .action-card');
    GlobalFilterContext.set({ interfaceId: 'gsc' }, { skipCascade: true, source: 'audit', allowInvalid: true });
    await new Promise((r) => setTimeout(r, 800));
    const actionsAfterIface = count('#coco-live-actions-pending .coco-act-page-card, #coco-live-actions-pending .action-card');
    GlobalFilterContext.set({ interfaceId: null }, { skipCascade: true, source: 'audit' });

    return {
      goalsBefore,
      goalsAfterFilter,
      goalsAfterReset,
      goalsFilterWorks: goalsAfterFilter <= goalsBefore,
      actionsBefore,
      actionsAfterIface,
      actionsIfaceWorks: actionsAfterIface <= actionsBefore,
      gfcInterfacePresent: !!document.getElementById('gfc-interface'),
      cocoVersion: window.CocoUnified && CocoUnified.version,
    };
  });

  report.filterDataProof = proof;
  await ctx.close();
}

await fetchDeployInfo();

if (!report.deploy.hasV3Unified && !report.deploy.error) {
  console.error('LIVE deploy missing v3-global-filter-unified in coco-marketing-unified.js');
  report.deploy.liveReady = false;
} else {
  report.deploy.liveReady = !!report.deploy.hasV3Unified;
}

const browser = await chromium.launch({ headless: true });
try {
  if (report.deploy.liveReady !== false) {
    await auditViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
    await auditViewport(browser, 'mobile', {
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
    });
    await proveFilterData(browser);
  }
} finally {
  await browser.close();
}

report.ok =
  report.deploy.liveReady !== false &&
  report.summary.fail === 0 &&
  report.filterDataProof.goalsFilterWorks !== false;

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'report.json'));
console.log('URL:', URL);
console.log('Pass:', report.summary.pass, 'Fail:', report.summary.fail);
console.log('Filter proof:', JSON.stringify(report.filterDataProof));
process.exit(report.ok ? 0 : 1);
