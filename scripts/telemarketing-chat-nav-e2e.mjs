/**
 * Staging E2E: agent home vs Dalia chat overlay + back navigation.
 * Staging / telemarketing only. Does not touch Production.
 * node scripts/telemarketing-chat-nav-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-chat-nav-2026-08-25');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused production');

const runId = Date.now().toString().slice(-8);
const password = `QaChat!${runId}Aa`;
const saEmail = `qa-chat-sa-${runId}@staging-e2e.local`;
const agentEmail = `qa-chat-agent-${runId}@staging-e2e.local`;
const marker = `QA-CHAT-NAV-${runId}`;

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  mainMerged: false,
  tests: [],
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

async function createUser(email, role, name) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  await admin.from('profiles').upsert({
    id: uid,
    full_name: name,
    company_name: 'אורן קאר',
    phone: '0500000094',
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

async function isHome(page) {
  const start = await page.getByTestId('tele-start-call').count().catch(() => 0);
  const overlay = await page.getByTestId('dalia-chat-overlay').count().catch(() => 0);
  const heading = await page.getByTestId('telemarketing-agent-home').count().catch(() => 0);
  return start > 0 && overlay === 0 && heading > 0;
}

async function isChatOpen(page) {
  const overlay = await page.getByTestId('dalia-chat-overlay').count().catch(() => 0);
  const back = await page.getByTestId('dalia-back-telemarketing').count().catch(() => 0);
  return overlay > 0 && back > 0;
}

const users = {};
let browser;

try {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  rec('deploy-staging', 'Pages is Staging branch', /feat\/incident-alerts-staging/.test(deployTxt) ? 'PASS' : 'FAIL', { deployTxt: deployTxt.trim() });
  rec('deploy-not-prod', 'Not Production', !deployTxt.includes(PROD_REF) ? 'PASS' : 'FAIL');
  report.deployed_ref = deployTxt.trim();

  users.sa = await createUser(saEmail, 'super_admin', `QA Chat SA ${runId}`);
  users.agent = await createUser(agentEmail, 'telemarketing_agent', `QA Chat Agent ${runId}`);

  const saSession = await signIn(saEmail);
  const agentSession = await signIn(agentEmail);
  const saApi = createClient(STAGING_URL, keys.anon, {
    global: { headers: { Authorization: `Bearer ${saSession.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const chat = await saApi.from('telemarketing_team_chats').insert({
    agent_id: users.agent,
    agent_name: `QA Chat Agent ${runId}`,
    company_name: '',
    phone: '',
    care_type: 'פנייה פנימית',
    request_detail: `${marker} nav`,
    urgency: 'רגיל',
    status: 'ממתין לנציג',
    initiated_by: 'admin',
    client_token: `dalia-nav-${randomUUID()}`,
  }).select('id').single();
  rec('seed-chat', 'Seed manager→agent chat', chat.error ? 'FAIL' : 'PASS', { error: chat.error?.message, chatId: chat.data?.id });
  if (chat.data?.id) {
    await saApi.from('telemarketing_team_messages').insert({
      chat_id: chat.data.id,
      author_id: users.sa,
      author_name: `QA Chat SA ${runId}`,
      author_role: 'super_admin',
      kind: 'user',
      body: `${marker} hello`,
    });
  }

  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const storageKey = `sb-${STAGING_REF}-auth-token`;

  async function pageFor(session, viewport = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ locale: 'he-IL', viewport });
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: sessionValue(session),
    });
    const page = await context.newPage();
    return { context, page };
  }

  async function runAgentFlow(label, viewport) {
    const { page, context } = await pageFor(agentSession, viewport);
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByTestId('tele-start-call').waitFor({ timeout: 30000 });
    rec(`${label}-login-home`, 'Login/open lands on agent telemarketing home, not chat overlay', (await isHome(page)) ? 'PASS' : 'FAIL', {
      url: page.url(),
      overlay: await page.getByTestId('dalia-chat-overlay').count(),
    });
    rec(`${label}-no-auto-thread`, 'Thread send box is not open on arrival', (await page.getByPlaceholder('כתבו הודעה...').count()) === 0 ? 'PASS' : 'FAIL');

    await page.getByTestId('dalia-toggle-inbox').click();
    await page.getByTestId('dalia-chat-row').first().waitFor({ timeout: 15000 });
    rec(`${label}-inbox-not-thread`, 'Opening the inbox list does not open a thread', (await isHome(page)) || (await page.getByTestId('dalia-chat-overlay').count()) === 0 ? 'PASS' : 'FAIL');

    await page.getByTestId('dalia-chat-row').first().click();
    await page.getByTestId('dalia-chat-overlay').waitFor({ timeout: 15000 });
    rec(`${label}-open-chat`, 'Entering a chat from the list opens the thread', (await isChatOpen(page)) ? 'PASS' : 'FAIL');
    rec(`${label}-back-button`, 'Chat has חזרה לטלמיטינג', (await page.getByTestId('dalia-back-telemarketing').count()) > 0 ? 'PASS' : 'FAIL');
    rec(`${label}-back-agent-home-label`, 'Chat has חזרה למסך העובד', (await page.getByTestId('dalia-back-agent-home').count()) > 0 ? 'PASS' : 'FAIL');

    await page.getByTestId('dalia-back-telemarketing').first().click();
    await page.getByTestId('tele-start-call').waitFor({ timeout: 15000 });
    rec(`${label}-back-button-home`, 'Back button returns to agent home / inbox, not stuck in chat', (await isHome(page)) || (await page.getByTestId('dalia-chat-overlay').count()) === 0 ? 'PASS' : 'FAIL', { url: page.url() });
    rec(`${label}-return-inbox`, 'Return keeps inbox available', (await page.getByTestId('dalia-toggle-inbox').count()) > 0 || (await page.getByTestId('dalia-chat-row').count()) > 0 ? 'PASS' : 'FAIL');

    if ((await page.getByTestId('dalia-chat-row').count()) === 0) {
      await page.getByTestId('dalia-toggle-inbox').click();
    }
    await page.getByTestId('dalia-chat-row').first().click();
    await page.getByTestId('dalia-chat-overlay').waitFor({ timeout: 15000 });
    rec(`${label}-reenter`, 'Can enter the same chat again', (await isChatOpen(page)) ? 'PASS' : 'FAIL');

    await page.goBack();
    await page.getByTestId('tele-start-call').waitFor({ timeout: 15000 });
    rec(`${label}-browser-back`, 'Browser/phone Back closes chat and is not stuck', (await page.getByTestId('dalia-chat-overlay').count()) === 0 ? 'PASS' : 'FAIL', { url: page.url() });

    await page.getByRole('button', { name: 'יציאה' }).click();
    await page.waitForTimeout(1500);
    rec(`${label}-logout`, 'Logout leaves the agent session', /login|התחבר|סיסמה/i.test(await page.locator('body').innerText()) || !page.url().includes('/telemarketing') ? 'PASS' : 'FAIL', { url: page.url() });
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true }).catch(() => null);
    await context.close();
  }

  await runAgentFlow('desktop', { width: 1440, height: 900 });
  await runAgentFlow('mobile', devices['iPhone 12'].viewport);

  const { page: saPage, context: saCtx } = await pageFor(saSession, { width: 1440, height: 900 });
  await saPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await saPage.waitForTimeout(2500);
  const adminBody = await saPage.locator('body').innerText();
  rec('admin-home-unchanged', 'Manager still lands on admin telemarketing, not agent chat', /מסך מנהל/.test(adminBody) && /פנייה פנימית לעובד/.test(adminBody) ? 'PASS' : 'FAIL');
  rec('admin-no-auto-overlay', 'Manager does not auto-open a chat thread', (await saPage.getByTestId('dalia-chat-overlay').count()) === 0 ? 'PASS' : 'FAIL');
  rec('admin-compose-still-there', 'Manager compose without customer still present', /פנייה פנימית לעובד/.test(adminBody) ? 'PASS' : 'FAIL');

  const adminRows = saPage.getByTestId('dalia-chat-row');
  if ((await adminRows.count()) > 0) {
    await adminRows.first().click();
    await saPage.getByTestId('dalia-chat-overlay').waitFor({ timeout: 15000 });
    rec('admin-open-chat', 'Manager can still open a thread', (await saPage.getByTestId('dalia-chat-overlay').count()) > 0 ? 'PASS' : 'FAIL');
    rec('admin-back-label', 'Manager back stays on the list, not agent home', (await saPage.getByRole('button', { name: 'חזרה לרשימת הפניות' }).count()) > 0 ? 'PASS' : 'FAIL');
    await saPage.getByTestId('dalia-back-telemarketing').first().click();
    await saPage.waitForTimeout(800);
    rec('admin-back-stays-admin', 'Manager back returns to admin screen', /מסך מנהל/.test(await saPage.locator('body').innerText()) && (await saPage.getByTestId('dalia-chat-overlay').count()) === 0 ? 'PASS' : 'FAIL', { url: saPage.url() });
  } else {
    rec('admin-open-chat', 'Manager can still open a thread', 'FAIL', { note: 'no chat rows on admin' });
  }
  await saPage.screenshot({ path: join(OUT, 'admin-desktop.png'), fullPage: true }).catch(() => null);
  await saCtx.close();
} catch (e) {
  rec('fatal', 'E2E runner', 'FAIL', { error: e instanceof Error ? e.message : String(e) });
} finally {
  if (browser) await browser.close();
  try {
    for (const id of Object.values(users)) {
      await admin.from('profiles').update({ is_active: false, full_name: `QA Chat deactivated ${runId}` }).eq('id', id);
    }
  } catch (e) {
    report.cleanupError = String(e.message || e).slice(0, 400);
  }
}

const fail = report.tests.filter((t) => t.status === 'FAIL').length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail, total: report.tests.length, out: OUT, deployed_ref: report.deployed_ref }, null, 2));
if (!report.ok) process.exit(1);
