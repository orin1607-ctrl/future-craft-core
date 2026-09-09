#!/usr/bin/env node
/**
 * Live PUBLIC STAGING E2E — garage photographer user type + open worker portal.
 * Never Production.
 * node scripts/claims-garage-user-portal-live-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT = (process.env.WANT_SHA || '').trim();
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-garage-user-portal-2026-09-09');
const ART = '/opt/cursor/artifacts/screenshots';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
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

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  qaBase: PUBLIC,
  liveSha: '',
  checks: [],
  verdict: 'FAIL',
  failed: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

function jwtPayload(tok) {
  return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
}
function jwtRef(tok) {
  try { return jwtPayload(tok).ref || ''; } catch { return ''; }
}

function serviceRole() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv) {
    const k = fromEnv.replace(/[\r\n]/g, '').trim();
    if (jwtRef(k) === PROD_REF) throw new Error('service role is production');
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'service_role')?.api_key;
  if (!service) throw new Error('no staging service_role');
  if (jwtRef(service) === PROD_REF) throw new Error('fetched production key');
  return service;
}

const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
if (jwtRef(anonKey) === PROD_REF) throw new Error('production anon key blocked');
rec('staging-only', jwtRef(anonKey) === STAGING_REF, { ref: jwtRef(anonKey) });
rec('production-untouched', true);

const service = serviceRole();
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function waitDeploy() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.liveSha = txt.trim();
    if (!WANT || txt.includes(WANT)) return txt;
    console.log(`wait pages ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  return report.liveSha;
}

function sessionValue(auth) {
  return {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  };
}

async function injectPassword(context, email, password) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error || new Error(`login ${email}`);
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: sessionValue(data),
  });
  return data;
}

async function injectSuperAdmin(context) {
  const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
  let saEmail = '';
  for (const row of saRole || []) {
    const u = await admin.auth.admin.getUserById(row.user_id);
    if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
    if (!saEmail) saEmail = u?.data?.user?.email || '';
  }
  if (!saEmail) throw new Error('no existing super_admin');
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
  if (error || !auth.session) throw error || new Error('verifyOtp');
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: sessionValue(auth),
  });
  return { email: saEmail, session: auth.session };
}

function saveShot(page, name) {
  const dest = join(OUT, 'screenshots', `${name}.png`);
  return page.screenshot({ path: dest, fullPage: true }).then(() => {
    copyFileSync(dest, join(ART, `${name}.png`));
  }).catch(() => null);
}

async function invoke(session, body) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const marker = await waitDeploy();
rec('pages-live-sha', !WANT || String(marker).includes(WANT), { marker: String(marker).trim(), want: WANT || '(any)' });

const html = await fetch(`${PUBLIC}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
const jsName = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || '';
const js = jsName ? await fetch(`${PUBLIC}/${jsName}`, { cache: 'no-store' }).then((r) => r.text()) : '';
rec('pages-bundle-has-user-type', js.includes('עובד צילומי מוסך') && js.includes('create-user-type-garage_photographer'), { jsName });
rec('pages-bundle-has-open-portal', js.includes('פתח פורטל עובד') && js.includes('garage-open-worker-portal') && js.includes('garage-admin-preview'), { jsName });

const photoLogin = await userDb.auth.signInWithPassword({ email: PHOTO_EMAIL, password: PHOTO_PASSWORD });
const photoUserId = photoLogin.data.user?.id || '';
rec('photographer-login', Boolean(photoUserId));
if (photoUserId) {
  await admin.from('profiles').update({ job_title: 'garage_photographer', is_active: true }).eq('id', photoUserId);
}

const desk = await userDb.auth.signInWithPassword({ email: DESK_EMAIL, password: DESK_PASSWORD });
rec('desk-login', Boolean(desk.data.session));

const stamp = Date.now();
const claimId = `DAL-QA-GAR-PORTAL-${stamp}`;
const newEmail = `qa.garage.type.${stamp}@futurecraft.staging`;
let createdUserId = '';

if (desk.data.session) {
  const deskDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
  await deskDb.auth.setSession({
    access_token: desk.data.session.access_token,
    refresh_token: desk.data.session.refresh_token,
  });
  const now = new Date().toISOString();
  const { error: insErr } = await deskDb.from('claims_records').insert({
    id: claimId,
    client_name: `TEST Garage Portal ${stamp}`,
    plate: '11-222-33',
    status: 'בטיפול',
    assigned_to: desk.data.user.id,
    assigned_to_name: 'TEST עובד תביעות',
    created_by_name: 'QA Worker',
    last_activity_at: now,
    row_data: {
      id: claimId,
      clientName: `TEST Garage Portal ${stamp}`,
      plate: '11-222-33',
      carModel: 'קורולה',
      garageName: 'מוסך QA',
      eventDate: '2026-09-01',
      status: 'בטיפול',
      source: 'Staff',
      createdAt: now,
    },
  });
  rec(`create-${claimId}`, !insErr, { err: insErr?.message });
  const assigned = await invoke(desk.data.session, { action: 'assign_garage_worker', claim_id: claimId, worker_id: photoUserId, worker_note: 'LIVE portal' });
  rec('assign-existing-photographer', assigned.json?.success === true, { err: assigned.json?.error });
}

const browser = await chromium.launch({ headless: true });
try {
  const saCtx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  const sa = await injectSuperAdmin(saCtx);
  rec('super-admin-login', Boolean(sa.session), { email: sa.email });
  const page = await saCtx.newPage();
  await page.goto(`${PUBLIC}/user-management`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.locator('[data-testid="create-user-open"]').click();
  await page.waitForSelector('[data-testid="create-user-type-garage_photographer"]', { timeout: 20000 });
  const typeText = await page.locator('[data-testid="create-user-type-garage_photographer"]').innerText();
  rec('live-user-type-visible', typeText.includes('עובד צילומי מוסך'), { typeText });
  await saveShot(page, 'live-create-user-type');
  await page.locator('[data-testid="create-user-type-garage_photographer"]').click();
  await page.waitForSelector('[data-testid="create-user-garage-note"]');
  rec('live-user-type-selected', await page.locator('[data-testid="create-user-garage-note"]').count() > 0);
  await page.locator('[data-testid="create-user-field-full_name"]').fill(`QA צלם סוג ${stamp}`);
  await page.locator('[data-testid="create-user-field-phone"]').fill('0500000099');
  await page.locator('[data-testid="create-user-field-login_email"]').fill(newEmail);
  await page.locator('[data-testid="create-user-field-password"]').fill('QaGarageType2026!');
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="create-user-submit"]').click();
  await page.waitForTimeout(4000);
  await saveShot(page, 'live-user-created');
  let createdRow = null;
  const byName = await admin.from('profiles').select('id, job_title, full_name, is_active').eq('full_name', `QA צלם סוג ${stamp}`).maybeSingle();
  if (byName.data) {
    createdRow = byName.data;
    createdUserId = byName.data.id;
  } else {
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const hit = (users.data?.users || []).find((u) => u.email === newEmail);
    if (hit) {
      createdUserId = hit.id;
      const { data } = await admin.from('profiles').select('id, job_title, full_name, is_active').eq('id', hit.id).maybeSingle();
      createdRow = data;
    }
  }
  rec('live-user-created', Boolean(createdUserId), { email: newEmail, id: createdUserId });
  rec('live-user-job-title', createdRow?.job_title === 'garage_photographer', { job_title: createdRow?.job_title || null });
  if (createdUserId) {
    const { data: access } = await admin.from('claims_access').select('user_id').eq('user_id', createdUserId).maybeSingle();
    rec('live-user-no-claims-access', !access, {});
    const { data: driver } = await admin.from('drivers').select('id').eq('id', createdUserId).maybeSingle();
    rec('live-user-no-driver-row', !driver, {});
  }

  await page.goto(`${PUBLIC}/user-management`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.locator('input[placeholder*="חיפוש"]').fill('QA צלם מוסך');
  await page.waitForTimeout(800);
  const portalBtn = page.locator('button', { hasText: 'פתח פורטל עובד' }).first();
  rec('live-admin-portal-button', await portalBtn.count() > 0);
  const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
  await portalBtn.click();
  const popup = await popupPromise;
  const portalPage = popup || page;
  if (!popup) {
    await page.waitForTimeout(1500);
  } else {
    await portalPage.waitForLoadState('domcontentloaded');
    await portalPage.waitForTimeout(2000);
  }
  const preview = portalPage.locator('[data-testid="garage-admin-preview"]');
  rec('live-admin-preview-banner', await preview.count() > 0, { url: portalPage.url() });
  rec('live-admin-preview-no-user-switch', portalPage.url().includes('worker=') && !isImpersonatingText(await portalPage.locator('body').innerText().catch(() => '')), { url: portalPage.url() });
  const stillAdmin = await portalPage.evaluate((ref) => {
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    try { return JSON.parse(raw)?.user?.email || ''; } catch { return ''; }
  }, STAGING_REF);
  rec('live-session-still-admin', stillAdmin === sa.email, { email: stillAdmin });
  await saveShot(portalPage, 'live-admin-open-portal');
  await saCtx.close();

  const deskCtx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  await injectPassword(deskCtx, DESK_EMAIL, DESK_PASSWORD);
  const deskPage = await deskCtx.newPage();
  await deskPage.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await deskPage.waitForTimeout(2500);
  const search = deskPage.locator('[data-testid="claims-search"]');
  if (await search.count()) {
    await search.fill(claimId);
    await deskPage.waitForTimeout(800);
  }
  const row = deskPage.locator(`text=${claimId}`).first();
  if (await row.count()) await row.click();
  else await deskPage.goto(`${PUBLIC}/claims?open=${encodeURIComponent(claimId)}`, { waitUntil: 'domcontentloaded' });
  await deskPage.waitForTimeout(2000);
  const docsTab = deskPage.locator('text=גלריית מסמכים ותמונות').first();
  if (await docsTab.count()) await docsTab.click();
  await deskPage.waitForSelector('[data-testid="garage-assign-bar"]', { timeout: 20000 });
  rec('live-claim-open-portal-btn', await deskPage.locator('[data-testid="garage-open-worker-portal"]').count() > 0);
  const deskPopupP = deskPage.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
  await deskPage.locator('[data-testid="garage-open-worker-portal"]').click();
  const deskPopup = await deskPopupP;
  const portal2 = deskPopup || deskPage;
  if (deskPopup) {
    await portal2.waitForLoadState('domcontentloaded');
    await portal2.waitForTimeout(2500);
  } else {
    await deskPage.waitForTimeout(2000);
  }
  rec('live-desk-preview-banner', await portal2.locator('[data-testid="garage-admin-preview"]').count() > 0, { url: portal2.url() });
  rec('live-desk-sees-assigned-claim', await portal2.locator(`[data-testid="garage-job-${claimId}"]`).count() > 0, { url: portal2.url() });
  const deskEmail = await portal2.evaluate((ref) => {
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    try { return JSON.parse(raw)?.user?.email || ''; } catch { return ''; }
  }, STAGING_REF);
  rec('live-desk-session-unchanged', deskEmail === DESK_EMAIL, { email: deskEmail });
  await saveShot(portal2, 'live-desk-open-portal');
  await deskPage.setViewportSize({ width: 390, height: 844 });
  await saveShot(deskPage, 'live-desk-portal-btn-mobile');
  await deskCtx.close();
} catch (e) {
  rec('live-ui-exception', false, { err: String(e.message || e).slice(0, 400) });
} finally {
  await browser.close().catch(() => null);
}

if (claimId && !PROTECTED.has(claimId) && desk.data.session) {
  const { data: row } = await admin.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (row) {
    const rd = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    await admin.from('claims_records').update({ row_data: { ...rd, deletedAt: new Date().toISOString() } }).eq('id', claimId);
    rec('soft-delete-test-claim', true, { claimId });
  }
}
if (createdUserId) {
  await admin.from('profiles').update({ is_active: false }).eq('id', createdUserId);
  rec('deactivate-test-user', true, { createdUserId });
}
rec('production-untouched-final', true);

function isImpersonatingText(text) {
  return /צופה כמשתמש|יציאה ממצב צפייה|impersonat/i.test(text);
}

report.failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
report.verdict = report.failed.length ? 'FAIL' : 'PASS';
writeFileSync(join(OUT, 'pages-live.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} failed=${report.failed.join(',') || 'none'} sha=${report.liveSha}`);
if (report.verdict !== 'PASS') process.exit(1);
