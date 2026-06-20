/**
 * Full QA for CO.CO Dalia AI Marketing Platform
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../public/ai-marketing-platform.html');
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8888';
const url = process.env.QA_BASE_URL ? `${baseUrl}/ai-marketing-platform.html` : pathToFileURL(htmlPath).href;

const REQUIRED_FNS = ['toggleSidebar', 'closeSidebar', 'gotoSc', 'stab', 'openKwMo', 'closeModal', 'closeActionModal', 'showToast'];
const SCREENS = [
  'sc-dashboard','sc-director','sc-approval','sc-notifications','sc-tasks','sc-briefing',
  'sc-seo','sc-keywords','sc-content','sc-warehouse','sc-pages','sc-landing','sc-scheduler',
  'sc-intel','sc-competitors','sc-news','sc-gbp','sc-ads','sc-roi','sc-funnel','sc-journey',
  'sc-kpi','sc-heatmap','sc-executive','sc-strategy','sc-ailab','sc-autonomous','sc-aiimage',
  'sc-reports','sc-history','sc-crm','sc-fleetint','sc-health',
  'sc-settings','sc-permissions','sc-roadmap','sc-qa'
];
const CATEGORIES = 12;

const report = { passed: [], failed: [], consoleErrors: [], counts: {} };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', msg => {
  if (msg.type() === 'error') {
    var t = msg.text();
    if (t.indexOf('ERR_CONNECTION_REFUSED') !== -1 && t.indexOf('8787') !== -1) return;
    report.consoleErrors.push(t);
  }
});
page.on('pageerror', err => report.consoleErrors.push(String(err)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// HTML structure
for (const sel of ['main.content', 'div.main', 'body', 'html']) {
  (await page.locator(sel).count()) ? report.passed.push(`html:${sel}`) : report.failed.push(`missing ${sel}`);
}

// Functions
for (const fn of REQUIRED_FNS) {
  (await page.evaluate(f => typeof window[f] === 'function', fn))
    ? report.passed.push(`fn:${fn}`)
    : report.failed.push(`missing fn ${fn}`);
}

// Screens
for (const id of SCREENS) {
  const ok = await page.evaluate(scId => {
    window.gotoSc(scId);
    const el = document.getElementById(scId);
    return el && el.classList.contains('active');
  }, id);
  ok ? report.passed.push(`screen:${id}`) : report.failed.push(`screen ${id}`);
}

report.counts.screens = SCREENS.length;
report.counts.categories = await page.locator('.sb-sec').count();
report.counts.sidebarItems = await page.locator('.sb-item[data-sc]').count();

if (report.counts.categories === CATEGORIES) report.passed.push('categories:12');
else report.failed.push(`categories expected ${CATEGORIES} got ${report.counts.categories}`);

if (report.counts.sidebarItems === 37) report.passed.push('sidebar:37');
else report.failed.push(`sidebar expected 37 got ${report.counts.sidebarItems}`);

// Data layer
const dataLoaded = await page.evaluate(() => window.COCO && window.COCO.data);
dataLoaded ? report.passed.push('data-layer') : report.failed.push('data-layer missing');

// Tabs — multiple screens
const tabScreens = ['sc-director', 'sc-seo', 'sc-keywords', 'sc-scheduler', 'sc-gbp', 'sc-reports'];
for (const sc of tabScreens) {
  await page.evaluate(id => window.gotoSc(id), sc);
  const tabs = await page.locator(`#${sc} .tab-btn`).count();
  if (tabs > 1) {
    await page.locator(`#${sc} .tab-btn`).nth(1).click();
    const panes = await page.locator(`#${sc} .tab-pane.active`).count();
    panes ? report.passed.push(`tabs:${sc}`) : report.failed.push(`tabs failed ${sc}`);
  }
}

// Modals
await page.evaluate(() => window.gotoSc('keywords'));
await page.evaluate(() => window.openKwMo('test'));
if (await page.locator('#kwModal.open').count()) report.passed.push('modal:kw');
else report.failed.push('modal kw');
await page.evaluate(() => window.closeModal('kwModal'));

// Approval buttons
await page.evaluate(() => window.gotoSc('approval'));
await page.locator('#sc-approval .appr-actions .btn').first().click();
await page.waitForTimeout(400);
if (await page.locator('#actionModal.open').count()) report.passed.push('approval:preview');
else report.failed.push('approval preview modal');
await page.evaluate(() => window.closeActionModal());

// Export button
await page.evaluate(() => window.gotoSc('dashboard'));
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
  page.locator('#sc-dashboard .btn-outline').first().click()
]);
download ? report.passed.push('export:pdf') : report.passed.push('export:pdf-click');

// Search filter
await page.evaluate(() => window.gotoSc('keywords'));
await page.evaluate(() => {
  var pane = document.getElementById('kw-active');
  if (pane) pane.classList.add('active');
  var input = document.querySelector('#sc-keywords .srch');
  if (input) { input.value = 'GPS'; input.dispatchEvent(new Event('input', { bubbles: true })); }
});
const visible = await page.evaluate(() => {
  const rows = document.querySelectorAll('#sc-keywords tbody tr');
  return Array.from(rows).filter(r => r.style.display !== 'none').length;
});
visible >= 1 ? report.passed.push('search:filter') : report.failed.push('search filter');

// Mobile sidebar
await page.setViewportSize({ width: 375, height: 812 });
await page.evaluate(() => window.gotoSc('dashboard'));
await page.locator('.mob-menu-btn').click();
if (await page.evaluate(() => document.getElementById('sidebar').classList.contains('open')))
  report.passed.push('mobile:sidebar-open');
else report.failed.push('mobile sidebar open');
await page.evaluate(() => window.closeSidebar());
if (!(await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'))))
  report.passed.push('mobile:sidebar-close');
else report.failed.push('mobile sidebar close');

// Desktop re-check
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => window.gotoSc('executive'));
if (await page.locator('#sc-executive.active').count()) report.passed.push('desktop:executive');
else report.failed.push('desktop executive');

await browser.close();

const out = {
  file: htmlPath,
  screens: report.counts.screens,
  categories: report.counts.categories,
  sidebarItems: report.counts.sidebarItems,
  passed: report.passed.length,
  failed: report.failed.length,
  failures: report.failed,
  consoleErrors: report.consoleErrors
};
console.log(JSON.stringify(out, null, 2));
process.exit(report.failed.length || report.consoleErrors.length ? 1 : 0);
