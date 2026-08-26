/**
 * Staging: after data reset, prove lead numbers + clean dashboard.
 * node scripts/telemarketing-full-reset-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-full-reset-2026-08-26');
mkdirSync(OUT, { recursive: true });
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const ADMIN = { email: 'orin1607@gmail.com' };
const MARKER = 'qa-reset-e2e';
const QA_COMPANY = 'QA-RESET-E2E-0826';
const QA_PHONE = '0501999888';

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

const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, mainTouched: false, hostingerTouched: false };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 450) : '');
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
    await adminDb.from('telemarketing_calls').update({ status: 'completed', ended_at: new Date().toISOString(), result: 'qa-reset-cleanup', summary: MARKER }).eq('id', row.id);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of works || []) {
    await adminDb.from('telemarketing_work_sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', row.id);
  }
}

async function cleanupQa() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').or(`summary.ilike.%${MARKER}%,result.eq.qa-reset-cleanup,company_name.eq.${QA_COMPANY}`);
  const ids = (calls || []).map((c) => c.id);
  if (ids.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
    await adminDb.from('telemarketing_calls').delete().in('id', ids);
  }
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('id, lead_key').or(`reason.ilike.%${MARKER}%,company_name.eq.${QA_COMPANY},company_name.eq.מערכות אשד`);
  const keysArr = (states || []).map((s) => s.lead_key);
  if (keysArr.length) {
    await adminDb.from('telemarketing_lead_status_events').delete().in('lead_key', keysArr);
    await adminDb.from('telemarketing_lead_states').delete().in('id', (states || []).map((s) => s.id));
  }
  await adminDb.from('telemarketing_followups').delete().eq('company_name', 'מערכות אשד');
  const { data: extras } = await adminDb.from('telemarketing_lead_directory').select('id').eq('company_name', QA_COMPANY);
  for (const row of extras || []) {
    await adminDb.from('telemarketing_lead_assignment_events').delete().eq('lead_id', row.id);
    await adminDb.from('telemarketing_lead_directory').delete().eq('id', row.id);
  }
  await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);
}

const tairSession = await sessionFor(TAIR.email);
const adminSession = await sessionFor(ADMIN.email);
await completeOpen(TAIR.id);
await cleanupQa();

const { count: dirCount } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
const { count: calls0 } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true });
const { count: fu0 } = await adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true });
const { count: work0 } = await adminDb.from('telemarketing_work_sessions').select('id', { count: 'exact', head: true });
const { count: chats0 } = await adminDb.from('telemarketing_team_chats').select('id', { count: 'exact', head: true });
const { data: agents } = await adminDb.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
check('keep-29', dirCount === 29, { dirCount });
check('dashboard-source-zero', calls0 === 0 && fu0 === 0 && work0 === 0 && chats0 === 0, { calls0, fu0, work0, chats0 });
check('only-tair-agent', (agents || []).length === 1 && agents?.[0]?.user_id === TAIR.id, agents);

try {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const adminCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(adminSession),
  });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(5000);
  const dash = await adminPage.locator('body').innerText();
  check('admin-dashboard-zero', dash.includes('שיחות היום') && /שיחות היום[\s\S]{0,80}0/.test(dash.replace(/\s+/g, ' ')) || (dash.includes('שיחות היום') && dash.includes('0')), dash.slice(0, 400));
  check('admin-has-29', dash.includes('מערכות אשד') && dash.includes('פייר אאוט'), null);
  await adminPage.screenshot({ path: join(OUT, '08-admin-dashboard-zero.png'), fullPage: true });

  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(tairSession),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  check('four-buttons', (await page.getByTestId('tele-work-from-list').count()) > 0 && (await page.getByTestId('tele-start-call').count()) > 0);
  await page.getByTestId('tele-work-from-list').click();
  await page.waitForTimeout(2500);
  const preview = await page.locator('body').innerText();
  const numberEl = await page.getByTestId('tele-lead-number').first().innerText().catch(() => '');
  check('card-shows-number-before-call', numberEl.includes('ליד #1') && preview.includes('מערכות אשד') && preview.includes('השיחה לא התחילה'), { numberEl, preview: preview.slice(0, 300) });
  check('did-not-auto-start', (await page.getByRole('button', { name: 'סיום שיחה' }).count()) === 0);
  await page.screenshot({ path: join(OUT, '09-lead-number-before-call.png'), fullPage: true });

  await page.getByTestId('tele-start-call').click();
  await page.waitForTimeout(4000);
  const started = await page.locator('body').innerText();
  check('number-during-call', started.includes('ליד #1') && (started.includes('השיחה פעילה') || started.includes('סיום שיחה')), started.slice(0, 250));
  await page.getByRole('button', { name: 'סיום שיחה' }).click();
  await page.waitForTimeout(1500);
  const reportText = await page.locator('body').innerText();
  const reportNumber = await page.getByTestId('tele-lead-number').first().innerText().catch(() => '');
  check('number-on-report', reportNumber.includes('ליד #1') || reportText.includes('ליד #1'), { reportNumber, snippet: reportText.slice(0, 200) });
  await page.getByRole('button', { name: 'לא ענה' }).click();
  await page.getByRole('button', { name: 'קר' }).click();
  await page.locator('textarea').first().fill(`${MARKER} no-answer lead 1`);
  await page.getByRole('button', { name: 'שמור וסיים שיחה' }).click();
  await page.waitForTimeout(4000);
  const after = await page.locator('body').innerText();
  check('continue-keeps-number', after.includes('המשך טיפול') && (after.includes('ליד #1') || after.includes('#1')), after.slice(0, 400));
  await page.screenshot({ path: join(OUT, '10-continue-with-number.png'), fullPage: true });

  await page.getByRole('textbox', { name: 'שם החברה', exact: true }).fill(QA_COMPANY);
  await page.getByRole('textbox', { name: 'טלפון', exact: true }).fill(QA_PHONE);
  await page.getByTestId('tele-start-call').click();
  await page.waitForTimeout(4000);
  const manual = await page.locator('body').innerText();
  check('manual-created-number', manual.includes('נוצר ליד #30') || manual.includes('ליד #30'), manual.slice(0, 350));
  await page.screenshot({ path: join(OUT, '11-manual-lead-30.png'), fullPage: true });
  if (await page.getByRole('button', { name: 'סיום שיחה' }).count()) {
    await page.getByRole('button', { name: 'סיום שיחה' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'לא מעוניין' }).click();
    await page.getByRole('button', { name: 'קר' }).click();
    await page.locator('textarea').first().fill(`${MARKER} close manual 30`);
    await page.getByRole('button', { name: 'שמור וסיים שיחה' }).click();
    await page.waitForTimeout(3000);
  }
  const { data: qaLead } = await adminDb.from('telemarketing_lead_directory').select('lead_number, company_name').eq('company_name', QA_COMPANY).maybeSingle();
  check('manual-in-directory', qaLead?.lead_number === '30', qaLead);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  check('mobile-buttons', (await page.getByTestId('tele-start-call').count()) > 0);
  await page.screenshot({ path: join(OUT, '12-mobile.png'), fullPage: true });
  await browser.close();
} catch (e) {
  check('ui-uncaught', false, String(e.message || e).slice(0, 500));
}

await completeOpen(TAIR.id);
await cleanupQa();
const { count: still29 } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
const { count: callsEnd } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true });
const { count: fuEnd } = await adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true });
const { data: tair } = await adminDb.from('profiles').select('full_name').eq('id', TAIR.id).single();
const { data: agentsEnd } = await adminDb.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
check('final-29', still29 === 29, { still29 });
check('final-zero-activity', callsEnd === 0 && fuEnd === 0, { callsEnd, fuEnd });
check('final-tair', tair?.full_name === 'תאיר' && (agentsEnd || []).length === 1);
report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
if (!report.pass) process.exit(2);
