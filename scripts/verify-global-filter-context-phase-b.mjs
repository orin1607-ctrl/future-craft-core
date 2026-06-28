/**
 * Verify Global Filter Context Phase B — unified cascade filter bar UI.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'global-filter-context-phase-b');
const BASE = process.env.LOCAL_VERIFY_URL ||
  process.env.STAGING_PAGES_URL ||
  'http://127.0.0.1:8888/ai-marketing-platform.html';
const STAGING = BASE.includes('?') ? BASE : BASE + '?v=v3-global-filter-b';

mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), url: STAGING, viewports: {}, ok: false, errors: [] };

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
  const vpReport = { consoleErrors: [], checks: {} };

  page.on('console', (m) => {
    if (m.type() === 'error') vpReport.consoleErrors.push(m.text());
  });

  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(6000);

  if (label === 'mobile') {
    await page.evaluate(() => {
      document.getElementById('coco-unified-context-bar')?.classList.add('is-expanded');
    });
  }

  const bar = await page.evaluate(async () => {
    if (window.GlobalFilterBar && GlobalFilterBar.init) await GlobalFilterBar.init();
    await (window.GlobalFilterContext && GlobalFilterContext.whenReady
      ? GlobalFilterContext.whenReady()
      : Promise.resolve());
    var gfcClient = document.getElementById('gfc-client');
    var gfcItem = document.getElementById('gfc-item');
    var ctx = GlobalFilterContext.get();
    return {
      hasBar: !!window.GlobalFilterBar,
      hasMeta: !!window.FilterMeta,
      mounted: !!gfcClient,
      primaryCount: document.querySelectorAll('.gfc-primary .gfc-select').length,
      advancedCount: document.querySelectorAll('.gfc-advanced .gfc-select').length,
      summaryChip: document.getElementById('coco-unified-filter-chip')?.textContent || '',
      clientId: ctx.clientId,
      activityType: ctx.activityType,
      campaignId: ctx.campaignId,
      assetId: ctx.assetId,
      hasItemSelect: !!gfcItem,
    };
  });

  vpReport.checks.bar = bar;

  if (!bar.hasBar) fail(label, 'GlobalFilterBar');
  else pass(label, 'GlobalFilterBar');

  if (!bar.hasMeta) fail(label, 'FilterMeta');
  else pass(label, 'FilterMeta');

  if (!bar.mounted) fail(label, 'filter bar mounted');
  else pass(label, 'filter bar mounted', bar.primaryCount + ' primary selects');

  if (bar.primaryCount < 4) fail(label, 'primary cascade', String(bar.primaryCount));
  else pass(label, 'primary cascade', 'client/activity/campaign/asset');

  if (!bar.clientId) fail(label, 'default client seeded');
  else pass(label, 'default client seeded', bar.clientId);

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-goals'); });
  await page.waitForTimeout(3000);

  const goalsAll = await page.evaluate(() => {
    return document.querySelectorAll('#coco-live-goals-list .goal-acc-item').length;
  });
  vpReport.checks.goalsAll = goalsAll;
  if (goalsAll !== 28) fail(label, 'goals baseline 28', String(goalsAll));
  else pass(label, 'goals baseline 28');

  const scoped = await page.evaluate(async () => {
    GlobalFilterContext.set({
      specificItem: { type: 'page', id: 'page-01', label: 'בית', path: '/' },
    }, { skipCascade: true, source: 'verify', allowInvalid: true });
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-goals');
    await new Promise((r) => setTimeout(r, 800));
    var goals = document.querySelectorAll('#coco-live-goals-list .goal-acc-item').length;
    var ctxAfter = GlobalFilterContext.get();
    if (typeof goScreen === 'function') goScreen('screen-actions');
    await new Promise((r) => setTimeout(r, 1200));
    var persisted = GlobalFilterContext.get().specificItem?.id === 'page-01';
    var barStill = !!document.getElementById('gfc-client');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
    await new Promise((r) => setTimeout(r, 800));
    var actions = document.querySelectorAll('#coco-live-actions-pending .coco-act-page-card').length;
    GlobalFilterContext.set({ specificItem: null }, { skipCascade: true, source: 'verify', allowInvalid: true });
    return { goals, ctxAfter: ctxAfter.specificItem?.id, persisted, barStill, actions };
  });

  vpReport.checks.scoped = scoped;

  if (scoped.goals !== 1) fail(label, 'specificItem scopes goals', 'got ' + scoped.goals);
  else pass(label, 'specificItem scopes goals', '1 page');

  if (!scoped.persisted) fail(label, 'context persists across screens');
  else pass(label, 'context persists across screens');

  if (!scoped.barStill) fail(label, 'filter bar on actions screen');
  else pass(label, 'filter bar on actions screen');

  if (scoped.actions > 28) fail(label, 'actions page cards', String(scoped.actions));
  else pass(label, 'actions scoped pages', String(scoped.actions));

  await page.evaluate(async () => {
    GlobalFilterContext.set({ specificItem: null }, { skipCascade: true, source: 'verify', allowInvalid: true });
    if (window.CocoData && CocoData.bindScreen) {
      CocoData.bindScreen('screen-goals');
      CocoData.bindScreen('screen-actions');
    }
    await new Promise((r) => setTimeout(r, 600));
  });

  const restored = await page.evaluate(() => {
    return document.querySelectorAll('#coco-live-goals-list .goal-acc-item').length;
  });
  vpReport.checks.restored = restored;
  if (restored !== 28) fail(label, 'goals restored after reset', String(restored));
  else pass(label, 'goals restored after reset');

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
