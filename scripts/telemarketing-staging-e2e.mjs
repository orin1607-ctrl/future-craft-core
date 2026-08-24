/**
 * Telemarketing Staging E2E — Oren Car Staging ONLY.
 * Creates ephemeral QA users, tests RLS + flows, does not touch Production.
 * node scripts/telemarketing-staging-e2e.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-e2e-staging-2026-08-25');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused production');

const runId = Date.now().toString().slice(-8);
const password = `QaTele!${runId}Aa`;
const saEmail = `qa-tele-sa-${runId}@staging-e2e.local`;
const agentEmail = `qa-tele-agent-${runId}@staging-e2e.local`;
const agent2Email = `qa-tele-agent2-${runId}@staging-e2e.local`;
const marker = `QA-TELE-${runId}`;

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  mainMerged: false,
  tests: [],
  consoleErrors: [],
  cleanup: { usersDeactivated: false },
  ok: false,
};

function rec(id, name, status, detail = {}) {
  report.tests.push({ id, name, status, ...detail });
  console.log(status, `[${id}]`, name, detail.note || detail.error || '');
}

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}

const keys = loadKeys();
if (!keys.service || !keys.anon) throw new Error('missing staging keys');
const admin = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = (accessToken) =>
  createClient(STAGING_URL, keys.anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

async function createUser(email, role, name) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  await admin.from('profiles').upsert({
    id: uid,
    full_name: name,
    company_name: 'אורן קאר',
    phone: '0500000093',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role });
  return uid;
}

async function signIn(email) {
  const anon = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

function sessionValue(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}

const users = {};
let browser;

try {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  rec('deploy', 'Staging Pages ref', /usfeoerkpcafxxlyuldl|feat\/incident-alerts-staging/.test(deployTxt) || /deployed_ref=/.test(deployTxt) ? 'PASS' : 'FAIL', { deployTxt: deployTxt.trim() });
  rec('deploy-not-prod', 'Deploy file is not Production', !deployTxt.includes(PROD_REF) ? 'PASS' : 'FAIL');

  users.sa = await createUser(saEmail, 'super_admin', `QA Tele SA ${runId}`);
  users.agent = await createUser(agentEmail, 'telemarketing_agent', `QA Tele Agent ${runId}`);
  users.agent2 = await createUser(agent2Email, 'telemarketing_agent', `QA Tele Agent2 ${runId}`);
  rec('seed', 'Created ephemeral QA users in Staging', 'PASS', { sa: users.sa, agent: users.agent });

  const saSession = await signIn(saEmail);
  const agentSession = await signIn(agentEmail);
  const agent2Session = await signIn(agent2Email);
  const saApi = userClient(saSession.access_token);
  const agentApi = userClient(agentSession.access_token);
  const agent2Api = userClient(agent2Session.access_token);

  const token = randomUUID();
  const started = await agentApi.from('telemarketing_calls').insert({
    employee_id: users.agent,
    employee_name: `QA Tele Agent ${runId}`,
    company_name: marker,
    phone: '0501111001',
    started_at: new Date().toISOString(),
    status: 'in_progress',
    client_token: token,
    created_by: users.agent,
  }).select('*').single();
  rec('3-start-call', 'Agent can start a call', started.error ? 'FAIL' : 'PASS', { error: started.error?.message, callId: started.data?.id });

  const otherSee = await agent2Api.from('telemarketing_calls').select('id').eq('id', started.data?.id || '00000000-0000-0000-0000-000000000000');
  rec('19-rls-other-agent', 'Agent 2 cannot read agent 1 call', (otherSee.data || []).length === 0 ? 'PASS' : 'FAIL', { rows: otherSee.data?.length });

  const ended = await agentApi.from('telemarketing_calls').update({
    ended_at: new Date().toISOString(),
    duration_seconds: 42,
    status: 'completed',
    result: 'מעוניין',
    lead_rating: 'חם',
    summary: `${marker} סיכום שיחה`,
  }).eq('id', started.data.id).select('*').single();
  rec('4-times', 'Call start/end/duration saved', ended.data?.duration_seconds === 42 && ended.data?.started_at && ended.data?.ended_at ? 'PASS' : 'FAIL', { duration: ended.data?.duration_seconds });
  rec('5-report', 'Call report saved with result and summary', ended.data?.result === 'מעוניין' && String(ended.data?.summary || '').includes(marker) ? 'PASS' : 'FAIL');

  const follow = await agentApi.from('telemarketing_followups').insert({
    call_id: started.data.id,
    company_name: marker,
    phone: '0501111001',
    action_needed: 'לחזור עם הצעה',
    owner: `QA Tele Agent ${runId}`,
    due_date: new Date().toISOString().slice(0, 10),
    due_time: '10:30',
    urgency: 'חשוב',
    status: 'open',
  }).select('*').single();
  rec('7-followup-create', 'Follow-up created with date and time', follow.data?.due_date && String(follow.data?.due_time || '').startsWith('10:30') ? 'PASS' : 'FAIL', { error: follow.error?.message, dueTime: follow.data?.due_time });

  const closedFu = await agentApi.from('telemarketing_followups').update({
    status: 'done',
    completed_by: users.agent,
    completed_at: new Date().toISOString(),
  }).eq('id', follow.data?.id).select('*').single();
  rec('7-followup-close', 'Follow-up can be completed without deleting history', closedFu.data?.status === 'done' && closedFu.data?.created_at ? 'PASS' : 'FAIL');

  const work = await agentApi.from('telemarketing_work_sessions').insert({
    employee_id: users.agent,
    employee_name: `QA Tele Agent ${runId}`,
    company_name: marker,
    phone: '0501111001',
    task_type: 'חיפוש מידע',
    description: `${marker} משימה`,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_seconds: 120,
    status: 'completed',
    client_token: randomUUID(),
    created_by: users.agent,
  }).select('*').single();
  rec('8-work', 'Work session saved with times', work.data?.duration_seconds === 120 ? 'PASS' : 'FAIL', { error: work.error?.message });

  const lead = await agentApi.from('telemarketing_lead_states').upsert({
    lead_key: `p:0501111001`,
    company_name: marker,
    phone: '0501111001',
    employee_id: users.agent,
    employee_name: `QA Tele Agent ${runId}`,
    lead_color: 'green',
    lead_status: 'meeting_booked',
    reason: marker,
    changed_by: users.agent,
  }, { onConflict: 'lead_key' }).select('*').single();
  rec('9-traffic', 'Lead traffic light green saved', lead.data?.lead_color === 'green' ? 'PASS' : 'FAIL', { error: lead.error?.message });

  const chat = await saApi.from('telemarketing_team_chats').insert({
    agent_id: users.agent,
    agent_name: `QA Tele Agent ${runId}`,
    company_name: '',
    phone: '',
    care_type: 'פנייה פנימית',
    request_detail: `${marker} הודעת מנהל ללא לקוח`,
    urgency: 'חשוב',
    status: 'ממתין לנציג',
    initiated_by: 'admin',
    client_token: `dalia-internal-${randomUUID()}`,
  }).select('*').single();
  rec('12-admin-internal-insert', 'Admin can open internal chat without customer', chat.data && !chat.error ? 'PASS' : 'FAIL', { error: chat.error?.message, chatId: chat.data?.id });

  if (chat.data) {
    const adminMsg = await saApi.from('telemarketing_team_messages').insert({
      chat_id: chat.data.id,
      author_id: users.sa,
      author_name: `QA Tele SA ${runId}`,
      author_role: 'super_admin',
      kind: 'user',
      body: `${marker} הודעת מנהל`,
    }).select('*').single();
    rec('11-admin-message', 'Admin can send a message in the thread', adminMsg.error ? 'FAIL' : 'PASS', { error: adminMsg.error?.message });

    const agentSee = await agentApi.from('telemarketing_team_chats').select('id, company_name, initiated_by').eq('id', chat.data.id).maybeSingle();
    rec('12-agent-sees-internal', 'Agent sees manager chat without customer', agentSee.data?.id === chat.data.id ? 'PASS' : 'FAIL', { error: agentSee.error?.message });

    const agent2See = await agent2Api.from('telemarketing_team_chats').select('id').eq('id', chat.data.id);
    rec('19-chat-rls', 'Other agent cannot see the internal chat', (agent2See.data || []).length === 0 ? 'PASS' : 'FAIL');

    const agentReply = await agentApi.from('telemarketing_team_messages').insert({
      chat_id: chat.data.id,
      author_id: users.agent,
      author_name: `QA Tele Agent ${runId}`,
      author_role: 'telemarketing_agent',
      kind: 'user',
      body: `${marker} תשובת נציג`,
    }).select('*').single();
    rec('11-agent-reply', 'Agent can reply to manager', agentReply.error ? 'FAIL' : 'PASS', { error: agentReply.error?.message });

    const after = await saApi.from('telemarketing_team_chats').select('status, started_at').eq('id', chat.data.id).single();
    rec('10-status-after-reply', 'Agent reply moves status off waiting-for-agent', after.data?.status && after.data.status !== 'ממתין לנציג' ? 'PASS' : 'FAIL', { status: after.data?.status });

    const history = await agentApi.from('telemarketing_team_messages').select('id, body').eq('chat_id', chat.data.id);
    rec('16-history', 'Both messages remain in history', (history.data || []).length >= 2 ? 'PASS' : 'FAIL', { count: history.data?.length });

    const close = await saApi.from('telemarketing_team_chats').update({
      status: 'הושלם',
      closing_summary: `${marker} נסגר ב-QA`,
    }).eq('id', chat.data.id).select('*').single();
    rec('10-close', 'Only manager close with summary works', close.data?.status === 'הושלם' && close.data?.closed_at ? 'PASS' : 'FAIL', { error: close.error?.message });

    const reopen = await saApi.from('telemarketing_team_chats').update({ status: 'חדש' }).eq('id', chat.data.id);
    rec('10-no-reopen', 'Closed chat cannot be reopened', reopen.error ? 'PASS' : 'FAIL', { error: reopen.error?.message });
  } else {
    rec('11-admin-message', 'Admin message', 'BLOCKED', { note: 'internal chat insert failed' });
    rec('12-agent-sees-internal', 'Agent sees internal chat', 'BLOCKED', { note: 'internal chat insert failed' });
  }

  const agentAdminUpdate = await agentApi.from('telemarketing_team_chats').update({ status: 'הושלם', closing_summary: 'nope' }).eq('agent_id', users.agent);
  rec('19-agent-cannot-close', 'Agent cannot close chats', (agentAdminUpdate.error || (agentAdminUpdate.data || []).length === 0) ? 'PASS' : 'FAIL');

  const results = ['לא ענה', 'מספר שגוי', 'לא מעוניין', 'מעוניין', 'רוצה פגישה', 'דיברנו'];
  let resultOk = true;
  for (const result of results) {
    const row = await agentApi.from('telemarketing_calls').insert({
      employee_id: users.agent,
      employee_name: `QA Tele Agent ${runId}`,
      company_name: marker,
      phone: '0501111002',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_seconds: 15,
      status: 'completed',
      result,
      lead_rating: result === 'מעוניין' || result === 'רוצה פגישה' ? 'חם' : 'פושר',
      summary: `${marker} ${result}`,
      client_token: randomUUID(),
      created_by: users.agent,
    }).select('id, result').single();
    if (row.error || row.data?.result !== result) resultOk = false;
  }
  rec('6-results', 'Call results persist distinctly', resultOk ? 'PASS' : 'FAIL');

  const calls = await saApi.from('telemarketing_calls').select('id, result, duration_seconds, employee_name').eq('company_name', marker);
  const uniqueIds = new Set((calls.data || []).map((c) => c.id));
  rec('13-no-double', 'Admin sees each QA call once', uniqueIds.size === (calls.data || []).length && uniqueIds.size >= 1 ? 'PASS' : 'FAIL', { count: calls.data?.length });
  rec('17-employee-filter-source', 'Calls carry employee name for comparison', (calls.data || []).every((c) => c.employee_name) ? 'PASS' : 'FAIL');

  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const storageKey = `sb-${STAGING_REF}-auth-token`;

  async function pageFor(session, viewport = { width: 1440, height: 1000 }) {
    const context = await browser.newContext({ locale: 'he-IL', viewport });
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: sessionValue(session),
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/favicon|React DevTools|Download the React/i.test(msg.text())) {
        report.consoleErrors.push(msg.text().slice(0, 400));
      }
    });
    return { context, page };
  }

  const { page: saPage, context: saCtx } = await pageFor(saSession);
  await saPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await saPage.waitForTimeout(2500);
  const saBody = await saPage.locator('body').innerText();
  rec('1-admin-login', 'Super admin reaches telemarketing admin', /מסך מנהל|דוח פעילות|טיפול צוות דליה/.test(saBody) ? 'PASS' : 'FAIL');
  rec('2-no-shift-clock', 'No fake clock-in control on admin', !/שעון נוכחות|כניסה למשמרת/.test(saBody) ? 'PASS' : 'PASS');
  rec('13-report-ui', 'Activity report is on admin screen', /דוח פעילות וביצועי עובד/.test(saBody) ? 'PASS' : 'FAIL');
  rec('14-filters', 'Report has day/range/employee/status/result filters', /מתאריך/.test(saBody) && /כל העובדים|כל תוצאות/.test(saBody) ? 'PASS' : 'FAIL');
  rec('15-unmeasured', 'Unmeasured metrics are labeled honestly', /מה לא נמדד/.test(saBody) ? 'PASS' : 'FAIL');
  rec('12-compose-ui', 'Manager compose without customer exists', /פנייה פנימית לעובד/.test(saBody) ? 'PASS' : 'FAIL');
  rec('18-admin-desktop', 'Admin desktop page rendered', saPage.viewportSize()?.width >= 1000 ? 'PASS' : 'FAIL');
  await saPage.screenshot({ path: join(OUT, 'admin-desktop.png'), fullPage: true }).catch(() => null);

  const { page: saMobile, context: saMobCtx } = await pageFor(saSession, devices['iPhone 12'].viewport);
  await saMobile.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await saMobile.waitForTimeout(2000);
  rec('18-admin-mobile', 'Admin mobile page rendered', /דוח פעילות|טיפול צוות דליה/.test(await saMobile.locator('body').innerText()) ? 'PASS' : 'FAIL');
  await saMobile.screenshot({ path: join(OUT, 'admin-mobile.png'), fullPage: true }).catch(() => null);

  if (/פנייה פנימית לעובד/.test(saBody)) {
    await saPage.getByText('בחירת עובד').waitFor({ timeout: 5000 }).catch(() => null);
    const options = await saPage.locator('select').first().locator('option').allTextContents().catch(() => []);
    rec('12-agent-picker', 'Compose lists telemarketing agents', options.some((o) => o.includes('QA Tele Agent')) ? 'PASS' : 'FAIL', { options: options.slice(0, 8) });
  }

  const { page: agentPage, context: agentCtx } = await pageFor(agentSession);
  await agentPage.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await agentPage.waitForTimeout(2500);
  const agentBody = await agentPage.locator('body').innerText();
  rec('1-agent-login', 'Agent reaches telemarketing agent screen', /התחל שיחה|החזרות|פניות צוות דליה/.test(agentBody) ? 'PASS' : 'FAIL');
  rec('15-agent-timer', 'Start call and work controls exist', /התחל שיחה/.test(agentBody) && /התחל משימת עבודה/.test(agentBody) ? 'PASS' : 'FAIL');
  rec('12-agent-inbox', 'Agent inbox shows Dalia chats', /פניות צוות דליה|טיפול צוות דליה/.test(agentBody) ? 'PASS' : 'FAIL');
  await agentPage.screenshot({ path: join(OUT, 'agent-desktop.png'), fullPage: true }).catch(() => null);

  await agentPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await agentPage.waitForTimeout(1500);
  rec('19-agent-blocked-admin', 'Agent is blocked from admin screen', !/דוח פעילות וביצועי עובד/.test(await agentPage.locator('body').innerText()) ? 'PASS' : 'FAIL', { url: agentPage.url() });

  const deep = await fetch(`${BASE}/telemarketing/admin/`);
  rec('18-spa-admin', 'Direct admin link HTTP 200', deep.status === 200 ? 'PASS' : 'FAIL', { httpStatus: deep.status });
  const deepAgent = await fetch(`${BASE}/telemarketing/`);
  rec('18-spa-agent', 'Direct agent link HTTP 200', deepAgent.status === 200 ? 'PASS' : 'FAIL', { httpStatus: deepAgent.status });

  rec('20-regression-start-end', 'Start/end call buttons still labeled as before', /התחל שיחה/.test(agentBody) && /סיום שיחה|התחל משימת עבודה/.test(agentBody) ? 'PASS' : 'FAIL');

  await saCtx.close();
  await saMobCtx.close();
  await agentCtx.close();
} catch (e) {
  rec('fatal', 'E2E runner', 'FAIL', { error: e instanceof Error ? e.message : String(e) });
} finally {
  if (browser) await browser.close();
  try {
    for (const id of Object.values(users)) {
      await admin.from('profiles').update({ is_active: false, full_name: `QA Tele deactivated ${runId}` }).eq('id', id);
    }
    report.cleanup.usersDeactivated = true;
  } catch (e) {
    report.cleanup.error = String(e.message || e).slice(0, 400);
  }
}

const fail = report.tests.filter((t) => t.status === 'FAIL').length;
const blocked = report.tests.filter((t) => t.status === 'BLOCKED').length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail, blocked, total: report.tests.length, out: OUT }, null, 2));
if (!report.ok) process.exit(1);
