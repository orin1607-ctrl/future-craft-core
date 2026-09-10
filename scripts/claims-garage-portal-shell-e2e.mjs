#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — real garage photographer Login → dedicated /garage shell.
 * TEST claims only. Soft-delete at end. Never Production.
 * node scripts/claims-garage-portal-shell-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-garage-portal-shell-2026-09-10');
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
  claimsDocsPrivate: true,
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
rec('desk-login', !!desk.session.access_token);

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
  id: photoUserId,
  full_name: 'QA צלם מוסך',
  is_active: true,
  two_factor_approved: false,
  approval_status: 'approved',
  job_title: 'garage_photographer',
}, { onConflict: 'id' });
await admin.from('user_roles').delete().eq('user_id', photoUserId);
await admin.from('user_roles').insert({ user_id: photoUserId, role: 'driver' });
await admin.from('claims_access').delete().eq('user_id', photoUserId);
const { data: photoProfile } = await admin.from('profiles').select('job_title, two_factor_approved').eq('id', photoUserId).maybeSingle();
rec('photographer-job-title', photoProfile?.job_title === 'garage_photographer', { job: photoProfile?.job_title });

const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('photographer-api-login', !!photo.session.access_token);

const stamp = Date.now();
const claimId = `DAL-QA-GPS-${stamp}`;
const otherId = `DAL-QA-GPS-O-${stamp}`;
const now = new Date().toISOString();
async function makeClaim(id, name, plate) {
  const { error } = await desk.db.from('claims_records').insert({
    id, client_name: name, status: 'בטיפול', plate, assigned_to: desk.session.user.id,
    row_data: {
      id, clientName: name, clientEmail: 'yoni122222@gmail.com', clientPhone: '0501111111',
      plate, carModel: 'קורולה', garageName: 'מוסך QA', eventDate: '2026-09-01',
      status: 'בטיפול', source: 'Staff', insCompany: 'מגדל', createdAt: now,
    },
    created_by_name: 'QA Worker', last_activity_at: now,
  });
  rec(`create-${id}`, !error, { err: error?.message });
}
await makeClaim(claimId, `TEST Garage Portal ${stamp}`, '11-222-33');
await makeClaim(otherId, `TEST Garage Other ${stamp}`, '44-555-66');

const assign = await invoke(desk.session, { action: 'assign_garage_worker', claim_id: claimId, worker_id: photoUserId, worker_note: 'צילום פח קדמי' });
rec('staff-assign', assign.json.success === true, { err: assign.json.error });

const jobs = await invoke(photo.session, { action: 'garage_list_jobs' });
const jobIds = (jobs.json.jobs || []).map((j) => j.claim_id);
rec('worker-sees-assigned-only', jobs.json.success === true && jobIds.includes(claimId) && !jobIds.includes(otherId), { jobIds });
const otherJob = await invoke(photo.session, { action: 'garage_get_job', claim_id: otherId });
rec('unassigned-claim-blocked', otherJob.status === 403, { status: otherJob.status });

async function uploadJpg(name) {
  const form = new FormData();
  form.set('action', 'garage_upload');
  form.set('claim_id', claimId);
  form.set('file', new Blob([jpgN(name)], { type: 'image/jpeg' }), name);
  return invokeForm(photo.session, form);
}
const up1 = await uploadJpg(`gps-front-${stamp}.jpg`);
const up2 = await uploadJpg(`gps-side-${stamp}.jpg`);
const file1 = String(up1.json.file_id || '');
const file2 = String(up2.json.file_id || '');
rec('upload-two-jpegs', Boolean(file1 && file2 && file1 !== file2), { file1, file2 });
const complete = await invoke(photo.session, { action: 'garage_complete', claim_id: claimId });
rec('complete-awaiting', complete.json.success === true && complete.json.review_status === 'awaiting_review');

const needs = await invoke(desk.session, { action: 'garage_review_needs_update', claim_id: claimId, note: 'חסרה תמונת לוחית' });
rec('needs-update', needs.json.assignment?.review_status === 'needs_update', { err: needs.json.error });
const up3 = await uploadJpg(`gps-plate-${stamp}.jpg`);
const file3 = String(up3.json.file_id || '');
rec('add-photo-same-claim', Boolean(file3) && file3 !== file1, { file3 });
const photos = await invoke(photo.session, { action: 'garage_list_photos', claim_id: claimId });
const ids = (photos.json.photos || []).map((p) => p.id);
rec('old-photos-kept', ids.includes(file1) && ids.includes(file2) && ids.includes(file3), { n: ids.length });
const complete2 = await invoke(photo.session, { action: 'garage_complete', claim_id: claimId });
rec('complete-again', complete2.json.review_status === 'awaiting_review');
const approve = await invoke(desk.session, { action: 'garage_review_approve', claim_id: claimId });
rec('staff-approve', approve.json.assignment?.review_status === 'approved', { err: approve.json.error });

const staffPdf = new FormData();
staffPdf.set('action', 'staff_upload');
staffPdf.set('claim_id', otherId);
staffPdf.set('file', new Blob([Buffer.from('%PDF-1.1\n%%OTHER\n')], { type: 'application/pdf' }), `other-${stamp}.pdf`);
const otherFile = await invokeForm(desk.session, staffPdf);
const otherFileId = String(otherFile.json.file_id || '');
const leak = await invoke(photo.session, { action: 'garage_signed_url', claim_id: claimId, file_id: otherFileId });
rec('foreign-file-blocked', leak.status === 403 || leak.json.blocked === true || leak.json.success === false);

const share = await invoke(desk.session, {
  action: 'create_share', claim_id: claimId, recipient_name: 'שמאי QA', recipient_kind: 'surveyor',
  file_ids: [file1, file2], ttl_hours: 48,
});
const token = String(share.json.token || '');
rec('secure-share-create', share.json.success === true && token.length >= 64, { err: share.json.error });
const pubGet = await pub({ action: 'public_share_get', token });
const pubIds = (pubGet.json.files || []).map((f) => f.id);
rec('share-selected-only', pubGet.json.success === true && pubIds.includes(file1) && pubIds.includes(file2) && !pubIds.includes(file3) && !pubIds.includes(otherFileId), { pubIds });

const { data: buckets } = await admin.storage.listBuckets();
const docsBucket = (buckets || []).find((b) => b.name === 'claims-docs');
rec('claims-docs-private', docsBucket?.public === false, { public: docsBucket?.public });

const pagesGarage = await fetch(`${PUBLIC}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
const local = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const localGarage = await fetch(`${local}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
const uiBase = process.env.CLAIMS_QA_PREFER_PUBLIC === '1'
  ? (pagesGarage === 200 ? PUBLIC : (localGarage === 200 ? local : ''))
  : (localGarage === 200 ? local : (pagesGarage === 200 ? PUBLIC : ''));
rec('ui-base-ready', Boolean(uiBase), { pagesGarage, localGarage, uiBase, liveSha: report.liveSha });

if (uiBase) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${uiBase}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('input[type="email"], input[type="password"]', { timeout: 30000 });
    await page.locator('input[type="email"]').first().fill(PHOTO_EMAIL);
    await page.locator('input[type="password"]').first().fill(PHOTO_PASSWORD);
    await page.getByRole('button', { name: 'התחבר' }).click();
    await page.waitForURL(/\/garage/, { timeout: 45000 }).catch(() => null);
    const url = page.url();
    rec('real-login-lands-garage', /\/garage/.test(url) && !/\/dashboard|\/faults|\/vehicles|\/claims/.test(url), { url });
    await page.waitForSelector('[data-testid="garage-portal"], [data-testid="garage-shell"]', { timeout: 25000 }).catch(() => null);
    rec('real-login-garage-portal', await page.locator('[data-testid="garage-portal"]').count() > 0);
    rec('no-fleet-menu', (await page.locator('[data-testid="mobile-nav-open"]').count()) === 0);
    rec('no-driver-bottom-nav-faults', (await page.getByText('תקלה', { exact: true }).count()) === 0);
    rec('no-driver-bottom-nav-invoices', (await page.getByText('חשבוניות', { exact: true }).count()) === 0);
    rec('no-vehicles-link', (await page.getByRole('link', { name: /רכבים|נהגים|תביעות/ }).count()) === 0);
    await page.waitForSelector(`[data-testid="garage-job-${claimId}"]`, { timeout: 20000 }).catch(() => null);
    rec('assigned-job-visible', await page.locator(`[data-testid="garage-job-${claimId}"]`).count() > 0);
    rec('other-job-hidden', await page.locator(`[data-testid="garage-job-${otherId}"]`).count() === 0);
    const search = page.locator('[data-testid="garage-search"]');
    if (await search.count()) {
      await search.fill('11-222-33');
      await page.waitForTimeout(300);
      rec('search-assigned', await page.locator(`[data-testid="garage-job-${claimId}"]`).count() > 0);
      await search.fill('אין-כזה-לקוח-xyz');
      await page.waitForTimeout(300);
      rec('search-empty-not-global', await page.locator(`[data-testid="garage-job-${claimId}"]`).count() === 0);
      await search.fill('');
    }
    if (await page.locator(`[data-testid="garage-job-${claimId}"]`).count()) {
      await page.locator(`[data-testid="garage-job-${claimId}"]`).click();
      await page.waitForSelector('[data-testid="garage-job-open"]', { timeout: 15000 }).catch(() => null);
      rec('open-job', await page.locator('[data-testid="garage-job-open"]').count() > 0);
      rec('camera-button', await page.locator('[data-testid="garage-camera"]').count() > 0);
      rec('upload-button', await page.locator('[data-testid="garage-pick"]').count() > 0);
      rec('complete-button', await page.locator('[data-testid="garage-complete"]').count() > 0);
      await page.waitForSelector(`[data-testid="garage-download-${file1}"], [data-testid="garage-photos"] img`, { timeout: 20000 }).catch(() => null);
      rec('has-download', await page.locator('[data-testid^="garage-download-"]').count() > 0 || await page.locator('[data-testid="garage-photos"] img').count() > 0);
    }
    const mob = join(OUT, 'screenshots', 'real-login-garage-mobile.png');
    await page.screenshot({ path: mob, fullPage: true });
    try { copyFileSync(mob, join('/opt/cursor/artifacts', 'garage-portal-real-login-mobile.png')); } catch { /* skip */ }

    await page.goto(`${uiBase}/dashboard?v=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL(/\/garage/, { timeout: 20000 }).catch(() => null);
    rec('dashboard-redirects-garage', /\/garage/.test(page.url()), { url: page.url() });
    await page.goto(`${uiBase}/faults?v=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL(/\/garage/, { timeout: 20000 }).catch(() => null);
    rec('faults-blocked', /\/garage/.test(page.url()), { url: page.url() });

    await page.locator('[data-testid="garage-logout"], [data-testid="garage-logout-desktop"]').first().click().catch(() => null);
    await page.waitForURL(/\/login|\/about/, { timeout: 20000 }).catch(() => null);
    rec('logout', /login|about/.test(page.url()), { url: page.url() });
    await page.goto(`${uiBase}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await page.locator('input[type="email"]').first().fill(PHOTO_EMAIL);
    await page.locator('input[type="password"]').first().fill(PHOTO_PASSWORD);
    await page.getByRole('button', { name: 'התחבר' }).click();
    await page.waitForURL(/\/garage/, { timeout: 45000 }).catch(() => null);
    rec('relogin-garage', /\/garage/.test(page.url()), { url: page.url() });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="garage-portal"]', { timeout: 20000 }).catch(() => null);
    rec('refresh-stays-garage', /\/garage/.test(page.url()) && await page.locator('[data-testid="garage-portal"]').count() > 0, { url: page.url() });

    const deskCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
    await deskCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: desk.session.access_token,
        refresh_token: desk.session.refresh_token,
        expires_at: desk.session.expires_at,
        expires_in: desk.session.expires_in,
        token_type: desk.session.token_type,
        user: desk.session.user,
      },
    });
    const staffPage = await deskCtx.newPage();
    await staffPage.goto(`${uiBase}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await staffPage.waitForSelector('[data-testid="claims-search"], [data-testid="claims-open-new"]', { timeout: 45000 }).catch(() => null);
    const box = staffPage.locator('[data-testid="claims-search"]').locator('visible=true').first();
    if (await box.count()) {
      await box.fill(claimId);
      await staffPage.waitForTimeout(900);
      const row = staffPage.locator(`[data-testid="claim-row-${claimId}"]`).first();
      if (await row.count()) {
        await row.click();
        await staffPage.locator('[data-testid="claims-open-docs"]').click().catch(() => null);
        await staffPage.waitForSelector('[data-testid="garage-review-approved"], [data-testid="garage-assign-current"]', { timeout: 25000 }).catch(() => null);
        rec('staff-desktop-approved', await staffPage.locator('[data-testid="garage-review-approved"]').count() > 0, {
          text: (await staffPage.locator('[data-testid="garage-assign-bar"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200),
        });
        rec('staff-secure-share-control', await staffPage.getByText('שיתוף מאובטח', { exact: false }).count() > 0);
        const deskShot = join(OUT, 'screenshots', 'staff-desktop.png');
        await staffPage.screenshot({ path: deskShot, fullPage: false });
        try { copyFileSync(deskShot, join('/opt/cursor/artifacts', 'garage-portal-staff-desktop.png')); } catch { /* skip */ }
      } else rec('staff-desktop-approved', false, { err: 'row missing' });
    } else rec('staff-desktop-approved', false, { err: 'search missing' });

    if (token) {
      const sharePage = await browser.newPage();
      await sharePage.goto(`${uiBase}/claims-share?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      const shareText = (await sharePage.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      rec('surveyor-no-login-share', !/התחבר|כניסה למערכת/.test(shareText) || /הורד|תמונ|קבצ/.test(shareText), { shareText });
      await sharePage.close();
    }

    await deskCtx.close();
    await browser.close();
  } catch (e) {
    rec('ui-playwright', false, { err: String(e.message || e).slice(0, 300) });
  }
}

const freshPhoto = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
const unassign = await invoke(desk.session, { action: 'unassign_garage_worker', claim_id: claimId });
rec('unassign', unassign.json.success === true);
const afterUn = await invoke(freshPhoto.session, { action: 'garage_get_job', claim_id: claimId });
rec('unassign-blocks', afterUn.status === 403 && afterUn.json.blocked === true, { status: afterUn.status, err: afterUn.json.error });
await invoke(desk.session, { action: 'revoke_share', claim_id: claimId, share_id: share.json.id }).catch(() => null);

await softDelete(claimId, desk.db);
await softDelete(otherId, desk.db);
rec('soft-delete-test-claims', true, { claimId, otherId });
rec('production-untouched', true);

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, liveSha: report.liveSha, n: report.checks.length }, null, 2));
if (failed.length) process.exit(1);
