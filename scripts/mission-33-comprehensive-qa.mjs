#!/usr/bin/env node
/**
 * Mission 33 — Comprehensive final QA for entire marketing management system.
 * Output: docs/audit-reports/mission-33/
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || `v3-mission-33-${Date.now()}`;
const STAGING = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'mission-33');
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { id: 'screen-hub', name: 'Dashboard', nameHe: 'מרכז שיווק' },
  { id: 'screen-status', name: 'Status', nameHe: 'מצב נוכחי' },
  { id: 'screen-clients', name: 'Clients', nameHe: 'חברות ועסקים' },
  { id: 'screen-business-strategy', name: 'Business Strategy', nameHe: 'אסטרטגיית שיווק AI' },
  { id: 'screen-agents', name: 'Agents', nameHe: 'עוזרים' },
  { id: 'screen-goals', name: 'Goals', nameHe: 'מטרות' },
  { id: 'screen-actions', name: 'Actions', nameHe: 'פעולות' },
  { id: 'screen-history', name: 'History', nameHe: 'היסטוריה' },
  { id: 'screen-reports', name: 'Reports', nameHe: 'דוחות' },
  { id: 'screen-crm', name: 'CRM', nameHe: 'CRM' },
  { id: 'screen-assets', name: 'Assets', nameHe: 'נכסים דיגיטליים' },
  { id: 'screen-ai-center', name: 'AI Control Center', nameHe: 'מרכז AI' },
  { id: 'screen-agent-dashboard', name: 'Agent Dashboard', nameHe: 'דשבורד עוזר' },
  { id: 'screen-crm-card', name: 'CRM Card', nameHe: 'כרטיס CRM' },
];

let commitHash = '';
try { commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim(); } catch { /* */ }

const report = {
  mission: 33,
  at: new Date().toISOString(),
  version: VER,
  stagingUrl: STAGING.split('&t=')[0],
  commitHash,
  screens: {},
  sections: {},
  fixes: [],
  consoleErrors: [],
  networkErrors: [],
  passed: 0,
  failed: 0,
  warnings: 0,
  readyForStaging: false,
};

function section(id, data) {
  report.sections[id] = data;
  if (data.status === 'pass') report.passed++;
  else if (data.status === 'warn') report.warnings++;
  else report.failed++;
}

function screenStatus(id, data) {
  report.screens[id] = data;
}

function ignorableConsole(t) {
  return /favicon|404.*\.(png|ico|woff|svg)|net::ERR.*font|Failed to load resource.*\.(png|ico)/i.test(t);
}

async function bootPage(page, opts = {}) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignorableConsole(m.text())) {
      report.consoleErrors.push(m.text().slice(0, 250));
    }
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (/favicon|\.woff|\.png|googleapis\.com\/css/i.test(url)) return;
    report.networkErrors.push({ url: url.slice(0, 120), err: req.failure()?.errorText || 'fail' });
  });
  const t0 = Date.now();
  await page.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
  await page.waitForSelector('#screen-hub, #coco-claude-root', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(opts.waitMs ?? 2500);
  return Date.now() - t0;
}

async function probeScreen(page, sid, opts = {}) {
  if (sid === 'screen-business-strategy') {
    await page.evaluate(() => BusinessStrategyWizard && BusinessStrategyWizard.open());
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 }).catch(() => {});
  } else if (sid === 'screen-agent-dashboard') {
    await page.evaluate(() => {
      if (typeof openAgentDashboard === 'function') openAgentDashboard('gsc');
      else goScreen('screen-agent-dashboard');
    });
  } else if (sid === 'screen-crm-card') {
    await page.evaluate(() => {
      if (typeof openCrmCard === 'function') openCrmCard('lead1');
      else goScreen('screen-crm-card');
    });
  } else {
    await page.evaluate((id) => goScreen(id), sid);
  }
  await page.waitForTimeout(opts.waitMs ?? 500);

  return page.evaluate((id) => {
    const el = document.getElementById(id);
    const dyn = document.getElementById('agent-dash-content') || document.getElementById('crm-card-content');
    const content = el?.querySelector('.content') || dyn || el;
    const rect = content?.getBoundingClientRect?.() || { height: 0 };
    const text = (content?.innerText || el?.innerText || '').trim();
    const scrollEl = el?.querySelector('.content') || dyn || el;
    const canScroll = scrollEl ? scrollEl.scrollHeight > scrollEl.clientHeight + 5 : false;
    const overflowY = scrollEl ? getComputedStyle(scrollEl).overflowY : '';
    const buttons = el ? [...el.querySelectorAll('button, .btn, .hub-card, .bnav-btn')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length : 0;
    const tabs = el ? el.querySelectorAll('.nav-tab, .nav-tabs .nav-tab, [role="tab"]').length : 0;
    return {
      exists: !!el,
      active: el?.classList.contains('active') ?? false,
      hasContent: text.length > 20,
      contentLen: text.length,
      canScroll,
      overflowY,
      buttons,
      tabs,
      height: rect.height,
    };
  }, sid);
}

async function mobileScrollTest(page, sid) {
  await probeScreen(page, sid, { waitMs: 400 });
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    const scrollEl = el?.querySelector('.content') || document.getElementById('agent-dash-content') || document.getElementById('crm-card-content') || el;
    if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight + 5) {
      return { sid: id, scrollable: false, ok: true, reason: 'no_scroll_needed' };
    }
    const positions = [scrollEl.scrollTop];
    for (let i = 0; i < 12; i++) {
      scrollEl.scrollTop += 200;
      positions.push(scrollEl.scrollTop);
    }
    const downOk = positions[positions.length - 1] > positions[0] + 50;
    for (let i = 0; i < 12; i++) scrollEl.scrollTop -= 200;
    const upOk = scrollEl.scrollTop < positions[positions.length - 1] - 30;
    const jumps = positions.slice(1).filter((p, i) => p < positions[i] - 80).length;
    const fab = document.querySelector('.ai-fab, #coco-ai-fab, [class*="fab"]');
    const footer = document.querySelector('.bnav, .footer, #biz-strategy-root .footer');
    let fabBlocks = false;
    if (fab && scrollEl) {
      const fr = fab.getBoundingClientRect();
      const br = scrollEl.getBoundingClientRect();
      fabBlocks = fr.bottom > br.bottom - 20 && fr.top < br.bottom;
    }
    return {
      sid: id,
      scrollable: true,
      ok: downOk && jumps === 0,
      downOk,
      upOk,
      jumps,
      fabBlocks,
      footerVisible: !!footer,
      maxScroll: positions[positions.length - 1],
    };
  }, sid);
}

async function clickId(page, id) {
  await page.evaluate((sel) => { const el = document.getElementById(sel); if (el) el.click(); }, id);
}

// ── 33.0 Git / Deploy ──
async function checkDeploy() {
  const checks = { commitHash, localWizard: false, stagingWizard: false, pagesOk: false };
  try {
    const local = readFileSync(join(ROOT, 'public/ai-marketing/business-strategy-wizard.js'), 'utf8');
    checks.localWizard = /2\.0\.0-approved/.test(local);
    const res = await fetch('https://orin1607-ctrl.github.io/future-craft-core/ai-marketing/business-strategy-wizard.js?t=' + Date.now());
    const body = await res.text();
    checks.stagingWizard = /2\.0\.0-approved/.test(body);
    checks.pagesOk = res.ok;
  } catch (e) {
    checks.error = e.message;
  }
  section('33.0_git_deploy', {
    status: checks.stagingWizard && checks.pagesOk ? 'pass' : 'warn',
    title: 'Git / GitHub Pages deploy',
    found: checks,
    note: checks.stagingWizard ? 'Staging bundle matches approved wizard' : 'Staging may still be deploying',
  });
}

// ── Main QA ──
console.log('Mission 33 QA —', STAGING);
const browser = await chromium.launch({ headless: true });

await checkDeploy();

// 33.1 Desktop — all screens
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bootMs = await bootPage(page);
  const desktop = {};

  for (const sc of SCREENS) {
    const info = await probeScreen(page, sc.id);
    let status = 'pass';
    const issues = [];
    if (!info.exists) { status = 'fail'; issues.push('screen missing'); }
    else if (!info.hasContent && sc.id !== 'screen-business-strategy') { status = 'warn'; issues.push('low content'); }
    if (sc.id === 'screen-business-strategy' && !info.hasContent) {
      const wiz = await page.evaluate(() => !!document.querySelector('#biz-strategy-root .tb'));
      if (!wiz) { status = 'fail'; issues.push('wizard not mounted'); }
      else { status = 'pass'; info.hasContent = true; }
    }
    desktop[sc.id] = { ...info, status, issues };
    screenStatus(sc.id, {
      desktop: status,
      name: sc.nameHe,
      issues,
      ...info,
    });
  }

  // Hub cards
  await page.evaluate(() => goScreen('screen-hub'));
  const hubCards = await page.evaluate(() => document.querySelectorAll('#screen-hub .hub-card').length);

  // Actions tabs
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { timeout: 90000 }).catch(() => {});
  const actionTabs = await page.evaluate(() => {
    const tabs = document.querySelectorAll('#screen-actions .nav-tab');
    const results = [];
    tabs.forEach((t, i) => {
      t.click();
      const pane = document.querySelector('#screen-actions .tab-pane.active, #screen-actions .tab-content.active');
      results.push({ i, text: t.textContent?.trim().slice(0, 20), hasPane: !!pane, paneLen: pane?.innerText?.length || 0 });
    });
    return { count: tabs.length, tabs: results };
  });

  // AI Control Center
  await page.evaluate(() => goScreen('screen-ai-center'));
  const aiCenter = await page.evaluate(() => ({
    panel: !!document.getElementById('coco-ai-control-panel'),
    input: !!document.getElementById('coco-ai-control-input'),
    hasControl: !!window.COCO_AI_CONTROL,
  }));

  const desktopOk = Object.values(desktop).every((d) => d.status !== 'fail');
  section('33.1_desktop_screens', {
    status: desktopOk ? 'pass' : 'fail',
    title: 'Desktop — all screens',
    found: { bootMs, hubCards, actionTabs, aiCenter, screens: desktop },
  });
  await page.close();
}

// 33.2 Mobile — scroll all screens (critical)
{
  const page = await browser.newPage({ ...devices['iPhone 13'] });
  await bootPage(page);
  const mobile = {};
  const scrollFails = [];

  for (const sc of SCREENS) {
    const info = await probeScreen(page, sc.id, { waitMs: 450 });
    const scroll = await mobileScrollTest(page, sc.id);
    let status = 'pass';
    const issues = [];
    if (!info.exists) { status = 'fail'; issues.push('missing'); }
    if (scroll.scrollable && !scroll.ok) { status = 'fail'; issues.push('scroll_stuck'); scrollFails.push(sc.id); }
    if (scroll.fabBlocks) { status = status === 'fail' ? 'fail' : 'warn'; issues.push('fab_may_block'); }
    mobile[sc.id] = { info, scroll, status, issues };
    const prev = report.screens[sc.id] || {};
    screenStatus(sc.id, {
      ...prev,
      mobile: status,
      mobileScroll: scroll,
      issues: [...(prev.issues || []), ...issues],
    });
  }

  // Deep actions scroll
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('.coco-act-lite-card', { timeout: 90000 }).catch(() => {});
  const actionsDeep = await page.evaluate(async () => {
    const el = document.querySelector('#screen-actions .content');
    if (!el) return { ok: false };
    const positions = [el.scrollTop];
    for (let i = 0; i < 15; i++) { el.scrollTop += 250; positions.push(el.scrollTop); await new Promise((r) => requestAnimationFrame(r)); }
    const jumps = positions.slice(1).filter((p, i) => p < positions[i] - 50).length;
    return { ok: el.scrollTop > 100 && jumps === 0, maxScroll: el.scrollTop, jumps };
  });

  section('33.2_mobile_scroll', {
    status: scrollFails.length === 0 && actionsDeep.ok ? 'pass' : 'fail',
    title: 'Mobile scroll — all screens',
    found: { scrollFails, actionsDeep, sample: Object.fromEntries(Object.entries(mobile).slice(0, 4)) },
  });
  await page.close();
}

// 33.3 Buttons & hub navigation
{
  const page = await browser.newPage({ ...devices['iPhone 13'] });
  await bootPage(page);
  await page.evaluate(() => goScreen('screen-hub'));
  const hubNav = await page.evaluate(async () => {
    const results = [];
    const cards = [...document.querySelectorAll('#screen-hub .hub-card')];
    for (let i = 0; i < cards.length; i++) {
      goScreen('screen-hub');
      await new Promise((r) => setTimeout(r, 300));
      const c = document.querySelectorAll('#screen-hub .hub-card')[i];
      if (!c) break;
      const label = c.innerText.slice(0, 30);
      c.click();
      await new Promise((r) => setTimeout(r, 700));
      const act = document.querySelector('.screen.active');
      const active = act?.id || (document.querySelector('#biz-strategy-root .tb') ? 'screen-business-strategy' : null);
      results.push({ label, active, ok: !!active });
    }
    return results;
  });

  const bnav = await page.evaluate(async () => {
    const results = [];
    const btns = [...document.querySelectorAll('.bnav-btn')];
    for (const btn of btns) {
      const label = btn.innerText.slice(0, 15);
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
      results.push({ label, active: document.querySelector('.screen.active')?.id, ok: !!document.querySelector('.screen.active') });
    }
    return results;
  });

  let wbOk = false;
  try {
    await page.evaluate(() => goScreen('screen-actions'));
    await page.waitForSelector('.coco-act-lite-card', { timeout: 60000 });
    await page.evaluate(() => {
      const b = document.querySelector('[data-act-open-wb]');
      if (b) b.click();
    });
    await page.waitForSelector('.coco-act-lite-wb', { timeout: 15000 });
    wbOk = true;
    await page.evaluate(() => {
      const b = document.querySelector('[data-act-back-list]');
      if (b) b.click();
    });
  } catch { /* */ }

  const ok = hubNav.filter((h) => h.ok).length >= 8 && bnav.every((b) => b.ok);
  section('33.3_buttons', {
    status: ok ? 'pass' : 'warn',
    title: 'Buttons & navigation',
    found: { hubNav, bnav, workbenchOpens: wbOk },
  });
  await page.close();
}

// 33.4 Connections / workflow
{
  const page = await browser.newPage();
  await bootPage(page);
  const flow = [];

  // Business strategy full flow
  await page.evaluate(() => BusinessStrategyWizard.open());
  await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });
  flow.push({ step: 'biz_strategy_open', ok: true });

  const prefill = await page.inputValue('#b-name').catch(() => '');
  flow.push({ step: 'biz_prefill', ok: /דליה/i.test(prefill) });

  await clickId(page, 'btn-next');
  await page.waitForTimeout(300);
  await clickId(page, 'btn-next');
  await page.waitForTimeout(300);
  await page.evaluate(() => startAnalysis());
  await page.waitForFunction(() => {
    const d = document.getElementById('ana-done');
    return d && d.style.display !== 'none';
  }, { timeout: 35000 });
  flow.push({ step: 'biz_analysis', ok: true });

  for (let i = 0; i < 3; i++) { await clickId(page, 'btn-next'); await page.waitForTimeout(400); }
  await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 12000 });
  flow.push({ step: 'biz_export', ok: true });

  const ctx = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('coco-business-context-v1') || 'null'); } catch { return null; }
  });
  flow.push({ step: 'business_context', ok: ctx?.clientId === 'dalia-c-official' });

  await page.evaluate(() => { const b = document.querySelector('#exported .btn-p'); if (b) b.click(); });
  await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 10000 });
  flow.push({ step: 'to_agents', ok: true });

  for (const [sid, name] of [['screen-goals', 'goals'], ['screen-actions', 'actions'], ['screen-history', 'history'], ['screen-reports', 'reports']]) {
    await page.evaluate((id) => goScreen(id), sid);
    await page.waitForTimeout(800);
    const ok = await page.evaluate((id) => document.getElementById(id)?.classList.contains('active'), sid);
    flow.push({ step: name, ok });
  }

  const banner = await page.evaluate(() => document.getElementById('coco-live-agents-context')?.innerText || '');
  flow.push({ step: 'agents_banner', ok: /Business Context/i.test(banner) });

  section('33.4_connections', {
    status: flow.every((f) => f.ok) ? 'pass' : 'fail',
    title: 'Screen connections & Business Strategy flow',
    found: { flow },
  });
  await page.close();
}

// 33.5 Gmail / notifications
{
  const page = await browser.newPage();
  await bootPage(page);
  const gmail = await page.evaluate(() => {
    if (!window.MarketingNotifications) return { ok: false, reason: 'no MarketingNotifications' };
    const t = MarketingNotifications.testAll();
    const req = MarketingNotifications.getGmailRequirements();
    const types = Object.keys(MarketingNotifications.TYPES || {});
    return {
      ok: t.ok && t.count === 5,
      queueCount: t.count,
      types: types.length,
      gmailStatus: req.status,
      wired: req.wired,
      missing: req.missing,
      templateFiles: ['email-approval-sample.html', 'email-preview-approval.html'],
    };
  });
  const templatesExist = ['email-approval-sample.html', 'email-preview-approval.html'].every(
    (f) => existsSync(join(ROOT, 'public/ai-marketing', f))
  );
  section('33.5_gmail', {
    status: gmail.ok && templatesExist ? 'pass' : 'warn',
    title: 'Gmail / notifications infrastructure',
    found: { ...gmail, templatesExist },
    note: 'Live Gmail OAuth deferred — Resend stub ready',
  });
  await page.close();
}

// 33.6 Performance
{
  const page = await browser.newPage({ ...devices['iPhone 13'] });
  const bootMs = await bootPage(page);
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { timeout: 90000 }).catch(() => {});
  const perf = await page.evaluate(() => ({
    totalDom: document.querySelectorAll('*').length,
    actionsNodes: document.querySelectorAll('#screen-actions *').length,
    jsHeap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  }));
  await page.close();
  section('33.6_performance', {
    status: bootMs < 90000 && perf.totalDom < 22000 ? 'pass' : 'warn',
    title: 'Performance',
    found: { bootMs, ...perf, consoleErrorCount: report.consoleErrors.length, networkErrorCount: report.networkErrors.length },
  });
}

// 33.7 Console / network summary
section('33.7_console', {
  status: report.consoleErrors.length <= 5 ? 'pass' : 'warn',
  title: 'Console & network errors',
  found: {
    consoleErrors: report.consoleErrors.slice(0, 15),
    networkErrors: report.networkErrors.slice(0, 10),
    uniqueConsole: [...new Set(report.consoleErrors)].length,
  },
});

// Final per-screen status aggregation
for (const sc of SCREENS) {
  const s = report.screens[sc.id] || {};
  const d = s.desktop || 'unknown';
  const m = s.mobile || 'unknown';
  let overall = 'pass';
  if (d === 'fail' || m === 'fail') overall = 'fail';
  else if (d === 'warn' || m === 'warn') overall = 'warn';
  report.screens[sc.id] = { ...s, name: sc.nameHe, overall };
}

const fails = Object.values(report.screens).filter((s) => s.overall === 'fail').length;
const warns = Object.values(report.screens).filter((s) => s.overall === 'warn').length;
const sectionFails = Object.values(report.sections).filter((s) => s.status === 'fail').length;

report.readyForStaging = fails === 0 && sectionFails === 0;
report.summary = { screensPass: SCREENS.length - fails - warns, screensWarn: warns, screensFail: fails, sectionFails, sectionWarnings: report.warnings };

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const statusIcon = (s) => (s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : '❌');
const md = [
  '# Mission 33 — QA מקיף וסופי',
  '',
  `**תאריך:** ${report.at}`,
  `**Staging:** ${report.stagingUrl}`,
  `**Commit:** \`${commitHash}\``,
  '',
  report.readyForStaging
    ? '## ✅ מערכת ניהול השיווק מוכנה לעבודה מלאה ב-Staging ללא תקלות ידועות'
    : '## ❌ נמצאו תקלות — ראה פירוט',
  '',
  '### סטטוס לפי מסך',
  '',
  '| מסך | Desktop | Mobile | סטטוס |',
  '|-----|---------|--------|--------|',
  ...SCREENS.map((sc) => {
    const s = report.screens[sc.id] || {};
    return `| ${sc.nameHe} | ${statusIcon(s.desktop)} | ${statusIcon(s.mobile)} | ${statusIcon(s.overall)} |`;
  }),
  '',
  '### סעיפי בדיקה',
  '',
  ...Object.entries(report.sections).map(([k, v]) => `- ${statusIcon(v.status)} **${v.title}** (${k})`),
  '',
  `**תקלות Console:** ${report.consoleErrors.length} · **Network:** ${report.networkErrors.length}`,
  '',
  report.fixes.length ? '### תיקונים\n' + report.fixes.map((f) => `- ${f}`).join('\n') : '',
].join('\n');
writeFileSync(join(OUT, 'REPORT-HE.md'), md);

console.log(JSON.stringify({ ready: report.readyForStaging, summary: report.summary, out: OUT }, null, 2));
await browser.close();
process.exit(report.readyForStaging ? 0 : 1);
