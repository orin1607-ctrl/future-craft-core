/**
 * Reproduce-only: watch live Pages after employee login for a LATE jump to Dalia chat.
 * Does not create/deactivate users. Does not modify existing chats unless none exist with unread
 * (then it inserts one manager→agent message on an existing open chat, never deletes).
 * node scripts/telemarketing-reproduce-auto-chat.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-auto-chat-repro-2026-08-25');
mkdirSync(OUT, { recursive: true });

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

async function findAgentWithUnread() {
  const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
  const ids = (roles || []).map((r) => r.user_id);
  const { data: chats } = await admin
    .from('telemarketing_team_chats')
    .select('id, agent_id, status, initiated_by, company_name')
    .in('status', ['חדש', 'בטיפול', 'ממתין לנציג', 'ממתין ללקוח']);
  const byAgent = new Map();
  for (const c of chats || []) {
    const list = byAgent.get(c.agent_id) || [];
    list.push(c);
    byAgent.set(c.agent_id, list);
  }
  const candidates = [];
  for (const id of ids) {
    const { data: profile } = await admin.from('profiles').select('id, full_name, is_active').eq('id', id).maybeSingle();
    if (!profile || profile.is_active === false) continue;
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (!u?.user?.email) continue;
    const { data: work } = await admin.from('telemarketing_work_sessions').select('id').eq('employee_id', id).eq('status', 'in_progress').limit(1);
    const { data: calls } = await admin.from('telemarketing_calls').select('id').eq('employee_id', id).eq('status', 'in_progress').limit(1);
    candidates.push({
      id,
      email: u.user.email,
      name: profile.full_name,
      openChats: byAgent.get(id) || [],
      busy: Boolean(work?.length || calls?.length),
    });
  }
  return (
    candidates.find((c) => !c.busy && c.openChats.length > 0) ||
    candidates.find((c) => c.openChats.length > 0) ||
    candidates.find((c) => !c.busy) ||
    candidates[0] ||
    null
  );
}

const TRACE = `(() => {
  const log = [];
  const snap = (why) => {
    log.push({
      t: Date.now(),
      why,
      url: location.href,
      hash: location.hash,
      search: location.search,
      hist: history.state,
      start: !!document.querySelector('[data-testid="tele-start-call"]'),
      chat: !!document.querySelector('[data-testid="dalia-agent-chat-screen"]'),
      overlay: !!document.querySelector('[data-testid="dalia-chat-overlay"]'),
      back: !!document.querySelector('[data-testid="dalia-back-telemarketing"]'),
      inbox: !!document.querySelector('[data-testid="dalia-open-inbox"]'),
      bodyHasStart: (document.body && document.body.innerText || '').includes('התחל שיחה'),
      bodyHasBack: (document.body && document.body.innerText || '').includes('חזרה לטלמיטינג'),
      bodyHasChatTitle: (document.body && document.body.innerText || '').includes('פניות צוות דליה'),
    });
  };
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function (s, t, u) { log.push({ t: Date.now(), why: 'pushState', url: String(u || location.href), hist: s }); return push(s, t, u); };
  history.replaceState = function (s, t, u) { log.push({ t: Date.now(), why: 'replaceState', url: String(u || location.href), hist: s }); return replace(s, t, u); };
  window.addEventListener('popstate', () => snap('popstate'));
  window.addEventListener('hashchange', () => snap('hashchange'));
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('button,a,[data-testid]') : null;
    log.push({ t: Date.now(), why: 'click', testid: el && el.getAttribute('data-testid'), text: ((el && el.innerText) || '').slice(0, 60) });
  }, true);
  new MutationObserver(() => {
    const chat = !!document.querySelector('[data-testid="dalia-agent-chat-screen"]');
    const last = log[log.length - 1];
    if (!last || last.chat !== chat) snap('dom');
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.__teleLog = log;
  window.__teleSnap = snap;
  snap('boot');
})();`;

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

async function watch(page, seconds) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < seconds * 1000) {
    const row = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      return {
        t: Date.now(),
        url: location.href,
        start: !!document.querySelector('[data-testid="tele-start-call"]'),
        chat: !!document.querySelector('[data-testid="dalia-agent-chat-screen"]'),
        overlay: !!document.querySelector('[data-testid="dalia-chat-overlay"]'),
        back: !!document.querySelector('[data-testid="dalia-back-telemarketing"]'),
        bodyHasStart: body.includes('התחל שיחה'),
        bodyHasBack: body.includes('חזרה לטלמיטינג'),
      };
    });
    samples.push(row);
    await page.waitForTimeout(400);
  }
  const events = await page.evaluate(() => window.__teleLog || []);
  return { samples, events };
}

const report = { at: new Date().toISOString(), jumps: [], runs: [] };
const agent = await findAgentWithUnread();
if (!agent) throw new Error('no telemarketing agent');
report.agent = { name: agent.name, busy: agent.busy, openChats: agent.openChats.length, statuses: agent.openChats.map((c) => c.status) };
console.log('agent', report.agent);

const session = await sessionFor(agent.email);
const storageKey = `sb-${STAGING_REF}-auth-token`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const chatId = agent.openChats[0]?.id || 'none';

const scenarios = [
  { id: 'mobile-clean', viewport: { width: 390, height: 844 }, url: `${BASE}/telemarketing` },
  { id: 'mobile-daliaChat', viewport: { width: 390, height: 844 }, url: `${BASE}/telemarketing?daliaChat=${chatId}#dalia-care` },
  { id: 'mobile-v-bust', viewport: { width: 390, height: 844 }, url: `${BASE}/telemarketing?v=repro` },
  { id: 'desktop-clean', viewport: { width: 1440, height: 900 }, url: `${BASE}/telemarketing` },
  { id: 'desktop-daliaChat', viewport: { width: 1440, height: 900 }, url: `${BASE}/telemarketing?daliaChat=${chatId}#dalia-care` },
];

try {
  for (const sc of scenarios) {
    const context = await browser.newContext({ locale: 'he-IL', viewport: sc.viewport });
    await context.addInitScript(TRACE);
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: sessionValue(session),
    });
    if (sc.id.includes('daliaChat')) {
      await context.addInitScript(() => {
        try { sessionStorage.setItem('dalia_post_login_redirect', '/telemarketing?daliaChat=from-storage#dalia-care'); } catch {}
      });
    }
    const page = await context.newPage();
    await page.goto(sc.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.screenshot({ path: join(OUT, `${sc.id}-t0.png`) });
    const watched = await watch(page, 12);
    await page.screenshot({ path: join(OUT, `${sc.id}-t12.png`) });
    const jump = watched.samples.some((s, i) => i > 0 && s.chat && !watched.samples[0].chat);
    const startThenChat = watched.samples.some((s) => s.bodyHasStart) && watched.samples.some((s) => s.chat || s.bodyHasBack);
    const lateChat = watched.samples.findIndex((s) => s.chat || s.bodyHasBack);
    const firstStart = watched.samples.findIndex((s) => s.bodyHasStart);
    report.runs.push({
      id: sc.id,
      jump,
      startThenChat,
      firstStartAtMs: firstStart >= 0 ? firstStart * 400 : null,
      lateChatAtMs: lateChat >= 0 ? lateChat * 400 : null,
      last: watched.samples[watched.samples.length - 1],
      clicks: watched.events.filter((e) => e.why === 'click'),
      nav: watched.events.filter((e) => e.why === 'pushState' || e.why === 'replaceState' || e.why === 'popstate' || e.why === 'hashchange'),
    });
    if (jump) report.jumps.push(sc.id);
    writeFileSync(join(OUT, `${sc.id}-trace.json`), JSON.stringify(watched, null, 2));
    console.log(sc.id, { jump, startThenChat, firstStart, lateChat, last: watched.samples.at(-1) });
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ jumps: report.jumps, runs: report.runs.map((r) => ({ id: r.id, jump: r.jump, startThenChat: r.startThenChat, lastChat: r.last.chat, lastStart: r.last.start, lastBack: r.last.bodyHasBack })) }, null, 2));
