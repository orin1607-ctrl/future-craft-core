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
];

const V4_CATEGORIES = ['ai','plan','site','promo','exec','reports','knowledge','settings'];

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

  const cats = await page.locator('#v4CategoryGrid .v4-world-btn').count();
  cats === 8 ? pass(`${vp.name}:cats-8`) : fail(`${vp.name}:cats-${cats}`);

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

  // Chat
  await page.evaluate(() => window.gotoSc('morning'));
  await page.fill('#v4ChatInput', 'מה לעשות היום?');
  await page.click('#v4ChatSend');
  await page.waitForTimeout(400);
  const msgs = await page.locator('#v4ChatMsgs .v4-msg').count();
  msgs >= 2 ? pass(`${vp.name}:chat`) : fail(`${vp.name}:chat`);

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

    const sendH = await page.evaluate(() => document.getElementById('v4ChatSend')?.getBoundingClientRect().height || 0);
    sendH >= 48 ? pass('mobile:chat-send-48px') : fail(`mobile:chat-send-${sendH}px`);

    report.mobile.categoryBtnHeight = btnH;
    const sidebarHidden = await page.evaluate(() => {
      const s = document.getElementById('sidebar');
      return s ? getComputedStyle(s).display === 'none' : true;
    });
    sidebarHidden ? pass('mobile:sidebar-hidden') : fail('mobile:sidebar-visible');
  }

  // Assets
  for (const asset of ['home-v4.js', 'home-v4.css', 'app.js']) {
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
