#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — last treatment column in the claims table.
 * TEST claims only. Soft-delete at end. No Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short origin/feat/incident-alerts-staging', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-last-treatment-table-2026-09-09');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);

const env = {};
try {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
} catch { /* optional */ }
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, qaBase: PUBLIC, wantSha: WANT_SHA, deployTxt: '', checks: [], verdict: 'FAIL' };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('worker login failed');
  return data.session;
}
async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}
async function inject(context, session) {
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    },
  });
}
async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  try { if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `last-treat-${name}.png`)); } catch { /* skip */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitDeploy() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait pages ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await sleep(15000);
  }
  return false;
}

const session = await login();
rec('worker-login', !!session.access_token);
rec('staging-only', STAGING_REF !== PROD_REF);

if (!process.env.CLAIMS_QA_SKIP_WAIT) {
  const deployed = await waitDeploy();
  rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
  if (!deployed) {
    writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

const id = `DAL-QA-LTT-${Date.now()}`;
const now = new Date().toISOString();
const action1 = 'עדכון טיפול ראשון QA';
const action2 = 'עדכון טיפול אחרון QA';
const { error: insErr } = await userDb.from('claims_records').insert({
  id,
  client_name: 'QA Last Treatment',
  status: 'בטיפול',
  plate: '98-765-43',
  row_data: {
    id,
    clientName: 'QA Last Treatment',
    clientEmail: 'yoni122222@gmail.com',
    plate: '98-765-43',
    status: 'בטיפול',
    source: 'Staff',
    docsOrderStatus: 'needs_sort',
    lastTreatmentAction: action2,
    lastTreatmentAt: now,
    lastStatusNote: action2,
    createdAt: now,
  },
  created_by_name: 'QA Worker',
  last_activity_at: now,
});
rec('create-test-claim', !insErr, { err: insErr?.message, id });

const hisIns = await userDb.from('claims_history').insert([
  { id: `HIS-${Date.now()}-1`, claim_id: id, row_data: { action: action1, type: 'treatment', note: 'היסטוריה ראשונה', at: '08.09.2026, 10:00', by: 'QA' } },
  { id: `HIS-${Date.now()}-2`, claim_id: id, row_data: { action: action2, type: 'treatment', note: 'היסטוריה אחרונה', at: '09.09.2026, 11:00', by: 'QA' } },
]).select('id');
rec('seed-history-rows', !hisIns.error && (hisIns.data || []).length === 2, { err: hisIns.error?.message, n: (hisIns.data || []).length });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await inject(context, session);
const page = await context.newPage();
await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
await box.waitFor({ state: 'visible', timeout: 15000 });
await box.fill(id);
await page.waitForTimeout(700);
await shot(page, 'table');

const row = page.locator(`[data-testid="claim-row-${id}"]`);
const rowText = (await row.innerText().catch(() => '')) || '';
rec('table-shows-last-treatment', rowText.includes(action2) || rowText.includes('טיפול אחרון QA'), { rowText: rowText.slice(0, 400) });
rec('table-hides-docs-order-in-that-slot', !/תיק ישן \/ דורש סידור/.test(rowText), { rowText: rowText.slice(0, 400) });
rec('table-shows-date', /09\/09|9\.9\.|09\.09/.test(rowText) || rowText.includes('2026'), { rowText: rowText.slice(0, 400) });

const btn = page.locator(`[data-testid="claim-last-treatment-${id}"]`);
const btnOk = await btn.count();
rec('last-treatment-control', btnOk > 0);
if (btnOk) {
  await btn.first().click();
  const hist = await page.waitForSelector('[data-testid="claim-treat-history"]', { timeout: 25000 }).then(() => true).catch(() => false);
  rec('click-opens-treatment-history', hist);
  await page.getByText(action1, { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => undefined);
  const histText = (await page.locator('[data-testid="claim-treat-history"]').innerText().catch(() => '')) || '';
  rec('history-keeps-previous-updates', histText.includes(action1) && histText.includes(action2), { histText: histText.slice(0, 400) });
  await shot(page, 'history');
  await page.locator('.mcl').first().click().catch(() => undefined);
  await page.waitForTimeout(400);
  await page.locator(`[data-testid="claim-last-treatment-${id}"]`).first().click();
  await page.waitForSelector('[data-testid="claim-treat-history"]', { timeout: 25000 });
  const histAgain = (await page.locator('[data-testid="claim-treat-history"]').innerText().catch(() => '')) || '';
  rec('history-still-there-after-close', histAgain.includes(action1) && histAgain.includes(action2), { histAgain: histAgain.slice(0, 400) });
  await shot(page, 'history-reopen');
}

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await inject(mobile, session);
const mpage = await mobile.newPage();
await mpage.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await mpage.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
await mpage.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
const mbox = mpage.locator('[data-testid="claims-search"]').locator('visible=true').first();
if (await mbox.count()) await mbox.fill(id);
await mpage.waitForTimeout(700);
const mtext = (await mpage.locator(`[data-testid="claim-row-${id}"]`).innerText().catch(() => '')) || '';
rec('mobile-shows-last-treatment', mtext.includes(action2) || (await mpage.locator(`[data-testid="claim-last-treatment-${id}"]`).count()) > 0, { mtext: mtext.slice(0, 300) });
await shot(mpage, 'mobile');
await mobile.close();
await browser.close();

await softDelete(id);
const { data: gone } = await userDb.from('claims_records').select('row_data').eq('id', id).maybeSingle();
rec('soft-delete-test-claim', Boolean(gone?.row_data?.deletedAt), { id });

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.map((c) => c.name).join(',') || 'none'}`);
process.exit(failed.length ? 1 : 0);
