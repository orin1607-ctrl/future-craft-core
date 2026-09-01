/**
 * Claims default-view QA: all claims on entry. Desktop + mobile.
 * node scripts/claims-default-list-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-incoming-gmail-2026-09-01/ui-qa');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = {
  at: new Date().toISOString(),
  productionTouched: false,
  hostingerTouched: false,
  checks: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

let base = PUBLIC;
try {
  const r = await fetch('http://localhost:8080/', { signal: AbortSignal.timeout(1500) });
  if (r.ok) base = 'http://localhost:8080';
} catch { /* public */ }
report.base = base;

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;

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

async function runAt(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  await page.goto(`${base}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const heading = page.getByTestId('claims-list-heading');
  const table = page.getByTestId('claims-list-table');
  const headingVisible = await heading.isVisible().catch(() => false);
  const tableVisible = await table.isVisible().catch(() => false);
  const headingText = headingVisible ? (await heading.innerText()).replace(/\s+/g, ' ').trim() : '';
  const rows = tableVisible ? await table.locator('tbody tr').count() : 0;
  rec(`${name}-default-all-claims`, headingVisible && tableVisible && headingText.includes('כל התיקים') && rows >= 16, {
    headingText,
    rows,
  });
  await page.screenshot({ path: join(OUT, `${name}-enter.png`), fullPage: true });

  if (viewport.width < 700) {
    await page.getByTestId('claims-sb-open').click();
    await page.waitForTimeout(400);
  }
  const statusBtn = page.getByRole('button', { name: /חדש/ }).first();
  if (await statusBtn.isVisible().catch(() => false)) {
    await statusBtn.click();
    await page.waitForTimeout(600);
  }
  const filteredHeading = await page.getByTestId('claims-list-heading').innerText().catch(() => '');
  rec(`${name}-status-filter-works`, filteredHeading.includes('חדש'), { filteredHeading });

  if (viewport.width < 700) {
    await page.getByTestId('claims-sb-open').click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page.getByTestId('claims-nav-all').click();
  await page.waitForTimeout(600);
  const backText = await page.getByTestId('claims-list-heading').innerText().catch(() => '');
  const backRows = await page.getByTestId('claims-list-table').locator('tbody tr').count().catch(() => 0);
  rec(`${name}-back-to-all`, backText.includes('כל התיקים') && backRows >= 16, { backText, backRows });

  await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const afterReload = await page.getByTestId('claims-list-heading').innerText().catch(() => '');
  rec(`${name}-refresh-still-all`, afterReload.includes('כל התיקים'), { afterReload });

  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.goto(`${base}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const afterReturn = await page.getByTestId('claims-list-heading').innerText().catch(() => '');
  rec(`${name}-leave-and-return`, afterReturn.includes('כל התיקים'), { afterReturn });
  await page.screenshot({ path: join(OUT, `${name}-return.png`), fullPage: true });
  await browser.close();
}

await runAt('desktop', { width: 1440, height: 900 });
await runAt('mobile', { width: 390, height: 844 });
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, base: report.base, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
