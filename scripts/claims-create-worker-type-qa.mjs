/**
 * Public Staging QA: create-user type "עובד ניהול תביעות".
 * Staging only. Does not touch Production / 0014 / existing users' grants.
 * node scripts/claims-create-worker-type-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-worker-create-user-2026-09-01');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const stamp = Date.now();
const TEST_NAME = `TEST עובד תביעות ${stamp}`;
const TEST_EMAIL = `qa.claims.worker.${stamp}@futurecraft.staging`;
const TEST_PHONE = '0500000099';
const TEST_PASSWORD = 'QaWorker2026!';
const TEST_CLAIM = 'DAL-QA-WORKER-001';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  existingUsersChanged: false,
  testEmail: TEST_EMAIL,
  testClaim: TEST_CLAIM,
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` ${extra.err}` : ''}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const vehBefore = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const accBefore = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
rec('vehicles-437-before', vehBefore === 437, { vehBefore });
rec('accidents-11-before', accBefore === 11, { accBefore });

const { data: c14 } = await admin.from('claims_records').select('id, client_name, assigned_to, row_data').eq('id', 'DAL-2026-0014').maybeSingle();
rec('0014-intact-before', Boolean(c14) && !c14.row_data?.deletedAt && String(c14.client_name || '').includes('מנחם'));

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
let saId = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; saId = row.user_id; break; }
  if (!saEmail) { saEmail = u?.data?.user?.email || ''; saId = row.user_id; }
}

const { data: existingClaim } = await admin.from('claims_records').select('id').eq('id', TEST_CLAIM).maybeSingle();
if (!existingClaim) {
  const { error: insErr } = await admin.from('claims_records').insert({
    id: TEST_CLAIM,
    client_name: 'TEST-CLAIMS-WORKER',
    status: 'חדש',
    company_name: 'TEST',
    created_by: saId || null,
    created_by_name: 'QA',
    row_data: { qa: true, clientName: 'TEST-CLAIMS-WORKER', source: 'create-user-claims-worker' },
  });
  rec('test-claim-created', !insErr, { err: insErr?.message });
} else {
  rec('test-claim-reused', true);
}

async function inject(context, email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (error || !auth.session) throw error || new Error('verifyOtp');
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    },
  });
  return auth.session.user.id;
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx, saEmail);
const page = await ctx.newPage();
let workerId = '';

try {
  await page.goto(`${PUBLIC}/user-management`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'פתיחת משתמש חדש' }).click();
  await page.waitForTimeout(800);
  const typeBtn = page.locator('[data-testid="create-user-type-claims_worker"]');
  rec('wizard-type-visible', await typeBtn.isVisible(), { text: await typeBtn.innerText().catch(() => '') });
  await page.screenshot({ path: join(OUT, 'ui-qa', '01-wizard-types.png'), fullPage: true }).catch(() => null);
  await typeBtn.click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="create-user-field-full_name"]').fill(TEST_NAME);
  await page.locator('[data-testid="create-user-field-phone"]').fill(TEST_PHONE);
  await page.locator('[data-testid="create-user-field-login_email"]').fill(TEST_EMAIL);
  await page.locator('[data-testid="create-user-field-password"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.waitForTimeout(500);
  rec('wizard-summary-type', (await page.getByText('עובד ניהול תביעות').count()) > 0);
  await page.screenshot({ path: join(OUT, 'ui-qa', '02-wizard-summary.png'), fullPage: true }).catch(() => null);
  await page.getByRole('button', { name: /צור משתמש/ }).click();
  await page.waitForTimeout(4000);
  rec('wizard-created', (await page.getByText('המשתמש נוצר').count()) > 0 || (await page.getByText('תוצאה').count()) > 0);
  await page.screenshot({ path: join(OUT, 'ui-qa', '03-wizard-result.png'), fullPage: true }).catch(() => null);
  await page.getByRole('button', { name: 'סגור' }).click().catch(() => null);
  await page.waitForTimeout(1200);

  const { data: created } = await admin.from('profiles').select('id, full_name, is_active').eq('full_name', TEST_NAME).maybeSingle();
  workerId = created?.id || '';
  rec('db-user-created', Boolean(workerId), { workerId, name: created?.full_name });
  const { data: grant } = await admin.from('claims_access').select('user_id, worker_only').eq('user_id', workerId).maybeSingle();
  rec('db-worker-only-grant', Boolean(grant?.worker_only), { grant });
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', workerId).maybeSingle();
  rec('db-no-new-app-role', roleRow?.role === 'driver', { role: roleRow?.role });
  const { data: driverRow } = await admin.from('drivers').select('id').eq('id', workerId).maybeSingle();
  rec('db-not-in-drivers', !driverRow);

  if (workerId && created && created.is_active === false) {
    await page.locator('input').first().fill(TEST_NAME);
    await page.waitForTimeout(800);
    const row = page.locator('table tbody tr').filter({ hasText: TEST_NAME }).first();
    rec('user-row-visible', await row.count() > 0);
    const sw = row.locator('button[role="switch"]').last();
    await sw.click();
    await page.waitForTimeout(1500);
  }
  const { data: afterAct } = await admin.from('profiles').select('is_active').eq('id', workerId).maybeSingle();
  rec('db-user-activated', afterAct?.is_active === true);

  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const search = page.locator('.claims-root input.fi').first();
  await search.fill(TEST_CLAIM);
  await page.waitForTimeout(900);
  await page.locator('.claims-root .tw tbody tr').filter({ hasText: 'QA-WORKER' }).first().click();
  await page.waitForTimeout(1100);
  await page.locator('[data-testid="claims-assign-btn"]').click();
  await page.locator('[data-testid="claims-assign-user"]').waitFor({ state: 'visible', timeout: 8000 });
  rec('assign-label-handler', (await page.getByText('עובד מטפל').count()) > 0);
  const options = await page.locator('[data-testid="claims-assign-user"] option').allTextContents();
  rec('assign-lists-new-worker', options.some((t) => t.includes(TEST_NAME)), { options: options.slice(0, 12) });
  await page.locator('[data-testid="claims-assign-user"]').selectOption({ value: workerId });
  await page.locator('[data-testid="claims-assign-save"]').click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(OUT, 'ui-qa', '04-assigned.png'), fullPage: true }).catch(() => null);
  const { data: assigned } = await admin.from('claims_records').select('assigned_to, assigned_to_name').eq('id', TEST_CLAIM).maybeSingle();
  rec('assignment-persisted', assigned?.assigned_to === workerId, { assigned });
} catch (e) {
  rec('desktop-uncaught', false, { err: String(e).slice(0, 500) });
  await page.screenshot({ path: join(OUT, 'ui-qa', 'desktop-err.png'), fullPage: true }).catch(() => null);
}

await ctx.close();

try {
  if (!workerId) throw new Error('no workerId');
  const wctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  await inject(wctx, TEST_EMAIL);
  const wp = await wctx.newPage();
  await wp.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await wp.waitForTimeout(1800);
  rec('worker-lands-claims', wp.url().includes('/claims'));
  rec('worker-sees-assigned', (await wp.getByText(TEST_CLAIM).count()) > 0 || (await wp.getByText('TEST-CLAIMS-WORKER').count()) > 0);
  rec('worker-no-0014', (await wp.getByText('DAL-2026-0014').count()) === 0 && (await wp.getByText('מנחם מור').count()) === 0);
  rec('worker-nav-claims-only', (await wp.getByText('ניהול תביעות').count()) > 0);
  rec('worker-no-vehicles-nav', (await wp.locator('a[href*="/vehicles"]').count()) === 0);
  rec('worker-no-tele-nav', (await wp.locator('a[href*="/telemarketing"]').count()) === 0);
  await wp.screenshot({ path: join(OUT, 'ui-qa', '05-worker-claims.png'), fullPage: true }).catch(() => null);
  await wp.goto(`${PUBLIC}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await wp.waitForTimeout(1400);
  rec('worker-blocked-vehicles', !wp.url().includes('/vehicles'));
  await wp.screenshot({ path: join(OUT, 'ui-qa', '06-worker-blocked-vehicles.png'), fullPage: true }).catch(() => null);
  await wctx.close();

  const mctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await inject(mctx, TEST_EMAIL);
  const mp = await mctx.newPage();
  await mp.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await mp.waitForTimeout(1600);
  rec('mobile-worker-claims', (await mp.getByText(TEST_CLAIM).count()) > 0 || (await mp.getByText('TEST-CLAIMS-WORKER').count()) > 0 || mp.url().includes('/claims'));
  rec('mobile-bottom-claims', (await mp.locator('nav a[href*="/claims"]').count()) > 0 || (await mp.getByText('תביעות').count()) > 0);
  rec('mobile-no-faults-nav', (await mp.locator('nav a[href*="/faults"]').count()) === 0);
  await mp.screenshot({ path: join(OUT, 'ui-qa', '07-mobile-worker.png'), fullPage: true }).catch(() => null);
  await mctx.close();
} catch (e) {
  rec('worker-session-uncaught', false, { err: String(e).slice(0, 500) });
}

await browser.close();

const { data: c14b } = await admin.from('claims_records').select('id, assigned_to, row_data, client_name').eq('id', 'DAL-2026-0014').maybeSingle();
rec('0014-intact-after', Boolean(c14b) && !c14b.row_data?.deletedAt && c14b.assigned_to === c14?.assigned_to);
const vehAfter = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const accAfter = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
rec('vehicles-437-after', vehAfter === 437, { vehAfter });
rec('accidents-11-after', accAfter === 11, { accAfter });

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-qa', 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
process.exit(report.ok ? 0 : 1);
