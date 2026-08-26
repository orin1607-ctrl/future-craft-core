/**
 * Staging QA: work-from-list shows card first; no-answer stays in continued treatment.
 * node scripts/telemarketing-continue-treatment-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-continue-treatment-2026-08-26');
mkdirSync(OUT, { recursive: true });
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const ADMIN = { email: 'orin1607@gmail.com' };
const MARKER = 'qa-continue-e2e';

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
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  rootCause:
    'Work-from-list called beginCall immediately. No-answer did not create continued-treatment unless the agent checked Follow-up.',
};
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

async function completeOpenCalls(employeeId) {
  const { data } = await adminDb.from('telemarketing_calls').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of data || []) {
    await adminDb.from('telemarketing_calls').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      result: 'qa-continue-cleanup',
      summary: MARKER,
    }).eq('id', row.id);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of works || []) {
    await adminDb.from('telemarketing_work_sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', row.id);
  }
}

async function cleanupQa() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').or(`summary.ilike.%${MARKER}%,result.eq.qa-continue-cleanup`);
  const ids = (calls || []).map((c) => c.id);
  if (ids.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
    await adminDb.from('telemarketing_calls').delete().in('id', ids);
  }
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('id, lead_key').ilike('reason', `%${MARKER}%`);
  const keysArr = (states || []).map((s) => s.lead_key);
  if (keysArr.length) {
    await adminDb.from('telemarketing_lead_status_events').delete().in('lead_key', keysArr);
    await adminDb.from('telemarketing_lead_states').delete().in('id', (states || []).map((s) => s.id));
  }
  await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);
}

const tairSession = await sessionFor(TAIR.email);
await sessionFor(ADMIN.email);
await completeOpenCalls(TAIR.id);
await cleanupQa();

const { count: dirCount } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
check('keep-29', dirCount === 29, { dirCount });

try {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(tairSession),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);

  check('four-buttons-before', (await page.getByTestId('tele-work-from-list').count()) > 0 && (await page.getByTestId('tele-start-call').count()) > 0);
  await page.getByTestId('tele-work-from-list').click();
  await page.waitForTimeout(2500);
  const preview = await page.locator('body').innerText();
  check('card-before-call', (await page.getByTestId('tele-lead-preview').count()) > 0 && preview.includes('ליד #1') && preview.includes('מערכות אשד'), preview.slice(0, 400));
  check('did-not-auto-start', !preview.includes('השיחה פעילה') && (await page.getByRole('button', { name: 'סיום שיחה' }).count()) === 0);
  await page.screenshot({ path: join(OUT, '01-card-before-call.png'), fullPage: true });

  await page.getByTestId('tele-start-call').click();
  await page.waitForTimeout(4000);
  const started = await page.locator('body').innerText();
  check('started-after-click', started.includes('השיחה פעילה') || started.includes('סיום שיחה'), started.slice(0, 250));
  await page.screenshot({ path: join(OUT, '02-call-started.png'), fullPage: true });
  await page.getByRole('button', { name: 'סיום שיחה' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'לא ענה' }).click();
  await page.getByRole('button', { name: 'קר' }).click();
  await page.locator('textarea').first().fill(`${MARKER} no-answer 1`);
  await page.getByRole('button', { name: 'שמור וסיים שיחה' }).click();
  await page.waitForTimeout(4000);
  const afterNoAnswer = await page.locator('body').innerText();
  check('stayed-in-continue', afterNoAnswer.includes('המשך טיפול') && afterNoAnswer.includes('מערכות אשד'), afterNoAnswer.slice(0, 500));
  await page.screenshot({ path: join(OUT, '03-no-answer-continue.png'), fullPage: true });

  const { data: openFu } = await adminDb.from('telemarketing_followups').select('id, status, company_name, action_needed').eq('status', 'open').ilike('company_name', '%אשד%');
  check('followup-open-after-no-answer', (openFu || []).length >= 1, openFu);

  await page.getByText('מערכות אשד', { exact: false }).first().click();
  await page.waitForTimeout(800);
  if (await page.getByTestId('tele-continue-lead').count()) {
    await page.getByTestId('tele-continue-lead').click();
  } else {
    await page.getByRole('button', { name: 'התחל המשך טיפול' }).click();
  }
  await page.waitForTimeout(2500);
  const reentry = await page.locator('body').innerText();
  check('reentry-card-not-auto-call', (await page.getByTestId('tele-lead-preview').count()) > 0 && reentry.includes('ליד #1') && !reentry.includes('השיחה פעילה'), reentry.slice(0, 400));
  await page.screenshot({ path: join(OUT, '04-reentry-card.png'), fullPage: true });

  await page.getByTestId('tele-start-call').click();
  await page.waitForTimeout(4000);
  const second = await page.locator('body').innerText();
  check('second-attempt-same-lead', second.includes('ליד #1') && (second.includes('השיחה פעילה') || second.includes('סיום שיחה')), second.slice(0, 350));
  check('history-kept', second.includes(MARKER) || second.includes('לא ענה') || second.includes('היסטורי'), second.slice(0, 350));
  await page.screenshot({ path: join(OUT, '05-second-attempt.png'), fullPage: true });
  await page.getByRole('button', { name: 'סיום שיחה' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'לא מעוניין' }).click();
  await page.getByRole('button', { name: 'קר' }).click();
  await page.locator('textarea').first().fill(`${MARKER} final close`);
  await page.getByRole('button', { name: 'שמור וסיים שיחה' }).click();
  await page.waitForTimeout(4000);

  const { data: fuAfter } = await adminDb.from('telemarketing_followups').select('id, status').in('id', (openFu || []).map((f) => f.id));
  check('closed-only-on-final', (fuAfter || []).every((f) => f.status === 'done') || (fuAfter || []).length === 0, fuAfter);
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id, result, summary').ilike('summary', `%${MARKER}%`).eq('company_name', 'מערכות אשד');
  check('two-attempts-same-company', (calls || []).length >= 2, calls);
  await page.screenshot({ path: join(OUT, '06-final-close.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  check('mobile-start-call', (await page.getByTestId('tele-start-call').count()) > 0);
  await page.screenshot({ path: join(OUT, '07-mobile.png'), fullPage: true });

  await browser.close();
} catch (e) {
  check('ui-uncaught', false, String(e.message || e).slice(0, 500));
}

await completeOpenCalls(TAIR.id);
await cleanupQa();
const { count: still29 } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
const { data: tair } = await adminDb.from('profiles').select('full_name').eq('id', TAIR.id).single();
check('final-29', still29 === 29, { still29 });
check('final-tair', tair?.full_name === 'תאיר');
report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
if (!report.pass) process.exit(2);
