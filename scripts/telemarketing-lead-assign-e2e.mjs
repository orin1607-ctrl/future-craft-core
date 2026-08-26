/**
 * Staging QA: lead assignment + claim. Does not touch Production.
 * node scripts/telemarketing-lead-assign-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-lead-assign-2026-08-26');
mkdirSync(OUT, { recursive: true });
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const AVI = { email: 'yoni133333@gmail.com', id: 'e260ae41-c144-4545-bbf3-36f1d2735180', name: 'אבי טלמיטינג' };
const ADMIN = { email: 'orin1607@gmail.com' };

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
  return { session: auth.session, client };
}

function userClient(session) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  client.auth.setSession(session);
  return client;
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
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

async function withPage(session, viewport, fn) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ locale: 'he-IL', viewport });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function completeOpenCalls(employeeId) {
  const { data } = await adminDb.from('telemarketing_calls').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of data || []) {
    await adminDb.from('telemarketing_calls').update({ status: 'completed', ended_at: new Date().toISOString(), result: 'qa-assign-cleanup' }).eq('id', row.id);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of works || []) {
    await adminDb.from('telemarketing_work_sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', row.id);
  }
}

const { count: beforeCount } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
check('directory-still-29', beforeCount === 29, { beforeCount });
const { data: numbers } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, phone, company_name').order('lead_number');
check('lead-numbers-intact', (numbers || []).some((r) => r.lead_number === '1') && (numbers || []).some((r) => r.lead_number === '29'));

const adminAuth = await sessionFor(ADMIN.email);
const tairAuth = await sessionFor(TAIR.email);
const aviAuth = await sessionFor(AVI.email);
const adminCli = userClient(adminAuth.session);
const tairCli = userClient(tairAuth.session);
const aviCli = userClient(aviAuth.session);

await completeOpenCalls(TAIR.id);
await completeOpenCalls(AVI.id);

const lead1 = numbers.find((r) => r.lead_number === '1');
const lead2 = numbers.find((r) => r.lead_number === '2');
const lead3 = numbers.find((r) => r.lead_number === '3');
const lead29 = numbers.find((r) => r.lead_number === '29');

const one = await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead1.id], p_agent_id: TAIR.id });
check('rpc-one-to-tair', !one.error && one.data?.assignedCount === 1, one.error || one.data);

const many = await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead2.id, lead3.id], p_agent_id: AVI.id });
check('rpc-many-to-avi', !many.error && many.data?.assignedCount === 2, many.error || many.data);

const tairRows = await tairCli.from('telemarketing_lead_directory').select('lead_number');
check('tair-sees-assigned-lead1', (tairRows.data || []).some((r) => r.lead_number === '1'), { count: tairRows.data?.length, err: tairRows.error?.message });
const aviRows = await aviCli.from('telemarketing_lead_directory').select('lead_number');
check('avi-rls-hides-tair-lead', !(aviRows.data || []).some((r) => r.lead_number === '1'), { numbers: (aviRows.data || []).map((r) => r.lead_number) });

const aviSteal = await aviCli.rpc('telemarketing_claim_lead', { p_lead_id: lead1.id });
check('avi-cannot-claim-tair-lead', Boolean(aviSteal.error), aviSteal.error?.message || aviSteal.data);

const aviAssign = await aviCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead1.id], p_agent_id: AVI.id });
check('agent-cannot-bulk-assign', Boolean(aviAssign.error), aviAssign.error?.message);

const transfer = await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead1.id], p_agent_id: AVI.id });
check('transfer-tair-to-avi', !transfer.error && transfer.data?.assignedCount === 1, transfer.error || transfer.data);

const { data: events } = await adminCli.from('telemarketing_lead_assignment_events').select('lead_number, previous_agent_name, new_agent_name, changed_by_name').eq('lead_id', lead1.id).order('created_at', { ascending: false }).limit(2);
check('audit-history', (events || []).length >= 1 && events[0].new_agent_name === AVI.name, events);

const fuCall = await adminCli.from('telemarketing_calls').insert({
  employee_id: TAIR.id,
  employee_name: TAIR.name,
  company_name: lead29.company_name,
  phone: lead29.phone,
  status: 'completed',
  ended_at: new Date().toISOString(),
  client_token: `qa-assign-fu-${Date.now()}`,
  created_by: adminAuth.session.user.id,
  result: 'qa-followup-keep',
}).select('id').single();
if (fuCall.error) {
  check('followup-setup', false, fuCall.error.message);
} else {
  const fu = await adminCli.from('telemarketing_followups').insert({
    call_id: fuCall.data.id,
    company_name: lead29.company_name,
    phone: lead29.phone,
    action_needed: 'QA assign follow-up keep',
    owner: TAIR.name,
    due_date: new Date().toISOString().slice(0, 10),
    status: 'open',
  }).select('id, owner').single();
  const moved = await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead29.id], p_agent_id: AVI.id });
  const { data: fuAfter } = await adminDb.from('telemarketing_followups').select('id, owner, status').eq('id', fu.data?.id).single();
  check('followup-kept-and-owner-moved', fuAfter?.status === 'open' && fuAfter?.owner === AVI.name && moved.data?.assignedCount === 1, fuAfter);
}

const busyCall = await tairCli.from('telemarketing_calls').insert({
  employee_id: TAIR.id,
  employee_name: TAIR.name,
  company_name: lead2.company_name,
  phone: lead2.phone,
  status: 'in_progress',
  client_token: `qa-assign-busy-${Date.now()}`,
  created_by: TAIR.id,
}).select('id').single();
const busyAssign = await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead2.id], p_agent_id: TAIR.id });
check('busy-skip-no-full-success', !busyAssign.error && busyAssign.data?.skippedCount >= 1 && busyAssign.data?.assignedCount === 0, busyAssign.error || busyAssign.data);
await completeOpenCalls(TAIR.id);

await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [lead1.id, lead2.id, lead3.id], p_agent_id: TAIR.id });
const tairCli2 = userClient(tairAuth.session);
const raceSame = await Promise.all([
  tairCli.rpc('telemarketing_claim_next_lead'),
  tairCli2.rpc('telemarketing_claim_next_lead'),
]);
const sameAgentIds = raceSame.map((r) => r.data?.id).filter(Boolean);
check('claim-race-same-agent-distinct', sameAgentIds.length === 2 && new Set(sameAgentIds).size === 2, sameAgentIds);
const extra = numbers.find((r) => r.lead_number === '4') || numbers.find((r) => r.lead_number === '5');
if (extra) {
  await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [extra.id], p_agent_id: AVI.id });
  const raceOther = await Promise.all([
    tairCli.rpc('telemarketing_claim_next_lead'),
    aviCli.rpc('telemarketing_claim_next_lead'),
  ]);
  const otherIds = raceOther.map((r) => r.data?.id).filter(Boolean);
  check('claim-race-two-employees', otherIds.length >= 1 && new Set(otherIds).size === otherIds.length, otherIds);
}

const { count: still29 } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
check('no-delete-29', still29 === 29, { still29 });

const uiMode = process.argv.includes('--rpc-only') ? 'rpc' : 'full';
try {
if (uiMode === 'full') {
  await withPage(adminAuth.session, { width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(5000);
    const hasAssign = await page.getByTestId('lead-assign-open').count();
    check('admin-assign-ui', hasAssign > 0, { url: page.url() });
    if (!hasAssign) {
      await page.screenshot({ path: join(OUT, 'admin-missing-assign.png'), fullPage: true });
      return;
    }
    check('import-still-there', await page.getByTestId('lead-import-panel').count() > 0);
    check('export-still-there', await page.getByTestId('lead-directory-export').count() > 0);
    await page.getByTestId('lead-filter-agent').selectOption('unassigned');
    await page.waitForTimeout(400);
    const unassignedText = await page.locator('[data-testid="lead-directory-board"]').innerText();
    check('unassigned-filter', unassignedText.includes('ללא עובד משויך') || unassignedText.includes('תוצאות מסוננות'));
    await page.getByTestId('lead-filter-agent').selectOption('all');
    await page.getByTestId('lead-select-all').click();
    await page.getByTestId('lead-assign-open').click();
    await page.getByTestId('lead-assign-agent').selectOption({ label: TAIR.name });
    await page.getByTestId('lead-assign-preview').click();
    const preview = await page.getByTestId('lead-assign-confirm-box').innerText();
    check('preview-29-tair', preview.includes('29') && preview.includes(TAIR.name), preview.slice(0, 200));
    await page.getByTestId('lead-assign-confirm').click();
    await page.waitForTimeout(4000);
    const resultText = await page.getByTestId('lead-assign-result').innerText();
    check('assign-29-result', resultText.includes('שויכו: 29') && resultText.includes('לא שויכו: 0'), resultText.slice(0, 300));
    await page.screenshot({ path: join(OUT, 'admin-assigned-29.png'), fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.getByTestId('lead-filter-agent').selectOption(TAIR.id);
    const filtered = await page.locator('[data-testid="lead-directory-board"]').innerText();
    check('filter-tair-after-refresh', filtered.includes('29') || filtered.includes(TAIR.name), filtered.slice(0, 250));
  });

  await withPage(adminAuth.session, { width: 390, height: 844 }, async (page) => {
    await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    check('mobile-assign-ui', await page.getByTestId('lead-assign-open').count() > 0);
    await page.screenshot({ path: join(OUT, 'admin-mobile.png'), fullPage: true });
  });

  await completeOpenCalls(TAIR.id);
  await withPage(tairAuth.session, { width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(5000);
    const home = await page.locator('[data-testid="telemarketing-agent-home"]').innerText();
    check('tair-home', home.includes('תאיר') || home.includes('טלמיטינג'), home.slice(0, 200));
    const board = await page.locator('[data-testid="lead-directory-board"]').innerText();
    check('tair-sees-assigned', board.includes('29 לידים') || /לידים במאגר/.test(board), board.slice(0, 250));
    const { count: tairVisible } = await tairCli.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
    check('tair-db-sees-29', tairVisible === 29, { tairVisible });
    await page.getByTestId('tele-start-call').click();
    await page.waitForTimeout(4000);
    const afterStart = await page.locator('body').innerText();
    check('start-call-takes-assigned', afterStart.includes('השיחה פעילה') || afterStart.includes('סיום שיחה'), afterStart.slice(0, 400));
    await page.screenshot({ path: join(OUT, 'tair-start-call.png'), fullPage: true });
    if (await page.getByRole('button', { name: 'סיום שיחה' }).count()) {
      await page.getByRole('button', { name: 'סיום שיחה' }).click();
      await page.waitForTimeout(1500);
    }
  });
  await completeOpenCalls(TAIR.id);

  await completeOpenCalls(AVI.id);
  await withPage(aviAuth.session, { width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    const { count: aviVisible } = await aviCli.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
    check('avi-does-not-see-tair-pool', aviVisible === 0, { aviVisible });
    await page.locator('#new-lead').getByPlaceholder('שם החברה').fill('שיחה ידנית QA');
    await page.locator('#new-lead').getByPlaceholder('טלפון').fill('03-9999999');
    await page.getByTestId('tele-start-call').click();
    await page.waitForTimeout(4000);
    const body = await page.locator('body').innerText();
    check('avi-manual-call-without-lead', body.includes('השיחה פעילה') || body.includes('סיום שיחה') || body.includes('שיחה ידנית QA'), body.slice(0, 400));
    await page.screenshot({ path: join(OUT, 'avi-manual-call.png'), fullPage: true });
    if (await page.getByRole('button', { name: 'סיום שיחה' }).count()) {
      await page.getByRole('button', { name: 'סיום שיחה' }).click();
    }
  });
  await completeOpenCalls(AVI.id);
}
} catch (e) {
  check('ui-uncaught', false, String(e.message || e).slice(0, 500));
}

const { count: finalCount } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
check('final-still-29', finalCount === 29, { finalCount });
report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
if (!report.pass) process.exit(2);
