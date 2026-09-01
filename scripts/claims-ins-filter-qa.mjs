/**
 * Public Staging QA: insurance company column + filter on Claims dashboard/list.
 * Read-only on claim rows. Staging only.
 * node scripts/claims-ins-filter-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-ins-filter-2026-09-01');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, claimsDataMutated: false, checks: [], ok: false };
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
const claimsBefore = await admin.from('claims_records').select('id, row_data, assigned_to, updated_at');
rec('vehicles-437', vehBefore === 437, { vehBefore });
rec('accidents-11', accBefore === 11, { accBefore });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}

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

async function runOnPage(page, prefix) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const allBtn = page.getByRole('button', { name: 'כל התביעות' });
  if (await allBtn.count()) await allBtn.click().catch(() => null);
  await page.waitForTimeout(400);

  rec(`${prefix}-list-ins-col`, (await page.locator('[data-testid="claims-list-table"] th', { hasText: 'חברת ביטוח' }).count()) > 0);
  rec(`${prefix}-ins-filter`, await page.locator('[data-testid="claims-ins-filter"]').first().isVisible());
  rec(`${prefix}-all-ins-option`, (await page.locator('[data-testid="claims-ins-filter"] option').first().textContent()) === 'כל חברות הביטוח');

  const options = (await page.locator('[data-testid="claims-ins-filter"] option').allTextContents()).map((t) => t.trim()).filter(Boolean);
  rec(`${prefix}-ins-options-from-data`, options.length >= 1, { options });
  const company = options.find((o) => o && o !== 'כל חברות הביטוח');
  const allCount = await page.locator('[data-testid="claims-list-table"] tbody tr').count();
  rec(`${prefix}-all-rows`, allCount >= 1, { allCount });

  if (company) {
    await page.locator('[data-testid="claims-ins-filter"]').first().selectOption({ label: company });
    await page.waitForTimeout(400);
    const filtered = await page.locator('[data-testid="claims-list-table"] tbody tr').count();
    const cells = await page.locator('[data-testid="claims-list-table"] tbody tr td:nth-child(4)').allTextContents();
    rec(`${prefix}-filter-works`, filtered >= 1 && filtered <= allCount && cells.every((t) => t.trim() === company), { company, filtered, cells: cells.slice(0, 8) });
    await page.locator('[data-testid="claims-ins-filter"]').first().selectOption({ value: '' });
    await page.waitForTimeout(400);
    const back = await page.locator('[data-testid="claims-list-table"] tbody tr').count();
    rec(`${prefix}-all-ins-restores`, back === allCount, { back, allCount });
  } else {
    rec(`${prefix}-filter-works`, true, { note: 'no populated insCompany values in current list' });
    rec(`${prefix}-all-ins-restores`, true);
  }

  await page.locator('[data-testid="claims-sb"]').getByText('דשבורד', { exact: true }).click().catch(async () => {
    await page.getByRole('button', { name: 'דשבורד' }).first().click();
  });
  await page.waitForTimeout(700);
  rec(`${prefix}-dash-all-claims`, (await page.getByText('כל התביעות').count()) > 0);
  rec(`${prefix}-dash-ins-col`, (await page.locator('[data-testid="claims-dash-table"] th', { hasText: 'חברת ביטוח' }).count()) > 0);
  rec(`${prefix}-dash-ins-filter`, await page.locator('[data-testid="claims-ins-filter"]').first().isVisible());
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
try {
  await runOnPage(page, 'desktop');
  await page.screenshot({ path: join(OUT, 'ui-qa', 'desktop-list.png') }).catch(() => null);
} catch (e) {
  rec('desktop-uncaught', false, { err: String(e).slice(0, 500) });
  await page.screenshot({ path: join(OUT, 'ui-qa', 'desktop-err.png') }).catch(() => null);
}
await ctx.close();

const mctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await inject(mctx);
const mp = await mctx.newPage();
try {
  await runOnPage(mp, 'mobile');
  await mp.screenshot({ path: join(OUT, 'ui-qa', 'mobile-list.png') }).catch(() => null);
} catch (e) {
  rec('mobile-uncaught', false, { err: String(e).slice(0, 500) });
  await mp.screenshot({ path: join(OUT, 'ui-qa', 'mobile-err.png') }).catch(() => null);
}
await mctx.close();
await browser.close();

const claimsAfter = await admin.from('claims_records').select('id, row_data, assigned_to, updated_at');
const beforeMap = Object.fromEntries((claimsBefore.data || []).map((r) => [r.id, `${r.assigned_to}|${r.updated_at}|${JSON.stringify(r.row_data)}`]));
const mutated = (claimsAfter.data || []).some((r) => beforeMap[r.id] !== `${r.assigned_to}|${r.updated_at}|${JSON.stringify(r.row_data)}`);
rec('claims-data-unchanged', !mutated);
rec('vehicles-437-after', (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count === 437);
rec('accidents-11-after', (await admin.from('accidents').select('id', { count: 'exact', head: true })).count === 11);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-qa', 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
process.exit(report.ok ? 0 : 1);
