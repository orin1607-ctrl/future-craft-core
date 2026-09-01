/**
 * Public Staging QA: demo soft-delete + claims worker assign.
 * node scripts/claims-worker-assign-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-demo-delete-2026-09-01');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });
const report = { at: new Date().toISOString(), productionTouched: false, checks: [], ok: false };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
let saId = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; saId = row.user_id; break; }
  if (!saEmail) { saEmail = u?.data?.user?.email || ''; saId = row.user_id; }
}

const { data: c18 } = await admin.from('claims_records').select('id, row_data').eq('id', 'DAL-2026-0018').maybeSingle();
const { data: c19 } = await admin.from('claims_records').select('id, row_data').eq('id', 'DAL-2026-0019').maybeSingle();
const { data: c14 } = await admin.from('claims_records').select('id, client_name, row_data').eq('id', 'DAL-2026-0014').maybeSingle();
rec('db-0018-soft-deleted', Boolean(c18?.row_data?.deletedAt));
rec('db-0019-soft-deleted', Boolean(c19?.row_data?.deletedAt));
rec('db-0014-intact', Boolean(c14) && !c14.row_data?.deletedAt && String(c14.client_name).includes('מנחם'));
rec('db-rows-still-18', (await admin.from('claims_records').select('id', { count: 'exact', head: true })).count === 18);
rec('db-docs-kept', (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count === 1836);
rec('vehicles-437', (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count === 437);
rec('accidents-11', (await admin.from('accidents').select('id', { count: 'exact', head: true })).count === 11);

const { data: assignTarget } = await admin.from('claims_records').select('id, assigned_to, assigned_to_name').eq('id', 'DAL-2026-0011').maybeSingle();
const prevAssigned = assignTarget?.assigned_to || null;
const prevAssignedName = assignTarget?.assigned_to_name || '';

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
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
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
try {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);
  const search = page.locator('.claims-root input.fi').first();
  await search.fill('0018');
  await page.waitForTimeout(800);
  rec('ui-0018-hidden', (await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0018' }).count()) === 0);
  await search.fill('0019');
  await page.waitForTimeout(800);
  rec('ui-0019-hidden', (await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0019' }).count()) === 0);
  await search.fill('0014');
  await page.waitForTimeout(800);
  rec('ui-0014-visible', (await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0014' }).count()) > 0);

  await search.fill('0011');
  await page.waitForTimeout(800);
  await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0011' }).first().click();
  await page.waitForTimeout(1100);
  rec('assign-btn', await page.locator('[data-testid="claims-assign-btn"]').isVisible());
  await page.locator('[data-testid="claims-assign-btn"]').click();
  await page.locator('[data-testid="claims-assign-user"]').waitFor({ state: 'visible', timeout: 8000 });
  const optCount = await page.locator('[data-testid="claims-assign-user"] option').count();
  rec('assign-has-workers', optCount >= 2, { optCount });
  rec('assign-modal-label', (await page.getByText('הקצה לעובד תביעות').count()) > 0);
  await page.locator('.ov.open').last().locator('.mf .btn-g').click({ force: true });
  rec('assign-cancelled-no-persist', true);

  await page.goto(`${PUBLIC}/user-management`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);
  rec('users-col-claims-worker', (await page.getByText('עובד תביעות').count()) > 0);
  rec('users-filter', await page.locator('[data-testid="users-claims-filter"]').count() > 0);
  await page.screenshot({ path: join(OUT, 'ui-qa', 'users.png'), fullPage: true }).catch(() => null);
} catch (e) {
  rec('uncaught', false, { err: String(e).slice(0, 400) });
  await page.screenshot({ path: join(OUT, 'ui-qa', 'err.png'), fullPage: true }).catch(() => null);
}
await page.screenshot({ path: join(OUT, 'ui-qa', 'claims.png'), fullPage: true }).catch(() => null);

const mobile = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await inject(mobile);
const mp = await mobile.newPage();
await mp.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
await mp.waitForTimeout(1400);
const msearch = mp.locator('.claims-root input.fi').first();
if (await msearch.count()) {
  await msearch.fill('DAL-2026-0018');
  await mp.waitForTimeout(900);
  rec('mobile-0018-hidden', (await mp.getByText('DAL-2026-0018').count()) === 0);
  await msearch.fill('DAL-2026-0014');
  await mp.waitForTimeout(900);
  rec('mobile-0014-visible', (await mp.getByText('DAL-2026-0014').count()) > 0 || (await mp.locator('.claims-root .tw tbody tr').filter({ hasText: '0014' }).count()) > 0);
} else {
  rec('mobile-0018-hidden', !(await mp.content()).includes('DAL-2026-0018'));
  rec('mobile-0014-visible', (await mp.content()).includes('DAL-2026-0014'));
}
await mp.screenshot({ path: join(OUT, 'ui-qa', 'mobile.png'), fullPage: true }).catch(() => null);
await mobile.close();
await browser.close();

const { data: c14b } = await admin.from('claims_records').select('id, row_data, assigned_to').eq('id', 'DAL-2026-0014').maybeSingle();
rec('0014-still-intact-after-qa', Boolean(c14b) && !c14b.row_data?.deletedAt);
const { data: c11 } = await admin.from('claims_records').select('assigned_to').eq('id', 'DAL-2026-0011').maybeSingle();
rec('0011-assignment-unchanged', (c11?.assigned_to || null) === (prevAssigned || null));
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-qa', 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
process.exit(report.ok ? 0 : 1);
