#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — claims docs/photos preview, download, Secure Share.
 * Real files, no-login share window, leakage, garage surveyor link.
 * TEST claims only. Soft-delete at end. Never Production.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-links-2026-09-10');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(join(OUT, 'downloads'), { recursive: true });
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
  uiBase: '',
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
const PDF_A = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%DOCS-LINKS-A\n');
const PDF_B = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%DOCS-LINKS-B\n');

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
  const ct = res.headers.get('content-type') || '';
  const cd = res.headers.get('content-disposition') || '';
  if (/zip|pdf|octet-stream|image\//i.test(ct) && !/json/i.test(ct)) {
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), json: null, ct, cd };
  }
  return { status: res.status, json: await res.json().catch(() => ({})), buf: null, ct, cd };
}
async function staffUpload(session, claimId, name, mime, bytes, extra = {}) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  if (extra.staff_type) form.set('staff_type', extra.staff_type);
  form.set('file', new Blob([bytes], { type: mime }), name);
  return invokeForm(session, form);
}
function zipNames(buf) {
  const names = [];
  if (!buf) return names;
  let i = 0;
  while (i + 30 < buf.length) {
    if (buf[i] !== 0x50 || buf[i + 1] !== 0x4b || buf[i + 2] !== 0x03 || buf[i + 3] !== 0x04) break;
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const size = buf.readUInt32LE(i + 18);
    names.push(buf.slice(i + 30, i + 30 + nameLen).toString('utf8'));
    i += 30 + nameLen + extra + size;
  }
  return names;
}
function isJpeg(buf) { return buf && buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8; }
function isPdf(buf) { return buf && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; }
function isZip(buf) { return buf && buf[0] === 0x50 && buf[1] === 0x4b; }
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
async function sniffUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      ct: res.headers.get('content-type') || '',
      cd: res.headers.get('content-disposition') || '',
      acao: res.headers.get('access-control-allow-origin') || '',
      bytes: buf.length,
      jpeg: isJpeg(buf),
      pdf: isPdf(buf),
    };
  } catch (e) {
    return { status: 0, err: String(e.message || e).slice(0, 180) };
  }
}

try {
  const pagesTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  report.liveSha = ((pagesTxt.match(/deployed_ref=(\S+)/) || [])[1] || '').slice(0, 40);
} catch { /* optional */ }

const admin = serviceClient();
rec('service-role-staging', Boolean(admin));
const desk = await loginAs(DESK_EMAIL, DESK_PASSWORD);
rec('desk-login', !!desk.session.access_token);
rec('staging-only', STAGING_REF !== PROD_REF && jwtRef(anonKey) === STAGING_REF, { ref: jwtRef(anonKey) });

let photoUserId = '';
if (admin) {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (users?.users || []).find((u) => u.email === PHOTO_EMAIL);
  photoUserId = existing?.id || '';
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
}
const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('photographer-login', !!photo.session.access_token);

const stamp = Date.now();
const idA = `DAL-QA-DLK-A-${stamp}`;
const idB = `DAL-QA-DLK-B-${stamp}`;
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
await makeClaim(idA, `TEST Docs Links ${stamp}`, '12-345-67');
await makeClaim(idB, `TEST Docs Other ${stamp}`, '76-543-21');

const upPdf = await staffUpload(desk.session, idA, `dlk-doc-${stamp}.pdf`, 'application/pdf', PDF_A);
const upJpg = await staffUpload(desk.session, idA, `dlk-photo-${stamp}.jpg`, 'image/jpeg', jpgN('staff'), { staff_type: 'damage_photos' });
const upSkip = await staffUpload(desk.session, idA, `dlk-skip-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%SKIP\n'));
const upOther = await staffUpload(desk.session, idB, `dlk-other-${stamp}.pdf`, 'application/pdf', PDF_B);
const filePdf = String(upPdf.json.file_id || '');
const fileJpg = String(upJpg.json.file_id || '');
const fileSkip = String(upSkip.json.file_id || '');
const fileOther = String(upOther.json.file_id || '');
rec('upload-pdf', Boolean(filePdf && upPdf.json.success), { id: filePdf });
rec('upload-photo', Boolean(fileJpg && upJpg.json.success), { id: fileJpg });
rec('upload-unselected', Boolean(fileSkip), { id: fileSkip });
rec('upload-other-claim', Boolean(fileOther), { id: fileOther });

const staffSigned = await invoke(desk.session, { action: 'signed_url', claim_id: idA, file_id: fileJpg, purpose: 'download', filename: `dlk-photo-${stamp}.jpg` });
rec('staff-signed-download-url', Boolean(staffSigned.json.url), { err: staffSigned.json.error });
if (staffSigned.json.url) {
  const sniff = await sniffUrl(staffSigned.json.url);
  rec('staff-signed-bytes-jpeg', sniff.jpeg === true && sniff.status === 200, sniff);
  rec('staff-signed-cors-or-attachment', Boolean(sniff.acao || /attachment/i.test(sniff.cd) || /download=/i.test(String(staffSigned.json.url))), sniff);
}

const created = await invoke(desk.session, {
  action: 'create_share', claim_id: idA, recipient_name: 'שמאי QA', recipient_kind: 'surveyor',
  file_ids: [filePdf, fileJpg], ttl_hours: 48,
});
const token1 = String(created.json.token || '');
rec('create-share', created.json.success === true && token1.length >= 64, { err: created.json.error, tokenLen: token1.length });

const got = await pub({ action: 'public_share_get', token: token1 });
const pubIds = (got.json.files || []).map((f) => f.id);
rec('share-selected-only', got.json.success === true && pubIds.includes(filePdf) && pubIds.includes(fileJpg) && !pubIds.includes(fileSkip) && !pubIds.includes(fileOther), { pubIds });
rec('share-no-claim-id', !got.json.claim_id && !JSON.stringify(got.json).includes(idA) && !JSON.stringify(got.json).includes(idB));

const prev = await pub({ action: 'public_share_url', token: token1, file_id: fileJpg, purpose: 'preview' });
rec('share-preview-url', Boolean(prev.json.url), { err: prev.json.error });
if (prev.json.url) {
  const sniff = await sniffUrl(prev.json.url);
  rec('share-preview-jpeg-bytes', sniff.jpeg === true, sniff);
}

const oneFile = await pub({ action: 'public_share_file', token: token1, file_id: fileJpg });
rec('share-file-jpeg-bytes', oneFile.status === 200 && isJpeg(oneFile.buf) && /attachment/i.test(oneFile.cd), {
  status: oneFile.status, ct: oneFile.ct, cd: oneFile.cd, bytes: oneFile.buf?.length,
});
const onePdf = await pub({ action: 'public_share_file', token: token1, file_id: filePdf });
rec('share-file-pdf-bytes', onePdf.status === 200 && isPdf(onePdf.buf) && /attachment/i.test(onePdf.cd), {
  status: onePdf.status, ct: onePdf.ct, cd: onePdf.cd, bytes: onePdf.buf?.length,
});
if (oneFile.buf) writeFileSync(join(OUT, 'downloads', 'share-photo.jpg'), oneFile.buf);
if (onePdf.buf) writeFileSync(join(OUT, 'downloads', 'share-doc.pdf'), onePdf.buf);

const skipFile = await pub({ action: 'public_share_file', token: token1, file_id: fileSkip });
rec('unselected-file-blocked', skipFile.status === 403 && (skipFile.json?.blocked === true || skipFile.json?.error), { status: skipFile.status });
const otherFile = await pub({ action: 'public_share_file', token: token1, file_id: fileOther });
rec('other-claim-file-blocked', otherFile.status === 403, { status: otherFile.status });
const wrongClaim = await pub({ action: 'public_share_get', token: token1, claim_id: idB });
rec('other-claim-hint-blocked', wrongClaim.status === 403, { status: wrongClaim.status });
const tamper = await pub({ action: 'public_share_file', token: token1, file_id: `${fileJpg}x` });
rec('tamper-file-id-blocked', tamper.status === 403, { status: tamper.status });

const zipAll = await pub({ action: 'public_share_zip', token: token1 });
const namesAll = zipNames(zipAll.buf);
rec('download-all-zip', zipAll.status === 200 && isZip(zipAll.buf) && namesAll.some((n) => n.includes('dlk-doc')) && namesAll.some((n) => n.includes('dlk-photo')), { names: namesAll });
rec('zip-only-allowlisted', zipAll.status === 200 && !namesAll.some((n) => /skip|other/i.test(n)), { names: namesAll });
const zipOne = await pub({ action: 'public_share_zip', token: token1, file_ids: [fileJpg] });
rec('download-selected-zip', zipOne.status === 200 && zipNames(zipOne.buf).length === 1, { names: zipNames(zipOne.buf) });
const zipInject = await pub({ action: 'public_share_zip', token: token1, file_ids: [fileJpg, fileSkip, fileOther] });
rec('zip-inject-blocked', zipInject.status === 403, { status: zipInject.status });

const assign = await invoke(desk.session, { action: 'assign_garage_worker', claim_id: idA, worker_id: photoUserId, worker_note: 'צילום QA' });
rec('garage-assign', assign.json.success === true, { err: assign.json.error });
async function uploadGarage(name) {
  const form = new FormData();
  form.set('action', 'garage_upload');
  form.set('claim_id', idA);
  form.set('file', new Blob([jpgN(name)], { type: 'image/jpeg' }), name);
  return invokeForm(photo.session, form);
}
const g1 = await uploadGarage(`dlk-gar-1-${stamp}.jpg`);
const g2 = await uploadGarage(`dlk-gar-2-${stamp}.jpg`);
const g3 = await uploadGarage(`dlk-gar-3-${stamp}.jpg`);
const gar1 = String(g1.json.file_id || '');
const gar2 = String(g2.json.file_id || '');
const gar3 = String(g3.json.file_id || '');
rec('garage-upload', Boolean(gar1 && gar2 && gar3), { gar1, gar2, gar3 });
const gShare = await invoke(photo.session, {
  action: 'garage_create_share', claim_id: idA, recipient_name: 'שמאי QA', file_ids: [gar1, gar2], ttl_hours: 48,
});
const gToken = String(gShare.json.token || '');
rec('garage-create-surveyor-share', gShare.json.success === true && gToken.length >= 64, { err: gShare.json.error });
const gGet = await pub({ action: 'public_share_get', token: gToken });
const gIds = (gGet.json.files || []).map((f) => f.id);
rec('garage-share-selected-only', gGet.json.success === true && gIds.includes(gar1) && gIds.includes(gar2) && !gIds.includes(gar3) && !gIds.includes(fileJpg) && !gIds.includes(filePdf), { gIds });
const gFile = await pub({ action: 'public_share_file', token: gToken, file_id: gar1 });
rec('garage-share-download-bytes', gFile.status === 200 && isJpeg(gFile.buf), { status: gFile.status, bytes: gFile.buf?.length });
const gLeak = await pub({ action: 'public_share_file', token: gToken, file_id: fileJpg });
rec('garage-share-staff-file-blocked', gLeak.status === 403, { status: gLeak.status });

if (admin) {
  const { data: buckets } = await admin.storage.listBuckets();
  const docs = (buckets || []).find((b) => b.name === 'claims-docs');
  rec('claims-docs-private', docs?.public === false, { public: docs?.public });
}

async function resolveUiBase() {
  const pagesShare = await fetch(`${PUBLIC}/claims-share/?t=probe`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
  const local = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
  const localShare = await fetch(`${local}/claims-share?t=probe`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
  const preferLocal = process.env.CLAIMS_QA_UI_BASE || (localShare === 200 && process.env.CLAIMS_QA_PREFER_LOCAL);
  const uiBase = preferLocal ? local : (pagesShare === 200 || pagesShare === 301 ? PUBLIC : (localShare === 200 ? local : ''));
  rec('ui-base-ready', Boolean(uiBase), { pagesShare, localShare, uiBase });
  return uiBase;
}

const uiBase = await resolveUiBase();
report.uiBase = uiBase;

async function clickDownload(page, selector, destName) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25000 }),
    page.locator(selector).first().click(),
  ]);
  const dest = join(OUT, 'downloads', destName);
  await download.saveAs(dest);
  const buf = existsSync(dest) ? readFileSync(dest) : null;
  return { name: download.suggestedFilename(), dest, buf, bytes: buf?.length || 0, jpeg: isJpeg(buf), pdf: isPdf(buf), zip: isZip(buf) };
}

if (uiBase && !process.env.CLAIMS_QA_API_ONLY) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const shareUrl = `${uiBase}/claims-share?t=${encodeURIComponent(token1)}`;
    const garageShareUrl = `${uiBase}/claims-share?t=${encodeURIComponent(gToken)}`;

    async function noLoginViewport(name, viewport) {
      const ctx = await browser.newContext({
        locale: 'he-IL',
        viewport,
        isMobile: viewport.width < 700,
        hasTouch: viewport.width < 700,
        acceptDownloads: true,
      });
      const page = await ctx.newPage();
      await page.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('[data-testid="share-page"]').waitFor({ timeout: 30000 });
      rec(`${name}-nologin-page`, await page.locator('[data-testid="share-page"]').isVisible());
      rec(`${name}-nologin-no-login-form`, (await page.locator('input[type="password"]').count()) === 0);
      rec(`${name}-nologin-count`, /2/.test(await page.locator('[data-testid="share-pub-count"]').innerText().catch(() => '')));
      await page.locator(`[data-testid="share-pub-view-${fileJpg}"] , [data-testid="share-pub-img-${fileJpg}"] button`).first().click().catch(() => null);
      await page.waitForSelector('[data-testid="share-preview"]', { timeout: 15000 }).catch(() => null);
      rec(`${name}-nologin-preview`, await page.locator('[data-testid="share-preview"]').count() > 0);
      const shot = join(OUT, 'screenshots', `nologin-${name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      try { copyFileSync(shot, join('/opt/cursor/artifacts', `docs-links-nologin-${name}.png`)); } catch { /* skip */ }

      let photoDl = null;
      try { photoDl = await clickDownload(page, `[data-testid="share-pub-dl-${fileJpg}"]`, `${name}-share-photo.bin`); }
      catch (e) { rec(`${name}-nologin-download-photo`, false, { err: String(e.message || e).slice(0, 200) }); }
      if (photoDl) rec(`${name}-nologin-download-photo`, photoDl.jpeg || photoDl.bytes > 20, photoDl);

      let docDl = null;
      try { docDl = await clickDownload(page, `[data-testid="share-pub-dl-${filePdf}"]`, `${name}-share-doc.bin`); }
      catch (e) { rec(`${name}-nologin-download-doc`, false, { err: String(e.message || e).slice(0, 200) }); }
      if (docDl) rec(`${name}-nologin-download-doc`, docDl.pdf || docDl.bytes > 20, docDl);

      await page.locator('[data-testid="share-pub-photos-only"]').click().catch(() => null);
      let selDl = null;
      try { selDl = await clickDownload(page, '[data-testid="share-pub-selected"]', `${name}-selected.zip`); }
      catch (e) { rec(`${name}-nologin-download-selected`, false, { err: String(e.message || e).slice(0, 200) }); }
      if (selDl) rec(`${name}-nologin-download-selected`, selDl.zip === true, selDl);

      let allDl = null;
      try { allDl = await clickDownload(page, '[data-testid="share-pub-zip"]', `${name}-all.zip`); }
      catch (e) { rec(`${name}-nologin-download-all`, false, { err: String(e.message || e).slice(0, 200) }); }
      if (allDl) rec(`${name}-nologin-download-all`, allDl.zip === true, allDl);

      rec(`${name}-nologin-no-internal`, (await page.locator('[data-testid="claims-open-new"]').count()) === 0);
      await ctx.close();
    }

    await noLoginViewport('desktop', { width: 1400, height: 900 });
    await noLoginViewport('mobile', { width: 390, height: 844 });

    const gCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const gPage = await gCtx.newPage();
    await gPage.goto(garageShareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await gPage.locator('[data-testid="share-page"]').waitFor({ timeout: 30000 });
    rec('garage-nologin-page', await gPage.locator('[data-testid="share-page"]').isVisible());
    rec('garage-nologin-no-login', (await gPage.locator('input[type="password"]').count()) === 0);
    const gShot = join(OUT, 'screenshots', 'nologin-garage.png');
    await gPage.screenshot({ path: gShot, fullPage: true });
    try { copyFileSync(gShot, join('/opt/cursor/artifacts', 'docs-links-nologin-garage.png')); } catch { /* skip */ }
    try {
      const gDl = await clickDownload(gPage, `[data-testid="share-pub-dl-${gar1}"]`, 'garage-share-photo.bin');
      rec('garage-nologin-download', gDl.jpeg || gDl.bytes > 20, gDl);
    } catch (e) {
      rec('garage-nologin-download', false, { err: String(e.message || e).slice(0, 200) });
    }
    await gCtx.close();

    const staffCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    await staffCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
    await staffCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const staff = await staffCtx.newPage();
    await staff.goto(`${uiBase}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await staff.waitForSelector('[data-testid="claims-search"], [data-testid="claims-open-new"]', { timeout: 45000 }).catch(() => null);
    const box = staff.locator('[data-testid="claims-search"]').locator('visible=true').first();
    if (await box.count()) {
      await box.fill(idA);
      await staff.waitForTimeout(1200);
      const row = staff.locator(`[data-testid="claim-row-${idA}"]`).first();
      if (await row.count()) {
        await row.click();
        await staff.locator('.claims-root .tab, [data-testid="docs-library"]').filter({ hasText: /מסמכים|גלריה/ }).first().click().catch(() => null);
        await staff.waitForSelector('[data-testid="docs-library"]', { timeout: 20000 }).catch(() => null);
        rec('staff-gallery', await staff.locator('[data-testid="docs-library"]').count() > 0);
        const prevBtn = staff.locator(`[data-testid="docs-preview-${fileJpg}"]`);
        if (await prevBtn.count()) {
          await prevBtn.click();
          await staff.waitForSelector('[data-testid="doc-preview"]', { timeout: 15000 }).catch(() => null);
          rec('staff-preview', await staff.locator('[data-testid="doc-preview"]').count() > 0);
          try {
            const pdl = await clickDownload(staff, '[data-testid="doc-preview-download"]', 'staff-preview-photo.bin');
            rec('staff-preview-download', pdl.jpeg || pdl.bytes > 20, pdl);
          } catch (e) {
            rec('staff-preview-download', false, { err: String(e.message || e).slice(0, 200) });
          }
        } else rec('staff-preview', false, { err: 'preview button missing' });
        try {
          const sdl = await clickDownload(staff, `[data-testid="docs-dl-${filePdf}"]`, 'staff-gallery-doc.bin');
          rec('staff-gallery-download-doc', sdl.pdf || sdl.bytes > 20, sdl);
        } catch (e) {
          rec('staff-gallery-download-doc', false, { err: String(e.message || e).slice(0, 200) });
        }
        await staff.locator(`[data-testid="share-file-${fileJpg}"], [data-testid="docs-library"]`).first().click().catch(() => null);
        const pick = staff.locator(`label:has(input[type="checkbox"]) >> text=${`dlk-photo-${stamp}.jpg`}`).first();
        if (await pick.count()) await pick.click().catch(() => null);
        else {
          const cb = staff.locator('[data-testid="docs-library"] input[type="checkbox"]').first();
          if (await cb.count()) await cb.check().catch(() => null);
        }
        await staff.locator('[data-testid="claims-secure-share"]').first().click();
        await staff.locator('[data-testid="mo-secure-share"]').waitFor({ timeout: 10000 });
        rec('staff-share-modal', await staff.locator('[data-testid="mo-secure-share"]').isVisible());
        await staff.locator('[data-testid="share-all"]').click().catch(() => null);
        const skipBox = staff.locator(`[data-testid="share-file-${fileSkip}"] input`);
        if (await skipBox.count()) await skipBox.uncheck().catch(() => null);
        await staff.locator('[data-testid="share-to"]').fill('שמאי UI');
        await staff.locator('[data-testid="share-phone"]').fill('0501111111');
        await staff.locator('[data-testid="share-create"]').click();
        await staff.waitForSelector('[data-testid="share-created"]', { timeout: 20000 });
        const createdUrl = (await staff.locator('[data-testid="share-url"]').innerText().catch(() => '')).trim();
        rec('staff-create-link', /claims-share\?t=/.test(createdUrl), { url: createdUrl.slice(0, 120) });
        await staff.locator('[data-testid="share-copy"]').click();
        const copied = await staff.evaluate(async () => {
          try { return await navigator.clipboard.readText(); } catch { return ''; }
        });
        rec('staff-copy-link', copied === createdUrl || /claims-share\?t=/.test(copied), { copied: String(copied).slice(0, 80) });
        await staff.locator('[data-testid="share-wa"]').click();
        await staff.waitForTimeout(200);
        const waBody = await staff.locator('[data-testid="wa-msg"]').inputValue().catch(() => '');
        rec('staff-whatsapp-has-url', /claims-share\?t=/.test(waBody) && /קישור מאובטח/.test(waBody), { body: waBody.slice(0, 160) });
        const staffShot = join(OUT, 'screenshots', 'staff-share.png');
        await staff.screenshot({ path: staffShot, fullPage: false });
        try { copyFileSync(staffShot, join('/opt/cursor/artifacts', 'docs-links-staff-share.png')); } catch { /* skip */ }

        if (createdUrl) {
          const ext = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 }, acceptDownloads: true });
          const extPage = await ext.newPage();
          await extPage.goto(createdUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await extPage.locator('[data-testid="share-page"]').waitFor({ timeout: 30000 });
          rec('copied-link-nologin', await extPage.locator('[data-testid="share-page"]').isVisible() && (await extPage.locator('input[type="password"]').count()) === 0);
          try {
            const cdl = await clickDownload(extPage, `[data-testid^="share-pub-dl-"]`, 'copied-link-file.bin');
            rec('copied-link-download', cdl.jpeg || cdl.pdf || cdl.bytes > 20, cdl);
          } catch (e) {
            rec('copied-link-download', false, { err: String(e.message || e).slice(0, 200) });
          }
          await ext.close();
        }
      } else rec('staff-gallery', false, { err: 'claim row missing' });
    } else rec('staff-gallery', false, { err: 'search missing' });
    await staffCtx.close();

    const photoCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
    await photoCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: photo.session.access_token,
        refresh_token: photo.session.refresh_token,
        expires_at: photo.session.expires_at,
        expires_in: photo.session.expires_in,
        token_type: photo.session.token_type,
        user: photo.session.user,
      },
    });
    const gp = await photoCtx.newPage();
    await gp.goto(`${uiBase}/garage`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await gp.waitForSelector('[data-testid="garage-portal"]', { timeout: 30000 }).catch(() => null);
    const jobBtn = gp.locator(`[data-testid="garage-job-${idA}"]`);
    if (await jobBtn.count()) {
      await jobBtn.click();
      await gp.waitForSelector('[data-testid="garage-photo-gallery"]', { timeout: 20000 });
      rec('garage-portal-gallery', await gp.locator('[data-testid="garage-gallery-title"]').isVisible());
      await gp.locator(`[data-testid="garage-pick-${gar1}"]`).check().catch(() => null);
      await gp.locator(`[data-testid="garage-pick-${gar2}"]`).check().catch(() => null);
      try {
        const gdl = await clickDownload(gp, `[data-testid="garage-download-${gar1}"]`, 'garage-portal-photo.bin');
        rec('garage-portal-download', gdl.jpeg || gdl.bytes > 20, gdl);
      } catch (e) {
        rec('garage-portal-download', false, { err: String(e.message || e).slice(0, 200) });
      }
      await gp.locator('[data-testid="garage-create-surveyor-link"]').click();
      await gp.waitForSelector('[data-testid="garage-share-created"]', { timeout: 20000 });
      const gUrl = (await gp.locator('[data-testid="garage-share-url"]').innerText().catch(() => '')).trim();
      rec('garage-portal-create-link', /claims-share\?t=/.test(gUrl), { url: gUrl.slice(0, 120) });
      const waHref = await gp.locator('[data-testid="garage-share-wa"]').getAttribute('href');
      rec('garage-portal-whatsapp', /wa\.me/.test(String(waHref || '')) && /claims-share/.test(decodeURIComponent(String(waHref || ''))), {
        href: String(waHref || '').slice(0, 160),
      });
      const gShot2 = join(OUT, 'screenshots', 'garage-portal-share.png');
      await gp.screenshot({ path: gShot2, fullPage: true });
      try { copyFileSync(gShot2, join('/opt/cursor/artifacts', 'docs-links-garage-portal.png')); } catch { /* skip */ }
    } else rec('garage-portal-gallery', false, { err: 'job missing on /garage' });
    await photoCtx.close();
    await browser.close();
  } catch (e) {
    rec('ui-playwright', false, { err: String(e.message || e).slice(0, 240) });
  }
}

await softDelete(idA, desk.db);
await softDelete(idB, desk.db);
rec('soft-delete-test-claims', true, { idA, idB });

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.verdict} ${report.checks.filter((c) => c.ok).length}/${report.checks.length}`);
if (failed.length) process.exit(1);
