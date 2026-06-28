/**
 * Deep verify goals + actions on live Staging — desktop + iPhone, console + network.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'goals-actions-mobile-fix');
const STAGING = process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';

mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), viewports: {}, ok: false, errors: [] };

function fail(vp, name, detail) {
  report.errors.push({ vp, name, detail });
  console.error('❌', vp, name, detail || '');
}

function pass(vp, name, detail) {
  console.log('✅', vp, name, detail || '');
}

async function auditViewport(browser, label, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const vpReport = { consoleErrors: [], failedRequests: [], checks: {} };

  page.on('console', (m) => {
    if (m.type() === 'error') vpReport.consoleErrors.push(m.text());
  });
  page.on('requestfailed', (r) => {
    vpReport.failedRequests.push({ url: r.url(), err: r.failure()?.errorText || '' });
  });

  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);

  // Check JS versions loaded
  const scripts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((s) => s.src)
  );
  const dataJs = scripts.find((s) => s.includes('coco-claude-data'));
  vpReport.checks.dataJsUrl = dataJs || 'inline/missing';

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-goals'); });
  await page.waitForTimeout(3000);

  const goalsState = await page.evaluate(() => {
    var live = document.getElementById('coco-live-goals-list');
    var demoItems = document.querySelectorAll('#tab-goals-all .goal-acc-item').length;
    var liveItems = live ? live.querySelectorAll('.goal-acc-item').length : 0;
    var liveVisible = live ? (live.offsetParent !== null && live.innerHTML.length > 100) : false;
    var liveDisplay = live ? getComputedStyle(live).display : 'missing';
    var tabsHidden = document.querySelector('#screen-goals .nav-tabs');
    var tabDisplay = tabsHidden ? getComputedStyle(tabsHidden).display : 'missing';
    var tabAllDisplay = document.getElementById('tab-goals-all');
    var recRows = live ? live.querySelectorAll('tbody tr').length : 0;
    var meta = window.CocoData && CocoData.getMeta ? CocoData.getMeta() : null;
    var bundle = window.CocoData && CocoData.getBundle ? CocoData.getBundle() : null;
    var pages = bundle && bundle.workPlan && bundle.workPlan.pages ? bundle.workPlan.pages.length : 0;
    var firstPanel = live ? live.querySelector('[id^="coco-page-recs-"]') : null;
    var firstPanelOpen = firstPanel ? firstPanel.style.display !== 'none' : false;
    return {
      liveItems, demoItems, liveVisible, liveDisplay, tabDisplay,
      tabAllDisplay: tabAllDisplay ? getComputedStyle(tabAllDisplay).display : 'missing',
      recRows, pages, goalsSource: meta && meta.goalsSource,
      bundlePages: pages,
      firstPanelOpen,
    };
  });

  vpReport.checks.goals = goalsState;

  if (goalsState.liveItems !== 28) fail(label, '28 page accordions', 'got ' + goalsState.liveItems + ', demo=' + goalsState.demoItems);
  else pass(label, '28 page accordions', String(goalsState.liveItems));

  if (!goalsState.liveVisible) fail(label, 'live goals visible', JSON.stringify({ display: goalsState.liveDisplay, tabAll: goalsState.tabAllDisplay }));
  else pass(label, 'live goals visible');

  if (goalsState.recRows < 560) fail(label, '560 rec rows total', 'got ' + goalsState.recRows);
  else pass(label, '560 rec rows', String(goalsState.recRows));

  // Expand 2nd page and count recs
  await page.evaluate(() => {
    var items = document.querySelectorAll('#coco-live-goals-list .goal-acc-item');
    if (items[1]) items[1].querySelector('[onclick*="CocoDataTogglePageRecs"]')?.click();
  });
  await page.waitForTimeout(300);
  const recsPage2 = await page.locator('#coco-live-goals-list .goal-acc-item').nth(1).locator('tbody tr').count();
  const recsMobilePage2 = await page.locator('#coco-live-goals-list .goal-acc-item').nth(1).locator('.coco-rec-row').count();
  const recCount = label === 'mobile' ? recsMobilePage2 : recsPage2;
  if (recCount !== 20) fail(label, '20 recs per page (page 2)', 'got ' + recCount);
  else pass(label, '20 recs per page', 'page 2 has 20');

  if (goalsState.pages !== 28) fail(label, 'SSOT pages in bundle', 'workPlan.pages=' + goalsState.pages);
  else pass(label, 'SSOT bundle', '28 pages from workPlan');

  if (goalsState.demoItems > 0 && goalsState.tabAllDisplay !== 'none') {
    fail(label, 'demo goals still visible', 'demo items=' + goalsState.demoItems);
  } else pass(label, 'demo hidden');

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-actions'); });
  await page.waitForTimeout(3000);

  const actionsState = await page.evaluate(() => {
    var pending = document.getElementById('coco-live-actions-pending');
    var cards = pending ? pending.querySelectorAll('.action-card').length : 0;
    var groups = pending ? pending.querySelectorAll('.card').length : 0;
    var visible = pending ? (pending.offsetParent !== null && pending.innerHTML.length > 50) : false;
    var meta = window.CocoData && CocoData.getMeta ? CocoData.getMeta() : null;
    return { cards, groups, visible, actionsSource: meta && meta.actionsSource };
  });

  vpReport.checks.actions = actionsState;

  if (actionsState.cards < 100) fail(label, 'action cards', 'got ' + actionsState.cards);
  else pass(label, 'action cards', String(actionsState.cards));

  if (actionsState.groups < 20) fail(label, 'page groups', 'got ' + actionsState.groups);
  else pass(label, 'page groups', String(actionsState.groups));

  if (!actionsState.visible) fail(label, 'actions visible');
  else pass(label, 'actions visible');

  if (vpReport.consoleErrors.length) {
    fail(label, 'console errors', vpReport.consoleErrors.slice(0, 3).join(' | '));
  } else pass(label, 'no console errors');

  const wpFailed = vpReport.failedRequests.filter((r) => /site-work-plan|coco-claude-data|dashboard\.json/.test(r.url));
  if (wpFailed.length) fail(label, 'network failures', JSON.stringify(wpFailed.slice(0, 3)));
  else pass(label, 'SSOT network OK');

  report.viewports[label] = vpReport;
  await ctx.close();
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  await auditViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await auditViewport(browser, 'mobile', { ...devices['iPhone 13'] });
} catch (e) {
  fail('all', 'browser', e.message);
}
await browser.close();

report.ok = report.errors.length === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'report.json'));
process.exit(report.ok ? 0 : 1);
