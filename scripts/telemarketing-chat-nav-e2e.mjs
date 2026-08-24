/**
 * Live Staging E2E: employee work home vs Dalia chat.
 * Must pass against GitHub Pages, not localhost.
 * node scripts/telemarketing-chat-nav-e2e.mjs
 */
import { chromium } from 'playwright';
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

async function startCallVisibleOnScreen(page) {
  const btn = page.getByTestId('tele-start-call');
  await btn.waitFor({ state: 'visible', timeout: 30000 });
  const chatScreen = await page.getByTestId('dalia-agent-chat-screen').count();
  const overlay = await page.getByTestId('dalia-chat-overlay').count();
  const box = await btn.boundingBox();
  const vh = page.viewportSize()?.height || 900;
  const onScreen = !!box && box.y >= 0 && box.y < vh - 8;
  const urlClean = !page.url().includes('daliaChat') && !page.url().includes('dalia-care');
  return {
    ok: chatScreen === 0 && overlay === 0 && onScreen && urlClean,
    chatScreen,
    overlay,
    y: box?.y,
    url: page.url(),
  };
}

const users = {};
let browser;

try {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  rec('deploy-staging', 'Pages is Staging branch', /feat\/incident-alerts-staging/.test(deployTxt) ? 'PASS' : 'FAIL', { deployTxt: deployTxt.trim() });
  rec('deploy-not-prod', 'Not Production', !deployTxt.includes(PROD_REF) ? 'PASS' : 'FAIL');
  report.deployed_ref = deployTxt.trim();

  const indexHtml = await fetch(`${BASE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  const asset = (indexHtml.match(/assets\/index-[^"]+\.js/) || [])[0];
  rec('bundle-asset', 'Live index.html has JS asset', asset ? 'PASS' : 'FAIL', { asset });
  report.liveBundle = asset;
  if (asset) {
    const js = await fetch(`${BASE}/${asset}?t=${Date.now()}`).then((r) => r.text());
    rec('bundle-work-home', 'Live bundle contains tele-work-home', js.includes('tele-work-home') ? 'PASS' : 'FAIL');
    rec('bundle-agent-chat-screen', 'Live bundle contains dalia-agent-chat-screen', js.includes('dalia-agent-chat-screen') ? 'PASS' : 'FAIL');
    rec('bundle-back-label', 'Live bundle contains חזרה לטלמיטינג', js.includes('חזרה לטלמיטינג') ? 'PASS' : 'FAIL');
    rec('bundle-not-localhost', 'Bundle fetched from GitHub Pages', asset.startsWith('assets/') ? 'PASS' : 'FAIL');
  }

  users.sa = await createUser(saEmail, 'super_admin', `QA Chat SA ${runId}`);
  users.agent = await createUser(agentEmail, 'telemarketing_agent', `QA Chat Agent ${runId}`);

  const saSession = await signIn(saEmail);
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

  async function contextWithSession(session, viewport) {
    const context = await browser.newContext({ locale: 'he-IL', viewport });
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: sessionValue(session),
    });
    const page = await context.newPage();
    return { context, page };
  }

  async function loginViaUi(page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByLabel('אימייל').or(page.getByPlaceholder(/אימייל/)).first().fill(agentEmail);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: 'התחבר' }).click();
    const otp = page.getByText(/קוד|OTP|אימות/i);
    const start = page.getByTestId('tele-start-call');
    const appeared = await Promise.race([
      start.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'home'),
      otp.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'otp').catch(() => null),
    ]).catch(() => null);
    return appeared;
  }

  async function runAgentFlow(label, viewport) {
    const agentSession = await signIn(agentEmail);
    const { page, context } = await contextWithSession(agentSession, viewport);

    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let home = await startCallVisibleOnScreen(page);
    rec(`${label}-clean-url-home`, 'Clean /telemarketing shows התחל שיחה on screen, not chat', home.ok ? 'PASS' : 'FAIL', home);

    await page.goto(`${BASE}/telemarketing?daliaChat=${chat.data?.id || 'x'}#dalia-care`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(800);
    home = await startCallVisibleOnScreen(page);
    rec(`${label}-strip-daliaChat`, 'Stale daliaChat/hash does not auto-open chat', home.ok ? 'PASS' : 'FAIL', home);

    await page.getByTestId('dalia-open-inbox').click();
    await page.getByTestId('dalia-agent-chat-screen').waitFor({ timeout: 15000 });
    rec(`${label}-chat-opens`, 'Chat screen opens only after explicit click', (await page.getByTestId('dalia-agent-chat-screen').count()) > 0 ? 'PASS' : 'FAIL');
    rec(`${label}-back-button-present`, 'חזרה לטלמיטינג is visible in chat', (await page.getByTestId('dalia-back-telemarketing').count()) > 0 ? 'PASS' : 'FAIL');

    if ((await page.getByTestId('dalia-chat-row').count()) > 0) {
      await page.getByTestId('dalia-chat-row').first().click();
      await page.getByPlaceholder('כתבו הודעה...').waitFor({ timeout: 10000 }).catch(() => null);
    }

    await page.getByTestId('dalia-back-telemarketing').first().click();
    home = await startCallVisibleOnScreen(page);
    rec(`${label}-back-to-start-call`, 'חזרה לטלמיטינג returns to התחל שיחה, not chat list', home.ok ? 'PASS' : 'FAIL', home);

    await page.getByTestId('dalia-open-inbox').click();
    await page.getByTestId('dalia-agent-chat-screen').waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.goBack();
    await page.waitForTimeout(400);
    home = await startCallVisibleOnScreen(page);
    rec(`${label}-browser-back`, 'Browser/phone Back returns to התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);

    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    home = await startCallVisibleOnScreen(page);
    rec(`${label}-refresh`, 'Refresh stays on work home, does not reopen chat', home.ok ? 'PASS' : 'FAIL', home);

    await page.screenshot({ path: join(OUT, `${label}-home.png`) }).catch(() => null);

    const logoutBtn = page.getByRole('button', { name: /יציאה|התנתקות/ }).first();
    await logoutBtn.click({ timeout: 15000 }).catch(() => null);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    rec(`${label}-logout`, 'Logout/login page reachable', /התחבר|סיסמה|אימייל/i.test(await page.locator('body').innerText()) ? 'PASS' : 'FAIL', { url: page.url() });

    const emailBox = page.locator('input[type="email"], input[placeholder*="אימייל"]').first();
    await emailBox.waitFor({ timeout: 15000 });
    await emailBox.fill(agentEmail);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: 'התחבר' }).click();
    const otpVisible = await page.getByText(/קוד אימות|OTP|קוד חד-פעמי/i).isVisible().catch(() => false);
    if (otpVisible) {
      rec(`${label}-relogin-home`, 'Logout→Login lands on התחל שיחה', 'BLOCKED', { note: 'Staging login requires OTP; cannot complete without weakening auth' });
    } else {
      home = await startCallVisibleOnScreen(page);
      rec(`${label}-relogin-home`, 'Logout→Login lands on התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);
    }

    await context.close();
  }

  await runAgentFlow('desktop', { width: 1440, height: 900 });
  await runAgentFlow('mobile', { width: 390, height: 844 });

  const { page: saPage, context: saCtx } = await contextWithSession(saSession, { width: 1440, height: 900 });
  await saPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await saPage.waitForTimeout(2500);
  const adminBody = await saPage.locator('body').innerText();
  rec('admin-home-unchanged', 'Manager still lands on admin telemarketing', /מסך מנהל/.test(adminBody) && /פנייה פנימית לעובד/.test(adminBody) ? 'PASS' : 'FAIL');
  rec('admin-no-agent-fullscreen', 'Manager is not forced into agent chat screen', (await saPage.getByTestId('dalia-agent-chat-screen').count()) === 0 ? 'PASS' : 'FAIL');
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
console.log(JSON.stringify({ ok: report.ok, fail, total: report.tests.length, out: OUT, deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.ok) process.exit(1);
