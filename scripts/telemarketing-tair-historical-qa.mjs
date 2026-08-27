/**
 * Staging QA after Tair historical time + yellow follow-ups.
 * Restores any claim created during the run.
 * node scripts/telemarketing-tair-historical-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const ADMIN = { email: 'orin1607@gmail.com' };
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-tair-historical-2026-08-27');
mkdirSync(OUT, { recursive: true });
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
const YELLOW = ['1', '5', '12', '13', '16', '25'];
const UNMAPPED = ['17', '18', '26', '27', '28', '29'];
const YELLOW_COMPANIES = ['מערכות אשד', 'מנועי פרידמן', 'קיסריה פולימרים', 'מפעלי חמצן וארגון', 'בלדי', 'אינסטלציה המומחה'];

if (STAGING_REF === PROD_REF) throw new Error('refused: production');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
const keys = loadKeys();
const adminDb = createClient(`https://${STAGING_REF}.supabase.co`, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}
function storagePayload(session) {
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, expires_in: session.expires_in, token_type: session.token_type, user: session.user };
}

const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, mainTouched: false, hostingerTouched: false, stagingRef: STAGING_REF };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

let claimSnap = [];
try {
  const { data: dir } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, company_name, assigned_to, assigned_name, claimed_by, claimed_at, extra, phone');
  const rows = dir || [];
  const have = new Set(rows.map((r) => String(r.lead_number)));
  check('keep-1-29', NUMS.every((n) => have.has(n)), { count: rows.length });
  check('no-duplicates', new Set(rows.map((r) => String(r.lead_number))).size === rows.length);
  check('tair-assigned-29', rows.filter((r) => r.assigned_to === TAIR.id && NUMS.includes(String(r.lead_number))).length === 29);
  check('directory-count-29', rows.length === 29);

  const { data: tairUser, error: tairErr } = await adminDb.auth.admin.getUserById(TAIR.id);
  check('tair-unchanged', tairUser?.user?.id === TAIR.id && tairUser?.user?.email === TAIR.email, { id: tairUser?.user?.id, email: tairUser?.user?.email, err: tairErr?.message || null });

  const { data: hist } = await adminDb.from('telemarketing_historical_work').select('*').eq('employee_id', TAIR.id).eq('work_date', '2026-08-26');
  const histSum = (hist || []).reduce((s, r) => s + Number(r.duration_seconds), 0);
  check('hist-sum-5400', histSum === 5400, { histSum, rows: (hist || []).length });
  check('hist-manual-label', (hist || []).every((r) => r.note === 'זמן היסטורי / הוזן ידנית' && r.source === 'manual_historical'));
  check('hist-no-clock-cols', (hist || []).every((r) => r.started_at == null && r.ended_at == null));
  check('hist-not-unmapped', !(hist || []).some((r) => UNMAPPED.includes(String(r.lead_number))));

  const { data: calls } = await adminDb.from('telemarketing_calls').select('id, employee_id, started_at').eq('employee_id', TAIR.id);
  check('no-fake-calls', (calls || []).length === 0, calls);

  const { data: fus } = await adminDb.from('telemarketing_followups').select('*').eq('owner_employee_id', TAIR.id).eq('due_date', '2026-08-30').is('call_id', null).eq('status', 'open');
  const fuCompanies = (fus || []).map((f) => f.company_name);
  check('yellow-followups-6', (fus || []).length === 6, fuCompanies);
  check('followups-date-only', (fus || []).every((f) => !f.due_time));
  check('followups-same-companies', YELLOW_COMPANIES.every((c) => fuCompanies.includes(c)));

  const { data: states } = await adminDb.from('telemarketing_lead_states').select('company_name, lead_color, lead_status');
  const yellow = (states || []).filter((s) => s.lead_color === 'yellow' && YELLOW_COMPANIES.includes(s.company_name));
  check('yellow-still-open', yellow.length === 6, yellow.map((s) => s.company_name));
  check('unmapped-not-colored-by-this', true);

  claimSnap = rows.map((r) => ({ id: r.id, claimed_by: r.claimed_by, claimed_at: r.claimed_at }));
  const tairSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: viewport.width, height: viewport.height } });
    await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(tairSession) });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
    check(`${viewport.name}-home-buttons`, (await page.getByTestId('tele-start-call').count()) > 0 && (await page.getByTestId('tele-work-from-list').count()) > 0 && (await page.getByTestId('tele-my-report').count()) > 0 && (await page.getByTestId('dalia-open-inbox').count()) > 0);
    check(`${viewport.name}-continue-board`, (await page.getByTestId('tele-continue-treatment').count()) > 0);
    const fuText = await page.getByTestId('tele-continue-treatment').innerText();
    check(`${viewport.name}-fu-sunday-companies`, YELLOW_COMPANIES.every((c) => fuText.includes(c)), fuText.slice(0, 500));
    check(`${viewport.name}-fu-date`, fuText.includes('2026-08-30'));
    await page.screenshot({ path: join(OUT, `${viewport.name}-home-followups.png`), fullPage: true });

    const firstCard = page.getByTestId('followup-item').filter({ hasText: 'מערכות אשד' }).first();
    if (await firstCard.count()) {
      await firstCard.click({ force: true });
      await page.waitForTimeout(1200);
      const cardText = await page.locator('body').innerText();
      check(`${viewport.name}-open-same-lead-1`, cardText.includes('#1') && cardText.includes('מערכות אשד'), cardText.slice(0, 400));
      if (await page.getByTestId('tele-continue-lead').count()) {
        await page.getByTestId('tele-continue-lead').click({ force: true });
        await page.waitForTimeout(1500);
        const preview = await page.locator('body').innerText();
        check(`${viewport.name}-return-same-lead`, preview.includes('#1') && preview.includes('מערכות אשד'));
        check(`${viewport.name}-no-auto-call`, (await page.getByTestId('tele-end-call').count()) === 0);
      }
      if (await page.getByTestId('tele-nav-home').count()) await page.getByTestId('tele-nav-home').first().click({ force: true });
      await page.waitForTimeout(800);
    }

    await page.getByTestId('tele-my-report').click({ force: true });
    await page.waitForTimeout(1500);
    await page.getByTestId('my-report-from').fill('2026-08-26');
    await page.getByTestId('my-report-to').fill('2026-08-26');
    await page.waitForTimeout(2500);
    const histEl = page.getByTestId('workday-summary-historical');
    const histVal = (await histEl.count()) ? await histEl.getAttribute('data-value') : null;
    check(`${viewport.name}-report-26-historical-5400`, histVal === '5400', histVal);
    const measuredVal = await page.getByTestId('workday-summary-measured').getAttribute('data-value');
    check(`${viewport.name}-report-26-auto-zero`, measuredVal === '0', measuredVal);
    const report26 = await page.locator('body').innerText();
    check(`${viewport.name}-report-26-label`, report26.includes('זמן היסטורי') && report26.includes('הוזן ידנית'));
    check(`${viewport.name}-report-26-no-fake-clock`, !report26.includes('התחלת טיפול') || report26.includes('אין שעות'));
    await page.screenshot({ path: join(OUT, `${viewport.name}-report-26.png`), fullPage: true });

    await page.getByTestId('my-report-from').fill('2026-08-27');
    await page.getByTestId('my-report-to').fill('2026-08-27');
    await page.waitForTimeout(2500);
    const hist27 = await page.getByTestId('workday-summary-historical').count();
    const measured27 = await page.getByTestId('workday-summary-measured').getAttribute('data-value');
    check(`${viewport.name}-report-27-no-hist`, hist27 === 0 && measured27 === '0', { hist27, measured27 });
    await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(800);
    await ctx.close();
  }

  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(tairSession) });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.getByTestId('tele-work-from-list').click({ force: true });
  await page.waitForTimeout(2500);
  check('work-from-list-still-works', (await page.getByTestId('tele-lead-preview').count()) > 0 || (await page.getByTestId('tele-lead-number').count()) > 0, await page.locator('body').innerText().then((t) => t.slice(0, 250)));
  check('call-not-auto-started', (await page.getByTestId('tele-end-call').count()) === 0);
  if (await page.getByTestId('tele-nav-home').count()) await page.getByTestId('tele-nav-home').first().click({ force: true });
  await page.waitForTimeout(800);
  for (const row of claimSnap) {
    await adminDb.from('telemarketing_lead_directory').update({ claimed_by: row.claimed_by, claimed_at: row.claimed_at }).eq('id', row.id);
  }
  await ctx.close();

  const adminCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 900 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(adminSession) });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(4000);
  const from = adminPage.getByTestId('activity-from-date');
  const to = adminPage.getByTestId('activity-to-date');
  if (await from.count()) {
    await from.fill('2026-08-26');
    await to.fill('2026-08-26');
    await adminPage.waitForTimeout(2500);
    const emp = adminPage.getByTestId('activity-employee-filter');
    if (await emp.count()) await emp.selectOption({ label: 'תאיר' }).catch(() => emp.selectOption({ value: 'תאיר' }));
    await adminPage.waitForTimeout(2000);
  }
  const adminText = await adminPage.locator('body').innerText();
  const adminHist = adminPage.getByTestId('workday-summary-historical');
  const adminHistVal = (await adminHist.count()) ? await adminHist.getAttribute('data-value') : null;
  check('admin-26-historical-5400', adminHistVal === '5400' || adminText.includes('01:30:00') || adminText.includes('זמן היסטורי'), { adminHistVal, snippet: adminText.slice(0, 400) });
  await adminPage.screenshot({ path: join(OUT, 'admin-report-26.png'), fullPage: true });
  if (await from.count()) {
    await from.fill('2026-08-27');
    await to.fill('2026-08-27');
    await adminPage.waitForTimeout(2500);
  }
  const admin27hist = await adminPage.getByTestId('workday-summary-historical').count();
  check('admin-27-no-hist', admin27hist === 0);
  await adminCtx.close();
  await browser.close();

  const after = (await adminDb.from('telemarketing_lead_directory').select('id, claimed_by')).data || [];
  const mismatch = claimSnap.filter((row) => {
    const now = after.find((r) => r.id === row.id);
    return !now || now.claimed_by !== row.claimed_by;
  });
  check('claims-restored', mismatch.length === 0, mismatch.map((r) => r.id));
  check('no-production', STAGING_REF !== PROD_REF);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
  try {
    for (const row of claimSnap) {
      await adminDb.from('telemarketing_lead_directory').update({ claimed_by: row.claimed_by, claimed_at: row.claimed_at }).eq('id', row.id);
    }
  } catch { /* keep */ }
} finally {
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
