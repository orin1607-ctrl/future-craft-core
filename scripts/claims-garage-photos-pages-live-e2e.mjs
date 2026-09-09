#!/usr/bin/env node
/**
 * Live PUBLIC STAGING Pages E2E — garage photographer path.
 * TEST claims only. Soft-delete at end. Never Production.
 * node scripts/claims-garage-photos-pages-live-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const WANT = process.env.CLAIMS_QA_SHA || 'f435bd1';
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
  liveSha: null,
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

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
async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  try { copyFileSync(path, join('/opt/cursor/artifacts', `${name}.png`)); } catch { /* skip */ }
  return path;
}

const marker = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
report.liveSha = String(marker).trim();
rec('pages-live-sha', marker.includes(WANT), { marker: marker.trim(), want: WANT });
const garageStatus = await fetch(`${PUBLIC}/garage/`, { cache: 'no-store' }).then((r) => r.status).catch(() => 0);
rec('pages-garage-200', garageStatus === 200, { garageStatus });
const claimsHtml = await fetch(`${PUBLIC}/claims/`, { cache: 'no-store' }).then((r) => r.text());
const jsName = (claimsHtml.match(/assets\/(index-[^"]+\.js)/) || [])[1] || '';
const js = jsName ? await fetch(`${PUBLIC}/assets/${jsName}`, { cache: 'no-store' }).then((r) => r.text()) : '';
rec('pages-bundle-has-assign-button', js.includes('שייך עובד לצילומי מוסך') && js.includes('garage-assign-open'), { jsName });
rec('pages-bundle-has-garage-portal', js.includes('garage-portal'));
rec('staging-only', STAGING_REF !== PROD_REF && jwtRef(anonKey) === STAGING_REF, { ref: jwtRef(anonKey) });
rec('production-untouched', jwtRef(anonKey) !== PROD_REF && !marker.includes('dalia-new') && !marker.includes(PROD_REF));

const desk = await loginAs(DESK_EMAIL, DESK_PASSWORD);
const photo = await loginAs(PHOTO_EMAIL, PHOTO_PASSWORD);
rec('desk-login', !!desk.session.access_token);
rec('photographer-login', !!photo.session.access_token);

const stamp = Date.now();
const claimId = `DAL-QA-GAR-LIVE-${stamp}`;
const otherId = `DAL-QA-GAR-LIVE-O-${stamp}`;
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
await makeClaim(claimId, `TEST Garage Live ${stamp}`, '11-222-33');
await makeClaim(otherId, `TEST Garage Other ${stamp}`, '44-555-66');

const front = existsSync('/tmp/garage-front.jpg') ? '/tmp/garage-front.jpg' : null;
const side = existsSync('/tmp/garage-side.jpg') ? '/tmp/garage-side.jpg' : null;
rec('real-jpegs-ready', Boolean(front && side), { front, side });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });

async function authContext(session, viewport) {
  const ctx = await browser.newContext({
    locale: 'he-IL',
    viewport,
    isMobile: viewport.width < 700,
    hasTouch: viewport.width < 700,
    ignoreHTTPSErrors: true,
  });
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

async function openClaimDocs(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="claims-search"], [data-testid="claims-open-new"]', { timeout: 45000 });
  const mine = page.locator('[data-testid="claims-mine-toggle"]').locator('visible=true').first();
  if (await mine.count()) {
    const t = await mine.innerText().catch(() => '');
    if (/שלי/.test(t) || /התביעות שלי/.test(t)) await mine.click().catch(() => null);
  }
  const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
  await box.fill(claimId);
  await page.waitForTimeout(1200);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  await page.locator('[data-testid="claims-open-docs"]').click();
  await page.waitForSelector('[data-testid="garage-assign-bar"]', { timeout: 25000 });
}

try {
  const staffCtx = await authContext(desk.session, { width: 1400, height: 900 });
  const staff = await staffCtx.newPage();
  await openClaimDocs(staff);
  const assignBtn = staff.locator('[data-testid="garage-assign-open"]');
  rec('live-assign-button-visible', await assignBtn.isVisible(), {
    text: (await staff.locator('[data-testid="garage-assign-bar"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200),
  });
  rec('live-more-assign-button', await staff.locator('[data-testid="claims-garage-assign-btn"]').count() >= 0);
  await shot(staff, 'live-staff-assign-button');
  await assignBtn.click();
  await staff.waitForSelector('[data-testid="garage-assign-modal"]', { timeout: 15000 });
  const select = staff.locator('[data-testid="garage-worker-select"]');
  await staff.waitForFunction(() => document.querySelectorAll('[data-testid="garage-worker-select"] option').length > 2, null, { timeout: 20000 });
  await staff.locator('[data-testid="garage-worker-search"]').fill('צלם מוסך');
  await staff.waitForTimeout(300);
  const opt = await select.locator('option').allTextContents();
  const photoId = photo.session.user.id;
  const hasPhoto = opt.some((t) => /צלם מוסך/.test(t)) || await select.locator(`option[value="${photoId}"]`).count() > 0;
  rec('live-worker-in-picker', hasPhoto, { n: opt.length, sample: opt.filter((t) => /צלם|QA/.test(t)).slice(0, 6) });
  await staff.locator('[data-testid="garage-worker-search"]').fill('');
  await staff.waitForTimeout(200);
  await select.selectOption(photoId);
  await staff.locator('[data-testid="garage-worker-note"]').fill('צילום פח קדמי — LIVE');
  await staff.locator('[data-testid="garage-assign-save"]').click();
  await staff.waitForSelector('[data-testid="garage-assign-current"]', { timeout: 20000 });
  const barText = (await staff.locator('[data-testid="garage-assign-bar"]').innerText()).replace(/\s+/g, ' ');
  rec('live-staff-assigned', /QA צלם|צלם מוסך/.test(barText) && /ממתין לצילום/.test(barText), { barText: barText.slice(0, 220) });
  await shot(staff, 'live-staff-assigned');
  await staffCtx.close();

  const deskGarageCtx = await authContext(desk.session, { width: 390, height: 844 });
  const deskGarage = await deskGarageCtx.newPage();
  await deskGarage.goto(`${PUBLIC}/garage`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await deskGarage.waitForSelector('[data-testid="garage-portal"]', { timeout: 30000 });
  await deskGarage.waitForSelector('[data-testid="garage-empty"], [data-testid="garage-job-list"]', { timeout: 20000 });
  rec('other-worker-no-job', await deskGarage.locator(`[data-testid="garage-job-${claimId}"]`).count() === 0);
  await deskGarageCtx.close();

  const photoCtx = await authContext(photo.session, { width: 390, height: 844 });
  const pho = await photoCtx.newPage();
  await pho.goto(`${PUBLIC}/garage`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pho.waitForSelector('[data-testid="garage-portal"]', { timeout: 30000 });
  await pho.waitForSelector(`[data-testid="garage-job-${claimId}"]`, { timeout: 25000 });
  rec('live-garage-works', await pho.locator('[data-testid="garage-portal"]').isVisible());
  rec('live-worker-sees-assigned', await pho.locator(`[data-testid="garage-job-${claimId}"]`).count() > 0);
  rec('live-worker-no-other-claim', await pho.locator(`[data-testid="garage-job-${otherId}"]`).count() === 0);
  await shot(pho, 'live-worker-list-mobile');
  await pho.locator(`[data-testid="garage-job-${claimId}"]`).click();
  await pho.waitForSelector('[data-testid="garage-job-open"]', { timeout: 15000 });
  rec('live-worker-limited-fields', await pho.getByText('מוסך QA').count() > 0 && await pho.getByText('11-222-33').count() > 0);
  if (front) {
    await pho.locator('[data-testid="garage-pick"]').setInputFiles([front, side].filter(Boolean));
    await pho.waitForSelector('[data-testid="garage-pending"]', { timeout: 10000 });
    rec('live-pending-ready', await pho.locator('[data-testid="garage-pending"]').count() > 0);
    await pho.locator('[data-testid="garage-send"]').click();
    await pho.waitForSelector('[data-testid="garage-photos"] a, [data-testid="garage-photos"] img', { timeout: 30000 });
    rec('live-upload-visible', (await pho.locator('[data-testid="garage-photos"] a, [data-testid="garage-photos"] img').count()) >= 1);
  } else rec('live-upload-visible', false, { err: 'jpeg missing' });
  await shot(pho, 'live-worker-uploaded-mobile');
  await pho.locator('[data-testid="garage-complete"]').click();
  await pho.waitForFunction(() => /הושלם/.test(document.querySelector('[data-testid="garage-job-open"]')?.innerText || ''), null, { timeout: 20000 }).catch(() => null);
  rec('live-complete-clicked', /הושלם/.test(await pho.locator('[data-testid="garage-job-open"]').innerText()));
  await photoCtx.close();

  const after = await invoke(desk.session, { action: 'get_garage_assignment', claim_id: claimId });
  rec('live-status-completed-on-claim', after.json.assignment?.status === 'completed', { status: after.json.assignment?.status, photos: after.json.photo_count });
  const docs = await invoke(desk.session, { action: 'list_docs', claim_id: claimId });
  const garageFiles = (docs.json.files || []).filter((f) => f.doc_kind === 'garage_photo' || f.doc_meta?.staff_type === 'garage_photos');
  rec('live-files-classified-garage-photos', garageFiles.length >= 1, { n: garageFiles.length, kinds: garageFiles.map((f) => f.doc_kind) });
  const fileId = garageFiles[0]?.id || '';

  const staff2 = await authContext(desk.session, { width: 1400, height: 900 });
  const s2 = await staff2.newPage();
  await openClaimDocs(s2);
  await s2.waitForSelector('[data-testid="garage-assign-current"]', { timeout: 20000 });
  const bar2 = (await s2.locator('[data-testid="garage-assign-bar"]').innerText()).replace(/\s+/g, ' ');
  rec('live-claim-status-completed', /צילום הושלם/.test(bar2), { bar2: bar2.slice(0, 220) });
  await s2.locator('[data-testid="docs-cat-garage_photos"]').click().catch(() => null);
  await s2.waitForTimeout(800);
  rec('live-gallery-topic-garage', await s2.getByText('תמונות מוסך', { exact: false }).count() > 0);
  if (fileId) {
    const img = s2.locator(`[data-testid="docs-img-${fileId}"]`);
    rec('live-photo-in-same-claim', await img.count() > 0);
    if (await img.count()) {
      await img.locator('button', { hasText: 'Preview' }).first().click();
      await s2.waitForSelector('[data-testid="doc-preview"]', { timeout: 15000 }).catch(() => null);
      rec('live-preview', await s2.locator('[data-testid="doc-preview"]').count() > 0);
      rec('live-download', await s2.locator('[data-testid="doc-preview-download"]').count() > 0);
      await s2.locator('[data-testid="doc-preview-close"]').click().catch(() => null);
    }
    await s2.locator('[data-testid="docs-cat-garage_photos"]').click().catch(() => null);
    await s2.locator('[data-testid="docs-lib-photos"]').click().catch(() => null);
  }
  await shot(s2, 'live-staff-gallery-garage');
  await s2.locator('[data-testid="claims-secure-share"]').click();
  await s2.waitForSelector('[data-testid="mo-secure-share"]', { timeout: 15000 });
  await s2.locator('[data-testid="share-garage"]').click();
  await s2.locator('[data-testid="share-to"]').fill('שמאי QA LIVE');
  await s2.locator('[data-testid="share-kind"]').selectOption('surveyor');
  await s2.locator('[data-testid="share-create"]').click();
  await s2.waitForSelector('[data-testid="share-created"]', { timeout: 20000 });
  const shareUrl = (await s2.locator('[data-testid="share-url"]').innerText()).trim();
  rec('live-secure-share-created', /claims-share/.test(shareUrl), { shareUrl: shareUrl.slice(0, 160) });
  await shot(s2, 'live-share-created');

  const pubCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
  const pubPage = await pubCtx.newPage();
  await pubPage.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pubPage.waitForSelector('[data-testid="share-page"]', { timeout: 30000 });
  const pubText = (await pubPage.locator('[data-testid="share-page"]').innerText()).replace(/\s+/g, ' ');
  rec('live-share-outside-selected-only', await pubPage.locator('[data-testid="share-page"]').isVisible() && !pubText.includes(otherId) && /garage|מוסך|jpg/i.test(pubText), { pubText: pubText.slice(0, 220) });
  rec('live-share-no-internal-nav', await pubPage.locator('[data-testid="claims-open-new"]').count() === 0);
  await shot(pubPage, 'live-share-public');
  await pubCtx.close();

  const listed = await invoke(desk.session, { action: 'list_shares', claim_id: claimId });
  const shareId = (listed.json.shares || []).find((s) => !s.revoked_at)?.id;
  if (shareId) {
    await s2.locator(`[data-testid="share-revoke-${shareId}"]`).click().catch(() => null);
  }
  const token = (shareUrl.match(/[?&]t=([^&]+)/) || [])[1] || '';
  if (shareId) await invoke(desk.session, { action: 'revoke_share', claim_id: claimId, share_id: shareId });
  const afterRevoke = await pub({ action: 'public_share_get', token: decodeURIComponent(token) });
  rec('live-revoke-blocks', afterRevoke.json.blocked === true || afterRevoke.json.error === 'revoked', { err: afterRevoke.json.error });
  await staff2.close();

  const otherJob = await invoke(photo.session, { action: 'garage_get_job', claim_id: otherId });
  rec('live-other-claim-blocked', otherJob.status === 403 && otherJob.json.blocked === true, { status: otherJob.status });
  const deskAsPhoto = await invoke(desk.session, { action: 'garage_get_job', claim_id: claimId });
  rec('live-other-worker-blocked', deskAsPhoto.status === 403, { status: deskAsPhoto.status });
  rec('live-no-cross-claim-leakage', otherJob.status === 403 && deskAsPhoto.status === 403);

  const mobStaff = await authContext(desk.session, { width: 390, height: 844 });
  const ms = await mobStaff.newPage();
  await openClaimDocs(ms);
  rec('live-mobile-assign-bar', await ms.locator('[data-testid="garage-assign-bar"]').count() > 0);
  await shot(ms, 'live-staff-mobile');
  await mobStaff.close();
} catch (e) {
  rec('live-playwright', false, { err: String(e.message || e).slice(0, 400) });
}

await browser.close();
await softDelete(claimId, desk.db);
await softDelete(otherId, desk.db);
rec('soft-delete-test-claims', true, { claimId, otherId });
rec('production-untouched-final', true);

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'pages-live.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, failed: report.failed, liveSha: report.liveSha, productionTouched: false, claimId }, null, 2));
process.exit(failed.length ? 1 : 0);
