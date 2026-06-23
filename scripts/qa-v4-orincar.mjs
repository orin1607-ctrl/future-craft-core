/**
 * QA — Mockup V4 for Orin Car (Staging GitHub Pages)
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';
const pageUrl = `${STAGING}/ai-marketing-platform`;

const LEGACY_SCREENS = [
  'sc-dashboard','sc-usermanual','sc-director','sc-approval','sc-notifications','sc-tasks','sc-briefing',
  'sc-seo','sc-keywords','sc-intel','sc-competitors','sc-news','sc-content','sc-warehouse','sc-pages',
  'sc-landing','sc-scheduler','sc-gbp','sc-ads','sc-roi','sc-funnel','sc-journey','sc-kpi','sc-heatmap',
  'sc-executive','sc-strategy','sc-ailab','sc-autonomous','sc-aiimage','sc-reports','sc-history','sc-crm',
  'sc-fleetint','sc-health','sc-settings','sc-permissions','sc-roadmap','sc-aiguide','sc-qa','sc-modules',
  'sc-aichat',
  'sc-mkt-hub', 'sc-mkt-client',
];

const V4_CATEGORIES = ['companies','status','goals','assets','assistants','actions','history','decisions','reports'];

const report = {
  url: pageUrl,
  passed: [],
  failed: [],
  warnings: [],
  consoleErrors: [],
  missingScreens: [],
  mobile: {},
};

function pass(msg) { report.passed.push(msg); }
function fail(msg) { report.failed.push(msg); }
function warn(msg) { report.warnings.push(msg); }

const browser = await chromium.launch();

for (const vp of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (/favicon|404|net::ERR|8787|503/.test(t)) return;
    report.consoleErrors.push(`[${vp.name}] ${t}`);
  });

  const res = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
  if (!res?.ok()) fail(`${vp.name}:page-load-${res?.status()}`);
  else pass(`${vp.name}:page-load`);

  const v4 = await page.evaluate(() => document.body.classList.contains('v4-mode'));
  v4 ? pass(`${vp.name}:v4-mode`) : fail(`${vp.name}:v4-mode`);

  const home = await page.evaluate(() => !!document.getElementById('sc-morning')?.classList.contains('active'));
  home ? pass(`${vp.name}:home-default`) : fail(`${vp.name}:home-default`);

  const dashCards = await page.locator('#v4DashGrid .v4-dash-card').count();
  dashCards >= 14 ? pass(`${vp.name}:dash-14`) : fail(`${vp.name}:dash-${dashCards}`);

  const prdBtns = await page.locator('#v4CategoryGrid .v4-world-btn').count();
  prdBtns === 9 ? pass(`${vp.name}:prd-9-buttons`) : fail(`${vp.name}:prd-buttons-${prdBtns}`);

  // Categories open
  for (const catId of V4_CATEGORIES) {
    await page.evaluate((id) => window.HomeV4?.openCategory(id), catId);
    await page.waitForTimeout(200);
    const open = await page.evaluate(() => document.getElementById('sc-category')?.classList.contains('active'));
    const items = await page.locator('#v4CategoryItems .v4-world-btn').count();
    if (open && items > 0) pass(`${vp.name}:cat-${catId}`);
    else fail(`${vp.name}:cat-${catId}`);
    await page.evaluate(() => window.gotoSc('morning'));
  }

  // Legacy screens exist in DOM
  const missing = await page.evaluate((ids) => {
    return ids.filter((id) => !document.getElementById(id));
  }, LEGACY_SCREENS);
  if (missing.length === 0) pass(`${vp.name}:all-legacy-screens-dom`);
  else {
    report.missingScreens = missing;
    fail(`${vp.name}:missing-screens-${missing.join(',')}`);
  }

  // Navigate sample modules
  for (const sc of ['seo', 'gbp', 'approval', 'settings', 'reports']) {
    await page.evaluate((id) => window.gotoSc(id), sc);
    await page.waitForTimeout(150);
    const active = await page.evaluate((id) => document.getElementById('sc-' + id)?.classList.contains('active'), sc);
    active ? pass(`${vp.name}:nav-${sc}`) : fail(`${vp.name}:nav-${sc}`);
    const back = await page.locator('.v4-module-bar .v4-go-home').first();
    if (await back.isVisible()) {
      const box = await back.boundingBox();
      if (box && box.height >= 44) pass(`${vp.name}:back-size-${sc}`);
      else fail(`${vp.name}:back-small-${sc}`);
    }
  }

  // Chat on aichat screen
  await page.evaluate(() => window.gotoSc('aichat'));
  await page.fill('#v4ChatInput', 'מה לעשות היום?');
  await page.click('#v4ChatSend');
  await page.waitForTimeout(400);
  const chatMsgs = await page.locator('#v4ChatMsgs .v4-msg').count();
  chatMsgs >= 2 ? pass(`${vp.name}:chat-aichat`) : fail(`${vp.name}:chat-aichat`);

  // PRD filter bar on module + home
  await page.evaluate(() => window.gotoSc('seo'));
  await page.waitForTimeout(500);
  const filterInfo = await page.evaluate(() => {
    const bar = document.querySelector('#sc-seo .prd-filter-bar');
    const ctx = document.querySelector('#sc-seo .prd-context-bar');
    const badges = document.querySelectorAll('#sc-seo .prd-ctx-badge').length;
    const breadcrumb = document.querySelector('#sc-seo .prd-breadcrumb');
    if (!bar) return { ok: false };
    const toggle = bar.querySelector('.prd-filter-toggle');
    if (toggle) toggle.click();
    const selects = bar.querySelectorAll('.prd-filter-select').length;
    const hasCampaignId = !!bar.querySelector('[data-key="campaignExternalId"]');
    const hasCampaignStatus = !!bar.querySelector('[data-key="campaignStatus"]');
    const hasResponsible = !!bar.querySelector('[data-key="responsibleUser"]');
    const hasDatePreset = !!bar.querySelector('[data-key="datePreset"]');
    const hasSavedViews = !!bar.querySelector('.prd-saved-views');
    const stub = bar.textContent.includes('שלב ב');
    const dg = document.querySelector('#sc-seo .prd-dg-search');
    return {
      ok: !!bar && !!ctx && badges >= 4 && !!breadcrumb && selects >= 6 && !stub,
      selects, hasCampaignId, hasCampaignStatus, hasResponsible, hasDatePreset, hasSavedViews, hasDg: !!dg,
    };
  });
  filterInfo.ok ? pass(`${vp.name}:prd-filter-v2-${filterInfo.selects}`) : fail(`${vp.name}:prd-filter-v2`);
  filterInfo.hasCampaignId ? pass(`${vp.name}:filter-campaign-id`) : fail(`${vp.name}:filter-campaign-id`);
  filterInfo.hasDatePreset ? pass(`${vp.name}:filter-date-preset`) : fail(`${vp.name}:filter-date-preset`);
  filterInfo.hasSavedViews ? pass(`${vp.name}:filter-saved-views`) : fail(`${vp.name}:filter-saved-views`);
  filterInfo.hasDg ? pass(`${vp.name}:datagrid-seo`) : fail(`${vp.name}:datagrid-seo`);

  await page.evaluate(() => window.gotoSc('morning'));
  await page.waitForTimeout(300);
  const homeFilter = await page.evaluate(() => {
    const bar = document.querySelector('#sc-morning .prd-filter-bar');
    const company = bar?.querySelector('select[data-key="company"]');
    return { hasBar: !!bar, hasCompany: !!company, options: company?.options?.length || 0 };
  });
  homeFilter.hasBar && homeFilter.hasCompany && homeFilter.options >= 2
    ? pass(`${vp.name}:home-filter-company`)
    : fail(`${vp.name}:home-filter-company`);

  await page.evaluate(() => window.gotoSc('mkt-hub'));
  await page.waitForTimeout(300);
  const mktHub = await page.evaluate(() => ({
    screen: !!document.getElementById('sc-mkt-hub'),
    list: !!document.getElementById('mktHubList'),
  }));
  mktHub.screen && mktHub.list ? pass(`${vp.name}:mkt-hub-screen`) : fail(`${vp.name}:mkt-hub-screen`);

  await page.evaluate(() => window.gotoSc('settings'));
  await page.waitForTimeout(300);
  const themeCard = await page.evaluate(() => ({
    card: !!document.getElementById('prdThemeCard'),
    export: !!document.getElementById('prdThemeExport'),
    import: !!document.getElementById('prdThemeImport'),
    reset: !!document.getElementById('prdThemeReset'),
  }));
  themeCard.card ? pass(`${vp.name}:theme-settings-card`) : fail(`${vp.name}:theme-settings-card`);
  themeCard.export && themeCard.import ? pass(`${vp.name}:theme-import-export`) : fail(`${vp.name}:theme-import-export`);

  if (vp.name === 'desktop') {
    const requiredScreens = ['morning', 'mkt-hub', 'mkt-client', 'dashboard', 'seo', 'ads', 'gbp', 'crm', 'content', 'keywords', 'landing', 'competitors', 'director', 'reports', 'settings'];
    const missingFilter = await page.evaluate((ids) => {
      return ids.filter((id) => {
        const sc = document.getElementById('sc-' + id);
        return !sc || !sc.querySelector('.prd-filter-bar') || !sc.querySelector('.prd-context-bar');
      });
    }, requiredScreens);
    missingFilter.length === 0 ? pass('desktop:all-key-screens-filtered') : fail('desktop:missing-filter-' + missingFilter.join(','));
  }

  await page.evaluate(() => window.gotoSc('morning'));

  if (vp.name === 'mobile') {
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    if (overflow.doc <= overflow.win + 2) pass('mobile:no-horizontal-scroll');
    else fail(`mobile:overflow-${overflow.doc}>${overflow.win}`);

    const dashCols = await page.evaluate(() => {
      const g = document.getElementById('v4DashGrid');
      return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    });
    dashCols === 1 ? pass('mobile:dash-1-col') : fail(`mobile:dash-${dashCols}-cols`);

    const btnH = await page.evaluate(() => {
      const b = document.querySelector('#v4CategoryGrid .v4-world-btn');
      return b ? b.getBoundingClientRect().height : 0;
    });
    btnH >= 72 ? pass('mobile:cat-btn-72px') : fail(`mobile:cat-btn-${btnH}px`);

    const sendH = await page.evaluate(() => {
      window.gotoSc('aichat');
      var el = document.getElementById('v4ChatSend');
      return el && el.getBoundingClientRect().height ? el.getBoundingClientRect().height : 0;
    });
    sendH >= 48 ? pass('mobile:chat-send-48px') : fail(`mobile:chat-send-${sendH}px`);

    report.mobile.categoryBtnHeight = btnH;
    const sidebarHidden = await page.evaluate(() => {
      const s = document.getElementById('sidebar');
      return s ? getComputedStyle(s).display === 'none' : true;
    });
    sidebarHidden ? pass('mobile:sidebar-hidden') : fail('mobile:sidebar-visible');
  }

  // Assets
  for (const asset of ['home-v4.js', 'home-v4.css', 'home-prd.css', 'home-companies.css', 'app.js', 'prd-filter.js', 'prd-theme.js', 'prd-datagrid.js', 'marketing-api.js', 'marketing-client.js', 'prd-entities.json']) {
    const r = await page.request.get(`${STAGING}/ai-marketing/${asset}`);
    r.ok() ? pass(`${vp.name}:asset-${asset}`) : fail(`${vp.name}:asset-${asset}-${r.status()}`);
  }

  await page.close();
}

await browser.close();

const outPath = path.join(__dirname, '../docs/audit-reports/project-001/v4-orincar-qa.json');
writeFileSync(outPath, JSON.stringify({
  ...report,
  passedCount: report.passed.length,
  failedCount: report.failed.length,
  ok: report.failed.length === 0 && report.consoleErrors.length === 0,
  at: new Date().toISOString(),
}, null, 2));

console.log(JSON.stringify({
  ok: report.failed.length === 0,
  passed: report.passed.length,
  failed: report.failed.length,
  failures: report.failed,
  consoleErrors: [...new Set(report.consoleErrors)],
}, null, 2));

process.exit(report.failed.length ? 1 : 0);
