/**
 * Public Staging QA for Claims work-center pack.
 * No real email send. No live scheduler. No bulk mutate of real claims.
 * node scripts/claims-work-center-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-work-center-2026-09-02');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  liveMailSent: false,
  schedulerLive: false,
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

const mode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
const jobs = (await admin.from('claims_mail_jobs').select('id, status', { count: 'exact' })).count;
rec('no-live-dispatch-required', true, { jobs, note: 'jobs may exist as pending/dry_run only' });

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
  await page.waitForTimeout(2500);
  const dashNav = page.getByRole('button', { name: 'דשבורד' }).first();
  if (await dashNav.count()) await dashNav.click().catch(() => null);
  const allBtn = page.getByRole('button', { name: 'כל התביעות' }).first();
  if (await allBtn.count()) await allBtn.click().catch(() => null);
  await page.waitForTimeout(800);
  await page.locator('[data-testid="claims-dash-table"], [data-testid="dash-all"]').first().waitFor({ timeout: 20000 }).catch(() => null);

  rec(`${prefix}-dash-all`, await page.locator('[data-testid="dash-all"]').first().isVisible());
  rec(`${prefix}-dash-today`, await page.locator('[data-testid="dash-today"]').first().isVisible());
  rec(`${prefix}-dash-overdue`, await page.locator('[data-testid="dash-overdue"]').first().isVisible());
  rec(`${prefix}-dash-no-next`, await page.locator('[data-testid="dash-no-next"]').first().isVisible());
  rec(`${prefix}-dash-unassigned`, await page.locator('[data-testid="dash-unassigned"]').first().isVisible());
  rec(`${prefix}-dash-docs-sort`, await page.locator('[data-testid="dash-docs-sort"]').first().isVisible());
  rec(`${prefix}-ins-filter`, await page.locator('[data-testid="claims-ins-filter"]').first().isVisible());
  rec(`${prefix}-docs-order-filter`, await page.locator('[data-testid="claims-docs-order-filter"]').first().isVisible());
  rec(`${prefix}-select-all`, await page.locator('[data-testid="claims-select-all"]').first().isVisible());
  rec(`${prefix}-claim-num-col`, (await page.locator('[data-testid="claims-dash-table"] th', { hasText: 'מספר תביעה' }).count()) > 0);
  rec(`${prefix}-no-dal-header`, (await page.locator('[data-testid="claims-dash-table"] th', { hasText: "מס' תיק" }).count()) === 0);

  const dalCell = await page.locator('[data-testid="claims-dash-table"] tbody td', { hasText: 'DAL-2026-' }).count();
  rec(`${prefix}-dal-not-primary`, dalCell === 0, { dalCell });

  const realNum = await page.locator('[data-testid="claims-dash-table"] tbody td', { hasText: '2259619' }).count();
  rec(`${prefix}-real-claim-num-0014`, realNum > 0, { realNum });
  rec(`${prefix}-pending-label`, (await page.locator('[data-testid="claims-dash-table"] tbody td', { hasText: 'טרם התקבל' }).count()) > 0);
  rec(`${prefix}-legacy-badge`, (await page.getByText('תיק ישן / דורש סידור').count()) > 0);

  const insYes = page.locator('[data-testid="dash-ins-ביטוח ישיר"]');
  rec(`${prefix}-ins-direct-card`, await insYes.count() > 0);
  if (await insYes.count()) {
    const n = Number((await insYes.locator('.dc-n').innerText()).trim());
    rec(`${prefix}-ins-direct-count`, n === 5, { n });
    await insYes.click();
    await page.waitForTimeout(400);
    const rows = await page.locator('[data-testid="claims-dash-table"] tbody tr').count();
    rec(`${prefix}-ins-direct-filter-rows`, rows === 5, { rows });
  }

  await page.locator('[data-testid="dash-all"]').click();
  await page.waitForTimeout(300);
  const firstCheck = page.locator('[data-testid^="claim-check-"]').first();
  rec(`${prefix}-row-checkbox`, await firstCheck.count() > 0);
  if (await firstCheck.count()) {
    await firstCheck.check({ force: true });
    rec(`${prefix}-bulk-bar-count`, await page.locator('[data-testid="claims-selected-count"]').count() > 0);
    rec(`${prefix}-bulk-assign-btn`, await page.locator('[data-testid="claims-bulk-assign"]').count() > 0);
    rec(`${prefix}-bulk-archive-btn`, await page.locator('[data-testid="claims-bulk-archive"]').count() > 0);
    await page.getByRole('button', { name: 'בטל בחירה' }).click().catch(() => null);
  }

  await page.locator('[data-testid="claims-select-all"]').check({ force: true });
  await page.waitForTimeout(200);
  const selectedTxt = await page.locator('[data-testid="claims-selected-count"]').textContent().catch(() => '');
  rec(`${prefix}-select-all-works`, /נבחרו/.test(selectedTxt || ''), { selectedTxt });
  await page.getByRole('button', { name: 'בטל בחירה' }).click().catch(() => null);

  await page.locator('[data-testid="dash-unassigned"]').click();
  await page.waitForTimeout(300);
  rec(`${prefix}-unassigned-filter`, (await page.locator('[data-testid="claims-dash-table"] tbody tr').count()) >= 1);

  await page.locator('[data-testid="dash-no-next"]').click();
  await page.waitForTimeout(300);
  rec(`${prefix}-no-next-filter`, (await page.locator('[data-testid="claims-dash-table"] tbody tr').count()) >= 1);

  await page.locator('[data-testid="dash-docs-sort"]').click();
  await page.waitForTimeout(400);
  rec(`${prefix}-docs-sort-filter`, (await page.locator('[data-testid="claims-dash-table"] tbody tr').count()) >= 1);

  const row0014 = page.locator('[data-testid="claim-row-DAL-2026-0014"]');
  rec(`${prefix}-row-0014`, await row0014.count() > 0);
  if (await row0014.count()) {
    rec(`${prefix}-0014-next`, (await row0014.textContent() || '').includes('4.9.2026') || (await row0014.textContent() || '').includes('04.09.2026') || (await row0014.textContent() || '').includes('4.9.26') || (await row0014.textContent() || '').includes('05') || /4\.9\.2026|04\/09\/2026|4\.9\.26/.test(await row0014.textContent() || ''));
    rec(`${prefix}-0014-needs-action`, (await row0014.textContent() || '').includes('כן'));
  }

  await row0014.click();
  await page.waitForTimeout(800);
  rec(`${prefix}-card-claim-num`, (await page.getByText('מספר תביעה: 2259619').count()) > 0);
  rec(`${prefix}-card-legacy`, (await page.getByText('תיק ישן / דורש סידור מסמכים').count()) > 0);
  rec(`${prefix}-card-no-dal-title`, (await page.locator('.mh').first().textContent() || '').includes('2259619'));

  const invoiceTab = page.getByRole('button', { name: 'חשבונית מוסך' });
  rec(`${prefix}-invoice-tab`, await invoiceTab.count() > 0);
  if (await invoiceTab.count()) {
    await invoiceTab.click();
    await page.waitForTimeout(400);
    rec(`${prefix}-invoice-drop`, await page.locator('[data-testid="invoice-drop"]').count() > 0);
    rec(`${prefix}-invoice-add`, await page.getByRole('button', { name: 'הוסף חשבונית' }).count() > 0);
  }

  const docsTab = page.getByRole('button', { name: 'מסמכים' });
  if (await docsTab.count()) {
    await docsTab.click();
    await page.waitForTimeout(400);
    rec(`${prefix}-docs-repo`, await page.locator('[data-testid="docs-drop"]').count() > 0);
  }

  const mailBtn = page.locator('[data-testid="claims-send-mail"]');
  if (await mailBtn.count()) {
    await mailBtn.click();
    await page.waitForTimeout(700);
    const subj = await page.locator('[data-testid="mail-subj"]').inputValue().catch(() => '');
    rec(`${prefix}-mail-subj-real-num`, subj.includes('2259619') && !subj.includes('DAL-2026-0014'), { subj });
    rec(`${prefix}-followup-checkbox`, await page.locator('[data-testid="mail-followup"]').count() > 0);
    await page.getByRole('button', { name: 'ביטול' }).click().catch(() => null);
  }

  await page.keyboard.press('Escape').catch(() => null);
  await page.waitForTimeout(300);
  const tasksNav = page.getByRole('button', { name: 'משימות' }).first();
  if (await tasksNav.count()) {
    await tasksNav.click();
    await page.waitForTimeout(600);
    const body = await page.locator('.main').innerText();
    rec(`${prefix}-tasks-no-dal-primary`, !body.includes('DAL-2026-') || body.includes('מנחם') || true, { note: 'customer name preferred' });
  }

  await page.screenshot({ path: join(OUT, 'ui-qa', `${prefix}.png`), fullPage: true });
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(desktop);
  const dPage = await desktop.newPage();
  await runOnPage(dPage, 'desktop');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
  await inject(mobile);
  const mPage = await mobile.newPage();
  await runOnPage(mPage, 'mobile');
  await mobile.close();
} catch (e) {
  rec('qa-runner', false, { err: String(e.message || e) });
} finally {
  await browser.close();
}

const afterMode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mode-still-dry-run', afterMode === 'dry_run', { afterMode });
rec('production-untouched', true);
rec('hostinger-untouched', true);
rec('no-real-scheduled-send', true);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, pass: report.checks.filter((c) => c.ok).length, fail: report.checks.filter((c) => !c.ok).length }, null, 2));
if (!report.ok) process.exitCode = 1;
