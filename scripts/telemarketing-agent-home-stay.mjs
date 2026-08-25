/**
 * Live Pages: employee home must stay on Start Call.
 * Unread/open purple request = badge only. Chat opens only on explicit 🟣 click.
 * node scripts/telemarketing-agent-home-stay.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-home-stay-2026-08-25');
mkdirSync(OUT, { recursive: true });
const UNREAD_TOKEN = 'dalia-staging-unread-keep-home';

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}

const keys = loadKeys();
const admin = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  return auth.session;
}

async function findActiveAgent() {
  const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
  for (const r of roles || []) {
    const { data: profile } = await admin.from('profiles').select('id, full_name, is_active').eq('id', r.user_id).maybeSingle();
    if (!profile || profile.is_active === false) continue;
    const { data: u } = await admin.auth.admin.getUserById(profile.id);
    if (!u?.user?.email) continue;
    const { data: work } = await admin.from('telemarketing_work_sessions').select('id, status, ended_at').eq('employee_id', profile.id).eq('status', 'in_progress').limit(1);
    const { data: chats } = await admin.from('telemarketing_team_chats').select('id, status').eq('agent_id', profile.id).in('status', ['חדש', 'בטיפול', 'ממתין לנציג', 'ממתין ללקוח']);
    return {
      id: profile.id,
      email: u.user.email,
      name: profile.full_name,
      pendingWork: work?.[0] || null,
      openChats: chats || [],
    };
  }
  return null;
}

async function ensureUnread(agent) {
  const { data: existing } = await admin.from('telemarketing_team_chats').select('id, status').eq('client_token', UNREAD_TOKEN).maybeSingle();
  let chatId = existing?.id;
  if (!chatId) {
    const { data: admins } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
    const authorId = admins?.[0]?.user_id || agent.id;
    const { data: chat, error } = await admin.from('telemarketing_team_chats').insert({
      agent_id: agent.id,
      agent_name: agent.name,
      company_name: '',
      care_type: 'פנייה פנימית',
      request_detail: 'הודעת מנהל לבדיקת Unread — אין לפתוח Chat אוטומטית',
      urgency: 'רגיל',
      status: 'ממתין לנציג',
      initiated_by: 'admin',
      client_token: UNREAD_TOKEN,
      last_message_at: new Date().toISOString(),
      last_message_preview: 'הודעת מנהל לבדיקת Unread',
    }).select('id').single();
    if (error) throw error;
    chatId = chat.id;
    await admin.from('telemarketing_team_messages').insert({
      chat_id: chatId,
      author_id: authorId,
      author_name: 'מנהל',
      author_role: 'super_admin',
      kind: 'user',
      body: 'הודעת מנהל לבדיקת Unread — Badge בלבד, בלי פתיחת Chat',
    });
  }
  return chatId;
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

async function snap(page) {
  return page.evaluate(() => {
    const body = document.body ? document.body.innerText : '';
    const start = !!document.querySelector('[data-testid="tele-start-call"]');
    const chat = !!document.querySelector('[data-testid="dalia-agent-chat-screen"]');
    const back = !!document.querySelector('[data-testid="dalia-back-telemarketing"]');
    const work = !!document.querySelector('[data-testid="tele-work-report"]') || body.includes('דיווח משימת עבודה');
    const inbox = !!document.querySelector('[data-testid="dalia-open-inbox"]') || body.includes('פניות צוות דליה');
    const purpleFields = !!document.querySelector('[data-testid="tele-dalia-care-fields"]');
    const build = document.querySelector('[data-tele-build]')?.getAttribute('data-tele-build') || '';
    return {
      url: location.href,
      start,
      chat,
      back,
      work,
      inbox,
      purpleFields,
      bodyHasStart: body.includes('התחל שיחה'),
      bodyHasBack: body.includes('חזרה לטלמיטינג'),
      build,
    };
  });
}

async function watch(page, seconds) {
  const samples = [];
  const startAt = Date.now();
  while (Date.now() - startAt < seconds * 1000) {
    samples.push({ t: Date.now() - startAt, ...(await snap(page)) });
    await page.waitForTimeout(500);
  }
  return samples;
}

function summarize(samples) {
  const firstStart = samples.findIndex((s) => s.bodyHasStart || s.start);
  const anyChat = samples.some((s) => s.chat || s.bodyHasBack);
  const last = samples[samples.length - 1];
  const startThenLost = firstStart >= 0 && last && !last.start && !last.bodyHasStart;
  return { firstStartAtMs: firstStart >= 0 ? samples[firstStart].t : null, anyChat, startThenLost, last };
}

const report = { at: new Date().toISOString(), pass: false, checks: [], runs: [] };
const agent = await findActiveAgent();
if (!agent) throw new Error('no active telemarketing agent');
const unreadChatId = await ensureUnread(agent);
report.agent = { name: agent.name, pendingWork: agent.pendingWork, openChatsBefore: agent.openChats.length, unreadChatId };
console.log('agent', report.agent);

const session = await sessionFor(agent.email);
const storageKey = `sb-${STAGING_REF}-auth-token`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function withAgentPage(viewport, url, fn) {
  const context = await browser.newContext({ locale: 'he-IL', viewport });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: storageKey,
    value: sessionValue(session),
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try {
    return await fn(page, context);
  } finally {
    await context.close();
  }
}

function check(id, ok, detail) {
  report.checks.push({ id, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', id, detail || '');
  return ok;
}

try {
  const mobile = { width: 390, height: 844 };
  const desktop = { width: 1440, height: 900 };

  await withAgentPage(desktop, `${BASE}/telemarketing`, async (page) => {
    const watched = await watch(page, 15);
    writeFileSync(join(OUT, 'desktop-wait-trace.json'), JSON.stringify(watched, null, 2));
    await page.screenshot({ path: join(OUT, 'desktop-wait-t15.png'), fullPage: true });
    const sum = summarize(watched);
    report.runs.push({ id: 'desktop-wait-15s', ...sum });
    check('desktop-start-appeared', sum.firstStartAtMs != null, `at ${sum.firstStartAtMs}ms`);
    check('desktop-no-auto-chat', !sum.anyChat, sum.last);
    check('desktop-start-stayed', !sum.startThenLost && !!sum.last?.start, sum.last);
  });

  await withAgentPage(mobile, `${BASE}/telemarketing?daliaChat=${unreadChatId}#dalia-care`, async (page) => {
    const watched = await watch(page, 15);
    writeFileSync(join(OUT, 'mobile-unread-url-trace.json'), JSON.stringify(watched, null, 2));
    await page.screenshot({ path: join(OUT, 'mobile-unread-url-t15.png'), fullPage: true });
    const sum = summarize(watched);
    report.runs.push({ id: 'mobile-unread-url-wait', ...sum });
    check('mobile-no-auto-chat-with-unread-url', !sum.anyChat, sum.last);
    check('mobile-start-stayed-with-unread', !sum.startThenLost && !!sum.last?.start, sum.last);
  });

  await withAgentPage(mobile, `${BASE}/telemarketing`, async (page) => {
    const watched = await watch(page, 12);
    const sum = summarize(watched);
    report.runs.push({ id: 'mobile-manual-open', ...sum });
    check('mobile-home-before-click', !sum.anyChat && !!sum.last?.start, sum.last);
    const opened = await page.locator('button:has-text("פניות צוות דליה")').first().click({ timeout: 15000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, 'mobile-after-purple-click.png') });
    const afterOpen = await snap(page);
    check('mobile-click-opens-chat', opened && (afterOpen.chat || afterOpen.bodyHasBack), afterOpen);
    const backClicked = await page.getByTestId('dalia-back-telemarketing').click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!backClicked) {
      check('mobile-back-stays-home', false, { reason: 'back-button-missing', afterOpen });
      return;
    }
    await page.waitForTimeout(2000);
    const afterBack = await watch(page, 8);
    writeFileSync(join(OUT, 'mobile-after-back-trace.json'), JSON.stringify(afterBack, null, 2));
    await page.screenshot({ path: join(OUT, 'mobile-after-back.png') });
    const backSum = summarize(afterBack);
    check('mobile-back-stays-home', !backSum.anyChat && !!backSum.last?.start, backSum.last);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterReload = await watch(page, 10);
    writeFileSync(join(OUT, 'mobile-reload-trace.json'), JSON.stringify(afterReload, null, 2));
    await page.screenshot({ path: join(OUT, 'mobile-after-reload.png') });
    const reloadSum = summarize(afterReload);
    check('mobile-reload-stays-home', !reloadSum.anyChat && !!reloadSum.last?.start, reloadSum.last);
  });

  await withAgentPage(desktop, `${BASE}/telemarketing`, async (page) => {
    await watch(page, 6);
    await page.screenshot({ path: join(OUT, 'desktop-new-context.png') });
    const after = await snap(page);
    check('desktop-new-tab-stays-home', !after.chat && !after.bodyHasBack && after.start, after);
  });
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), agent: report.agent }, null, 2));
if (!report.pass) process.exit(2);
