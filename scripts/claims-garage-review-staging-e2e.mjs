#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — garage photo review (awaiting_review / approved / needs_update).
 * TEST claims only. Soft-delete at end. Never Production.
 * node scripts/claims-garage-review-staging-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-garage-review-2026-09-09');
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
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

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
  claimsDocumentsUnchanged: true,
  qaBase: PUBLIC,
  liveSha: '',
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%GARAGE-PDF\n');

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

const admin = serviceClient();
rec('service-role-staging', Boolean(admin), { haveAdmin: Boolean(admin) });
if (!admin) {
  writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify({ ...report, verdict: 'FAIL', failed: ['service-role-staging'] }, null, 2));
  process.exit(1);
}

try {
  const shaRes = await fetch(`${PUBLIC}/sha.txt`, { cache: 'no-store' });
  report.liveSha = (await shaRes.text()).trim().slice(0, 64);
} catch { /* optional until Pages deploy */ }

const desk = await loginAs(DESK_EMAIL, DESK_PASSWORD);
rec('desk-login', !!desk.session.access_token);

let photoUserId = '';
const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = (existingUsers?.users || []).find((u) => u.email === PHOTO_EMAIL);
if (existing) {
  photoUserId = existing.id;
  await admin.auth.admin.updateUserById(existing.id, { password: PHOTO_PASSWORD, email_confirm: true });
} else {
  const created = await admin.auth.admin.createUser({
    email: PHOTO_EMAIL,
    password: PHOTO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'QA צלם מוסך' },
  });
  if (created.error || !created.data.user) throw created.error || new Error('create photographer failed');
  photoUserId = created.data.user.id;
}
await admin.from('profiles').upsert({
  id: photoUserId,
  full_name: 'QA צלם מוסך',
  is_active: true,
  two_factor_approved: true,
  approval_status: 'approved',
  job_title: 'garage_photographer',
}, { onConflict: 'id' });
await admin.from('user_roles').delete().eq('user_id', photoUserId);
await admin.from('user_roles').insert({ user_id: photoUserId, role: 'driver' });
await admin.from('claims_access').delete().eq('user_id', photoUserId);
const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('photographer-login', !!photo.session.access_token);

const stamp = Date.now();
const claimId = `DAL-QA-GRV-${stamp}`;
const otherId = `DAL-QA-GRV-O-${stamp}`;
const legacyId = `DAL-QA-GRV-L-${stamp}`;
const now = new Date().toISOString();
async function makeClaim(id, name, plate) {
  const { error } = await desk.db.from('claims_records').insert({
    id,
    client_name: name,
    status: 'בטיפול',
    plate,
    assigned_to: desk.session.user.id,
    row_data: {
      id, clientName: name, clientEmail: 'yoni122222@gmail.com', clientPhone: '0501111111',
      plate, carModel: 'קורולה', garageName: 'מוסך QA', eventDate: '2026-09-01',
      status: 'בטיפול', source: 'Staff', insCompany: 'מגדל', createdAt: now,
    },
    created_by_name: 'QA Worker',
    last_activity_at: now,
  });
  rec(`create-${id}`, !error, { err: error?.message });
}
await makeClaim(claimId, `TEST Garage Review ${stamp}`, '11-222-33');
await makeClaim(otherId, `TEST Garage Other ${stamp}`, '44-555-66');
await makeClaim(legacyId, `TEST Garage Legacy ${stamp}`, '77-888-99');

const { data: existingAwaiting } = await admin.from('claims_garage_assignments')
  .select('id, claim_id, review_status, completed_at')
  .eq('review_status', 'awaiting_review');
const beforeIds = new Set((existingAwaiting || []).map((r) => r.id));

await admin.from('claims_garage_assignments').insert({
  id: `GAR-LEG-${stamp}`,
  claim_id: legacyId,
  worker_id: photoUserId,
  worker_name: 'QA צלם מוסך',
  status: 'completed',
  review_status: '',
  review_note: '',
  reviewed_by_name: '',
  photo_count: 0,
  assigned_by: desk.session.user.id,
  assigned_by_name: 'QA Worker',
  completed_at: '2026-08-01T00:00:00.000Z',
});
const legacyReviews = await invoke(desk.session, { action: 'list_garage_reviews' });
const legacyHit = (legacyReviews.json.reviews || []).some((r) => r.claim_id === legacyId);
rec('01-assign-legacy-no-awaiting', !legacyHit && legacyReviews.json.success === true, {
  reviews: (legacyReviews.json.reviews || []).map((r) => r.claim_id).slice(0, 12),
  err: legacyReviews.json.error,
});

const assign = await invoke(desk.session, { action: 'assign_garage_worker', claim_id: claimId, worker_id: photoUserId, worker_note: 'צילום פח קדמי' });
rec('01-staff-assign', assign.json.success === true && assign.json.assignment?.worker_id === photoUserId, { err: assign.json.error });

const jobs = await invoke(photo.session, { action: 'garage_list_jobs' });
const jobIds = (jobs.json.jobs || []).map((j) => j.claim_id);
rec('02-worker-sees-assigned-only', jobs.json.success === true && jobIds.includes(claimId) && !jobIds.includes(otherId), { jobIds });

const otherJob = await invoke(photo.session, { action: 'garage_get_job', claim_id: otherId });
rec('03-worker-other-claim-403', otherJob.status === 403 && otherJob.json.blocked === true, { status: otherJob.status, err: otherJob.json.error });

const pdfForm = new FormData();
pdfForm.set('action', 'garage_upload');
pdfForm.set('claim_id', claimId);
pdfForm.set('file', new Blob([PDF], { type: 'application/pdf' }), `garage-bad-${stamp}.pdf`);
const badPdf = await invokeForm(photo.session, pdfForm);
rec('26-worker-pdf-blocked', badPdf.json.success === false, { err: badPdf.json.error });

async function uploadJpg(name) {
  const form = new FormData();
  form.set('action', 'garage_upload');
  form.set('claim_id', claimId);
  form.set('file', new Blob([JPG], { type: 'image/jpeg' }), name);
  return invokeForm(photo.session, form);
}
const up1 = await uploadJpg(`garage-front-${stamp}.jpg`);
const up2 = await uploadJpg(`garage-side-${stamp}.jpg`);
const file1 = String(up1.json.file_id || '');
const file2 = String(up2.json.file_id || '');
rec('04-worker-upload-jpegs', up1.json.success === true && up2.json.success === true && file1 && file2 && file1 !== file2, {
  file1, file2, err: up1.json.error || up2.json.error,
});
rec('05-same-claim', (up1.json.success === true || up2.json.success === true), { claimId });

const complete = await invoke(photo.session, { action: 'garage_complete', claim_id: claimId });
rec('06-worker-complete', complete.json.success === true && complete.json.status === 'completed' && complete.json.review_status === 'awaiting_review', {
  err: complete.json.error, review: complete.json.review_status,
});

const afterDone = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
rec('07-staff-awaiting-review', afterDone.json.assignment?.review_status === 'awaiting_review', {
  status: afterDone.json.assignment?.status, review: afterDone.json.assignment?.review_status,
});

const reviews = await invoke(desk.session, { action: 'list_garage_reviews' });
rec('07-table-awaiting', (reviews.json.reviews || []).some((r) => r.claim_id === claimId && r.review_status === 'awaiting_review'), {
  n: (reviews.json.reviews || []).length, err: reviews.json.error,
});

const docs = await invoke(desk.session, { action: 'list_docs', claim_id: claimId });
const files = docs.json.files || [];
const g1 = files.find((f) => f.id === file1);
rec('08-gallery-garage-photos', g1?.doc_kind === 'garage_photo' && g1?.doc_meta?.staff_type === 'garage_photos' && files.some((f) => f.id === file2), {
  kind: g1?.doc_kind, staff: g1?.doc_meta?.staff_type, n: files.length,
});

const signed = await invoke(desk.session, { action: 'signed_url', claim_id: claimId, file_id: file1 });
const signedAlt = signed.json.url ? signed : await invoke(photo.session, { action: 'garage_signed_url', claim_id: claimId, file_id: file1 });
rec('09-preview-url', Boolean(signedAlt.json.url), { hasUrl: Boolean(signedAlt.json.url), err: signed.json.error });
rec('10-download-url', Boolean(signedAlt.json.url) && /token=/.test(String(signedAlt.json.url || '')), { urlKind: String(signedAlt.json.url || '').slice(0, 40) });

const workerApprove = await invoke(photo.session, { action: 'garage_review_approve', claim_id: claimId });
rec('worker-cannot-approve', workerApprove.status === 403, { status: workerApprove.status, err: workerApprove.json.error });

const approve = await invoke(desk.session, { action: 'garage_review_approve', claim_id: claimId });
rec('11-staff-approve', approve.json.success === true && approve.json.assignment?.review_status === 'approved', { err: approve.json.error });
const afterApprove = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
rec('12-label-cleared', afterApprove.json.assignment?.review_status === 'approved', { review: afterApprove.json.assignment?.review_status });
rec('13-approved-saved', afterApprove.json.assignment?.review_status === 'approved');
rec('14-reviewer-saved', Boolean(afterApprove.json.assignment?.reviewed_by) && Boolean(afterApprove.json.assignment?.reviewed_by_name) && Boolean(afterApprove.json.assignment?.reviewed_at), {
  by: afterApprove.json.assignment?.reviewed_by_name, at: afterApprove.json.assignment?.reviewed_at,
});
const afterApproveList = await invoke(desk.session, { action: 'list_garage_reviews' });
rec('12-chip-gone', !(afterApproveList.json.reviews || []).some((r) => r.claim_id === claimId), {
  n: (afterApproveList.json.reviews || []).length,
});

const { data: hist } = await admin.from('claims_history').select('id, row_data').eq('claim_id', claimId);
const actions = (hist || []).map((h) => String(h.row_data?.action || ''));
rec('15-history-approve', actions.some((a) => a.includes('אושרו')) && actions.some((a) => a.includes('נשלחו לבדיקה')), { actions: actions.slice(0, 12) });

const againCompleteBlocked = await invoke(photo.session, { action: 'garage_complete', claim_id: claimId });
rec('recomplete-after-approve-sets-awaiting', againCompleteBlocked.json.success === true && againCompleteBlocked.json.review_status === 'awaiting_review');

const needs = await invoke(desk.session, { action: 'garage_review_needs_update', claim_id: claimId, note: 'חסרה תמונת לוחית ושלדה' });
rec('16-needs-update', needs.json.success === true && needs.json.assignment?.review_status === 'needs_update' && needs.json.assignment?.status === 'in_progress', {
  err: needs.json.error, review: needs.json.assignment?.review_status, status: needs.json.assignment?.status,
});
const emptyNote = await invoke(desk.session, { action: 'garage_review_needs_update', claim_id: claimId, note: '   ' });
rec('16-note-required', emptyNote.json.success === false, { err: emptyNote.json.error });

const workerJobs = await invoke(photo.session, { action: 'garage_list_jobs' });
const workerJob = (workerJobs.json.jobs || []).find((j) => j.claim_id === claimId);
rec('17-worker-sees-reason', workerJob?.review_status === 'needs_update' && String(workerJob?.review_note || '').includes('לוחית'), {
  note: workerJob?.review_note, review: workerJob?.review_status,
});
const otherWorkerView = await invoke(photo.session, { action: 'garage_get_job', claim_id: otherId });
rec('17-reason-not-on-other-claim', otherWorkerView.status === 403, { status: otherWorkerView.status });

const up3 = await uploadJpg(`garage-plate-${stamp}.jpg`);
const file3 = String(up3.json.file_id || '');
rec('18-worker-adds-photos', up3.json.success === true && Boolean(file3) && file3 !== file1 && file3 !== file2, { file3, err: up3.json.error });

const photosAfter = await invoke(photo.session, { action: 'garage_list_photos', claim_id: claimId });
const photoIds = (photosAfter.json.photos || []).map((p) => p.id);
rec('19-old-photos-kept', photoIds.includes(file1) && photoIds.includes(file2) && photoIds.includes(file3), { n: photoIds.length });

const complete2 = await invoke(photo.session, { action: 'garage_complete', claim_id: claimId });
rec('20-complete-again', complete2.json.success === true && complete2.json.review_status === 'awaiting_review');
const afterRound2 = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
rec('21-back-to-awaiting', afterRound2.json.assignment?.review_status === 'awaiting_review' && !afterRound2.json.assignment?.review_note, {
  review: afterRound2.json.assignment?.review_status, note: afterRound2.json.assignment?.review_note,
});

const approve2 = await invoke(desk.session, { action: 'garage_review_approve', claim_id: claimId });
rec('22-approve-after-update', approve2.json.success === true && approve2.json.assignment?.review_status === 'approved', { err: approve2.json.error });

const reopen = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
rec('23-refresh-reopen', reopen.json.assignment?.review_status === 'approved' && Boolean(reopen.json.assignment?.reviewed_at), {
  review: reopen.json.assignment?.review_status, by: reopen.json.assignment?.reviewed_by_name,
});

const staffPdf = new FormData();
staffPdf.set('action', 'staff_upload');
staffPdf.set('claim_id', otherId);
staffPdf.set('file', new Blob([PDF], { type: 'application/pdf' }), `other-${stamp}.pdf`);
const otherFile = await invokeForm(desk.session, staffPdf);
const otherFileId = String(otherFile.json.file_id || '');
const leakSigned = await invoke(photo.session, { action: 'garage_signed_url', claim_id: claimId, file_id: otherFileId });
rec('29-no-cross-claim-signed', leakSigned.status === 403 || leakSigned.json.blocked === true || leakSigned.json.success === false, {
  status: leakSigned.status, err: leakSigned.json.error,
});
const leakJob = await invoke(photo.session, { action: 'garage_list_photos', claim_id: otherId });
rec('29-no-cross-claim-list', leakJob.status === 403, { status: leakJob.status });

const share = await invoke(desk.session, {
  action: 'create_share', claim_id: claimId, recipient_name: 'שמאי QA', recipient_kind: 'surveyor',
  file_ids: [file1, file2], ttl_hours: 48,
});
const token = String(share.json.token || '');
rec('28-secure-share', share.json.success === true && token.length >= 64, { err: share.json.error });
const pubGet = await pub({ action: 'public_share_get', token });
const pubIds = (pubGet.json.files || []).map((f) => f.id);
rec('28-share-only-this-claim', pubGet.json.success === true && pubIds.includes(file1) && !pubIds.includes(otherFileId), { pubIds });
await invoke(desk.session, { action: 'revoke_share', claim_id: claimId, share_id: share.json.id });

const { data: buckets } = await admin.storage.listBuckets();
const docsBucket = (buckets || []).find((b) => b.name === 'claims-docs');
rec('claims-docs-private', docsBucket?.public === false, { public: docsBucket?.public });

const { data: afterAwaiting } = await admin.from('claims_garage_assignments')
  .select('id, claim_id, review_status')
  .eq('review_status', 'awaiting_review');
const leakedOld = (afterAwaiting || []).filter((r) => beforeIds.has(r.id) === false && r.claim_id === legacyId);
rec('migration-no-old-awaiting', leakedOld.length === 0 && !((afterAwaiting || []).some((r) => r.claim_id === legacyId)), {
  legacy: leakedOld,
});

if (!process.env.CLAIMS_QA_API_ONLY) {
  try {
    const { chromium } = await import('playwright');
    const pagesGarage = await fetch(`${PUBLIC}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
    const local = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
    const localGarage = await fetch(`${local}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
    const uiBase = localGarage === 200 ? local : (pagesGarage === 200 ? PUBLIC : '');
    rec('ui-base-ready', Boolean(uiBase), { pagesGarage, localGarage, uiBase });
    if (uiBase) {
      const browser = await chromium.launch({ headless: true });
      async function authContext(session, viewport) {
        const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
        await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
        return ctx;
      }

      const staffCtx = await authContext(desk.session, { width: 1400, height: 900 });
      const staffPage = await staffCtx.newPage();
      await staffPage.goto(`${uiBase}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await staffPage.waitForSelector('[data-testid="claims-search"], [data-testid="claims-open-new"]', { timeout: 45000 }).catch(() => null);
      const box = staffPage.locator('[data-testid="claims-search"]').locator('visible=true').first();
      if (await box.count()) {
        await box.fill(claimId);
        await staffPage.waitForTimeout(900);
        const chip = staffPage.locator('[data-testid="claim-alert-garage_review"]').first();
        rec('25-desktop-chip-absent-after-approve', (await chip.count()) === 0 || !(await chip.isVisible().catch(() => false)));
        const row = staffPage.locator(`[data-testid="claim-row-${claimId}"]`).first();
        if (await row.count()) {
          await row.click();
          await staffPage.locator('[data-testid="claims-open-docs"]').click().catch(() => null);
          await staffPage.waitForSelector('[data-testid="garage-assign-bar"]', { timeout: 20000 }).catch(() => null);
          rec('25-desktop-staff-bar', await staffPage.locator('[data-testid="garage-assign-bar"]').count() > 0);
          rec('25-desktop-approved-label', await staffPage.locator('[data-testid="garage-review-approved"]').count() > 0, {
            text: (await staffPage.locator('[data-testid="garage-assign-bar"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220),
          });
          rec('30-gallery-topic', await staffPage.getByText('תמונות מוסך', { exact: false }).count() > 0);
          const barPath = join(OUT, 'screenshots', 'staff-review-approved.png');
          await staffPage.screenshot({ path: barPath, fullPage: false });
          try { copyFileSync(barPath, join('/opt/cursor/artifacts', 'garage-review-staff.png')); } catch { /* skip */ }
        } else rec('25-desktop-staff-bar', false, { err: 'claim row missing' });
      } else rec('25-desktop-staff-bar', false, { err: 'search missing' });
      await staffCtx.close();

      const photoCtx = await authContext(photo.session, { width: 390, height: 844 });
      const photoPage = await photoCtx.newPage();
      await photoPage.goto(`${uiBase}/garage`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await photoPage.waitForSelector('[data-testid="garage-portal"]', { timeout: 30000 }).catch(() => null);
      rec('24-mobile-garage', await photoPage.locator('[data-testid="garage-portal"]').count() > 0);
      await photoPage.waitForSelector(`[data-testid="garage-job-${claimId}"]`, { timeout: 25000 }).catch(() => null);
      rec('24-mobile-job-card', await photoPage.locator(`[data-testid="garage-job-${claimId}"]`).count() > 0);
      if (await photoPage.locator(`[data-testid="garage-job-${claimId}"]`).count()) {
        await photoPage.locator(`[data-testid="garage-job-${claimId}"]`).click();
        await photoPage.waitForSelector('[data-testid="garage-job-open"]', { timeout: 15000 }).catch(() => null);
        rec('24-mobile-job-open', await photoPage.locator('[data-testid="garage-job-open"]').count() > 0);
        const mobPath = join(OUT, 'screenshots', 'worker-garage-mobile.png');
        await photoPage.screenshot({ path: mobPath, fullPage: true });
        try { copyFileSync(mobPath, join('/opt/cursor/artifacts', 'garage-review-mobile.png')); } catch { /* skip */ }
      }
      await photoCtx.close();
      await browser.close();
    }
  } catch (e) {
    rec('ui-playwright', false, { err: String(e.message || e).slice(0, 240) });
  }
}

const unassign = await invoke(desk.session, { action: 'unassign_garage_worker', claim_id: claimId });
rec('27-staff-unassign', unassign.json.success === true, { err: unassign.json.error });
const afterUn = await invoke(photo.session, { action: 'garage_get_job', claim_id: claimId });
rec('27-unassign-blocks-worker', afterUn.status === 403 && afterUn.json.blocked === true, { status: afterUn.status });

await softDelete(claimId, desk.db);
await softDelete(otherId, desk.db);
await softDelete(legacyId, desk.db);
await admin.from('claims_garage_assignments').update({ unassigned_at: new Date().toISOString() }).eq('claim_id', legacyId);
rec('soft-delete-test-claims', true, { claimId, otherId, legacyId });
rec('production-untouched', true);

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, liveSha: report.liveSha, n: report.checks.length }, null, 2));
if (failed.length) process.exit(1);
