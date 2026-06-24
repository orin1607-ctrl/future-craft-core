/**
 * QA — Orin Car Staging (CocoClaude UI + legacy V4 fallback)
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

const COCO_FLOW_SCREENS = [
  'screen-hub', 'screen-status', 'screen-clients', 'screen-goals', 'screen-actions',
  'screen-history', 'screen-assets', 'screen-ai-decisions', 'screen-reports', 'screen-agents',
];

const COCO_ASSETS = [
  'coco-claude-main.js', 'coco-claude-bridge.js', 'coco-claude-screens.html',
  'coco-claude-main.css', 'coco-claude-integration.css', 'prd-dalia-nav.js',
  'marketing-api.js', 'marketing-client.js', 'home-prd.css', 'app.js', 'dalia-site-config.js',
  'coco-integration-hub.js', 'coco-claude-data.js',
];

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

async function runCocoQa(page, vp) {
  await page.waitForSelector('#screen-hub', { timeout: 45000 });
  pass(`${vp.name}:coco-hub-loaded`);

  const hubActive = await page.evaluate(() => document.getElementById('screen-hub')?.classList.contains('active'));
  hubActive ? pass(`${vp.name}:coco-home-default`) : fail(`${vp.name}:coco-home-default`);

  const hubCards = await page.locator('#screen-hub .hub-card').count();
  hubCards >= 8 ? pass(`${vp.name}:coco-hub-cards-${hubCards}`) : fail(`${vp.name}:coco-hub-cards-${hubCards}`);

  for (const sc of COCO_FLOW_SCREENS) {
    await page.evaluate((id) => window.goScreen(id), sc);
    await page.waitForTimeout(120);
    const active = await page.evaluate((id) => document.getElementById(id)?.classList.contains('active'), sc);
    active ? pass(`${vp.name}:coco-nav-${sc.replace('screen-', '')}`) : fail(`${vp.name}:coco-nav-${sc}`);
  }

  const mktApi = await page.evaluate(() => ({
    onboard: typeof window.MarketingApi?.onboardMarketingCustomer === 'function',
    google: (window.MarketingApi?.GOOGLE_PROVIDERS || []).length,
    social: (window.MarketingApi?.SOCIAL_PROVIDERS || []).length,
    flow: !!(window.CocoClaude?.FLOW_CHAIN?.length && window.COCO?.flowContext),
  }));
  mktApi.onboard ? pass(`${vp.name}:mkt-api-onboard`) : fail(`${vp.name}:mkt-api-onboard`);
  mktApi.google >= 7 ? pass(`${vp.name}:mkt-google-providers`) : fail(`${vp.name}:mkt-google-providers`);
  mktApi.social >= 6 ? pass(`${vp.name}:mkt-social-providers`) : fail(`${vp.name}:mkt-social-providers`);
  mktApi.flow ? pass(`${vp.name}:coco-flow-context`) : fail(`${vp.name}:coco-flow-context`);

  const daliaNav = await page.evaluate(() => ({
    topBtn: document.querySelectorAll('.prd-dalia-exit').length >= 1,
    screenBar: document.querySelectorAll('.prd-dalia-bar').length >= 1,
    exitFn: typeof window.PrdDaliaNav?.exitToDalia === 'function',
    homeIcon: typeof window.showDaliaToast === 'function',
  }));
  daliaNav.topBtn ? pass(`${vp.name}:dalia-top-exit`) : fail(`${vp.name}:dalia-top-exit`);
  daliaNav.screenBar ? pass(`${vp.name}:dalia-screen-bar`) : fail(`${vp.name}:dalia-screen-bar`);
  daliaNav.exitFn ? pass(`${vp.name}:dalia-exit-fn`) : fail(`${vp.name}:dalia-exit-fn`);
  daliaNav.homeIcon ? pass(`${vp.name}:dalia-home-icon`) : fail(`${vp.name}:dalia-home-icon`);

  const liveOnly = await page.evaluate(() => ({
    body: document.body.classList.contains('dalia-live-only'),
    site: document.getElementById('coco-hub-client-sub')?.textContent?.includes('dalia-c.com'),
    company: (document.getElementById('sf-company-display')?.textContent || '').indexOf('גרין-טק') < 0,
    statusRoot: !!document.getElementById('coco-live-status-root'),
  }));
  liveOnly.body ? pass(`${vp.name}:dalia-live-only`) : fail(`${vp.name}:dalia-live-only`);
  liveOnly.site ? pass(`${vp.name}:dalia-c-site-label`) : fail(`${vp.name}:dalia-c-site-label`);
  liveOnly.company ? pass(`${vp.name}:no-demo-company-label`) : fail(`${vp.name}:no-demo-company-label`);
  liveOnly.statusRoot ? pass(`${vp.name}:live-status-panel`) : fail(`${vp.name}:live-status-panel`);

  const hubKpis = await page.evaluate(() => {
    const t = document.getElementById('coco-live-hub-kpis')?.textContent || '';
    return {
      text: t,
      fake: /14,320|8,420/.test(t.replace(/\s/g, '')),
      hasGsc: /קליקים|GSC/.test(t),
    };
  });
  !hubKpis.fake ? pass(`${vp.name}:hub-no-fake-kpis`) : fail(`${vp.name}:hub-fake-kpis`);
  hubKpis.hasGsc ? pass(`${vp.name}:hub-live-kpi-labels`) : fail(`${vp.name}:hub-live-kpi-labels`);

  await page.evaluate(() => window.goScreen('screen-assets'));
  await page.waitForTimeout(400);
  const assetsLive = await page.evaluate(() => ({
    grid: !!document.getElementById('coco-live-assets-grid'),
    dalia: (document.querySelector('#screen-assets .page-subtitle')?.textContent || '').includes('dalia-c.com'),
    noGreentech: !(document.getElementById('coco-live-assets-grid')?.textContent || '').includes('greentech'),
  }));
  assetsLive.grid ? pass(`${vp.name}:assets-live-grid`) : fail(`${vp.name}:assets-live-grid`);
  assetsLive.dalia || assetsLive.noGreentech ? pass(`${vp.name}:assets-dalia-site`) : fail(`${vp.name}:assets-dalia-site`);

  await page.evaluate(() => window.goScreen('screen-hub'));

  if (vp.name === 'mobile') {
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    if (overflow.doc <= overflow.win + 4) pass('mobile:no-horizontal-scroll');
    else fail(`mobile:overflow-${overflow.doc}>${overflow.win}`);
  }

  for (const asset of COCO_ASSETS) {
    const r = await page.request.get(`${STAGING}/ai-marketing/${asset}`);
    r.ok() ? pass(`${vp.name}:asset-${asset}`) : fail(`${vp.name}:asset-${asset}-${r.status()}`);
  }
}

async function runV4Qa(page, vp) {
  const v4 = await page.evaluate(() => document.body.classList.contains('v4-mode'));
  v4 ? pass(`${vp.name}:v4-mode`) : fail(`${vp.name}:v4-mode`);

  const home = await page.evaluate(() => !!document.getElementById('sc-morning')?.classList.contains('active'));
  home ? pass(`${vp.name}:home-default`) : fail(`${vp.name}:home-default`);

  const dashCards = await page.locator('#v4DashGrid .v4-dash-card').count();
  dashCards >= 14 ? pass(`${vp.name}:dash-14`) : fail(`${vp.name}:dash-${dashCards}`);

  const prdBtns = await page.locator('#v4CategoryGrid .v4-world-btn').count();
  prdBtns === 9 ? pass(`${vp.name}:prd-9-buttons`) : fail(`${vp.name}:prd-buttons-${prdBtns}`);

  for (const catId of V4_CATEGORIES) {
    await page.evaluate((id) => window.HomeV4?.openCategory(id), catId);
    await page.waitForTimeout(200);
    const open = await page.evaluate(() => document.getElementById('sc-category')?.classList.contains('active'));
    const items = await page.locator('#v4CategoryItems .v4-world-btn').count();
    if (open && items > 0) pass(`${vp.name}:cat-${catId}`);
    else fail(`${vp.name}:cat-${catId}`);
    await page.evaluate(() => window.gotoSc('morning'));
  }

  const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), LEGACY_SCREENS);
  if (missing.length === 0) pass(`${vp.name}:all-legacy-screens-dom`);
  else {
    report.missingScreens = missing;
    fail(`${vp.name}:missing-screens-${missing.join(',')}`);
  }

  for (const sc of ['seo', 'gbp', 'approval', 'settings', 'reports']) {
    await page.evaluate((id) => window.gotoSc(id), sc);
    await page.waitForTimeout(150);
    const active = await page.evaluate((id) => document.getElementById('sc-' + id)?.classList.contains('active'), sc);
    active ? pass(`${vp.name}:nav-${sc}`) : fail(`${vp.name}:nav-${sc}`);
  }

  const daliaNav = await page.evaluate(() => ({
    topBtn: !!document.querySelector('.prd-dalia-exit'),
    screenBar: !!document.querySelector('.prd-dalia-bar'),
    exitFn: typeof window.PrdDaliaNav?.exitToDalia === 'function',
  }));
  daliaNav.topBtn ? pass(`${vp.name}:dalia-top-exit`) : fail(`${vp.name}:dalia-top-exit`);
  daliaNav.screenBar ? pass(`${vp.name}:dalia-screen-bar`) : fail(`${vp.name}:dalia-screen-bar`);
  daliaNav.exitFn ? pass(`${vp.name}:dalia-exit-fn`) : fail(`${vp.name}:dalia-exit-fn`);

  for (const asset of ['home-v4.js', 'home-v4.css', 'home-prd.css', 'marketing-api.js', 'marketing-client.js', 'prd-dalia-nav.js']) {
    const r = await page.request.get(`${STAGING}/ai-marketing/${asset}`);
    r.ok() ? pass(`${vp.name}:asset-${asset}`) : fail(`${vp.name}:asset-${asset}-${r.status()}`);
  }
}

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

  await page.waitForTimeout(1500);
  const cocoMode = await page.evaluate(() => !!document.getElementById('screen-hub'));
  if (cocoMode) {
    pass(`${vp.name}:coco-mode`);
    await runCocoQa(page, vp);
  } else {
    await runV4Qa(page, vp);
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
