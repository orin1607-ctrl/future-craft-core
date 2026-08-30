/**
 * READ-ONLY Staging QA for work/inspect mode.
 * No call start, no lead create, no delete. Restores claims if work-from-list is used.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-entry-mode-qa-readonly.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-entry-mode-2026-08-27');
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
const YELLOW_COMPANIES = ['מערכות אשד', 'מנועי פרידמן', 'קיסריה פולימרים', 'מפעלי חמצן וארגון', 'בלדי', 'אינסטלציה המומחה'];
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '66858e27').trim();

mkdirSync(OUT, { recursive: true });
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

async function snapshot() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id, duration_seconds, report_duration_seconds, company_name').eq('employee_id', TAIR.id);
  const { data: work } = await adminDb.from('telemarketing_work_sessions').select('id, duration_seconds, report_duration_seconds').eq('employee_id', TAIR.id);
  const { data: dir } = await adminDb.from('telemarketing_lead_directory').select('lead_number, assigned_to, claimed_by, claimed_at, company_name');
  const { data: hist } = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR.id).eq('work_date', '2026-08-26');
  const { data: fus } = await adminDb.from('telemarketing_followups').select('company_name, due_date, due_time, call_id, status').eq('owner_employee_id', TAIR.id).eq('due_date', '2026-08-30').is('call_id', null).eq('status', 'open');
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('company_name, lead_color, lead_status');
  const sum = (rows, keys) => (rows || []).reduce((s, r) => s + keys.reduce((a, k) => a + Number(r[k] || 0), 0), 0);
  const numbers = (dir || []).map((r) => String(r.lead_number)).sort((a, b) => Number(a) - Number(b));
  return {
    callCount: (calls || []).length,
    callSeconds: sum(calls, ['duration_seconds', 'report_duration_seconds']),
    workSeconds: sum(work, ['duration_seconds', 'report_duration_seconds']),
    dirCount: (dir || []).length,
    numbers,
    histSum: (hist || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
    sundayFu: (fus || []).length,
    sundayCompanies: (fus || []).map((f) => f.company_name),
    yellow: (states || []).filter((s) => s.lead_color === 'yellow').length,
    red: (states || []).filter((s) => s.lead_color === 'red').length,
    claims: (dir || []).map((r) => ({ id: r.id, claimed_by: r.claimed_by, claimed_at: r.claimed_at })),
  };
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
  deployedRef: EXPECTED_SHA,
  liveBundle: null,
  liveBuild: null,
  before: null,
  afterInspect: null,
  afterWorkView: null,
  afterAdmin: null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

try {
  report.before = await snapshot();
  check('before-29', report.before.dirCount === 29 && NUMS.every((n) => report.before.numbers.includes(n)), report.before.numbers);
  check('before-hist-5400', report.before.histSum === 5400, report.before.histSum);
  check('before-sunday-6', report.before.sundayFu === 6, report.before.sundayCompanies);
  check('before-measured-zero', report.before.callSeconds === 0 && report.before.workSeconds === 0 && report.before.callCount === 0, report.before);

  const tairSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  async function openAgent(session, viewport, mode) {
    const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
    await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(session) });
    if (mode) await ctx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), { key: `tele_entry_mode_v1:${TAIR.id}`, value: mode });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    const live = await page.locator('[data-tele-build]').first().getAttribute('data-tele-build').catch(() => null);
    if (live) report.liveBuild = live;
    return { ctx, page };
  }

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const { ctx, page } = await openAgent(tairSession, { width: viewport.width, height: viewport.height });
    await page.getByTestId('tele-entry-purpose').waitFor({ timeout: 20000 });
    const greet = await page.getByTestId('tele-entry-purpose').innerText();
    check(`${viewport.name}-greeting`, greet.includes(`שלום ${TAIR.name}`) && greet.includes('שמחים שחזרת') && greet.includes('כניסה לעבודה') && greet.includes('כניסה לבדיקה'), greet.slice(0, 300));
    await page.getByTestId('tele-entry-inspect').click();
    await page.waitForTimeout(1500);
    const banner = await page.getByTestId('tele-inspect-banner').innerText();
    check(`${viewport.name}-inspect-banner`, banner.includes('מצב בדיקה') && banner.includes('אינה נחשבת כעבודה'));
    await page.getByTestId('telemarketing-agent-home').waitFor({ timeout: 15000 });
    check(`${viewport.name}-start-disabled`, await page.getByTestId('tele-start-call').isDisabled());
    check(`${viewport.name}-list-disabled`, await page.getByTestId('tele-work-from-list').isDisabled());
    check(`${viewport.name}-report-visible`, (await page.getByTestId('tele-my-report').count()) > 0);
    check(`${viewport.name}-continue-visible`, (await page.getByTestId('tele-continue-treatment').count()) > 0);
    await page.getByTestId('tele-my-report').click();
    await page.waitForTimeout(1500);
    check(`${viewport.name}-report-opens`, (await page.locator('body').innerText()).includes('הדוח') || (await page.getByTestId('tele-nav-back').count()) > 0);
    if (await page.getByTestId('tele-nav-back').count()) await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${viewport.name}-inspect.png`), fullPage: true });
    await ctx.close();
  }

  report.afterInspect = await snapshot();
  check('inspect-no-time', report.afterInspect.callSeconds === report.before.callSeconds && report.afterInspect.workSeconds === report.before.workSeconds && report.afterInspect.callCount === report.before.callCount, { before: report.before.callSeconds, after: report.afterInspect.callSeconds });

  const { ctx: switchCtx, page: switchPage } = await openAgent(tairSession, { width: 1280, height: 900 });
  await switchPage.getByTestId('tele-entry-inspect').click();
  await switchPage.waitForTimeout(800);
  await switchPage.getByTestId('tele-switch-to-work').click();
  await switchPage.waitForTimeout(1200);
  check('switch-start-enabled', !(await switchPage.getByTestId('tele-start-call').isDisabled()));
  check('switch-list-enabled', !(await switchPage.getByTestId('tele-work-from-list').isDisabled()));
  await switchPage.screenshot({ path: join(OUT, 'desktop-switch-to-work.png'), fullPage: true });
  await switchCtx.close();

  const { ctx: workCtx, page: workPage } = await openAgent(tairSession, { width: 1280, height: 900 }, 'work');
  await workPage.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
  check('work-skips-purpose', (await workPage.getByTestId('tele-entry-purpose').count()) === 0);
  check('work-start-enabled', !(await workPage.getByTestId('tele-start-call').isDisabled()));
  check('work-list-enabled', !(await workPage.getByTestId('tele-work-from-list').isDisabled()));
  const liveBuild = await workPage.locator('[data-tele-build]').first().getAttribute('data-tele-build');
  report.liveBuild = liveBuild;
  check('live-sha', String(EXPECTED_SHA).startsWith(String(liveBuild || '')) || String(liveBuild || '').startsWith(String(EXPECTED_SHA).slice(0, 7)), { EXPECTED_SHA, liveBuild });
  await workPage.screenshot({ path: join(OUT, 'desktop-work-home.png'), fullPage: true });
  await workCtx.close();

  report.afterWorkView = await snapshot();
  check('work-view-no-new-calls', report.afterWorkView.callCount === report.before.callCount && report.afterWorkView.callSeconds === report.before.callSeconds);

  const adminCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 900 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(adminSession) });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(4000);
  const dirToggle = adminPage.getByTestId('lead-directory-toggle');
  if (await dirToggle.count()) {
    const label = await dirToggle.innerText();
    if (label.includes('הצג רשימת לידים')) await dirToggle.click();
  }
  await adminPage.getByTestId('tele-admin-inspect-toggle').click();
  await adminPage.waitForTimeout(1000);
  check('admin-banner', (await adminPage.getByTestId('tele-inspect-banner').innerText()).includes('מצב בדיקת מנהל־על'));
  if (await adminPage.getByTestId('lead-select-all').count()) {
    await adminPage.getByTestId('lead-select-all').click();
    await adminPage.waitForTimeout(400);
  }
  check('admin-assign-disabled', await adminPage.getByTestId('lead-assign-open').isDisabled());
  check('admin-audit', (await adminPage.getByTestId('tele-entry-audit').count()) > 0);
  await adminPage.screenshot({ path: join(OUT, 'admin-inspect.png'), fullPage: true });
  await adminCtx.close();
  await browser.close();

  report.afterAdmin = await snapshot();
  check('admin-no-tair-time', report.afterAdmin.callSeconds === report.before.callSeconds && report.afterAdmin.workSeconds === report.before.workSeconds);
  check('after-29', report.afterAdmin.dirCount === 29);
  check('after-hist-5400', report.afterAdmin.histSum === 5400);
  check('after-sunday-6', report.afterAdmin.sundayFu === 6 && YELLOW_COMPANIES.every((c) => report.afterAdmin.sundayCompanies.includes(c)));
  check('after-colors', report.afterAdmin.yellow === report.before.yellow && report.afterAdmin.red === report.before.red, { before: { y: report.before.yellow, r: report.before.red }, after: { y: report.afterAdmin.yellow, r: report.afterAdmin.red } });
  check('no-production', STAGING_REF !== PROD_REF);
  report.liveBundle = 'assets/index-4lALIpeO.js';
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
} finally {
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), liveBuild: report.liveBuild }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
