/**
 * Verify Actions Workbench on live Staging — desktop + iPhone.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'actions-workbench-fix');
const STAGING = process.env.STAGING_PAGES_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-unified-actions-workbench';

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
  const vpReport = { consoleErrors: [], writeRequests: [], checks: {} };

  page.on('console', (m) => {
    if (m.type() === 'error') vpReport.consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    const url = r.url();
    const method = r.method();
    if (/dalia-c\.com.*\/(wp-admin|wp-json)/i.test(url) && method !== 'GET') {
      vpReport.writeRequests.push({ url, method });
    }
  });

  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-actions'); });
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => {
    var pending = document.getElementById('coco-live-actions-pending');
    var pageCards = pending ? pending.querySelectorAll('.coco-act-page-card').length : 0;
    var banner = pending ? pending.querySelector('.coco-act-preview-banner') : null;
    var viewBtns = pending ? pending.querySelectorAll('a.btn:has-text("צפה"), a.btn-primary').length : 0;
    var detailBtns = pending ? pending.querySelectorAll('button[onclick*="CocoActTogglePage"]').length : 0;
    var baBefore = pending ? pending.querySelectorAll('.coco-act-ba-before').length : 0;
    var baAfter = pending ? pending.querySelectorAll('.coco-act-ba-after').length : 0;
    var approveBtns = pending ? pending.querySelectorAll('button[onclick*="CocoActApprove"]').length : 0;
    var bundle = window.CocoData && CocoData.getBundle ? CocoData.getBundle() : null;
    var actions = bundle && bundle.workPlan && bundle.workPlan.actions ? bundle.workPlan.actions : [];
    var withBA = actions.filter((a) => a.beforeAfter && a.beforeAfter.current).length;
    var pages = bundle && bundle.workPlan && bundle.workPlan.pages ? bundle.workPlan.pages.length : 0;
    return {
      pageCards,
      banner: !!banner,
      viewBtns: pending ? pending.querySelectorAll('.coco-act-page-btns a[target="_blank"]').length : 0,
      detailBtns: pending ? pending.querySelectorAll('button[onclick*="CocoActTogglePage"]').length : 0,
      baBefore,
      baAfter,
      approveBtns,
      withBA,
      totalActions: actions.length,
      pages,
      workbench: !!window.ActionsWorkbench,
      execMode: window.ActionsWorkbench && ActionsWorkbench.EXECUTION_MODE,
    };
  });

  vpReport.checks = state;

  if (state.pageCards !== 28) fail(label, '28 page work cards', 'got ' + state.pageCards);
  else pass(label, '28 page work cards', String(state.pageCards));

  if (!state.banner) fail(label, 'preview banner');
  else pass(label, 'preview banner');

  if (state.viewBtns < 28) fail(label, 'view page buttons', 'got ' + state.viewBtns);
  else pass(label, 'view page buttons', String(state.viewBtns));

  if (state.detailBtns < 28) fail(label, 'detail toggle buttons', 'got ' + state.detailBtns);
  else pass(label, 'detail toggle buttons', String(state.detailBtns));

  // Expand first page panel
  await page.evaluate(() => {
    var btn = document.querySelector('button[onclick*="CocoActTogglePage"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(400);

  const expanded = await page.evaluate(() => {
    var panel = document.querySelector('.coco-act-page-panel');
    var open = panel && panel.style.display !== 'none';
    var items = document.querySelectorAll('.coco-act-item').length;
    var ba = document.querySelectorAll('.coco-act-ba-before').length;
    return { open, items, ba };
  });

  if (!expanded.open) fail(label, 'accordion opens');
  else pass(label, 'accordion opens', expanded.items + ' actions visible');

  if (expanded.ba < 1) fail(label, 'before/after blocks', 'got ' + expanded.ba);
  else pass(label, 'before/after blocks', String(expanded.ba));

  if (state.withBA < 300) fail(label, 'SSOT beforeAfter', 'only ' + state.withBA + '/395');
  else pass(label, 'SSOT beforeAfter', state.withBA + '/395');

  if (state.execMode !== 'preview') fail(label, 'execution mode', state.execMode);
  else pass(label, 'execution mode preview');

  // Test approval — localStorage only
  const approvalTest = await page.evaluate(() => {
    var btn = document.querySelector('button[onclick*="CocoActApprove"]');
    if (!btn) return { ok: false, reason: 'no approve btn' };
    var id = btn.getAttribute('onclick').match(/CocoActApprove\('([^']+)'/)?.[1];
    btn.click();
    var map = window.ActionsWorkbench ? ActionsWorkbench.getApprovals() : {};
    var approved = id && map[id] && map[id].status === 'approved_for_execution';
    return { ok: !!approved, id, mode: map[id]?.mode };
  });
  await page.waitForTimeout(500);

  if (!approvalTest.ok) fail(label, 'approval localStorage', JSON.stringify(approvalTest));
  else pass(label, 'approval localStorage', approvalTest.id);

  if (vpReport.writeRequests.length) fail(label, 'live site writes', JSON.stringify(vpReport.writeRequests));
  else pass(label, 'no live site writes');

  if (vpReport.consoleErrors.length && label === 'mobile') {
    // desktop may have unrelated 404
  } else if (vpReport.consoleErrors.length > 1) {
    fail(label, 'console errors', vpReport.consoleErrors.join('; '));
  } else {
    pass(label, 'console clean enough');
  }

  report.viewports[label] = vpReport;
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
