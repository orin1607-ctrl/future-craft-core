/**
 * P1 UAT — Full pre-user QA on Staging (Orin Car)
 * Covers: live data, dashboard, AI wiring, all modules, mobile, console, assets
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';
const pageUrl = `${STAGING}/ai-marketing-platform`;
const OUT_DIR = path.join(__dirname, '../docs/audit-reports/project-001');

const V4_CATEGORIES = ['status', 'goals', 'assets', 'assistants', 'actions', 'history', 'decisions', 'reports'];

const LEGACY_SCREENS = [
  'sc-dashboard', 'sc-usermanual', 'sc-director', 'sc-approval', 'sc-notifications', 'sc-tasks', 'sc-briefing',
  'sc-seo', 'sc-keywords', 'sc-intel', 'sc-competitors', 'sc-news', 'sc-content', 'sc-warehouse', 'sc-pages',
  'sc-landing', 'sc-scheduler', 'sc-gbp', 'sc-ads', 'sc-roi', 'sc-funnel', 'sc-journey', 'sc-kpi', 'sc-heatmap',
  'sc-executive', 'sc-strategy', 'sc-ailab', 'sc-autonomous', 'sc-aiimage', 'sc-reports', 'sc-history', 'sc-crm',
  'sc-fleetint', 'sc-health', 'sc-settings', 'sc-permissions', 'sc-roadmap', 'sc-aiguide', 'sc-qa', 'sc-modules',
  'sc-morning', 'sc-category', 'sc-aichat',
];

const SAMPLE_MODULES = ['seo', 'keywords', 'content', 'gbp', 'ads', 'approval', 'settings', 'reports', 'director', 'dashboard'];

const report = {
  url: pageUrl,
  at: new Date().toISOString(),
  sections: { data: [], ai: [], dashboard: [], modules: [], mobile: [], system: [] },
  passed: [],
  failed: [],
  warnings: [],
  manualRequired: [],
  consoleErrors: [],
  pageErrors: [],
  ok: true,
};

function pass(section, msg) { report.passed.push(msg); report.sections[section].push({ ok: true, msg }); }
function fail(section, msg) { report.failed.push(msg); report.sections[section].push({ ok: false, msg }); report.ok = false; }
function warn(section, msg) { report.warnings.push(msg); report.sections[section].push({ ok: 'warn', msg }); }
function manual(msg) { report.manualRequired.push(msg); }

function isBenignConsole(t) {
  return /favicon|404|net::ERR|8787|503|REFUSED|Failed to load resource.*404/.test(t);
}

// --- Static asset checks ---
try {
  const dashRes = await fetch(`${STAGING}/project-001/dashboard.json?t=${Date.now()}`);
  if (dashRes.ok) {
    const dash = await dashRes.json();
    if (dash.stats && dash.connections?.searchConsole?.ok) pass('data', 'static:dashboard-json-gsc');
    else fail('data', 'static:dashboard-json-incomplete');
    if (dash.dataSource === 'sheets') pass('data', 'static:dataSource-sheets');
    else warn('data', `static:dataSource-${dash.dataSource}`);
  } else fail('data', `static:dashboard-json-${dashRes.status}`);
} catch (e) {
  fail('data', `static:dashboard-fetch-${e.message}`);
}

const browser = await chromium.launch();

async function runViewport(label, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (isBenignConsole(t)) return;
    report.consoleErrors.push(`[${label}] ${t}`);
  });
  page.on('pageerror', (err) => report.pageErrors.push(`[${label}] ${err.message}`));

  const res = await page.goto(pageUrl + '?uat=' + Date.now(), { waitUntil: 'networkidle', timeout: 90000 });
  if (!res?.ok()) fail('system', `${label}:page-load-${res?.status()}`);
  else pass('system', `${label}:page-load`);

  // Wait for data layer
  const dataReady = await page.waitForFunction(
    () => window.COCO?.data?.kpis && typeof window.isLiveData === 'function',
    { timeout: 15000 },
  ).then(() => true).catch(() => false);
  if (dataReady) pass('data', `${label}:data-layer-ready`);
  else fail('data', `${label}:data-layer-timeout`);

  const liveInfo = await page.evaluate(() => {
    const d = window.COCO?.data;
    const live = typeof window.isLiveData === 'function' && window.isLiveData();
    const cards = [...document.querySelectorAll('#v4DashGrid .v4-dash-card')].map((c) => ({
      lbl: c.querySelector('.lbl')?.textContent,
      val: c.querySelector('.val')?.textContent,
      demo: !!c.querySelector('.demo-tag'),
    }));
    return {
      live,
      source: d?.meta?.source,
      kpis: d?.kpis,
      cardCount: cards.length,
      cards,
      emptyCards: cards.filter((c) => !c.val || c.val === '—' || c.val.trim() === ''),
      demoCards: cards.filter((c) => c.demo),
      connections: d?.connections,
    };
  });

  if (liveInfo.live) pass('data', `${label}:isLiveData-true`);
  else fail('data', `${label}:isLiveData-false-source-${liveInfo.source}`);

  if (liveInfo.cardCount >= 14) pass('dashboard', `${label}:dash-14-cards`);
  else fail('dashboard', `${label}:dash-cards-${liveInfo.cardCount}`);

  // Allow "—" only on leads when live (no CRM yet)
  const badEmpty = liveInfo.emptyCards.filter((c) => c.lbl !== 'לידים');
  if (badEmpty.length === 0) pass('dashboard', `${label}:no-empty-cards`);
  else fail('dashboard', `${label}:empty-cards-${badEmpty.map((c) => c.lbl).join(',')}`);

  if (liveInfo.live && liveInfo.demoCards.length === 0) pass('dashboard', `${label}:no-demo-tags-when-live`);
  else if (liveInfo.live) fail('dashboard', `${label}:demo-tags-${liveInfo.demoCards.length}`);
  else warn('dashboard', `${label}:demo-mode-expected-tags`);

  // Live KPI sanity
  if (liveInfo.kpis?.avgPosition?.value && liveInfo.kpis.avgPosition.value !== '—') {
    pass('data', `${label}:kpi-position-${liveInfo.kpis.avgPosition.value}`);
  } else fail('data', `${label}:kpi-position-missing`);

  // Refresh / sync
  await page.evaluate(() => window.syncNow?.());
  await page.waitForTimeout(1200);
  const afterSync = await page.evaluate(() => ({
    live: window.isLiveData?.(),
    hasKpis: !!window.COCO?.data?.kpis,
  }));
  if (afterSync.hasKpis) pass('dashboard', `${label}:sync-refresh-ok`);
  else fail('dashboard', `${label}:sync-refresh-failed`);

  // AI wiring
  const aiWire = await page.evaluate(() => ({
    marketingApiChat: typeof window.marketingApiChat === 'function',
    cocoAssistant: typeof window.COCO_ASSISTANT?.apiChat === 'function',
    runAi: typeof window.runAi === 'function',
    loadData: typeof window.loadData === 'function',
    buildCtx: typeof window.COCO_ASSISTANT?.buildSystemPrompt === 'function',
  }));
  if (aiWire.marketingApiChat) pass('ai', `${label}:marketingApiChat-exported`);
  else fail('ai', `${label}:marketingApiChat-missing`);
  if (aiWire.cocoAssistant) pass('ai', `${label}:COCO_ASSISTANT-apiChat`);
  else fail('ai', `${label}:COCO_ASSISTANT-missing`);
  if (aiWire.runAi) pass('ai', `${label}:runAi-exported`);
  else fail('ai', `${label}:runAi-missing`);

  const ctxSample = await page.evaluate(() => {
    try {
      return window.COCO_ASSISTANT?.buildSystemPrompt?.() || '';
    } catch { return ''; }
  });
  if (ctxSample.includes('מיקום ממוצע') || ctxSample.includes('קליקים')) {
    pass('ai', `${label}:ai-context-includes-kpis`);
  } else fail('ai', `${label}:ai-context-missing-kpis`);

  // V4 chat — must get a reply (fallback OK on staging without auth)
  await page.evaluate(() => window.gotoSc('morning'));
  const questions = ['מה לעשות היום?', 'מה מצב ה-SEO?', 'תן לי נתונים'];
  for (const q of questions) {
    const before = await page.locator('#v4ChatMsgs .v4-msg').count();
    await page.fill('#v4ChatInput', q);
    await page.click('#v4ChatSend');
    await page.waitForTimeout(800);
    const after = await page.locator('#v4ChatMsgs .v4-msg').count();
    if (after > before) pass('ai', `${label}:chat-reply-${q.slice(0, 12)}`);
    else fail('ai', `${label}:chat-no-reply-${q.slice(0, 12)}`);
  }

  // Run AI — on staging without JWT expects toast, not crash
  await page.evaluate(() => window.gotoSc('director'));
  await page.evaluate(() => window.runAi('director', 'בדיקת QA קצרה', 'QA'));
  await page.waitForTimeout(600);
  const toastVisible = await page.evaluate(() => {
    const t = document.getElementById('cocoToast');
    return t?.classList.contains('show');
  });
  if (toastVisible) pass('ai', `${label}:runAi-toast-no-crash`);
  else warn('ai', `${label}:runAi-no-toast`);

  manual('AI חי (OpenAI): דורש התחברות Super Admin ב-/ai-marketing — לא ניתן לאוטומציה ללא JWT');

  // All categories
  for (const catId of V4_CATEGORIES) {
    await page.evaluate((id) => window.HomeV4?.openCategory(id), catId);
    await page.waitForTimeout(200);
    const open = await page.evaluate(() => document.getElementById('sc-category')?.classList.contains('active'));
    const items = await page.locator('#v4CategoryItems .v4-world-btn').count();
    if (open && items > 0) pass('modules', `${label}:cat-${catId}`);
    else fail('modules', `${label}:cat-${catId}`);
    await page.evaluate(() => window.gotoSc('morning'));
  }

  // All legacy screens navigate
  for (const scId of LEGACY_SCREENS) {
    const ok = await page.evaluate((id) => {
      window.gotoSc(id.replace(/^sc-/, ''));
      const el = document.getElementById(id);
      return !!(el && el.classList.contains('active'));
    }, scId);
    if (ok) pass('modules', `${label}:screen-${scId}`);
    else fail('modules', `${label}:screen-${scId}`);
  }

  // Module buttons smoke + back
  for (const mod of SAMPLE_MODULES) {
    await page.evaluate((id) => window.gotoSc(id), mod);
    await page.waitForTimeout(150);
    const active = await page.evaluate((id) => document.getElementById('sc-' + id)?.classList.contains('active'), mod);
    if (!active) { fail('modules', `${label}:nav-${mod}`); continue; }
    pass('modules', `${label}:nav-${mod}`);
    const btns = await page.locator(`#sc-${mod} .btn`).count();
    if (btns > 0) pass('modules', `${label}:buttons-${mod}-${btns}`);
    const back = page.locator(`#sc-${mod} .v4-module-bar .v4-go-home`);
    if (await back.count()) {
      await back.first().click();
      await page.waitForTimeout(200);
      const home = await page.evaluate(() => document.getElementById('sc-morning')?.classList.contains('active'));
      if (home) pass('modules', `${label}:back-home-from-${mod}`);
      else fail('modules', `${label}:back-home-fail-${mod}`);
    }
  }

  // Assets 200
  for (const asset of ['home-v4.js', 'home-v4.css', 'app.js', 'ai-assistant.js']) {
    const r = await page.request.get(`${STAGING}/ai-marketing/${asset}`);
    if (r.ok()) pass('system', `${label}:asset-${asset}`);
    else fail('system', `${label}:asset-${asset}-${r.status()}`);
  }

  if (label.startsWith('mobile')) {
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    if (overflow.doc <= overflow.win + 2) pass('mobile', `${label}:no-horizontal-scroll`);
    else fail('mobile', `${label}:overflow`);

    const dashCols = await page.evaluate(() => {
      const g = document.getElementById('v4DashGrid');
      return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    });
    if (dashCols === 1) pass('mobile', `${label}:dash-1-col`);
    else fail('mobile', `${label}:dash-cols-${dashCols}`);

    const catH = await page.evaluate(() => document.querySelector('#v4CategoryGrid .v4-world-btn')?.getBoundingClientRect().height || 0);
    if (catH >= 72) pass('mobile', `${label}:cat-btn-${Math.round(catH)}px`);
    else fail('mobile', `${label}:cat-btn-${catH}px`);

    const sendH = await page.evaluate(() => document.getElementById('v4ChatSend')?.getBoundingClientRect().height || 0);
    if (sendH >= 48) pass('mobile', `${label}:chat-send-${Math.round(sendH)}px`);
    else fail('mobile', `${label}:chat-send-${sendH}px`);
  }

  await page.close();
}

await runViewport('desktop', { width: 1280, height: 900 });
await runViewport('mobile-390', { width: 390, height: 844 });

// iPhone + Android device profiles
async function runDevice(label, deviceDescriptor) {
  const ctx = await browser.newContext({ ...deviceDescriptor, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isBenignConsole(msg.text())) {
      report.consoleErrors.push(`[${label}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => report.pageErrors.push(`[${label}] ${err.message}`));

  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.COCO?.data?.kpis, { timeout: 15000 }).catch(() => {});

  const live = await page.evaluate(() => window.isLiveData?.());
  live ? pass('mobile', `${label}:live-data`) : fail('mobile', `${label}:live-data`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  overflow ? pass('mobile', `${label}:no-scroll`) : fail('mobile', `${label}:horizontal-scroll`);

  for (const catId of V4_CATEGORIES) {
    await page.evaluate((id) => window.HomeV4?.openCategory(id), catId);
    await page.waitForTimeout(150);
    const items = await page.locator('#v4CategoryItems .v4-world-btn').count();
    if (items > 0) pass('mobile', `${label}:cat-${catId}`);
    else fail('mobile', `${label}:cat-${catId}`);
    await page.evaluate(() => window.gotoSc('morning'));
  }

  await ctx.close();
}

await runDevice('iphone-13', devices['iPhone 13']);
await runDevice('android-pixel5', devices['Pixel 5']);

await browser.close();

// Console / page errors fail the run
const uniqueConsole = [...new Set(report.consoleErrors)];
const uniquePage = [...new Set(report.pageErrors)];
if (uniqueConsole.length) {
  report.ok = false;
  uniqueConsole.forEach((e) => fail('system', `console:${e.slice(0, 120)}`));
}
if (uniquePage.length) {
  report.ok = false;
  uniquePage.forEach((e) => fail('system', `pageerror:${e.slice(0, 120)}`));
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'p1-uat-qa.json');
writeFileSync(outPath, JSON.stringify({
  ...report,
  passedCount: report.passed.length,
  failedCount: report.failed.length,
  warningCount: report.warnings.length,
  consoleErrors: uniqueConsole,
  pageErrors: uniquePage,
  uatReady: report.ok,
  at: new Date().toISOString(),
}, null, 2));

const summary = {
  uatReady: report.ok,
  passed: report.passed.length,
  failed: report.failed.length,
  warnings: report.warnings.length,
  failures: report.failed,
  manualRequired: report.manualRequired,
  consoleErrors: uniqueConsole,
  pageErrors: uniquePage,
  reportPath: outPath,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(report.ok ? 0 : 1);
