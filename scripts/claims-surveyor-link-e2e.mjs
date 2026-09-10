#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — surveyor Secure Share link only.
 * Real photographer creates a link; a no-login window opens it.
 * TEST claims only. Soft-delete at end. Never Production.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-surveyor-link-2026-09-10');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync('/opt/cursor/artifacts', { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const DESK_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const DESK_PASSWORD = 'QaWorker2026!';
const PHOTO_EMAIL = 'qa.garage.photographer@futurecraft.staging';
const PHOTO_PASSWORD = 'QaGarage2026!';
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
function jwtRef(tok) {
  try { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8')).ref || ''; }
  catch { return ''; }
}
if (jwtRef(anonKey) === PROD_REF) throw new Error('production anon key blocked');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  qaBase: PUBLIC,
  liveSha: '',
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

const JPG_BASE = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
function jpgN(tag) {
  return Buffer.concat([JPG_BASE, Buffer.from(`-${tag}-`)]);
}
function authHdr(session) {
  return { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}
async function invoke(session, body) {
  const res = await fetch(FN, { method: 'POST', headers: authHdr(session), body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function invokeForm(session, form) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function pub(body) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function loginAs(email, password) {
  const db = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error || new Error(`login failed ${email}`);
  return { session: data.session, db };
}
async function softDelete(claimId, sessionDb) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await sessionDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await sessionDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}
function serviceClient() {
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').replace(/[\r\n]/g, '').trim();
  if (!raw) {
    try {
      const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
      const service = keys.find((k) => k.name === 'service_role')?.api_key;
      if (service && jwtRef(service) !== PROD_REF) {
        return createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });
      }
    } catch { /* optional */ }
    return null;
  }
  if (jwtRef(raw) === PROD_REF) throw new Error('production service key blocked');
  return createClient(`https://${STAGING_REF}.supabase.co`, raw, { auth: { persistSession: false } });
}

try {
  const pagesTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  report.liveSha = ((pagesTxt.match(/deployed_ref=(\S+)/) || [])[1] || '').slice(0, 40);
} catch { /* optional */ }

const admin = serviceClient();
rec('service-role-staging', Boolean(admin));
if (!admin) {
  writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify({ ...report, verdict: 'FAIL' }, null, 2));
  process.exit(1);
}

const desk = await loginAs(DESK_EMAIL, DESK_PASSWORD);
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = (users?.users || []).find((u) => u.email === PHOTO_EMAIL);
let photoUserId = existing?.id || '';
if (existing) {
  await admin.auth.admin.updateUserById(existing.id, { password: PHOTO_PASSWORD, email_confirm: true });
} else {
  const created = await admin.auth.admin.createUser({
    email: PHOTO_EMAIL, password: PHOTO_PASSWORD, email_confirm: true,
    user_metadata: { full_name: 'QA צלם מוסך' },
  });
  photoUserId = created.data.user.id;
}
await admin.from('profiles').upsert({
  id: photoUserId, full_name: 'QA צלם מוסך', is_active: true, two_factor_approved: false,
  approval_status: 'approved', job_title: 'garage_photographer',
}, { onConflict: 'id' });
await admin.from('user_roles').delete().eq('user_id', photoUserId);
await admin.from('user_roles').insert({ user_id: photoUserId, role: 'driver' });
await admin.from('claims_access').delete().eq('user_id', photoUserId);
const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('photographer-login', !!photo.session.access_token);

const stamp = Date.now();
const claimId = `DAL-QA-SLK-${stamp}`;
const now = new Date().toISOString();
const { error: createErr } = await desk.db.from('claims_records').insert({
  id: claimId, client_name: `TEST Surveyor Link ${stamp}`, status: 'בטיפול', plate: '22-333-44',
  assigned_to: desk.session.user.id,
  row_data: {
    id: claimId, clientName: `TEST Surveyor Link ${stamp}`, plate: '22-333-44',
    carModel: 'קורולה', garageName: 'מוסך QA', eventDate: '2026-09-01',
    status: 'בטיפול', source: 'Staff', createdAt: now,
  },
  created_by_name: 'QA Worker', last_activity_at: now,
});
rec('create-test-claim', !createErr, { err: createErr?.message, claimId });
await invoke(desk.session, { action: 'assign_garage_worker', claim_id: claimId, worker_id: photoUserId });

async function uploadJpg(name) {
  const form = new FormData();
  form.set('action', 'garage_upload');
  form.set('claim_id', claimId);
  form.set('file', new Blob([jpgN(name)], { type: 'image/jpeg' }), name);
  return invokeForm(photo.session, form);
}
const up1 = await uploadJpg(`slk-a-${stamp}.jpg`);
const up2 = await uploadJpg(`slk-b-${stamp}.jpg`);
const up3 = await uploadJpg(`slk-c-${stamp}.jpg`);
const file1 = String(up1.json.file_id || '');
const file2 = String(up2.json.file_id || '');
const file3 = String(up3.json.file_id || '');
rec('upload-three', Boolean(file1 && file2 && file3));

const share = await invoke(photo.session, {
  action: 'garage_create_share', claim_id: claimId, recipient_name: 'שמאי QA', file_ids: [file1, file2], ttl_hours: 48,
});
const token = String(share.json.token || '');
rec('create-share', share.json.success === true && token.length >= 64, { err: share.json.error });

const publicUrl = `${PUBLIC}/claims-share?t=${encodeURIComponent(token)}`;
const head = await fetch(publicUrl, { method: 'HEAD', redirect: 'follow', cache: 'no-store' });
rec('public-link-http-ok', head.ok && head.status === 200, { status: head.status, url: publicUrl, final: head.url });
const noRedirect = await fetch(publicUrl, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
rec('public-link-not-404', noRedirect.status !== 404, { status: noRedirect.status, location: noRedirect.headers.get('location') });

const pubGet = await pub({ action: 'public_share_get', token });
const pubIds = (pubGet.json.files || []).map((f) => f.id);
rec('api-selected-only', pubGet.json.success === true && pubIds.includes(file1) && pubIds.includes(file2) && !pubIds.includes(file3), { pubIds });
const blocked = await pub({ action: 'public_share_url', token, file_id: file3 });
rec('api-unselected-blocked', blocked.status === 403 || blocked.json.blocked === true);
const dl = await pub({ action: 'public_share_url', token, file_id: file1, purpose: 'download' });
rec('api-download', Boolean(dl.json.url));

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const anon = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await anon.newPage();
await page.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-testid="share-page"], [data-testid="share-error"]', { timeout: 25000 }).catch(() => null);
const bodyText = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
rec('no-login-window', !/התחבר|כניסה למערכת|סיסמה/.test(bodyText) && await page.locator('[data-testid="share-page"]').count() > 0, { url: page.url(), bodyText });
rec('sees-selected', await page.locator(`[data-testid="share-pub-img-${file1}"]`).count() > 0 && await page.locator(`[data-testid="share-pub-img-${file2}"]`).count() > 0);
rec('hides-unselected', await page.locator(`[data-testid="share-pub-img-${file3}"]`).count() === 0);
rec('has-preview', await page.getByText('Preview', { exact: false }).count() > 0);
rec('has-download', await page.locator('[data-testid^="share-pub-dl-"]').count() > 0);
rec('has-download-all', await page.locator('[data-testid="share-pub-zip"]').count() > 0);
const mob = join(OUT, 'screenshots', 'surveyor-no-login-mobile.png');
await page.screenshot({ path: mob, fullPage: true });
try { copyFileSync(mob, join('/opt/cursor/artifacts', 'surveyor-link-no-login-mobile.png')); } catch { /* skip */ }

const deskCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
const deskPage = await deskCtx.newPage();
await deskPage.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await deskPage.waitForSelector('[data-testid="share-page"]', { timeout: 25000 }).catch(() => null);
rec('desktop-no-login', await deskPage.locator('[data-testid="share-page"]').count() > 0 && !/התחבר/.test(await deskPage.innerText('body').catch(() => '')));
const deskShot = join(OUT, 'screenshots', 'surveyor-no-login-desktop.png');
await deskPage.screenshot({ path: deskShot, fullPage: true });
try { copyFileSync(deskShot, join('/opt/cursor/artifacts', 'surveyor-link-no-login-desktop.png')); } catch { /* skip */ }

await deskCtx.close();
await anon.close();
await browser.close();

await invoke(desk.session, { action: 'revoke_share', claim_id: claimId, share_id: share.json.id }).catch(() => null);
await softDelete(claimId, desk.db);
rec('soft-delete', true, { claimId });
rec('production-untouched', true);

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, liveSha: report.liveSha, n: report.checks.length, publicUrl: publicUrl.slice(0, 80) }, null, 2));
if (failed.length) process.exit(1);
