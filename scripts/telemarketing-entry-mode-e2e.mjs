/**
 * Staging QA: agent work/inspect + admin inspect. Restores claims and deletes only QA-ENTRY-MODE rows.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-entry-mode-e2e.mjs
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
const QA_COMPANY = 'QA-ENTRY-MODE-0827';
const QA_PHONE = '0500000827';
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();

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

async function tairMeasured() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('duration_seconds, report_duration_seconds, treatment_duration_seconds, company_name').eq('employee_id', TAIR.id);
  const { data: work } = await adminDb.from('telemarketing_work_sessions').select('duration_seconds, report_duration_seconds, company_name').eq('employee_id', TAIR.id);
  const realCalls = (calls || []).filter((r) => r.company_name !== QA_COMPANY);
  const qaCalls = (calls || []).filter((r) => r.company_name === QA_COMPANY);
  const sum = (rows, keys) => rows.reduce((s, r) => s + keys.reduce((a, k) => a + Number(r[k] || 0), 0), 0);
  return {
    callCount: realCalls.length,
    callSeconds: sum(realCalls, ['duration_seconds', 'report_duration_seconds']),
    workSeconds: sum(work || [], ['duration_seconds', 'report_duration_seconds']),
    qaCallCount: qaCalls.length,
    qaCallSeconds: sum(qaCalls, ['duration_seconds', 'report_duration_seconds', 'treatment_duration_seconds']),
  };
}

async function regression() {
  const { data: dir } = await adminDb.from('telemarketing_lead_directory').select('lead_number, assigned_to, company_name');
  const rows = (dir || []).filter((r) => r.company_name !== QA_COMPANY);
  const have = new Set(rows.map((r) => String(r.lead_number)));
  const { data: hist } = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR.id).eq('work_date', '2026-08-26');
  const histSum = (hist || []).reduce((s, r) => s + Number(r.duration_seconds), 0);
  const { data: fus } = await adminDb.from('telemarketing_followups').select('company_name, due_date, due_time, call_id').eq('owner_employee_id', TAIR.id).eq('due_date', '2026-08-30').is('call_id', null).eq('status', 'open');
  return {
    dirCount: rows.length,
    has29: NUMS.every((n) => have.has(n)),
    tairAssigned: rows.filter((r) => r.assigned_to === TAIR.id && NUMS.includes(String(r.lead_number))).length,
    histSum,
    sundayFu: (fus || []).length,
    sundayCompanies: (fus || []).map((f) => f.company_name),
  };
}

async function cleanupQa() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').eq('company_name', QA_COMPANY);
  const ids = (calls || []).map((c) => c.id);
  if (ids.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
    await adminDb.from('telemarketing_calls').delete().in('id', ids);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').eq('company_name', QA_COMPANY);
  if (works?.length) await adminDb.from('telemarketing_work_sessions').delete().in('id', works.map((w) => w.id));
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('id, lead_key').eq('company_name', QA_COMPANY);
  if (states?.length) {
    await adminDb.from('telemarketing_lead_status_events').delete().in('lead_key', states.map((s) => s.lead_key));
    await adminDb.from('telemarketing_lead_states').delete().in('id', states.map((s) => s.id));
  }
  const { data: qaLeads } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number').eq('company_name', QA_COMPANY);
  const extra = (qaLeads || []).filter((row) => !NUMS.includes(String(row.lead_number)));
  if (extra.length) {
    await adminDb.from('telemarketing_lead_assignment_events').delete().in('lead_id', extra.map((r) => r.id));
    await adminDb.from('telemarketing_lead_directory').delete().in('id', extra.map((r) => r.id));
  }
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
  expectedSha: EXPECTED_SHA || null,
  liveBuild: null,
  before: null,
  afterInspect: null,
  afterWork: null,
  afterCleanup: null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

let claimSnap = [];
try {
  await cleanupQa();
  report.before = { measured: await tairMeasured(), regression: await regression() };
  check('before-29', report.before.regression.has29 && report.before.regression.dirCount === 29, report.before.regression);
  check('before-hist-5400', report.before.regression.histSum === 5400, report.before.regression.histSum);
  check('before-sunday-6', report.before.regression.sundayFu === 6, report.before.regression.sundayCompanies);

  const { data: dirRows } = await adminDb.from('telemarketing_lead_directory').select('id, claimed_by, claimed_at').in('lead_number', NUMS);
  claimSnap = dirRows || [];

  const tairSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  async function openAgent(session, viewport, mode) {
    const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
    await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(session) });
    if (mode) {
      await ctx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), { key: `tele_entry_mode_v1:${TAIR.id}`, value: mode });
    }
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
    check(`${viewport.name}-greeting-dynamic`, greet.includes(`שלום ${TAIR.name}`) && !greet.includes('שלום תאיר מזרחי'), greet.slice(0, 200));
    await page.getByTestId('tele-entry-inspect').click();
    await page.waitForTimeout(1500);
    await page.getByTestId('tele-inspect-banner').waitFor({ timeout: 15000 });
    check(`${viewport.name}-inspect-banner`, (await page.getByTestId('tele-inspect-banner').innerText()).includes('מצב בדיקה'));
    await page.getByTestId('telemarketing-agent-home').waitFor({ timeout: 15000 });
    const startBtn = page.getByTestId('tele-start-call');
    check(`${viewport.name}-start-disabled`, await startBtn.isDisabled());
    check(`${viewport.name}-list-disabled`, await page.getByTestId('tele-work-from-list').isDisabled());
    await page.getByTestId('tele-my-report').click();
    await page.waitForTimeout(1500);
    check(`${viewport.name}-report-viewable`, (await page.locator('body').innerText()).length > 20);
    if (await page.getByTestId('tele-nav-back').count()) await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${viewport.name}-inspect.png`), fullPage: true });
    await ctx.close();
  }

  report.afterInspect = { measured: await tairMeasured(), regression: await regression() };
  check('inspect-no-time', report.afterInspect.measured.callSeconds === report.before.measured.callSeconds && report.afterInspect.measured.workSeconds === report.before.measured.workSeconds && report.afterInspect.measured.qaCallCount === 0, { before: report.before.measured, after: report.afterInspect.measured });
  check('inspect-no-calls', report.afterInspect.measured.callCount === report.before.measured.callCount);

  const { ctx: workCtx, page: workPage } = await openAgent(tairSession, { width: 1280, height: 900 });
  await workPage.getByTestId('tele-entry-inspect').click();
  await workPage.waitForTimeout(1000);
  await workPage.getByTestId('tele-switch-to-work').click();
  await workPage.waitForTimeout(1500);
  check('switch-start-enabled', !(await workPage.getByTestId('tele-start-call').isDisabled()));
  check('switch-list-enabled', !(await workPage.getByTestId('tele-work-from-list').isDisabled()));
  await workPage.getByPlaceholder('שם החברה').fill(QA_COMPANY);
  await workPage.getByPlaceholder('טלפון').fill(QA_PHONE);
  await workPage.getByTestId('tele-start-call').click();
  await workPage.waitForTimeout(2500);
  check('work-call-started', (await workPage.getByTestId('tele-end-call').count()) > 0);
  await workPage.waitForTimeout(2000);
  await workPage.getByTestId('tele-end-call').click();
  await workPage.waitForTimeout(1500);
  await workPage.getByRole('button', { name: 'לא מעוניין', exact: true }).click();
  await workPage.getByRole('button', { name: 'פושר', exact: true }).click();
  await workPage.locator('textarea').first().fill('QA-ENTRY-MODE-0827 work-mode measurement proof');
  await workPage.getByTestId('tele-submit-report').click();
  await workPage.waitForTimeout(3500);
  await workPage.screenshot({ path: join(OUT, 'desktop-work-after-submit.png'), fullPage: true });
  await workCtx.close();

  report.afterWork = { measured: await tairMeasured(), regression: await regression() };
  check('work-created-qa-call', report.afterWork.measured.qaCallCount >= 1 && report.afterWork.measured.qaCallSeconds > 0, report.afterWork.measured);
  check('work-did-not-touch-real-calls', report.afterWork.measured.callCount === report.before.measured.callCount, { before: report.before.measured.callCount, after: report.afterWork.measured.callCount });

  const { ctx: listCtx, page: listPage } = await openAgent(tairSession, { width: 1280, height: 900 }, 'work');
  await listPage.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
  check('refresh-keeps-work', (await listPage.getByTestId('tele-entry-purpose').count()) === 0);
  await listPage.getByTestId('tele-work-from-list').click();
  await listPage.waitForTimeout(2500);
  check('work-from-list', (await listPage.getByTestId('tele-lead-preview').count()) > 0 || (await listPage.getByTestId('tele-lead-number').count()) > 0);
  check('work-from-list-no-auto-call', (await listPage.getByTestId('tele-end-call').count()) === 0);
  if (await listPage.getByTestId('tele-nav-home').count()) await listPage.getByTestId('tele-nav-home').first().click({ force: true });
  await listCtx.close();
  for (const row of claimSnap) {
    await adminDb.from('telemarketing_lead_directory').update({ claimed_by: row.claimed_by, claimed_at: row.claimed_at }).eq('id', row.id);
  }

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
  const adminBanner = await adminPage.getByTestId('tele-inspect-banner').innerText();
  check('admin-inspect-banner', adminBanner.includes('מצב בדיקת מנהל־על'));
  if (await adminPage.getByTestId('lead-select-all').count()) {
    await adminPage.getByTestId('lead-select-all').click();
    await adminPage.waitForTimeout(500);
  }
  check('admin-assign-disabled', await adminPage.getByTestId('lead-assign-open').isDisabled());
  check('admin-audit-panel', (await adminPage.getByTestId('tele-entry-audit').count()) > 0);
  await adminPage.screenshot({ path: join(OUT, 'admin-inspect.png'), fullPage: true });
  const tairDuringAdmin = await tairMeasured();
  check('admin-inspect-no-tair-time', tairDuringAdmin.callSeconds === report.afterWork.measured.callSeconds && tairDuringAdmin.workSeconds === report.afterWork.measured.workSeconds, tairDuringAdmin);
  await adminCtx.close();
  await browser.close();

  await cleanupQa();
  for (const row of claimSnap) {
    await adminDb.from('telemarketing_lead_directory').update({ claimed_by: row.claimed_by, claimed_at: row.claimed_at }).eq('id', row.id);
  }
  report.afterCleanup = { measured: await tairMeasured(), regression: await regression() };
  check('cleanup-qa-gone', report.afterCleanup.measured.qaCallCount === 0);
  check('after-29', report.afterCleanup.regression.has29 && report.afterCleanup.regression.dirCount === 29, report.afterCleanup.regression);
  check('after-hist-5400', report.afterCleanup.regression.histSum === 5400);
  check('after-sunday-6', report.afterCleanup.regression.sundayFu === 6 && YELLOW_COMPANIES.every((c) => report.afterCleanup.regression.sundayCompanies.includes(c)), report.afterCleanup.regression.sundayCompanies);
  check('after-real-seconds-unchanged', report.afterCleanup.measured.callSeconds === report.before.measured.callSeconds && report.afterCleanup.measured.workSeconds === report.before.measured.workSeconds, { before: report.before.measured, after: report.afterCleanup.measured });
  check('no-production', STAGING_REF !== PROD_REF);
  if (EXPECTED_SHA) {
    const live = report.liveBuild || '';
    check('live-sha', EXPECTED_SHA.startsWith(live) || live.startsWith(EXPECTED_SHA.slice(0, 7)), { EXPECTED_SHA, live });
  }
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
  try { await cleanupQa(); } catch { /* keep */ }
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
