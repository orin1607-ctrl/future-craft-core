/**
 * Live visual audit — Global Filter Bar on all 10 marketing hub screens (staging).
 * Captures top-region screenshots + structured JSON per screen.
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
const URL = BASE.includes('?')
  ? BASE.replace(/([?&]t=)\d+/, '$1' + TS).replace(/([?&]t=)[^&]*/, '$1' + TS)
  : BASE + '?v=v3-global-filter-all&t=' + TS;
const finalUrl = URL.includes('t=') ? URL : URL + (URL.includes('?') ? '&' : '?') + 't=' + TS;

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
  url: finalUrl,
  cacheBustTimestamp: TS,
  deploy: {},
  viewports: {},
  summary: { pass: 0, fail: 0, total: SCREENS.length * 2 },
  errors: [],
};

async function fetchDeployInfo() {
  const registryUrl =
    'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing/filter-screen-registry.js?t=' + TS;
  const htmlUrl = finalUrl;
  try {
    const [regRes, htmlRes] = await Promise.all([fetch(registryUrl), fetch(htmlUrl)]);
    const regText = await regRes.text();
    const htmlText = await htmlRes.text();
    const hasRegistry = regText.includes('MARKETING_HUB_SCREENS');
    const uiVersion = htmlText.match(/<meta name="ui-version" content="([^"]+)"/)?.[1] || null;
    const buildCommit = htmlText.match(/<meta name="build-commit" content="([^"]+)"/)?.[1] || null;
    const scriptHashes = [...htmlText.matchAll(/ai-marketing\/([^"?]+\.js)(\?[^"]*)?"/g)].map((m) => m[1]);
    report.deploy = {
      registryUrl,
      registryStatus: regRes.status,
      hasMarketingHubScreens: hasRegistry,
      uiVersion,
      buildCommit,
      scriptFiles: scriptHashes.slice(0, 20),
    };
  } catch (e) {
    report.deploy = { error: String(e.message || e) };
  }
}

function screenStatus(r) {
  if (!r.barExists) return 'חסר';
  if (!r.barVisible) return 'מוסתר';
  if (r.barAfterTopbar && r.barInsideScreen) return 'מתחת ל-topbar';
  if (r.barInsideScreen) return 'במסך (לא מיד אחרי topbar)';
  return 'מחוץ למסך';
}

function isPass(r) {
  return r.barExists && r.barInsideScreen && r.barAfterTopbar && r.barVisible && !r.legacyFilterVisible;
}

async function auditViewport(browser, viewportLabel, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const viewportResults = {};

  await page.goto(finalUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);

  const pageMeta = await page.evaluate(() => {
    const uiVersion = document.querySelector('meta[name="ui-version"]')?.content || null;
    const buildCommit = document.querySelector('meta[name="build-commit"]')?.content || null;
    const scripts = Array.from(document.querySelectorAll('script[src*="ai-marketing"]')).map((s) => s.src);
    return { uiVersion, buildCommit, scripts };
  });
  report.deploy.pageLoaded = pageMeta;

  await page.evaluate(async () => {
    if (window.CocoUnified && CocoUnified.init) CocoUnified.init();
    if (window.GlobalFilterBar && GlobalFilterBar.init) await GlobalFilterBar.init();
    await (window.GlobalFilterContext && GlobalFilterContext.whenReady
      ? GlobalFilterContext.whenReady()
      : Promise.resolve());
    await new Promise((r) => setTimeout(r, 1500));
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

      const sc = document.getElementById(screenId);
      const bar = document.getElementById('coco-unified-context-bar');
      const gfc = document.getElementById('gfc-client');
      const topbar = sc && sc.querySelector('.topbar');
      const barInsideScreen = !!(sc && bar && sc.contains(bar));
      let barAfterTopbar = false;
      if (topbar && bar && topbar.nextElementSibling === bar) barAfterTopbar = true;
      if (screenId === 'screen-crm' && barInsideScreen && !barAfterTopbar && topbar && bar) {
        barAfterTopbar = topbar.compareDocumentPosition(bar) === Node.DOCUMENT_POSITION_FOLLOWING;
      }
      const barStyle = bar ? getComputedStyle(bar) : null;
      const barVisible =
        !!bar &&
        barStyle.display !== 'none' &&
        barStyle.visibility !== 'hidden' &&
        barStyle.opacity !== '0' &&
        bar.offsetHeight > 0;
      const legacyFilterVisible = sc
        ? Array.from(sc.querySelectorAll('.legacy-marketing-filter')).some(
            (el) => getComputedStyle(el).display !== 'none',
          )
        : false;
      const uiVersion = document.querySelector('meta[name="ui-version"]')?.content || null;
      const buildCommit = document.querySelector('meta[name="build-commit"]')?.content || null;
      const gfcScript = Array.from(document.querySelectorAll('script[src*="global-filter"]'))
        .map((s) => s.src)
        .join(';');

      return {
        screenId,
        barExists: !!gfc,
        barInsideScreen,
        barAfterTopbar,
        barVisible,
        barDisplay: barStyle ? barStyle.display : null,
        barVisibility: barStyle ? barStyle.visibility : null,
        barHeight: bar ? bar.offsetHeight : 0,
        legacyFilterVisible,
        scriptVersion: uiVersion,
        buildCommit,
        gfcScriptSrc: gfcScript || null,
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
          isExpanded: bar?.classList.contains('is-expanded') || false,
          barVisible:
            !!bar &&
            st.display !== 'none' &&
            st.visibility !== 'hidden' &&
            bar.offsetHeight > 0,
          barHeight: bar ? bar.offsetHeight : 0,
        };
      });
      result.mobileExpanded = mobileVis.isExpanded;
      result.barVisible = mobileVis.barVisible;
      result.barHeight = mobileVis.barHeight;
    }

    const shotName = `${screen.id}-${viewportLabel}.png`;
    const shotPath = join(OUT, shotName);

    const clipHeight = viewportLabel === 'mobile' ? 420 : 320;
    await page.screenshot({
      path: shotPath,
      clip: { x: 0, y: 0, width: contextOpts.viewport?.width || 1280, height: clipHeight },
    });

    const entry = {
      label: screen.label,
      ...result,
      screenshot: `docs/audit-reports/global-filter-visual-audit/${shotName}`,
      status: screenStatus(result),
      pass: isPass(result),
    };

    viewportResults[screen.id] = entry;
    if (entry.pass) report.summary.pass += 1;
    else {
      report.summary.fail += 1;
      report.errors.push({
        viewport: viewportLabel,
        screen: screen.id,
        status: entry.status,
        detail: entry,
      });
    }

    console.log(
      entry.pass ? '✅' : '❌',
      viewportLabel,
      screen.id,
      entry.status,
      '→',
      shotName,
    );
  }

  report.viewports[viewportLabel] = viewportResults;
  await ctx.close();
}

await fetchDeployInfo();

const browser = await chromium.launch({ headless: true });
try {
  await auditViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await auditViewport(browser, 'mobile', {
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  });
} finally {
  await browser.close();
}

report.ok = report.summary.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'report.json'));
console.log('URL:', finalUrl);
console.log('Pass:', report.summary.pass, 'Fail:', report.summary.fail);
process.exit(report.ok ? 0 : 1);
