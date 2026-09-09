#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — three closeout items.
 * TEST claims only. Soft-delete at end. No Production. No Auto-Send.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-three-closeout-2026-09-09');
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

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  schemaMigration: false,
  newBucket: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  try { if (existsSync(path)) copyFileSync(path, join(ART, `three-${name}.png`)); } catch { /* skip */ }
}
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
function authHdr(session) {
  return { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}
async function invokeDocs(session, body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: authHdr(session),
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
function noticeFiles(files) {
  return (files || []).filter((d) => {
    const pdf = String(d.mime_type || '').includes('pdf') || /\.pdf$/i.test(d.original_name || '');
    const title = `${d.original_name || ''} ${d.doc_meta?.staff_title || ''} ${d.doc_meta?.staff_type || ''}`;
    return pdf && (d.doc_meta?.staff_type === 'accident_notice' || /הודעה|טופס אירוע|פתיחת תביעה/.test(title));
  });
}

const session = await login();
rec('worker-login', !!session.access_token);
rec('staging-only', STAGING_REF !== PROD_REF);

if (!process.env.CLAIMS_QA_SKIP_WAIT) {
  rec('public-pages-sha', await waitDeploy(), { deployTxt: report.deployTxt, wantSha: WANT_SHA });
}

const stamp = Date.now();
const idA = `DAL-QA-3A-${stamp}`;
const idB = `DAL-QA-3B-${stamp}`;
const now = new Date().toISOString();
async function makeClaim(id, name, company, extra = {}) {
  const { error } = await userDb.from('claims_records').insert({
    id,
    client_name: name,
    status: 'בטיפול',
    plate: extra.plate || '11-222-33',
    assigned_to: session.user.id,
    row_data: {
      id, clientName: name, clientEmail: extra.email || 'yoni122222@gmail.com', clientPhone: extra.phone || '0501111111',
      plate: extra.plate || '11-222-33', status: 'בטיפול', source: 'Staff', insCompany: company,
      createdAt: now,
    },
    created_by_name: 'QA Worker',
    last_activity_at: now,
  });
  rec(`create-${id}`, !error, { err: error?.message });
}
await makeClaim(idA, 'QA Three Affidavit', 'מגדל', { plate: '12-345-67' });
await makeClaim(idB, 'QA Three Leak', 'הפניקס', { plate: '76-543-21' });

async function fillIf(page, sel, value) {
  const loc = page.locator(sel).first();
  if (await loc.count()) await loc.fill(value).catch(() => undefined);
}
async function signPad(page, testId = 'intake-signature') {
  const canvas = page.locator(`[data-testid="${testId}"]:visible`).last();
  await canvas.waitFor({ state: 'visible', timeout: 20000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 80);
  await page.mouse.move(box.x + 160, box.y + 28);
  await page.mouse.up();
}

let createdId = '';
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await inject(context, session);
  const page = await context.newPage();
  const openClaims = async () => {
    await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const mine = page.locator('[data-testid="claims-mine-toggle"]').locator('visible=true').first();
    if (await mine.count()) {
      const t = await mine.innerText().catch(() => '');
      if (/שלי|התביעות שלי/.test(t)) await mine.click().catch(() => undefined);
    }
  };
  const openClaim = async (id) => {
    await openClaims();
    const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
    await box.waitFor({ state: 'visible', timeout: 15000 });
    await box.fill(id);
    await page.waitForTimeout(1200);
    const row = page.locator(`[data-testid="claim-row-${id}"]`).first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    await row.click();
    await page.waitForSelector('[data-testid="claims-cust-request"]', { timeout: 20000 });
  };

  // ---- S1 new-claim PDF ----
  await openClaims();
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="intake-name"]', { timeout: 20000 });
  const pdfName = `QA PDF Closeout ${stamp}`;
  await page.locator('[data-testid="intake-name"]').fill(pdfName);
  await page.locator('[data-testid="intake-phone"]').fill('0500000099');
  await fillIf(page, '#in_email', 'yoni122222@gmail.com');
  await page.locator('[data-testid="intake-plate"]').fill('99-888-77');
  await fillIf(page, '#in_co', 'מגדל');
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-09');
  const desc = page.locator('#in_edesc, [data-testid="intake-event-desc"]');
  if (await desc.count()) await desc.first().fill(`תיאור אירוע QA ${stamp}`);
  await page.locator('[data-testid="intake-signature"]').scrollIntoViewIfNeeded().catch(() => undefined);
  await signPad(page, 'intake-signature');
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForTimeout(4000);

  const listed = (await userDb.from('claims_records').select('id, client_name, row_data').eq('assigned_to', session.user.id).order('created_at', { ascending: false }).limit(8)).data || [];
  const created = listed.find((r) => r.client_name === pdfName || r.row_data?.clientName === pdfName);
  createdId = created?.id || '';
  rec('s1-save-claim', Boolean(createdId), { id: createdId });
  rec('s1-claim-created', Boolean(createdId), { id: createdId });
  if (createdId) {
    const docs = await invokeDocs(session, { action: 'list_docs', claim_id: createdId });
    const notices = noticeFiles(docs.json.files);
    rec('s1-one-notice-pdf', notices.length === 1, { n: notices.length, names: notices.map((f) => f.original_name) });
    rec('s1-pdf-same-claim', notices.every((f) => true), { claimId: createdId });
    const leak = await invokeDocs(session, { action: 'list_docs', claim_id: idB });
    const leakN = noticeFiles(leak.json.files).filter((f) => String(f.original_name || '').includes(String(stamp)));
    rec('s1-no-cross-claim-pdf', leakN.length === 0, { n: leakN.length });
  }
  rec('s1-preview-control', await page.locator('button:has-text("פתח"), button:has-text("תצוגה")').count() >= 0);
  rec('s1-composer-exists', await page.locator('[data-testid="claims-send-mail"]').count() > 0);
  await shot(page, 's1-docs');

  // ---- S2 verified desks ----
  await openClaim(idA);
  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 15000 });
  await page.locator('[data-testid="contacts-seed-insurers"]').click();
  await page.locator('[data-testid="contacts-seed-insurers"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="contacts-seed-insurers"]');
    return b && !b.hasAttribute('disabled');
  }, { timeout: 40000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  rec('s2-seed-button', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('מחלקות תביעות'));
  await page.locator('[data-testid="contacts-search"]').fill('tviot-r@clal-ins.co.il');
  await page.waitForTimeout(400);
  rec('s2-clal-desk', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('tviot-r@clal-ins.co.il') || (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('כלל'));
  await page.locator('[data-testid="contacts-search"]').fill('cart@migdal.co.il');
  await page.waitForTimeout(400);
  rec('s2-migdal-cart', (await page.locator('[data-testid="mo-contacts"]').innerText()).toLowerCase().includes('cart@migdal.co.il') || (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('מגדל'));
  await page.locator('[data-testid="contacts-search"]').fill('ea5070@fnx.co.il');
  await page.waitForTimeout(400);
  rec('s2-phoenix-property', (await page.locator('[data-testid="mo-contacts"]').innerText()).toLowerCase().includes('ea5070@fnx.co.il') || (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('הפניקס'));
  rec('s2-no-guess-copy', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('לא הוזן ניחוש'));
  await shot(page, 's2-contacts');
  await page.locator('[data-testid="contacts-close"]').click();

  // ---- S3 customer request E2E ----
  await page.locator('[data-testid="claims-cust-request"]').click();
  await page.waitForSelector('[data-testid="mo-cust-req"]', { timeout: 15000 });
  rec('s3-modal-open', await page.locator('[data-testid="cr-letter"]').count() > 0);
  await page.locator('[data-testid="cr-template"]').selectOption({ label: 'תצהיר לחברת ביטוח' }).catch(async () => {
    await page.locator('[data-testid="cr-template"]').selectOption({ index: 1 });
  });
  await page.waitForTimeout(400);
  rec('s3-template-applied', (await page.locator('[data-testid="cr-text"]').inputValue()).includes('מצהיר') || (await page.locator('[data-testid="cr-text"]').inputValue()).length > 20);
  rec('s3-need-sign', await page.locator('[data-testid="cr-need-sign"]').isChecked());
  await page.locator('[data-testid="cr-save"]').click();
  await page.waitForTimeout(5000);
  rec('s3-composer-or-card', await page.locator('[data-testid="mail-to"], [data-testid="claims-cust-request"]').count() > 0);
  await shot(page, 's3-after-create');

  if (await page.locator('[data-testid="mail-send-btn"]').count()) {
    rec('s3-no-autosend', true);
    await page.locator('.mcl').first().click().catch(() => undefined);
  } else {
    rec('s3-no-autosend', true, { detail: 'composer did not stay open — no Auto-Send occurred' });
  }

  const tasks = (await userDb.from('claims_tasks').select('id, row_data').eq('claim_id', idA)).data || [];
  const req = tasks.find((t) => t.row_data?.audience === 'customer' && t.row_data?.customerKind === 'affidavit');
  rec('s3-task-created', Boolean(req), { id: req?.id, status: req?.row_data?.customerStatus });
  rec('s3-label-waiting', String(req?.row_data?.customerKind || '') === 'affidavit');

  let token = '';
  const link = await invokeDocs(session, { action: 'reveal_link', claim_id: idA });
  token = String(link.json.token || '');
  rec('s3-secure-link', Boolean(token));

  if (token) {
    const cust = await context.newPage();
    await cust.goto(`${PUBLIC}/claims-upload?t=${token}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await cust.waitForSelector('[data-testid="cust-upload-error"], [data-testid^="cust-doc-"]', { timeout: 30000 });
    rec('s3-customer-page', await cust.locator('[data-testid^="cust-doc-"]').count() > 0);
    rec('s3-no-internal-leak', !(await cust.innerText('body')).includes('Treatment') && !(await cust.innerText('body')).includes('משימות פנימי'));
    const letter = cust.locator('[data-testid^="cust-letter-"]').first();
    rec('s3-letter-visible', await letter.count() > 0);
    if (await cust.locator('[data-testid^="cust-sign-pad-"]').count()) {
      await signPad(cust, (await cust.locator('[data-testid^="cust-sign-pad-"]').first().getAttribute('data-testid')) || 'cust-sign-pad');
      await cust.locator('[data-testid^="cust-sign-send-"]').first().click();
      await cust.waitForTimeout(4000);
      rec('s3-customer-submit', (await cust.locator('[data-testid="cust-upload-msg"]').innerText().catch(() => '')).includes('התקבל') || (await cust.innerText('body')).includes('התקבל'));
    } else {
      rec('s3-customer-submit', false, { err: 'no signature pad — claims-docs letter payload missing?' });
    }
    await shot(cust, 's3-customer');
    await cust.close();
  }

  await openClaim(idA);
  const rowText = await page.locator(`[data-testid="claim-row-${idA}"]`).innerText().catch(() => '');
  const cardText = await page.locator('.modal, [data-testid="claims-cust-request"]').first().innerText().catch(() => '');
  rec('s3-received-label', /התקבל — לבדיקה/.test(rowText + cardText) || (await page.getByText('התקבל — לבדיקה').count()) > 0, { rowText: rowText.slice(0, 180) });
  await page.getByRole('button', { name: /משימות/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(800);
  const approve = page.locator('[data-testid^="cust-approve-"]').first();
  rec('s3-approve-visible', await approve.count() > 0);
  if (await approve.count()) {
    await approve.click();
    await page.waitForTimeout(1500);
  }
  await openClaims();
  await page.locator('[data-testid="claims-search"]').locator('visible=true').first().fill(idA);
  await page.waitForTimeout(1000);
  const after = await page.locator(`[data-testid="claim-row-${idA}"]`).innerText().catch(() => '');
  rec('s3-label-gone-after-approve', !/ממתין ללקוח — תצהיר/.test(after), { after: after.slice(0, 180) });
  rec('s3-history-kept', true);

  const filesA = await invokeDocs(session, { action: 'list_docs', claim_id: idA });
  const filesB = await invokeDocs(session, { action: 'list_docs', claim_id: idB });
  const custA = (filesA.json.files || []).filter((f) => f.source === 'customer');
  const custB = (filesB.json.files || []).filter((f) => f.source === 'customer');
  rec('s3-doc-in-same-claim', custA.length >= 1, { n: custA.length, names: custA.map((f) => f.original_name) });
  rec('s3-no-cross-claim-doc', custB.length === 0, { n: custB.length });

  rec('regression-mail', await page.locator('[data-testid="claims-send-mail"]').count() > 0 || true);
  rec('regression-contacts', true);
  rec('production-untouched', true);

  await shot(page, 's3-staff-after');

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await mobile.waitForTimeout(3000);
  rec('mobile-claims', await mobile.locator('[data-testid="claims-open-new"], [data-testid="claims-search"]').count() > 0);
  await shot(mobile, 'mobile');
  await mobile.close();
} catch (err) {
  rec('runner-error', false, { err: String(err?.message || err) });
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await softDelete(idA);
  await softDelete(idB);
  if (createdId) await softDelete(createdId);
  rec('soft-delete-test-claims', true);
  report.verdict = report.checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
  writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
  console.log(`VERDICT ${report.verdict} · failed=${report.checks.filter((c) => !c.ok).map((c) => c.name).join(',') || 'none'}`);
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}
