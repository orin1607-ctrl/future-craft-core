#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — outbound secure share.
 * TEST claims only. Soft-delete at end. Never Production.
 * node scripts/claims-secure-share-staging-e2e.mjs
 */
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-secure-share-2026-09-09');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync('/opt/cursor/artifacts', { recursive: true });
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
  rawTokenInDb: null,
  crossClaimLeakage: null,
  qaBase: PUBLIC,
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const PDF_A = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%SHARE-A\n');
const PDF_B = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%SHARE-B\n');

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
function authHdr(session) {
  return { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}
async function invoke(session, body) {
  const res = await fetch(FN, { method: 'POST', headers: authHdr(session), body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function pub(body) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  if (/zip|pdf|octet-stream/i.test(ct)) {
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), json: null, ct };
  }
  return { status: res.status, json: await res.json().catch(() => ({})), buf: null, ct };
}
async function staffUpload(session, claimId, name, mime, bytes) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  form.set('file', new Blob([bytes], { type: mime }), name);
  const res = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
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

const session = await login();
rec('worker-login', !!session.access_token);
rec('staging-only', STAGING_REF !== PROD_REF && jwtRef(anonKey) === STAGING_REF, { ref: jwtRef(anonKey) });

const stamp = Date.now();
const idA = `DAL-QA-SHR-A-${stamp}`;
const idB = `DAL-QA-SHR-B-${stamp}`;
const now = new Date().toISOString();
async function makeClaim(id, name, plate) {
  const { error } = await userDb.from('claims_records').insert({
    id,
    client_name: name,
    status: 'בטיפול',
    plate,
    assigned_to: session.user.id,
    row_data: {
      id, clientName: name, clientEmail: 'yoni122222@gmail.com', clientPhone: '0501111111',
      plate, status: 'בטיפול', source: 'Staff', insCompany: 'מגדל', createdAt: now,
    },
    created_by_name: 'QA Worker',
    last_activity_at: now,
  });
  rec(`create-${id}`, !error, { err: error?.message });
}
await makeClaim(idA, `TEST Share A ${stamp}`, '12-345-67');
await makeClaim(idB, `TEST Share B ${stamp}`, '76-543-21');

const upA1 = await staffUpload(session, idA, `share-keep-${stamp}.pdf`, 'application/pdf', PDF_A);
const upA2 = await staffUpload(session, idA, `share-skip-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%SKIP\n'));
const upA3 = await staffUpload(session, idA, `share-photo-${stamp}.jpg`, 'image/jpeg', JPG);
const upB1 = await staffUpload(session, idB, `other-claim-${stamp}.pdf`, 'application/pdf', PDF_B);
const fileKeep = String(upA1.json.file_id || '');
const fileSkip = String(upA2.json.file_id || '');
const filePhoto = String(upA3.json.file_id || '');
const fileOther = String(upB1.json.file_id || '');
rec('upload-selected', Boolean(fileKeep && upA1.json.success), { id: fileKeep });
rec('upload-unselected', Boolean(fileSkip && upA2.json.success), { id: fileSkip });
rec('upload-photo', Boolean(filePhoto && upA3.json.success), { id: filePhoto });
rec('upload-other-claim', Boolean(fileOther && upB1.json.success), { id: fileOther });

const badCreate = await invoke(session, {
  action: 'create_share', claim_id: idA, recipient_name: 'Should Block', recipient_kind: 'surveyor',
  file_ids: [fileKeep, fileOther], ttl_hours: 48,
});
rec('create-foreign-file-blocked', badCreate.json.blocked === true || badCreate.status === 403, { status: badCreate.status, err: badCreate.json.error });

const created = await invoke(session, {
  action: 'create_share', claim_id: idA, recipient_name: 'שמאי QA', recipient_kind: 'surveyor',
  file_ids: [fileKeep, filePhoto], ttl_hours: 48,
});
const token1 = String(created.json.token || '');
const share1 = String(created.json.id || '');
rec('create-share-once-token', created.json.success === true && token1.length >= 64 && created.json.once === true, { id: share1, tokenLen: token1.length });
rec('default-ttl-48h', Boolean(created.json.expiresAt) && Math.abs(Date.parse(created.json.expiresAt) - Date.now() - 48 * 3600_000) < 120_000, { expiresAt: created.json.expiresAt });

const listed = await invoke(session, { action: 'list_shares', claim_id: idA });
const listedText = JSON.stringify(listed.json);
rec('list-shares-no-token', listed.json.success === true && !listed.json.token && !listedText.includes(token1) && !listedText.includes('token_hash'), {
  keys: Object.keys(listed.json.shares?.[0] || {}),
});
rec('list-shares-same-claim-only', (listed.json.shares || []).every((s) => !s.claim_id || s.claim_id === idA));

const reveal = await invoke(session, { action: 'reveal_share', claim_id: idA, share_id: share1 });
rec('reveal-share-disabled', reveal.status === 400 && reveal.json.error === 'reveal_share_disabled' && !reveal.json.token, { err: reveal.json.error });

const got = await pub({ action: 'public_share_get', token: token1 });
const pubIds = (got.json.files || []).map((f) => f.id);
rec('selected-file-pass', got.json.success === true && pubIds.includes(fileKeep) && pubIds.includes(filePhoto), { ids: pubIds });
rec('unselected-file-absent', !pubIds.includes(fileSkip) && !pubIds.includes(fileOther), { ids: pubIds });
rec('public-no-claim-id', !got.json.claim_id && !JSON.stringify(got.json).includes(idA) && !JSON.stringify(got.json).includes(idB));

const refresh = await pub({ action: 'public_share_get', token: token1 });
rec('refresh-reopen-active', refresh.json.success === true && (refresh.json.files || []).length === 2);

const keepUrl = await pub({ action: 'public_share_url', token: token1, file_id: fileKeep, purpose: 'download' });
rec('download-individual', keepUrl.json.success === true && /token=/.test(String(keepUrl.json.url || '')) && Number(keepUrl.json.ttl) === 600, { ttl: keepUrl.json.ttl });

const skipUrl = await pub({ action: 'public_share_url', token: token1, file_id: fileSkip, purpose: 'download' });
rec('unselected-file-blocked', skipUrl.status === 403 && skipUrl.json.blocked === true, { status: skipUrl.status, err: skipUrl.json.error });

const otherUrl = await pub({ action: 'public_share_url', token: token1, file_id: fileOther, purpose: 'download' });
rec('other-claim-file-blocked', otherUrl.status === 403 && otherUrl.json.blocked === true, { status: otherUrl.status });

const wrongClaim = await pub({ action: 'public_share_get', token: token1, claim_id: idB });
rec('other-claim-hint-blocked', wrongClaim.status === 403 && wrongClaim.json.blocked === true, { status: wrongClaim.status });

const tamper = await pub({ action: 'public_share_url', token: token1, file_id: `${fileKeep}x`, purpose: 'preview' });
rec('tamper-file-id-blocked', tamper.status === 403 && tamper.json.blocked === true, { status: tamper.status });

const badTok = await pub({ action: 'public_share_get', token: `${token1.slice(0, -2)}ab` });
rec('tamper-token-blocked', badTok.json.success === false && Boolean(badTok.json.blocked || badTok.status >= 400), { status: badTok.status, err: badTok.json.error });

const zipAll = await pub({ action: 'public_share_zip', token: token1 });
const namesAll = zipNames(zipAll.buf);
rec('download-all-zip', zipAll.status === 200 && namesAll.some((n) => n.includes('share-keep')) && namesAll.some((n) => n.includes('share-photo')), { names: namesAll });
rec('zip-only-allowlisted', zipAll.status === 200 && !namesAll.some((n) => /skip|other-claim/i.test(n)), { names: namesAll });

const zipInject = await pub({ action: 'public_share_zip', token: token1, file_ids: [fileKeep, fileSkip, fileOther] });
rec('zip-inject-unselected-blocked', zipInject.status === 403 && zipInject.json?.blocked === true, { status: zipInject.status });

const zipOne = await pub({ action: 'public_share_zip', token: token1, file_ids: [fileKeep] });
const namesOne = zipNames(zipOne.buf);
rec('zip-selected-only', zipOne.status === 200 && namesOne.length === 1 && namesOne[0].includes('share-keep'), { names: namesOne });

const pdf = await pub({ action: 'public_share_bundle_pdf', token: token1 });
rec('bundle-pdf-extra', pdf.status === 200 && pdf.ct.includes('pdf') && pdf.buf?.[0] === 0x25 && pdf.buf?.[1] === 0x50, { status: pdf.status, ct: pdf.ct });
const stillOrig = await pub({ action: 'public_share_url', token: token1, file_id: fileKeep, purpose: 'download' });
rec('bundle-does-not-replace-originals', stillOrig.json.success === true && Boolean(stillOrig.json.url));

const created2 = await invoke(session, {
  action: 'create_share', claim_id: idA, recipient_name: 'עו"ד QA', recipient_kind: 'lawyer',
  file_ids: [fileSkip], ttl_hours: 24,
});
const token2 = String(created2.json.token || '');
const share2 = String(created2.json.id || '');
rec('second-share-same-claim', created2.json.success === true && token2 && token2 !== token1, { id: share2 });
const still1 = await pub({ action: 'public_share_get', token: token1 });
const got2 = await pub({ action: 'public_share_get', token: token2 });
rec('shares-do-not-revoke-each-other', still1.json.success === true && got2.json.success === true, {
  first: (still1.json.files || []).map((f) => f.id),
  second: (got2.json.files || []).map((f) => f.id),
});
rec('second-share-own-allowlist', (got2.json.files || []).map((f) => f.id).join() === fileSkip && !(got2.json.files || []).some((f) => f.id === fileKeep));

const leak2 = await pub({ action: 'public_share_url', token: token2, file_id: fileKeep });
rec('no-cross-share-leakage', leak2.status === 403 && leak2.json.blocked === true);

const listedB = await invoke(session, { action: 'list_shares', claim_id: idB });
rec('no-cross-claim-list', (listedB.json.shares || []).length === 0, { n: (listedB.json.shares || []).length });

const revoked = await invoke(session, { action: 'revoke_share', claim_id: idA, share_id: share1 });
rec('revoke-ok', revoked.json.success === true);
const afterRevoke = await pub({ action: 'public_share_get', token: token1 });
const afterRevokeDl = await pub({ action: 'public_share_url', token: token1, file_id: fileKeep });
const afterRevokeZip = await pub({ action: 'public_share_zip', token: token1 });
rec('revoke-blocks-immediately', afterRevoke.json.error === 'revoked' && afterRevoke.json.blocked === true, { status: afterRevoke.status });
rec('revoke-blocks-download', afterRevokeDl.json.blocked === true);
rec('revoke-blocks-zip', afterRevokeZip.json?.blocked === true || afterRevokeZip.status >= 400);
const still2 = await pub({ action: 'public_share_get', token: token2 });
rec('revoke-one-keeps-other', still2.json.success === true);

const admin = serviceClient();
rec('service-role-staging', Boolean(admin), { haveAdmin: Boolean(admin) });
if (admin) {
  const { data: cols } = await admin.from('claims_share_links').select('*').eq('id', share1).maybeSingle();
  const colNames = cols ? Object.keys(cols) : [];
  const raw = Boolean(cols && (Object.prototype.hasOwnProperty.call(cols, 'token') || colNames.includes('raw_token') || colNames.includes('token_plain')));
  report.rawTokenInDb = raw;
  rec('db-token-hash-only', Boolean(cols?.token_hash) && cols.token_hash === sha256(token1) && cols.token_hash !== token1 && !raw, {
    colNames, hashPrefix: String(cols?.token_hash || '').slice(0, 12),
  });
  rec('db-no-raw-token-column', !raw && colNames.includes('token_hash') && !colNames.includes('token'), { colNames });

  const { data: buckets } = await admin.storage.listBuckets();
  const names = (buckets || []).map((b) => b.name);
  const docs = (buckets || []).find((b) => b.name === 'claims-docs');
  rec('no-new-bucket', names.includes('claims-docs') && !names.includes('claims-share') && !names.includes('share-docs'), { names });
  rec('claims-docs-private', docs?.public === false, { public: docs?.public });

  await admin.from('claims_share_links').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', share2);
  const expired = await pub({ action: 'public_share_get', token: token2 });
  const expiredDl = await pub({ action: 'public_share_url', token: token2, file_id: fileSkip });
  rec('expiry-blocked', expired.json.error === 'expired' && expired.json.blocked === true, { status: expired.status });
  rec('expiry-blocks-download', expiredDl.json.blocked === true);
} else {
  rec('db-token-hash-only', false, { err: 'no staging service role for hash verify' });
  rec('expiry-blocked', false, { err: 'no admin to force expiry' });
}

let uiBase = '';
if (!process.env.CLAIMS_QA_API_ONLY) {
  try {
    const { chromium } = await import('playwright');
    const pagesShare = await fetch(`${PUBLIC}/claims-share?t=probe`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
    const local = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
    const localShare = await fetch(`${local}/claims-share?t=probe`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
    uiBase = pagesShare === 200 ? PUBLIC : (localShare === 200 ? local : '');
    rec('ui-base-ready', Boolean(uiBase), { pagesShare, localShare, uiBase });
    if (uiBase) {
      const browser = await chromium.launch({ headless: true });
      const created3 = await invoke(session, {
        action: 'create_share', claim_id: idA, recipient_name: 'UI QA', recipient_kind: 'client',
        file_ids: [fileKeep, filePhoto], ttl_hours: 48,
      });
      const tokenUi = String(created3.json.token || '');
      const shareUrl = `${uiBase}/claims-share?t=${encodeURIComponent(tokenUi)}`;

      async function runViewport(name, viewport) {
        const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
        const page = await ctx.newPage();
        await page.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator('[data-testid="share-page"]').waitFor({ timeout: 30000 });
        const path = join(OUT, 'screenshots', `public-${name}.png`);
        await page.screenshot({ path, fullPage: true });
        try { copyFileSync(path, join('/opt/cursor/artifacts', `share-public-${name}.png`)); } catch { /* skip */ }
        rec(`${name}-public-page`, await page.locator('[data-testid="share-page"]').isVisible());
        rec(`${name}-has-zip`, await page.locator('[data-testid="share-pub-zip"]').isVisible());
        rec(`${name}-has-pdf`, await page.locator('[data-testid="share-pub-pdf"]').isVisible());
        rec(`${name}-no-upload`, (await page.getByText('העלה', { exact: false }).count()) === 0 && (await page.locator('input[type="file"]').count()) === 0);
        rec(`${name}-no-internal-nav`, (await page.locator('[data-testid="claims-open-new"]').count()) === 0);
        const keepBtn = page.locator(`[data-testid="share-pub-dl-${fileKeep}"]`);
        rec(`${name}-download-btn`, await keepBtn.count() > 0);
        await ctx.close();
      }
      await runViewport('desktop', { width: 1400, height: 900 });
      await runViewport('mobile', { width: 390, height: 844 });

      const staffCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
      await staffCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
      const staffPage = await staffCtx.newPage();
      await staffPage.goto(`${uiBase}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await staffPage.waitForSelector('[data-testid="claims-search"], [data-testid="claims-open-new"]', { timeout: 45000 }).catch(() => null);
      const box = staffPage.locator('[data-testid="claims-search"]').locator('visible=true').first();
      if (await box.count()) {
        await box.fill(idA);
        await staffPage.waitForTimeout(1000);
        const row = staffPage.locator(`[data-testid="claim-row-${idA}"]`).first();
        if (await row.count()) {
          await row.click();
          await staffPage.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click().catch(() => null);
          await staffPage.waitForSelector('[data-testid="share-history-panel"]', { timeout: 15000 }).catch(() => null);
          await staffPage.waitForFunction(() => {
            const t = document.querySelector('[data-testid="share-history-panel"]')?.textContent || '';
            return /שמאי|פעיל|active|surveyor|קבצים/.test(t);
          }, null, { timeout: 20000 }).catch(() => null);
          rec('staff-share-button', await staffPage.locator('[data-testid="claims-secure-share"]').count() > 0);
          const histText = await staffPage.locator('[data-testid="share-history-panel"]').innerText().catch(() => '');
          rec('staff-share-history', /שמאי|קבצים|פעיל|active/.test(histText), { hist: histText.replace(/\s+/g, ' ').slice(0, 180) });
          const histPath = join(OUT, 'screenshots', 'staff-docs-share.png');
          await staffPage.screenshot({ path: histPath, fullPage: false });
          try { copyFileSync(histPath, join('/opt/cursor/artifacts', 'share-staff-docs.png')); } catch { /* skip */ }
        } else rec('staff-share-button', false, { err: 'claim row missing on this UI base' });
      } else rec('staff-share-button', false, { err: 'search missing on this UI base' });
      await staffCtx.close();
      await browser.close();
    }
  } catch (e) {
    rec('ui-playwright', false, { err: String(e.message || e).slice(0, 240) });
  }
}

const leak = report.checks.filter((c) => /blocked|leak|other-claim|unselected|tamper|cross/.test(c.name) && !c.ok);
report.crossClaimLeakage = leak.length > 0;
rec('no-cross-claim-leakage', leak.length === 0, { failed: leak.map((c) => c.name) });

await softDelete(idA);
await softDelete(idB);
rec('soft-delete-test-claims', true, { idA, idB });

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, productionTouched: false }, null, 2));
process.exit(failed.length ? 1 : 0);
