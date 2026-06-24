/**
 * QA — תשתית (ללא Google): Client ID, RLS, OAuth pipeline path, demo scrub
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });
const STAGING = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';

const report = { at: new Date().toISOString(), passed: [], failed: [], warnings: [] };
const pass = (m) => report.passed.push(m);
const fail = (m) => report.failed.push(m);

// ── 1. Client ID SSOT file ──
const ssotPath = join(process.cwd(), 'public/ai-marketing/client-id-ssot.js');
if (existsSync(ssotPath)) {
  const ssot = readFileSync(ssotPath, 'utf8');
  ssot.includes('dalia-c-official') ? pass('ssot:client-id') : fail('ssot:client-id');
  ssot.includes('DATA_PATHS') && ssot.includes('project-001/dashboard.json') ? pass('ssot:data-paths') : fail('ssot:data-paths');
  ssot.includes('assertUnified') ? pass('ssot:assert-unified') : fail('ssot:assert-unified');
} else fail('ssot:file-missing');

// ── 2. Platform loads SSOT ──
const platform = readFileSync(join(process.cwd(), 'public/ai-marketing-platform.html'), 'utf8');
platform.includes('client-id-ssot.js') ? pass('platform:loads-ssot') : fail('platform:loads-ssot');

// ── 3. OAuth pipeline (no execution — path only) ──
const exportDash = readFileSync(join(process.cwd(), 'scripts/project-001/project-001-export-dashboard.mjs'), 'utf8');
exportDash.includes("writeFileSync") && exportDash.includes('dashboard.json') ? pass('pipeline:export-dashboard') : fail('pipeline:export-dashboard');
const appJs = readFileSync(join(process.cwd(), 'public/ai-marketing/app.js'), 'utf8');
appJs.includes('mapDashboardRaw') && appJs.includes('liveOnly') ? pass('pipeline:map-dashboard-raw') : fail('pipeline:map-dashboard-raw');
existsSync(join(process.cwd(), 'public/project-001/dashboard.json')) ? pass('pipeline:dashboard-json-exists') : fail('pipeline:dashboard-json-exists');

// ── 4. RLS migration ──
const rls = readFileSync(join(process.cwd(), 'supabase/migrations/20260623120000_marketing_client_ssot.sql'), 'utf8');
rls.includes('marketing_can_access_customer') ? pass('rls:access-function') : fail('rls:access-function');
rls.includes('ENABLE ROW LEVEL SECURITY') ? pass('rls:enabled') : fail('rls:enabled');
rls.includes('marketing_profiles') && rls.includes('UNIQUE') ? pass('rls:profiles-unique-customer') : fail('rls:profiles-unique-customer');

// ── 5. Edge provision ──
const edge = readFileSync(join(process.cwd(), 'supabase/functions/create-admin-user/index.ts'), 'utf8');
edge.includes('marketing_profiles') && edge.includes('customer_id') ? pass('edge:marketing-provision') : fail('edge:marketing-provision');

// ── 6. Demo scrub ──
const dataJson = readFileSync(join(process.cwd(), 'public/ai-marketing/data.json'), 'utf8');
dataJson.includes('demoDisabled') ? pass('demo:data-json-disabled') : fail('demo:data-json-disabled');
const entities = readFileSync(join(process.cwd(), 'public/ai-marketing/prd-entities.json'), 'utf8');
!entities.includes('demo-client') ? pass('demo:no-demo-entities') : fail('demo:demo-entities-remain');

// ── 7. Live UI (staging) ──
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${STAGING}/ai-marketing-platform`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('#screen-hub', { timeout: 60000 });
await page.waitForTimeout(2000);

const live = await page.evaluate(() => ({
  ssot: typeof window.ClientIdSsot !== 'undefined',
  official: window.ClientIdSsot?.OFFICIAL?.clientId,
  ctx: window.COCO?.flowContext?.clientId,
  unified: window.ClientIdSsot?.assertUnified?.().ok,
  liveOnly: document.body.classList.contains('dalia-live-only'),
  noGreentech: !(document.getElementById('sf-company-display')?.textContent || '').includes('גרין-טק'),
  hubFake: /14,320|8,420/.test((document.getElementById('coco-live-hub-kpis')?.textContent || '').replace(/\s/g, '')),
}));

live.ssot ? pass('ui:client-id-ssot-loaded') : fail('ui:client-id-ssot-loaded');
live.official === 'dalia-c-official' ? pass('ui:official-id') : fail('ui:official-id');
live.ctx === 'dalia-c-official' ? pass('ui:flow-context-id') : fail('ui:flow-context-id-' + live.ctx);
live.unified !== false ? pass('ui:client-id-unified') : fail('ui:client-id-unified');
live.liveOnly ? pass('ui:live-only') : fail('ui:live-only');
live.noGreentech ? pass('ui:no-greentech-label') : fail('ui:greentech-label');
!live.hubFake ? pass('ui:hub-no-fake-kpis') : fail('ui:hub-fake-kpis');

for (const sc of ['screen-status', 'screen-clients', 'screen-goals', 'screen-actions', 'screen-assets', 'screen-reports']) {
  await page.evaluate((id) => window.goScreen(id), sc);
  await page.waitForTimeout(200);
  const ok = await page.evaluate((id) => document.getElementById(id)?.classList.contains('active'), sc);
  ok ? pass('flow:' + sc.replace('screen-', '')) : fail('flow:' + sc);
}

await browser.close();

report.ok = report.failed.length === 0;
writeFileSync(join(OUT, 'infrastructure-qa.json'), JSON.stringify({ ...report, passedCount: report.passed.length, failedCount: report.failed.length }, null, 2));
console.log(JSON.stringify({ ok: report.ok, passed: report.passed.length, failed: report.failed.length, failures: report.failed }, null, 2));
process.exit(report.ok ? 0 : 1);
