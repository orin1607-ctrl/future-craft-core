/**
 * Staging E2E: call/report/treatment clocks + super-admin per-lead report.
 * node scripts/telemarketing-treatment-timing-e2e.mjs
 * Does not reset directory 1-29. Cleans only qa-time-e2e rows.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-treatment-timing-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const ADMIN = { email: 'orin1607@gmail.com' };
const MARKER = 'qa-time-e2e';
const QA_COMPANY = 'QA-TIME-E2E-0826';
const QA_PHONE = '0501777666';
const CALL_WAIT_MS = 8000;
const REPORT_WAIT_MS = 3000;
const WORK_WAIT_MS = 4000;
const WORK_REPORT_MS = 2000;
const TOLERANCE_SEC = 5;

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  return auth.session;
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  expectedVsActual: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 500) : '');
}
function within(actual, expected, tol = TOLERANCE_SEC) {
  return Math.abs(Number(actual) - Number(expected)) <= tol;
}
function storagePayload(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}

async function completeOpen(employeeId) {
  const { data } = await adminDb.from('telemarketing_calls').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of data || []) {
    await adminDb.from('telemarketing_calls').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      result: 'qa-time-cleanup',
      summary: MARKER,
      report_ended_at: new Date().toISOString(),
    }).eq('id', row.id);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of works || []) {
    await adminDb.from('telemarketing_work_sessions').update({ status: 'completed', ended_at: new Date().toISOString(), description: MARKER }).eq('id', row.id);
  }
}

async function cleanupQa() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').or(`summary.ilike.%${MARKER}%,result.eq.qa-time-cleanup,company_name.eq.${QA_COMPANY}`);
  const ids = (calls || []).map((c) => c.id);
  if (ids.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
    await adminDb.from('telemarketing_calls').delete().in('id', ids);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').or(`company_name.eq.${QA_COMPANY},description.ilike.%${MARKER}%`);
  if (works?.length) await adminDb.from('telemarketing_work_sessions').delete().in('id', works.map((w) => w.id));
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('id, lead_key').or(`reason.ilike.%${MARKER}%,company_name.eq.${QA_COMPANY}`);
  const keysArr = (states || []).map((s) => s.lead_key);
  if (keysArr.length) {
    await adminDb.from('telemarketing_lead_status_events').delete().in('lead_key', keysArr);
    await adminDb.from('telemarketing_lead_states').delete().in('id', (states || []).map((s) => s.id));
  }
  const { data: qaLeads } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number').eq('company_name', QA_COMPANY);
  const extra = (qaLeads || []).filter((row) => !['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29'].includes(String(row.lead_number)));
  if (extra.length) {
    const extraIds = extra.map((r) => r.id);
    await adminDb.from('telemarketing_lead_assignment_events').delete().in('lead_id', extraIds);
    await adminDb.from('telemarketing_lead_directory').delete().in('id', extraIds);
  }
  await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);
}

async function fillCallReport(page, result, rating, summary) {
  await page.getByRole('button', { name: result, exact: true }).click();
  await page.getByRole('button', { name: rating, exact: true }).click();
  await page.locator('textarea').first().fill(summary);
  await page.getByTestId('tele-submit-report').click();
}

const tairSession = await sessionFor(TAIR.email);
const adminSession = await sessionFor(ADMIN.email);
await completeOpen(TAIR.id);
await cleanupQa();

const { count: dirBefore } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
check('keep-29-before', dirBefore === 29, { dirBefore });

try {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(tairSession),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const liveBuild = await page.locator('[data-tele-build]').first().getAttribute('data-tele-build');
  report.liveBuild = liveBuild;
  check('four-buttons', (await page.getByTestId('tele-start-call').count()) > 0 && (await page.getByTestId('tele-work-from-list').count()) > 0 && (await page.getByTestId('tele-start-work').count()) > 0);

  await page.getByTestId('tele-work-from-list').click();
  await page.waitForTimeout(2500);
  const preview = await page.locator('body').innerText();
  check('work-from-list-preview', (await page.getByTestId('tele-lead-preview').count()) > 0 && preview.includes('ליד #'), preview.slice(0, 300));
  await page.screenshot({ path: join(OUT, '01-preview.png'), fullPage: true });
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);

  await page.getByPlaceholder('שם החברה').fill(QA_COMPANY);
  await page.getByPlaceholder('טלפון').fill(QA_PHONE);

  const t0 = Date.now();
  await page.getByTestId('tele-start-call').click();
  await page.waitForTimeout(2500);
  check('call-started', (await page.getByRole('button', { name: 'סיום שיחה' }).count()) > 0);
  await page.waitForTimeout(CALL_WAIT_MS);
  const tCallEndClick = Date.now();
  await page.getByTestId('tele-end-call').click();
  await page.waitForTimeout(1500);
  check('report-timer-visible', (await page.getByTestId('tele-report-duration').count()) > 0);
  await page.waitForTimeout(REPORT_WAIT_MS);
  const tSubmitClick = Date.now();
  await fillCallReport(page, 'לא ענה', 'קר', `${MARKER} attempt-1 no-answer`);
  await page.waitForTimeout(4000);
  const expectedCall = Math.round((tCallEndClick - t0) / 1000);
  const expectedReport = Math.round((tSubmitClick - tCallEndClick) / 1000);

  const { data: qaLead } = await adminDb.from('telemarketing_lead_directory').select('lead_number, company_name').eq('company_name', QA_COMPANY).maybeSingle();
  const leadNumber = qaLead?.lead_number || '';
  report.qaLeadNumber = leadNumber;
  check('qa-lead-created', Number(leadNumber) >= 30, qaLead);

  const { data: attempt1 } = await adminDb.from('telemarketing_calls').select('*').eq('company_name', QA_COMPANY).ilike('summary', '%attempt-1%').maybeSingle();
  const a1 = attempt1 || {};
  const actualCall = a1.duration_seconds;
  const actualReport = a1.report_duration_seconds;
  const actualTreat = a1.treatment_duration_seconds;
  report.expectedVsActual.push({
    attempt: 1,
    expectedCall, actualCall,
    expectedReport, actualReport,
    expectedTreat: expectedCall + expectedReport,
    actualTreat,
    callEnd: a1.ended_at,
    reportStart: a1.report_started_at,
    reportEnd: a1.report_ended_at,
    treatedEnd: a1.treated_ended_at,
  });
  check('attempt1-call-duration', within(actualCall, expectedCall), { expectedCall, actualCall });
  check('attempt1-report-duration', within(actualReport, expectedReport), { expectedReport, actualReport });
  check('attempt1-treatment-sum', actualTreat === (actualCall || 0) + (actualReport || 0), { actualCall, actualReport, actualTreat });
  check('attempt1-call-end-neq-treat-end', a1.ended_at && a1.treated_ended_at && a1.ended_at !== a1.treated_ended_at, { ended: a1.ended_at, treated: a1.treated_ended_at });
  check('attempt1-result-no-answer', a1.result === 'לא ענה', a1.result);
  await page.screenshot({ path: join(OUT, '02-after-attempt1.png'), fullPage: true });

  const frozen = a1.duration_seconds;
  await page.waitForTimeout(6000);
  const { data: afterWait } = await adminDb.from('telemarketing_calls').select('duration_seconds, report_duration_seconds, treatment_duration_seconds').eq('id', a1.id).single();
  check('timer-stopped-after-submit', afterWait.duration_seconds === frozen && afterWait.treatment_duration_seconds === actualTreat, afterWait);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const afterReload = await page.locator('body').innerText();
  check('reload-no-live-timer', !afterReload.includes('השיחה פעילה'), afterReload.slice(0, 200));
  const { data: afterReloadRow } = await adminDb.from('telemarketing_calls').select('duration_seconds, treatment_duration_seconds').eq('id', a1.id).single();
  check('reload-duration-frozen', afterReloadRow.duration_seconds === frozen, afterReloadRow);

  check('continue-queue', afterReload.includes('המשך טיפול') && afterReload.includes(QA_COMPANY), afterReload.slice(0, 400));
  if (await page.getByTestId('tele-continue-lead').count()) {
    await page.getByTestId('tele-continue-lead').click();
  } else {
    await page.getByText(QA_COMPANY, { exact: false }).first().click();
    await page.waitForTimeout(500);
    if (await page.getByTestId('tele-continue-lead').count()) await page.getByTestId('tele-continue-lead').click();
  }
  await page.waitForTimeout(2000);
  const t2 = Date.now();
  await page.getByTestId('tele-start-call').click();
  await page.waitForTimeout(2500);
  await page.waitForTimeout(CALL_WAIT_MS);
  const t2End = Date.now();
  await page.getByTestId('tele-end-call').click();
  await page.waitForTimeout(1500);
  await page.waitForTimeout(REPORT_WAIT_MS);
  const t2Submit = Date.now();
  await fillCallReport(page, 'לחזור אליו', 'חם', `${MARKER} attempt-2 callback`);
  await page.waitForTimeout(4000);
  const { data: attempts } = await adminDb.from('telemarketing_calls').select('*').eq('company_name', QA_COMPANY).order('started_at', { ascending: true });
  check('two-attempts-same-lead', (attempts || []).length === 2, { count: attempts?.length, leadNumber });
  const a2 = attempts?.[1] || {};
  check('attempt2-treatment-sum', a2.treatment_duration_seconds === (a2.duration_seconds || 0) + (a2.report_duration_seconds || 0), a2);
  report.expectedVsActual.push({
    attempt: 2,
    expectedCall: Math.round((t2End - t2) / 1000),
    actualCall: a2.duration_seconds,
    expectedReport: Math.round((t2Submit - t2End) / 1000),
    actualReport: a2.report_duration_seconds,
    actualTreat: a2.treatment_duration_seconds,
  });
  await page.screenshot({ path: join(OUT, '03-after-attempt2.png'), fullPage: true });

  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.getByPlaceholder('שם החברה').fill(QA_COMPANY);
  await page.getByPlaceholder('טלפון').fill(QA_PHONE);
  const tWork = Date.now();
  await page.getByTestId('tele-start-work').click();
  await page.waitForTimeout(2000);
  await page.waitForTimeout(WORK_WAIT_MS);
  await page.getByTestId('tele-end-work').click();
  await page.waitForTimeout(1000);
  await page.waitForTimeout(WORK_REPORT_MS);
  await page.getByRole('button', { name: 'חיפוש מידע', exact: true }).click();
  await page.locator('textarea').first().fill(`${MARKER} work session`);
  await page.getByTestId('tele-submit-work').click();
  await page.waitForTimeout(3500);
  const { data: workRow } = await adminDb.from('telemarketing_work_sessions').select('*').eq('company_name', QA_COMPANY).maybeSingle();
  check('work-treatment-sum', workRow && workRow.treatment_duration_seconds === (workRow.duration_seconds || 0) + (workRow.report_duration_seconds || 0), workRow);
  check('work-has-report-clock', Boolean(workRow?.report_started_at && workRow?.report_ended_at), workRow);
  report.expectedVsActual.push({
    kind: 'work',
    expectedExec: Math.round((Date.now() - tWork) / 1000),
    actualExec: workRow?.duration_seconds,
    actualReport: workRow?.report_duration_seconds,
    actualTreat: workRow?.treatment_duration_seconds,
  });
  await page.screenshot({ path: join(OUT, '04-work.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  check('mobile-start-call', (await page.getByTestId('tele-start-call').count()) > 0);
  await page.screenshot({ path: join(OUT, '05-mobile.png'), fullPage: true });
  await browser.close();

  const adminBrowser = await chromium.launch({ headless: true, channel: 'chrome' });
  const adminCtx = await adminBrowser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(adminSession),
  });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(6000);
  await adminPage.getByTestId('activity-lead-query').fill(leadNumber || QA_COMPANY);
  await adminPage.waitForTimeout(4000);
  const adminText = await adminPage.locator('#activity-report').innerText();
  check('admin-lead-detail', (await adminPage.getByTestId('activity-lead-detail').count()) > 0, adminText.slice(0, 500));
  check('admin-two-attempts', (await adminPage.getByTestId('activity-lead-attempt-1').count()) > 0 && (await adminPage.getByTestId('activity-lead-attempt-2').count()) > 0);
  check('admin-shows-lead-number', adminText.includes(`ליד #${leadNumber}`) || adminText.includes(QA_COMPANY), adminText.slice(0, 300));
  check('admin-no-double-count-copy', adminText.includes('טיפול') && !adminText.includes('22:'), adminText.slice(0, 400));
  check('admin-dalia-unmeasured', adminText.includes('לא נמדד'));
  await adminPage.screenshot({ path: join(OUT, '06-admin-lead.png'), fullPage: true });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.screenshot({ path: join(OUT, '07-admin-mobile.png'), fullPage: true });
  check('admin-import', (await adminPage.getByTestId('lead-import-panel').count()) > 0);
  check('admin-directory', (await adminPage.getByTestId('lead-directory-board').count()) > 0);
  await adminBrowser.close();
} catch (e) {
  check('ui-uncaught', false, String(e.message || e).slice(0, 800));
}

await completeOpen(TAIR.id);
await cleanupQa();
const { count: still29 } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
const { data: leftoverCalls } = await adminDb.from('telemarketing_calls').select('id').or(`summary.ilike.%${MARKER}%,company_name.eq.${QA_COMPANY}`);
const { data: leftoverWork } = await adminDb.from('telemarketing_work_sessions').select('id').eq('company_name', QA_COMPANY);
const { data: tair } = await adminDb.from('profiles').select('full_name, is_active').eq('id', TAIR.id).single();
const { count: callsLeft } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true });
check('cleaned-qa-calls', (leftoverCalls || []).length === 0, leftoverCalls);
check('cleaned-qa-work', (leftoverWork || []).length === 0, leftoverWork);
check('final-29', still29 === 29, { still29 });
check('final-tair', tair?.full_name === 'תאיר' && tair?.is_active !== false, tair);
check('dashboard-source-empty', (callsLeft || 0) === 0, { callsLeft });
report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), expectedVsActual: report.expectedVsActual, qaLeadNumber: report.qaLeadNumber }, null, 2));
if (!report.pass) process.exit(2);
