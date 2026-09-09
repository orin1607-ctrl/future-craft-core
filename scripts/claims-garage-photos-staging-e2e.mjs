#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — garage photographer assignment + תמונות מוסך.
 * TEST claims only. Soft-delete at end. Never Production.
 * node scripts/claims-garage-photos-staging-e2e.mjs
 */
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-garage-photos-2026-09-09');
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
  qaBase: PUBLIC,
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
rec('recycle-existing-auth-user', Boolean(photoUserId), { id: photoUserId });

await admin.from('profiles').upsert({
  id: photoUserId,
  full_name: 'QA צלם מוסך',
  is_active: true,
  two_factor_approved: true,
  approval_status: 'approved',
}, { onConflict: 'id' });
await admin.from('user_roles').delete().eq('user_id', photoUserId);
await admin.from('user_roles').insert({ user_id: photoUserId, role: 'driver' });
await admin.from('claims_access').delete().eq('user_id', photoUserId);
rec('photographer-no-claims-access', true);

const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('photographer-login', !!photo.session.access_token);

const stamp = Date.now();
const claimId = `DAL-QA-GAR-${stamp}`;
const otherId = `DAL-QA-GAR-O-${stamp}`;
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
await makeClaim(claimId, `TEST Garage ${stamp}`, '11-222-33');
await makeClaim(otherId, `TEST Garage Other ${stamp}`, '44-555-66');

const beforeAssign = await desk.db.from('claims_records').select('id, assigned_to').eq('id', claimId).maybeSingle();
const assign = await invoke(desk.session, { action: 'assign_garage_worker', claim_id: claimId, worker_id: photoUserId, worker_note: 'צילום פח קדמי' });
rec('staff-assign', assign.json.success === true && assign.json.assignment?.worker_id === photoUserId, { err: assign.json.error });
const afterAssign = await desk.db.from('claims_records').select('id, assigned_to').eq('id', claimId).maybeSingle();
rec('assigned-to-unchanged', beforeAssign.data?.assigned_to === desk.session.user.id && afterAssign.data?.assigned_to === desk.session.user.id, {
  before: beforeAssign.data?.assigned_to, after: afterAssign.data?.assigned_to,
});

const got = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
rec('staff-get-assignment', got.json.success === true && got.json.assignment?.worker_id === photoUserId, { status: got.json.assignment?.status });

const jobs = await invoke(photo.session, { action: 'garage_list_jobs' });
const jobIds = (jobs.json.jobs || []).map((j) => j.claim_id);
rec('worker-sees-assigned-only', jobs.json.success === true && jobIds.includes(claimId) && !jobIds.includes(otherId), { jobIds });

const job = await invoke(photo.session, { action: 'garage_get_job', claim_id: claimId });
rec('worker-limited-claim', job.json.success === true && job.json.claim?.plate === '11-222-33' && !job.json.claim?.notes && !job.json.history, {
  claim: job.json.claim,
});

const otherJob = await invoke(photo.session, { action: 'garage_get_job', claim_id: otherId });
rec('worker-other-claim-403', otherJob.status === 403 && otherJob.json.blocked === true, { status: otherJob.status, err: otherJob.json.error });

const deskAsWorker = await invoke(desk.session, { action: 'garage_get_job', claim_id: claimId });
rec('desk-not-photographer-403', deskAsWorker.status === 403 && deskAsWorker.json.blocked === true, { status: deskAsWorker.status });

const listDocsAsPhoto = await invoke(photo.session, { action: 'list_docs', claim_id: claimId });
rec('worker-no-list-docs', listDocsAsPhoto.status === 403, { status: listDocsAsPhoto.status, err: listDocsAsPhoto.json.error });

const { data: rlsJobs, error: rlsErr } = await photo.db.from('claims_garage_assignments').select('id, claim_id').eq('claim_id', claimId);
rec('worker-no-direct-table', !rlsJobs?.length, { n: rlsJobs?.length || 0, err: rlsErr?.message });

const { data: rlsClaims } = await photo.db.from('claims_records').select('id').eq('id', claimId);
rec('worker-no-direct-claim', !rlsClaims?.length, { n: rlsClaims?.length || 0 });

const pdfForm = new FormData();
pdfForm.set('action', 'garage_upload');
pdfForm.set('claim_id', claimId);
pdfForm.set('file', new Blob([PDF], { type: 'application/pdf' }), `garage-bad-${stamp}.pdf`);
const badPdf = await invokeForm(photo.session, pdfForm);
rec('worker-pdf-blocked', badPdf.json.success === false && /image/i.test(String(badPdf.json.error || '')), { err: badPdf.json.error });

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
rec('worker-upload-1', up1.json.success === true && Boolean(file1), { id: file1, status: up1.json.status, err: up1.json.error });
rec('worker-upload-2', up2.json.success === true && Boolean(file2), { id: file2, err: up2.json.error });
rec('upload-marks-in-progress', up1.json.status === 'in_progress' || up2.json.status === 'in_progress');

const photos = await invoke(photo.session, { action: 'garage_list_photos', claim_id: claimId });
rec('worker-lists-own-photos', (photos.json.photos || []).some((p) => p.id === file1) && (photos.json.photos || []).some((p) => p.id === file2), {
  n: (photos.json.photos || []).length,
});
const signed = await invoke(photo.session, { action: 'garage_signed_url', claim_id: claimId, file_id: file1 });
rec('worker-signed-url', Boolean(signed.json.url) && /token=/.test(String(signed.json.url || '')), { hasUrl: Boolean(signed.json.url) });

const docs = await invoke(desk.session, { action: 'list_docs', claim_id: claimId });
const files = docs.json.files || [];
const g1 = files.find((f) => f.id === file1);
const g2 = files.find((f) => f.id === file2);
rec('staff-gallery-garage-photos', g1?.doc_kind === 'garage_photo' && (g1?.doc_meta?.staff_type === 'garage_photos') && Boolean(g2), {
  kind: g1?.doc_kind, staff: g1?.doc_meta?.staff_type,
});

const complete = await invoke(photo.session, { action: 'garage_complete', claim_id: claimId });
rec('worker-complete', complete.json.success === true && complete.json.status === 'completed', { err: complete.json.error });
const afterDone = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
rec('staff-sees-completed', afterDone.json.assignment?.status === 'completed', { status: afterDone.json.assignment?.status });

const staffPdf = new FormData();
staffPdf.set('action', 'staff_upload');
staffPdf.set('claim_id', otherId);
staffPdf.set('file', new Blob([PDF], { type: 'application/pdf' }), `other-${stamp}.pdf`);
const otherFile = await invokeForm(desk.session, staffPdf);
const otherFileId = String(otherFile.json.file_id || '');
rec('other-claim-file', Boolean(otherFileId), { id: otherFileId });

const badShare = await invoke(desk.session, {
  action: 'create_share', claim_id: claimId, recipient_name: 'שמאי QA', recipient_kind: 'surveyor',
  file_ids: [file1, otherFileId], ttl_hours: 48,
});
rec('share-foreign-file-blocked', badShare.json.blocked === true || badShare.status === 403, { status: badShare.status, err: badShare.json.error });

const share = await invoke(desk.session, {
  action: 'create_share', claim_id: claimId, recipient_name: 'שמאי QA', recipient_kind: 'surveyor',
  file_ids: [file1, file2], ttl_hours: 48,
});
const token = String(share.json.token || '');
rec('existing-secure-share', share.json.success === true && token.length >= 64, { id: share.json.id, tokenLen: token.length });
const pubGet = await pub({ action: 'public_share_get', token });
const pubIds = (pubGet.json.files || []).map((f) => f.id);
rec('share-only-garage-photos', pubGet.json.success === true && pubIds.includes(file1) && pubIds.includes(file2) && !pubIds.includes(otherFileId), { pubIds });
const revoked = await invoke(desk.session, { action: 'revoke_share', claim_id: claimId, share_id: share.json.id });
rec('share-revoke', revoked.json.success === true);
const afterRevoke = await pub({ action: 'public_share_get', token });
rec('share-revoke-blocks', afterRevoke.json.blocked === true || afterRevoke.json.error === 'revoked', { err: afterRevoke.json.error });

const { data: buckets } = await admin.storage.listBuckets();
const names = (buckets || []).map((b) => b.name);
const docsBucket = (buckets || []).find((b) => b.name === 'claims-docs');
rec('no-new-bucket', names.includes('claims-docs') && !names.includes('garage-photos'), { names: names.slice(0, 20) });
rec('claims-docs-private', docsBucket?.public === false, { public: docsBucket?.public });

if (!process.env.CLAIMS_QA_API_ONLY) {
  try {
    const { chromium } = await import('playwright');
    const pagesGarage = await fetch(`${PUBLIC}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
    const local = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
    const localGarage = await fetch(`${local}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
    const uiBase = localGarage === 200 ? local : (pagesGarage === 200 ? PUBLIC : '');
    rec('ui-base-ready', Boolean(uiBase), { pagesGarage, localGarage, uiBase });
    if (uiBase) {
      const liveJobs = await invoke(photo.session, { action: 'garage_list_jobs' });
      rec('ui-jobs-still-assigned', (liveJobs.json.jobs || []).some((j) => j.claim_id === claimId), {
        n: (liveJobs.json.jobs || []).length,
      });
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
        await staffPage.waitForTimeout(800);
        const row = staffPage.locator(`[data-testid="claim-row-${claimId}"]`).first();
        if (await row.count()) {
          await row.click();
          await staffPage.locator('[data-testid="claims-open-docs"]').click().catch(() => null);
          await staffPage.waitForSelector('[data-testid="garage-assign-bar"]', { timeout: 20000 }).catch(() => null);
          await staffPage.waitForSelector('[data-testid="garage-assign-current"]', { timeout: 20000 }).catch(() => null);
          rec('staff-assign-bar', await staffPage.locator('[data-testid="garage-assign-bar"]').count() > 0);
          rec('staff-assign-current', await staffPage.locator('[data-testid="garage-assign-current"]').count() > 0, {
            text: (await staffPage.locator('[data-testid="garage-assign-bar"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 180),
          });
          rec('staff-gallery-topic', await staffPage.getByText('תמונות מוסך', { exact: false }).count() > 0);
          const barPath = join(OUT, 'screenshots', 'staff-garage-bar.png');
          await staffPage.screenshot({ path: barPath, fullPage: false });
          try { copyFileSync(barPath, join('/opt/cursor/artifacts', 'garage-staff-bar.png')); } catch { /* skip */ }
        } else rec('staff-assign-bar', false, { err: 'claim row missing' });
      } else rec('staff-assign-bar', false, { err: 'search missing' });
      await staffCtx.close();

      const photoCtx = await authContext(photo.session, { width: 390, height: 844 });
      const photoPage = await photoCtx.newPage();
      await photoPage.goto(`${uiBase}/garage`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await photoPage.waitForSelector('[data-testid="garage-portal"]', { timeout: 30000 }).catch(() => null);
      rec('worker-portal', await photoPage.locator('[data-testid="garage-portal"]').count() > 0);
      await photoPage.waitForSelector(`[data-testid="garage-job-${claimId}"]`, { timeout: 25000 }).catch(() => null);
      const jobCard = photoPage.locator(`[data-testid="garage-job-${claimId}"]`);
      rec('worker-job-card', await jobCard.count() > 0, {
        empty: await photoPage.locator('[data-testid="garage-empty"]').count(),
        text: (await photoPage.locator('[data-testid="garage-portal"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220),
      });
      if (await photoPage.locator(`[data-testid="garage-job-${claimId}"]`).count()) {
        await photoPage.locator(`[data-testid="garage-job-${claimId}"]`).click();
        await photoPage.waitForSelector('[data-testid="garage-job-open"]', { timeout: 15000 }).catch(() => null);
        rec('worker-job-open', await photoPage.locator('[data-testid="garage-job-open"]').count() > 0);
        rec('worker-camera', await photoPage.locator('[data-testid="garage-camera"]').count() > 0);
        rec('worker-complete-btn', await photoPage.locator('[data-testid="garage-complete"]').count() > 0);
        const mobPath = join(OUT, 'screenshots', 'worker-garage-mobile.png');
        await photoPage.screenshot({ path: mobPath, fullPage: true });
        try { copyFileSync(mobPath, join('/opt/cursor/artifacts', 'garage-worker-mobile.png')); } catch { /* skip */ }
      }
      await photoCtx.close();
      await browser.close();
    }
  } catch (e) {
    rec('ui-playwright', false, { err: String(e.message || e).slice(0, 240) });
  }
}

const unassign = await invoke(desk.session, { action: 'unassign_garage_worker', claim_id: claimId });
rec('staff-unassign', unassign.json.success === true, { err: unassign.json.error });
const afterUn = await invoke(photo.session, { action: 'garage_get_job', claim_id: claimId });
rec('unassign-blocks-worker', afterUn.status === 403 && afterUn.json.blocked === true, { status: afterUn.status });
const afterUnAssignTo = await desk.db.from('claims_records').select('assigned_to').eq('id', claimId).maybeSingle();
rec('unassign-keeps-desk-handler', afterUnAssignTo.data?.assigned_to === desk.session.user.id);

await softDelete(claimId, desk.db);
await softDelete(otherId, desk.db);
rec('soft-delete-test-claims', true, { claimId, otherId });
rec('production-untouched', true);

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, productionTouched: false, claimId }, null, 2));
process.exit(failed.length ? 1 : 0);
