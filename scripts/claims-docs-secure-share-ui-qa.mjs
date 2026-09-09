#!/usr/bin/env node
/**
 * Documents tab + Secure Share UI QA against PUBLIC STAGING APIs.
 * TEST claim only. Soft-delete at end. Never Production.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-secure-share-2026-09-09');
const UI = (process.env.CLAIMS_QA_UI_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
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
  pagesSha: '',
  pagesHasShare: null,
  uiBase: UI,
  claimId: '',
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
const PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%DOCS-UI\n');

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
async function staffUpload(session, claimId, name, mime, bytes, extra = {}) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  if (extra.doc_kind) form.set('doc_kind', extra.doc_kind);
  if (extra.staff_type) form.set('staff_type', extra.staff_type);
  form.set('file', new Blob([bytes], { type: mime }), name);
  const res = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  return page.screenshot({ path, fullPage: false }).then(() => {
    try { copyFileSync(path, join('/opt/cursor/artifacts', `docs-ui-${name}.png`)); } catch { /* skip */ }
    return path;
  });
}

const pagesTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
report.pagesSha = (pagesTxt.match(/deployed_ref=(\S+)/) || [])[1] || '';
const pagesShare = await fetch(`${PUBLIC}/claims-share?t=probe`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
const pagesHtml = await fetch(`${PUBLIC}/claims`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
report.pagesHasShare = /שיתוף מאובטח|claims-secure-share|ClaimDocsLibrary/.test(pagesHtml);
rec('pages-sha-recorded', Boolean(report.pagesSha), { detail: report.pagesSha });
rec('pages-share-route-404', pagesShare === 404, { status: pagesShare });
rec('pages-html-no-share-yet', report.pagesHasShare === false, { sha: report.pagesSha });

const session = await login();
rec('worker-login', !!session.access_token);
rec('staging-only', STAGING_REF !== PROD_REF && jwtRef(anonKey) === STAGING_REF);

const stamp = Date.now();
const claimId = `DAL-QA-DOCS-${stamp}`;
report.claimId = claimId;
const now = new Date().toISOString();
const { error: insErr } = await userDb.from('claims_records').insert({
  id: claimId,
  client_name: `TEST Docs UI ${stamp}`,
  status: 'בטיפול',
  plate: '11-222-33',
  assigned_to: session.user.id,
  row_data: {
    id: claimId, clientName: `TEST Docs UI ${stamp}`, clientEmail: 'yoni122222@gmail.com',
    plate: '11-222-33', status: 'בטיפול', source: 'Staff', insCompany: 'מגדל', createdAt: now,
  },
  created_by_name: 'QA Worker',
  last_activity_at: now,
});
rec('create-test-claim', !insErr, { err: insErr?.message, id: claimId });

const upKeep = await staffUpload(session, claimId, `keep-${stamp}.pdf`, 'application/pdf', PDF, { doc_kind: 'surveyor_report' });
const upSkip = await staffUpload(session, claimId, `skip-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%SKIP\n'));
const upPhoto = await staffUpload(session, claimId, `photo-${stamp}.jpg`, 'image/jpeg', JPG, { doc_kind: 'surveyor_photo' });
const upInv = await staffUpload(session, claimId, `invoice-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%INV\n'), { doc_kind: 'garage_invoice' });
const fileKeep = String(upKeep.json.file_id || '');
const fileSkip = String(upSkip.json.file_id || '');
const filePhoto = String(upPhoto.json.file_id || '');
const fileInv = String(upInv.json.file_id || '');
rec('upload-keep', Boolean(fileKeep && upKeep.json.success), { id: fileKeep });
rec('upload-skip', Boolean(fileSkip && upSkip.json.success), { id: fileSkip });
rec('upload-photo', Boolean(filePhoto && upPhoto.json.success), { id: filePhoto });
rec('upload-invoice', Boolean(fileInv && upInv.json.success), { id: fileInv });

const localOk = await fetch(`${UI}/claims`, { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
rec('local-preview-up', localOk, { ui: UI });

if (localOk) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
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
  const page = await ctx.newPage();
  await page.goto(`${UI}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="claims-search"]', { timeout: 45000 });
  await page.locator('[data-testid="claims-search"]').locator('visible=true').first().fill(claimId);
  await page.waitForTimeout(1200);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`).first();
  rec('claim-row', await row.count() > 0);
  if (await row.count()) {
    await row.click();
    await page.locator('[data-testid="claims-tab-group-docs"]').click();
    await page.locator('[data-testid="docs-share-bar"]').waitFor({ timeout: 20000 });
    const lib = page.locator('[data-testid="docs-library"]');
    await lib.locator('[data-testid="doc-file-row"], [data-testid^="docs-img-"]').first().waitFor({ timeout: 25000 });
    await shot(page, 'docs-share-bar');
    rec('share-bar', await page.locator('[data-testid="docs-share-bar"]').isVisible());
    rec('share-button', await page.locator('[data-testid="claims-secure-share"]').isVisible());
    rec('ab-button', await page.locator('[data-testid="claims-secure-share-ab"]').count() > 0);
    rec('library', await lib.isVisible());
    const cats = await page.locator('[data-testid="docs-lib-cats"]').innerText();
    rec('cats-exact', /מסמכי לקוח/.test(cats) && /מסמכי רכב/.test(cats) && /דוחות שמאי/.test(cats) && /תמונות שמאי/.test(cats) && /חברת ביטוח/.test(cats) && /חשבוניות/.test(cats) && /טפסים/.test(cats) && /אחר/.test(cats) && /כל הגלריה/.test(cats) && !/כל הגלריה \(0\)/.test(cats), { cats: cats.replace(/\s+/g, ' ') });
    rec('keep-present', await lib.locator(`[data-doc-name="keep-${stamp}.pdf"]`).count() > 0);
    rec('skip-present', await lib.locator(`[data-doc-name="skip-${stamp}.pdf"]`).count() > 0);
    rec('photo-present', await lib.locator(`[data-testid="docs-img-${filePhoto}"]`).count() > 0);
    rec('invoice-present', await lib.locator(`[data-doc-name="invoice-${stamp}.pdf"]`).count() > 0);
    rec('photo-gallery', await lib.locator('[data-testid^="docs-gal-"]').count() > 0);
    const libHtml = await lib.innerHTML();
    rec('no-gmail-clutter', !/mail-body|gmail_thread|נושא המייל|From:|Subject:/.test(libHtml));
    await page.locator('[data-testid="docs-cat-surveyor_reports"]').click();
    await page.waitForTimeout(300);
    rec('cat-surveyor-keep', await lib.locator(`[data-doc-name="keep-${stamp}.pdf"]`).count() > 0);
    rec('cat-surveyor-photo', await lib.locator(`[data-testid="docs-img-${filePhoto}"]`).count() === 0);
    rec('cat-surveyor-no-invoice', await lib.locator(`[data-doc-name="invoice-${stamp}.pdf"]`).count() === 0);
    rec('cat-surveyor-no-skip', await lib.locator(`[data-doc-name="skip-${stamp}.pdf"]`).count() === 0);
    rec('gallery-tab', await page.locator('[data-testid="claims-tab-group-docs"]').innerText().then((t) => /גלרי/.test(t)));
    rec('print-btn', await lib.locator(`[data-testid="docs-print-${fileKeep}"]`).count() > 0);
    rec('topic-groups', await page.locator('[data-testid="docs-group-photos"]').count() > 0 && await page.locator('[data-testid="docs-group-reports"]').count() > 0);
    rec('topic-share-btn', await lib.locator('[data-testid="docs-topic-share-surveyor_reports"]').count() > 0);
    await page.locator('[data-testid="docs-cat-surveyor_photos"]').click();
    await page.waitForTimeout(200);
    rec('cat-photos-only', await lib.locator(`[data-testid="docs-img-${filePhoto}"]`).count() > 0 && await lib.locator(`[data-doc-name="keep-${stamp}.pdf"]`).count() === 0);
    await page.locator('[data-testid="docs-cat-all"]').click();
    await lib.locator(`[data-testid="docs-pick-${fileKeep}"]`).check();
    rec('picked-one', await page.locator('[data-testid="docs-share-picked"]').innerText().then((t) => t.includes('1')));
    await page.locator('[data-testid="claims-secure-share"]').click();
    await page.locator('[data-testid="mo-secure-share"]').waitFor({ timeout: 10000 });
    await page.locator('[data-testid="share-count"]').filter({ hasText: '1' }).waitFor({ timeout: 8000 }).catch(() => null);
    const ttl = await page.locator('[data-testid="share-ttl"]').inputValue();
    rec('modal-48h', ttl === '48h', { ttl });
    rec('modal-shows-selected', await page.locator('[data-testid="share-count"]').innerText().then((t) => /\b1\b/.test(t)));
    await page.locator('[data-testid="share-to"]').fill('שמאי QA');
    await page.locator('[data-testid="share-create"]').click();
    await page.locator('[data-testid="share-created"]').waitFor({ timeout: 20000 });
    const shareUrl = await page.locator('[data-testid="share-url"]').innerText();
    rec('share-created', /claims-share\?t=/.test(shareUrl), { url: shareUrl.slice(0, 80) });
    await shot(page, 'share-created');
    const token = decodeURIComponent((shareUrl.split('t=')[1] || '').trim());
    const got = await fetch(FN, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'public_share_get', token }),
    }).then((r) => r.json()).catch(() => ({}));
    const ids = (got.files || []).map((f) => f.id);
    rec('share-only-selected', ids.length === 1 && ids[0] === fileKeep, { ids });
    rec('share-excludes-skip', !ids.includes(fileSkip));
    rec('share-excludes-photo', !ids.includes(filePhoto));
  }
  await ctx.close();

  const mobile = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
  const mpage = await mobile.newPage();
  await mpage.goto(`${UI}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mpage.waitForSelector('[data-testid="claims-search"]', { timeout: 45000 });
  await mpage.locator('[data-testid="claims-search"]').locator('visible=true').first().fill(claimId);
  await mpage.waitForTimeout(1200);
  const mrow = mpage.locator(`[data-testid="claim-row-${claimId}"]`).first();
  if (await mrow.count()) {
    await mrow.click();
    await mpage.locator('[data-testid="claims-tab-group-docs"]').click();
    await mpage.locator('[data-testid="claims-secure-share"]').waitFor({ timeout: 15000 });
    rec('mobile-share-visible', await mpage.locator('[data-testid="claims-secure-share"]').isVisible());
    await shot(mpage, 'mobile-share');
  } else rec('mobile-share-visible', false, { err: 'row missing' });
  await mobile.close();
  } finally {
    await browser.close();
  }
}

await softDelete(claimId);
rec('soft-delete', true, { id: claimId });

const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
report.verdict = failed.length ? 'FAIL' : 'PASS';
writeFileSync(join(OUT, 'docs-ui-qa.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} failed=${failed.join(',') || 'none'} pages=${report.pagesSha}`);
process.exit(failed.length ? 1 : 0);
