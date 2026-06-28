/**
 * Phase A+B verification — JSON SSOT + Staging UI smoke (read-only).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const PLAN = join(P001.root, 'public', 'project-001', 'site-work-plan.json');
const TYPES = join(P001.root, 'public', 'project-001', 'marketing-recommendation-types.json');
const OUT = join(P001.root, 'docs', 'audit-reports', 'phase-ab-recommendations');
const STAGING = process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';

mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  json: {},
  ui: {},
  ok: false,
};

function fail(msg) {
  report.errors = report.errors || [];
  report.errors.push(msg);
  console.error('❌', msg);
}

function pass(msg) {
  console.log('✅', msg);
}

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const types = JSON.parse(readFileSync(TYPES, 'utf8'));
const expectedTypes = types.types.length;

report.json.pageCount = plan.pages?.length || 0;
report.json.goalsCount = plan.goals?.length || 0;
report.json.actionsCount = plan.actions?.length || 0;

if (plan.pages?.length !== 28) fail(`pages: expected 28, got ${plan.pages?.length}`);
else pass('28 pages in site-work-plan.json');

if (plan.goals?.length !== 28) fail(`goals: expected 28, got ${plan.goals?.length}`);
else pass('28 goals (page-level)');

let recOk = true;
for (const p of plan.pages || []) {
  if ((p.recommendations || []).length !== expectedTypes) {
    fail(`page ${p.id}: ${(p.recommendations || []).length} recommendations (expected ${expectedTypes})`);
    recOk = false;
  }
}
if (recOk) pass(`20 recommendations × 28 pages = ${28 * expectedTypes}`);

const dedupe = new Set();
let dupes = 0;
for (const a of plan.actions || []) {
  const k = a.dedupeKey || a.id;
  if (dedupe.has(k)) dupes++;
  dedupe.add(k);
}
report.json.uniqueActions = dedupe.size;
report.json.duplicateActions = dupes;
if (dupes > 0) fail(`duplicate action keys: ${dupes}`);
else pass(`${dedupe.size} unique action dedupe keys`);

const openActions = (plan.actions || []).filter((a) => a.status !== 'done' && a.status !== 'completed').length;
report.json.actionsOpen = openActions;
pass(`${openActions} open actions from non-ok recommendations`);

try {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);

  const hubCards = await page.locator('#screen-hub .hub-card').count();
  report.ui.hubCards = hubCards;
  if (hubCards !== 10) fail(`hub cards: expected 10, got ${hubCards}`);
  else pass('10 hub cards visible');

  await page.evaluate(() => {
    if (typeof goScreen === 'function') goScreen('screen-goals');
  });
  await page.waitForTimeout(2500);

  const goalAcc = await page.locator('#coco-live-goals-list .goal-acc-item').count();
  report.ui.goalsAccordions = goalAcc;
  if (goalAcc !== 28) fail(`goals accordions: expected 28, got ${goalAcc}`);
  else pass('28 page accordions on goals screen');

  const recRows = await page.locator('#coco-live-goals-list tbody tr').count();
  report.ui.goalsRecRows = recRows;
  if (recRows < 560) fail(`recommendation rows: expected >=560, got ${recRows}`);
  else pass(`${recRows} recommendation rows in goals UI`);

  await page.evaluate(() => {
    if (typeof goScreen === 'function') goScreen('screen-actions');
  });
  await page.waitForTimeout(2500);

  const actionCards = await page.locator('#coco-live-actions-pending .action-card').count();
  report.ui.actionCards = actionCards;
  if (actionCards < 100) fail(`action cards: expected many, got ${actionCards}`);
  else pass(`${actionCards} action cards on actions screen`);

  const pageGroups = await page.locator('#coco-live-actions-pending .card').count();
  report.ui.actionPageGroups = pageGroups;
  pass(`${pageGroups} page groups on actions screen`);

  report.ui.consoleErrors = consoleErrors.slice(0, 10);
  await browser.close();
} catch (e) {
  fail(`UI smoke: ${e.message}`);
  report.ui.error = e.message;
}

report.ok = !(report.errors && report.errors.length);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'report.json'));
process.exit(report.ok ? 0 : 1);
