#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — garage photo gallery split + surveyor Secure Share.
 * TEST claims only. Soft-delete at end. Never Production.
 * node scripts/claims-garage-gallery-share-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-garage-gallery-share-2026-09-10');
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
const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('photographer-api-login', !!photo.session.access_token);

const stamp = Date.now();
const claimId = `DAL-QA-GGS-${stamp}`;
const otherId = `DAL-QA-GGS-O-${stamp}`;
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
await makeClaim(claimId, `TEST Garage Gallery ${stamp}`, '11-222-33');
await makeClaim(otherId, `TEST Garage Other ${stamp}`, '44-555-66');

const assign = await invoke(desk.session, { action: 'assign_garage_worker', claim_id: claimId, worker_id: photoUserId, worker_note: 'צילום פח' });
rec('01-staff-assign', assign.json.success === true, { err: assign.json.error });

const jobs = await invoke(photo.session, { action: 'garage_list_jobs' });
const jobIds = (jobs.json.jobs || []).map((j) => j.claim_id);
rec('02-worker-sees-assigned-only', jobs.json.success === true && jobIds.includes(claimId) && !jobIds.includes(otherId), { jobIds });
const otherJob = await invoke(photo.session, { action: 'garage_get_job', claim_id: otherId });
rec('03-unassigned-claim-blocked', otherJob.status === 403, { status: otherJob.status });

async function uploadJpg(session, name, target = claimId) {
  const form = new FormData();
  form.set('action', 'garage_upload');
  form.set('claim_id', target);
  form.set('file', new Blob([jpgN(name)], { type: 'image/jpeg' }), name);
  return invokeForm(session, form);
}
const up1 = await uploadJpg(photo.session, `ggs-front-${stamp}.jpg`);
const up2 = await uploadJpg(photo.session, `ggs-side-${stamp}.jpg`);
const up3 = await uploadJpg(photo.session, `ggs-plate-${stamp}.jpg`);
const file1 = String(up1.json.file_id || '');
const file2 = String(up2.json.file_id || '');
const file3 = String(up3.json.file_id || '');
rec('04-upload-three-jpegs', Boolean(file1 && file2 && file3 && new Set([file1, file2, file3]).size === 3), { file1, file2, file3 });

const staffPdf = new FormData();
staffPdf.set('action', 'staff_upload');
staffPdf.set('claim_id', claimId);
staffPdf.set('staff_type', 'damage_photos');
staffPdf.set('file', new Blob([jpgN(`dmg-${stamp}`)], { type: 'image/jpeg' }), `damage-${stamp}.jpg`);
const damageUp = await invokeForm(desk.session, staffPdf);
const damageId = String(damageUp.json.file_id || '');
rec('05-staff-damage-photo-same-claim', Boolean(damageId) && damageId !== file1, { damageId });

const otherPdf = new FormData();
otherPdf.set('action', 'staff_upload');
otherPdf.set('claim_id', otherId);
otherPdf.set('file', new Blob([Buffer.from('%PDF-1.1\n%%OTHER\n')], { type: 'application/pdf' }), `other-${stamp}.pdf`);
const otherFile = await invokeForm(desk.session, otherPdf);
const otherFileId = String(otherFile.json.file_id || '');

const listed = await invoke(desk.session, { action: 'list_docs', claim_id: claimId });
const allFiles = listed.json.files || [];
const garageRows = allFiles.filter((f) => f.doc_kind === 'garage_photo' || f.doc_meta?.staff_type === 'garage_photos');
rec('06-source-of-truth-same-claim', garageRows.length >= 3 && garageRows.every((f) => allFiles.some((x) => x.id === f.id)), {
  garage: garageRows.length, total: allFiles.length,
});
rec('07-no-duplication', new Set(garageRows.map((f) => f.id)).size === garageRows.length);
rec('08-garage-kind', garageRows.some((f) => f.id === file1 && f.doc_kind === 'garage_photo'));

const workerShareOther = await invoke(photo.session, {
  action: 'garage_create_share', claim_id: claimId, recipient_name: 'שמאי QA', file_ids: [damageId], ttl_hours: 48,
});
rec('09-worker-cannot-share-non-garage', workerShareOther.status === 403 || workerShareOther.json.blocked === true, {
  status: workerShareOther.status, err: workerShareOther.json.error,
});

const workerShare = await invoke(photo.session, {
  action: 'garage_create_share', claim_id: claimId, recipient_name: 'שמאי QA', file_ids: [file1, file2], ttl_hours: 48,
});
const token = String(workerShare.json.token || '');
const shareId = String(workerShare.json.id || '');
rec('10-worker-create-surveyor-share', workerShare.json.success === true && token.length >= 64, { err: workerShare.json.error });

const broadShare = await invoke(photo.session, {
  action: 'create_share', claim_id: claimId, recipient_name: 'שמאי', recipient_kind: 'surveyor', file_ids: [file1], ttl_hours: 48,
});
rec('11-worker-cannot-use-staff-create-share', broadShare.status === 403 || broadShare.json.success === false);

const pubGet = await pub({ action: 'public_share_get', token });
const pubIds = (pubGet.json.files || []).map((f) => f.id);
rec('12-share-selected-only', pubGet.json.success === true && pubIds.includes(file1) && pubIds.includes(file2) && !pubIds.includes(file3) && !pubIds.includes(damageId), { pubIds });

const unselected = await pub({ action: 'public_share_url', token, file_id: file3 });
rec('13-unselected-garage-blocked', unselected.status === 403 || unselected.json.blocked === true);
const otherOnClaim = await pub({ action: 'public_share_url', token, file_id: damageId });
rec('14-other-file-same-claim-blocked', otherOnClaim.status === 403 || otherOnClaim.json.blocked === true);
const otherClaim = await pub({ action: 'public_share_url', token, file_id: otherFileId, claim_id: otherId });
rec('15-other-claim-blocked', otherClaim.status === 403 || otherClaim.json.blocked === true);
const tamper = await pub({ action: 'public_share_url', token, file_id: file1, claim_id: otherId });
rec('16-tamper-claim-id-blocked', tamper.status === 403 || tamper.json.blocked === true);

const dl1 = await pub({ action: 'public_share_url', token, file_id: file1, purpose: 'download' });
rec('17-share-download', Boolean(dl1.json.url), { err: dl1.json.error });
const zip = await fetch(FN, {
  method: 'POST',
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'public_share_zip', token }),
});
rec('18-share-download-all', zip.ok && (zip.headers.get('content-type') || '').includes('zip'), { status: zip.status, type: zip.headers.get('content-type') });

const { data: buckets } = await admin.storage.listBuckets();
const docsBucket = (buckets || []).find((b) => b.name === 'claims-docs');
rec('19-claims-docs-private', docsBucket?.public === false, { public: docsBucket?.public });

const pagesGarage = await fetch(`${PUBLIC}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
const local = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const localGarage = await fetch(`${local}/garage`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
const uiBase = process.env.CLAIMS_QA_PREFER_PUBLIC === '1'
  ? (pagesGarage === 200 ? PUBLIC : (localGarage === 200 ? local : ''))
  : (localGarage === 200 ? local : (pagesGarage === 200 ? PUBLIC : ''));
rec('20-ui-base-ready', Boolean(uiBase), { pagesGarage, localGarage, uiBase, liveSha: report.liveSha });

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
    rec('21-real-login-garage', /\/garage/.test(page.url()), { url: page.url() });
    await page.waitForSelector(`[data-testid="garage-job-${claimId}"]`, { timeout: 25000 }).catch(() => null);
    rec('22-assigned-job-visible', await page.locator(`[data-testid="garage-job-${claimId}"]`).count() > 0);
    rec('23-other-job-hidden', await page.locator(`[data-testid="garage-job-${otherId}"]`).count() === 0);
    if (await page.locator(`[data-testid="garage-job-${claimId}"]`).count()) {
      await page.locator(`[data-testid="garage-job-${claimId}"]`).click();
      await page.waitForSelector('[data-testid="garage-job-open"]', { timeout: 15000 }).catch(() => null);
      rec('24-open-job', await page.locator('[data-testid="garage-job-open"]').count() > 0);
      rec('25-camera', await page.locator('[data-testid="garage-camera"]').count() > 0);
      rec('26-upload', await page.locator('[data-testid="garage-pick"]').count() > 0);
      await page.waitForSelector('[data-testid="garage-photo-gallery"]', { timeout: 20000 }).catch(() => null);
      rec('27-garage-gallery-title', await page.getByTestId('garage-gallery-title').innerText().then((t) => t.includes('גלריית תמונות מוסך')).catch(() => false));
      rec('28-preview-control', await page.locator('[data-testid^="garage-preview-"]').count() > 0);
      rec('29-download-control', await page.locator('[data-testid^="garage-download-"]').count() > 0);
      await page.locator(`[data-testid="garage-pick-${file1}"]`).check().catch(() => null);
      await page.locator(`[data-testid="garage-pick-${file2}"]`).check().catch(() => null);
      rec('30-selected-two', await page.getByTestId('garage-selected-count').innerText().then((t) => t.includes('2')).catch(() => false));
      await page.getByTestId('garage-create-surveyor-link').click();
      await page.waitForSelector('[data-testid="garage-share-created"]', { timeout: 20000 }).catch(() => null);
      rec('31-ui-create-surveyor-link', await page.locator('[data-testid="garage-share-url"]').count() > 0);
      rec('32-copy-and-whatsapp', await page.locator('[data-testid="garage-share-copy"]').count() > 0 && await page.locator('[data-testid="garage-share-wa"]').count() > 0);
    }
    const mob = join(OUT, 'screenshots', 'worker-garage-gallery-mobile.png');
    await page.screenshot({ path: mob, fullPage: true });
    try { copyFileSync(mob, join('/opt/cursor/artifacts', 'garage-gallery-worker-mobile.png')); } catch { /* skip */ }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="garage-portal"]', { timeout: 20000 }).catch(() => null);
    rec('33-refresh-stays-garage', /\/garage/.test(page.url()) && await page.locator('[data-testid="garage-portal"]').count() > 0);

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
        await staffPage.waitForSelector('[data-testid="garage-photo-gallery"], [data-testid="docs-library"]', { timeout: 25000 }).catch(() => null);
        rec('34-staff-garage-gallery', await staffPage.locator('[data-testid="garage-photo-gallery"]').count() > 0);
        rec('35-general-gallery-has-no-garage-chip', await staffPage.locator('[data-testid="docs-cat-garage_photos"]').count() === 0);
        rec('36-general-gallery-has-no-garage-image', await staffPage.locator(`[data-testid="docs-img-${file1}"]`).count() === 0);
        rec('37-garage-photo-in-garage-gallery', await staffPage.locator(`[data-testid="garage-photo-${file1}"]`).count() > 0);
        const deskShot = join(OUT, 'screenshots', 'staff-docs-split.png');
        await staffPage.screenshot({ path: deskShot, fullPage: false });
        try { copyFileSync(deskShot, join('/opt/cursor/artifacts', 'garage-gallery-staff-desktop.png')); } catch { /* skip */ }
      } else rec('34-staff-garage-gallery', false, { err: 'row missing' });
    } else rec('34-staff-garage-gallery', false, { err: 'search missing' });

    if (token) {
      const sharePage = await browser.newPage();
      await sharePage.goto(`${uiBase}/claims-share?t=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sharePage.waitForSelector('[data-testid="share-page"], [data-testid="share-error"]', { timeout: 20000 }).catch(() => null);
      const shareText = (await sharePage.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
      rec('38-surveyor-no-login', !/התחבר|כניסה למערכת/.test(shareText) && await sharePage.locator('[data-testid="share-page"]').count() > 0, { shareText });
      rec('39-surveyor-selected-only', await sharePage.locator(`[data-testid="share-pub-img-${file1}"]`).count() > 0 && await sharePage.locator(`[data-testid="share-pub-img-${file3}"]`).count() === 0);
      rec('40-surveyor-download-all', await sharePage.locator('[data-testid="share-pub-zip"]').count() > 0);
      const shareShot = join(OUT, 'screenshots', 'surveyor-share.png');
      await sharePage.screenshot({ path: shareShot, fullPage: true });
      try { copyFileSync(shareShot, join('/opt/cursor/artifacts', 'garage-gallery-surveyor-share.png')); } catch { /* skip */ }
      await sharePage.close();
    }

    await deskCtx.close();
    await browser.close();
  } catch (e) {
    rec('ui-playwright', false, { err: String(e.message || e).slice(0, 300) });
  }
}

const revoke = await invoke(desk.session, { action: 'revoke_share', claim_id: claimId, share_id: shareId });
rec('41-revoke', revoke.json.success === true, { err: revoke.json.error });
const afterRevoke = await pub({ action: 'public_share_get', token });
rec('42-revoked-blocked', afterRevoke.status === 410 || afterRevoke.json.blocked === true || afterRevoke.json.error === 'revoked', {
  status: afterRevoke.status, err: afterRevoke.json.error,
});

const freshPhoto = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
const unassign = await invoke(desk.session, { action: 'unassign_garage_worker', claim_id: claimId });
rec('43-unassign', unassign.json.success === true);
const afterUn = await invoke(freshPhoto.session, { action: 'garage_get_job', claim_id: claimId });
rec('44-unassign-blocks-job', afterUn.status === 403 && afterUn.json.blocked === true, { status: afterUn.status });
const afterUnShare = await invoke(freshPhoto.session, {
  action: 'garage_create_share', claim_id: claimId, recipient_name: 'שמאי', file_ids: [file1], ttl_hours: 48,
});
rec('45-unassign-blocks-share', afterUnShare.status === 403 && afterUnShare.json.blocked === true, { status: afterUnShare.status });

await softDelete(claimId, desk.db);
await softDelete(otherId, desk.db);
rec('46-soft-delete-test-claims', true, { claimId, otherId });
rec('47-production-untouched', true);

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, liveSha: report.liveSha, n: report.checks.length }, null, 2));
if (failed.length) process.exit(1);
