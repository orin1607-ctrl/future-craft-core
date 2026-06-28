/**
 * Verify Global Filter Context Phase A infrastructure on Staging.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'global-filter-context-phase-a');
const STAGING = process.env.STAGING_PAGES_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-global-filter-a';

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
  const vpReport = { consoleErrors: [], checks: {} };

  page.on('console', (m) => {
    if (m.type() === 'error') vpReport.consoleErrors.push(m.text());
  });

  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(6000);

  const infra = await page.evaluate(async () => {
    var gfcReady = window.GlobalFilterContext && GlobalFilterContext.whenReady
      ? await GlobalFilterContext.whenReady()
      : null;
    var ctx = window.GlobalFilterContext ? GlobalFilterContext.get() : null;
    var flow = window.COCO && COCO.flowContext ? COCO.flowContext : null;
    var indexLoaded = window.FilterEntityIndex && FilterEntityIndex.isLoaded && FilterEntityIndex.isLoaded();
    var clients = indexLoaded && FilterEntityIndex.getClients ? FilterEntityIndex.getClients().length : 0;
    var pages = indexLoaded && FilterEntityIndex.getPages
      ? FilterEntityIndex.getPages('asset-dalia-c-com').total
      : 0;
    var registry = window.FilterScreenRegistry ? FilterScreenRegistry.list().length : 0;
    var testFilter = window.FilterEngine && FilterEngine.filter
      ? FilterEngine.filter(
          [{ pageId: 'page-01', title: 'home' }, { pageId: 'page-02', title: 'other' }],
          (x) => ({ pageId: x.pageId })
        ).length
      : -1;
    GlobalFilterContext.set({ subCategory: { type: 'page', id: 'page-01', path: '/' } }, { skipCascade: true, allowInvalid: true });
    var scoped = FilterEngine.filter(
      [{ pageId: 'page-01' }, { pageId: 'page-02' }],
      (x) => ({ pageId: x.pageId })
    ).length;
    GlobalFilterContext.set({ subCategory: null }, { skipCascade: true, allowInvalid: true });
    return {
      hasGfc: !!window.GlobalFilterContext,
      hasEngine: !!window.FilterEngine,
      hasTaxonomy: !!window.FilterTaxonomy,
      hasIndex: !!window.FilterEntityIndex,
      hasRegistry: !!window.FilterScreenRegistry,
      ctxVersion: ctx && ctx.version,
      clientId: ctx && ctx.clientId,
      flowClientId: flow && flow.clientId,
      synced: ctx && flow && ctx.clientId === flow.clientId,
      indexLoaded,
      clients,
      pages,
      registry,
      testFilter,
      scoped,
      activityTypes: window.FilterTaxonomy ? FilterTaxonomy.ACTIVITY_TYPES.length : 0,
    };
  });

  vpReport.checks.infra = infra;

  if (!infra.hasGfc) fail(label, 'GlobalFilterContext');
  else pass(label, 'GlobalFilterContext');

  if (!infra.hasEngine) fail(label, 'FilterEngine');
  else pass(label, 'FilterEngine');

  if (!infra.hasTaxonomy) fail(label, 'FilterTaxonomy');
  else pass(label, 'FilterTaxonomy', infra.activityTypes + ' activity types');

  if (!infra.indexLoaded) fail(label, 'FilterEntityIndex load');
  else pass(label, 'FilterEntityIndex', infra.clients + ' clients, ' + infra.pages + ' pages');

  if (infra.registry < 10) fail(label, 'FilterScreenRegistry', String(infra.registry));
  else pass(label, 'FilterScreenRegistry', infra.registry + ' screens');

  if (!infra.synced) fail(label, 'flowContext sync', JSON.stringify({ ctx: infra.clientId, flow: infra.flowClientId }));
  else pass(label, 'flowContext sync');

  if (infra.scoped !== 1) fail(label, 'FilterEngine page scope', 'got ' + infra.scoped);
  else pass(label, 'FilterEngine page scope');

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-goals'); });
  await page.waitForTimeout(3000);
  const goals = await page.evaluate(() => {
    return document.querySelectorAll('#coco-live-goals-list .goal-acc-item').length;
  });
  vpReport.checks.goals = goals;
  if (goals !== 28) fail(label, 'goals still 28', String(goals));
  else pass(label, 'goals still 28');

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-actions'); });
  await page.waitForTimeout(3000);
  const actions = await page.evaluate(() => {
    return document.querySelectorAll('#coco-live-actions-pending .coco-act-page-card').length;
  });
  vpReport.checks.actions = actions;
  if (actions !== 28) fail(label, 'actions still 28 pages', String(actions));
  else pass(label, 'actions still 28 pages');

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
