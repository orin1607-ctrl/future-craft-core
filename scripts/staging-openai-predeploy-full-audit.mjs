/**
 * Pre-deploy OpenAI full audit — local UI (with fixes) + live Staging Edge.
 * No deploy. No secrets printed.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const EDGE = `${STAGING_URL}/functions/v1`;
const LIVE = process.env.LIVE_STAGING === '1';
const STAGING_PAGES = 'https://orin1607-ctrl.github.io/future-craft-core';
const LOCAL = process.env.QA_BASE_URL || 'http://127.0.0.1:8899';
const BASE = LIVE ? STAGING_PAGES : LOCAL;
const OUT = join(process.cwd(), 'docs', 'audit-reports', LIVE ? 'openai-postdeploy-live' : 'openai-predeploy-full');
mkdirSync(OUT, { recursive: true });

const SCREENS_10 = [
  { id: 'screen-status', label: 'מצב נוכחי' },
  { id: 'screen-clients', label: 'חברות' },
  { id: 'screen-agents', label: 'עוזרים' },
  { id: 'screen-goals', label: 'מטרות' },
  { id: 'screen-actions', label: 'פעולות' },
  { id: 'screen-history', label: 'היסטוריה' },
  { id: 'screen-assets', label: 'נכסים' },
  { id: 'screen-ai-center', label: 'AI' },
  { id: 'screen-reports', label: 'דוחות' },
  { id: 'screen-hub', label: 'Hub' },
];

const AGENTS_11 = [
  { id: 'gsc', module: 'intel', prompt: 'תובנה SEO אחת מ-GSC ל-dalia-c.com' },
  { id: 'ga4', module: 'director', prompt: 'תובנת Analytics אחת מ-GA4' },
  { id: 'pagespeed', module: 'seo', prompt: 'המלצת PageSpeed אחת' },
  { id: 'project001', module: 'strategy', prompt: 'יעד שיווקי אחד ל-30 יום' },
  { id: 'cms', module: 'content', prompt: 'המלצת תוכן אחת ל-CMS' },
  { id: 'seotools', module: 'keywords', prompt: '3 מילות מפתח לניהול צי' },
  { id: 'gbp', module: 'gbp', prompt: 'משפט אחד לפוסט GBP' },
  { id: 'ads', module: 'ads', prompt: 'כותרת מודעה אחת' },
  { id: 'meta', module: 'news', prompt: 'רעיון תוכן social אחד' },
  { id: 'cursor', module: 'autonomous', prompt: 'פעולת AI אחת לתיקון טכני' },
  { id: 'manager', module: 'director', prompt: '3 תובנות מנהל שיווק' },
];

const MODULE_PROMPTS = {
  morning: 'תדרוך בוקר קצר', director: '3 תובנות SEO', seo: '3 הצעות SEO',
  keywords: '5 מילות מפתח', content: 'כותרת H1 + 3 נקודות', strategy: 'יעד שיווקי 30 יום',
  ailab: '2 רעיונות A/B', intel: 'הזדמנות GSC אחת', competitors: 'חוזקת מתחרה אחת',
  news: 'טרנד אחד', gbp: 'פוסט GBP קצר', ads: 'כותרת מודעה', landing: 'כותרת דף נחיתה',
  pages: 'שיפור Meta אחד', warehouse: 'צ\'קליסט SEO', briefing: 'תדרוך 3 שורות',
  executive: 'סיכום מנהלים', roi: 'ROI לערוץ SEO', reports: 'מתווה דוח שבועי',
  funnel: 'שלב משפך אחד', journey: 'נקודת מגע B2B', crm: 'רעיון קמפיין CRM',
  autonomous: 'פעולה אוטונומית אחת', aiimage: 'תיאור תמונה שיווקית', general: '5 נקודות שיווק',
};

const report = {
  at: new Date().toISOString(),
  localUrl: `${BASE}/ai-marketing-platform.html?fullscreen=1${LIVE ? '' : '&v=v3-unified-3j'}`,
  edge: { modules: [], agents: [], errors: [] },
  ui: {
    screens: [], navigation: [], aiButtons: [], dataFlow: [], assistant: [],
    consoleErrors: [], networkErrors: [], openaiCalls: 0,
  },
  summary: { pass: 0, fail: 0, ok: false },
};

function pass(cat, name, detail = {}) {
  report.summary.pass++;
  const row = { name, ok: true, ...detail };
  if (cat === 'edge-mod') report.edge.modules.push(row);
  else if (cat === 'edge-agent') report.edge.agents.push(row);
  else if (cat === 'screen') report.ui.screens.push(row);
  else if (cat === 'nav') report.ui.navigation.push(row);
  else if (cat === 'btn') report.ui.aiButtons.push(row);
  else if (cat === 'flow') report.ui.dataFlow.push(row);
  else if (cat === 'assistant') report.ui.assistant.push(row);
  console.log('✅', name, detail.note || '');
}

function fail(cat, name, error, detail = {}) {
  report.summary.fail++;
  const row = { name, ok: false, error, ...detail };
  if (cat === 'edge-mod') report.edge.modules.push(row);
  else if (cat === 'edge-agent') report.edge.agents.push(row);
  else if (cat === 'screen') report.ui.screens.push(row);
  else if (cat === 'nav') report.ui.navigation.push(row);
  else if (cat === 'btn') report.ui.aiButtons.push(row);
  else if (cat === 'flow') report.ui.dataFlow.push(row);
  else if (cat === 'assistant') report.ui.assistant.push(row);
  console.log('❌', name, error);
}

function loadKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8', cwd: process.cwd(),
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const { service, anon } = loadKeys();
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = Date.now();
const email = `predeploy-${runId}@staging-e2e.local`;
const password = `Pd!${runId}`;
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email).id;
await admin.from('profiles').upsert({
  id: uid, full_name: 'PreDeploy QA', company_name: 'דליה', is_active: true,
  approval_status: 'approved', two_factor_approved: true,
});
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 500));
const { data: auth } = await createClient(STAGING_URL, anon).auth.signInWithPassword({ email, password });
const token = auth.session.access_token;
const authHeaders = { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const stagingPayload = {
  accessToken: token, supabaseUrl: STAGING_URL, anonKey: anon,
  marketingChatUrl: `${EDGE}/marketing-ai-chat`,
};

async function edgeChat(module, prompt) {
  const res = await fetch(`${EDGE}/marketing-ai-chat`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ module, prompt }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

for (const [mod, prompt] of Object.entries(MODULE_PROMPTS)) {
  const { status, body } = await edgeChat(mod, prompt);
  const ok = status === 200 && body.ok && body.text?.length > 15;
  ok ? pass('edge-mod', `module:${mod}`, { status, len: body.text?.length })
    : fail('edge-mod', `module:${mod}`, body.error || `HTTP ${status}`);
}

for (const ag of AGENTS_11) {
  const { status, body } = await edgeChat(ag.module, `[${ag.id}] ${ag.prompt}`);
  const ok = status === 200 && body.ok && body.text?.length > 15;
  ok ? pass('edge-agent', `agent:${ag.id}`, { module: ag.module, len: body.text?.length })
    : fail('edge-agent', `agent:${ag.id}`, body.error || `HTTP ${status}`);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error' && !/favicon|404|ERR_|Failed to load resource/i.test(msg.text())) {
    report.ui.consoleErrors.push(msg.text().slice(0, 250));
  }
});
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('marketing-ai-chat')) {
    if (res.status() === 200) report.ui.openaiCalls++;
    if (res.status() >= 400) report.ui.networkErrors.push({ url: u.slice(0, 100), status: res.status() });
  }
  if (u.includes(STAGING_REF) && res.status() >= 500 && !u.includes('favicon')) {
    report.ui.networkErrors.push({ url: u.slice(0, 100), status: res.status() });
  }
});

try {
  await page.goto(`${BASE}/ai-marketing-platform.html?fullscreen=1${LIVE ? '&t=' + runId : '&v=v3-unified-3j'}`, {
    waitUntil: 'networkidle', timeout: 120000,
  });
} catch (e) {
  fail('screen', 'page-load', e.message);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

await page.waitForFunction(() => document.getElementById('screen-hub')?.classList.contains('active'), { timeout: 90000 });
await page.evaluate((p) => {
  window.COCO_STAGING = p;
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'dalia-coco-auth', ...p } }));
}, stagingPayload);
await page.waitForTimeout(2000);

const probe = await page.evaluate(async () => {
  const r = await window.marketingApiChat({ module: 'assistant', prompt: 'ping', system: 'ענה רק: ok' });
  return { ok: !!(r.ok && r.text), text: r.text };
});
probe.ok ? pass('btn', 'probeStagingAi/marketingApiChat', { text: probe.text })
  : fail('btn', 'probeStagingAi/marketingApiChat', 'no response');

let prevScreen = '';
for (const sc of SCREENS_10) {
  const nav = await page.evaluate((id) => {
    window.goScreen(id);
    const el = document.getElementById(id);
    return !!(el && el.classList.contains('active'));
  }, sc.id);
  nav ? pass('screen', sc.id, { label: sc.label })
    : fail('screen', sc.id, 'not active', { label: sc.label });

  if (prevScreen) {
    const chain = await page.evaluate(({ from, to }) => ({
      fromActive: !document.getElementById(from)?.classList.contains('active'),
      toActive: document.getElementById(to)?.classList.contains('active'),
      hubCount: document.getElementById('coco-hub-client-name')?.textContent?.length || 0,
    }), { from: prevScreen, to: sc.id });
    chain.toActive ? pass('nav', `${prevScreen}→${sc.id}`)
      : fail('nav', `${prevScreen}→${sc.id}`, 'navigation broken');
  }
  prevScreen = sc.id;
}

const agentsUi = await page.evaluate(() => {
  window.goScreen('screen-agents');
  return Array.from(document.querySelectorAll('[id^="agcard-"]')).map((el) => el.id.replace('agcard-', ''));
});
if (agentsUi.length === 11) pass('flow', 'agents:11-cards-visible', { ids: agentsUi });
else fail('flow', 'agents:11-cards-visible', `found ${agentsUi.length}`, { ids: agentsUi });

for (const agId of agentsUi) {
  const dash = await page.evaluate((id) => {
    if (typeof openAgentDashboard !== 'function') return { ok: false, err: 'no fn' };
    openAgentDashboard(id);
    const active = document.getElementById('screen-agent-dashboard')?.classList.contains('active');
    const title = document.getElementById('agent-dash-breadcrumb')?.textContent || '';
    return { ok: active && title.length > 1, title };
  }, agId);
  dash.ok ? pass('flow', `agent-dashboard:${agId}`, { title: dash.title })
    : fail('flow', `agent-dashboard:${agId}`, dash.err || 'dashboard not opened');
  await page.evaluate(() => window.goScreen('screen-agents'));
}

await page.evaluate(() => window.goScreen('screen-ai-center'));
const aiAnalysis = await page.evaluate(async () => {
  if (typeof runAiAnalysis !== 'function') return { ok: false, err: 'no fn' };
  runAiAnalysis();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const box = document.getElementById('ai-status-box');
    const txt = box?.textContent || '';
    if (txt.length > 80 && !/ממתין לחיבור API אמיתי|לחץ "הפעל ניתוח"/.test(txt)) {
      return { ok: true, len: txt.length, preview: txt.slice(0, 60) };
    }
    if (/שגיא|⚠️/.test(txt) && !/התחברות Super Admin/.test(txt)) {
      return { ok: false, err: txt.slice(0, 120) };
    }
  }
  return { ok: false, err: 'timeout' };
});
aiAnalysis.ok ? pass('btn', 'runAiAnalysis:screen-ai-center', { len: aiAnalysis.len })
  : fail('btn', 'runAiAnalysis:screen-ai-center', aiAnalysis.err || 'failed');

const runAiModal = await page.evaluate(async () => {
  window.goScreen('screen-goals');
  return new Promise((resolve) => {
    window.runAi('strategy', 'יעד שיווקי אחד קצר', 'QA Strategy');
    const t = setInterval(() => {
      const m = document.getElementById('actionModal');
      if (m?.classList.contains('open')) {
        clearInterval(t);
        resolve({ ok: true, len: document.getElementById('actionModalBody')?.textContent?.length || 0 });
      }
    }, 400);
    setTimeout(() => { clearInterval(t); resolve({ ok: false, err: 'modal timeout' }); }, 40000);
  });
});
runAiModal.ok ? pass('btn', 'runAi:modal', { len: runAiModal.len })
  : fail('btn', 'runAi:modal', runAiModal.err || 'failed');

const dataFlow = await page.evaluate(async () => {
  window.goScreen('screen-agents');
  const a = document.getElementById('coco-hub-client-name')?.textContent || '';
  window.goScreen('screen-goals');
  const g = document.querySelector('#screen-goals .page-title')?.textContent || '';
  window.goScreen('screen-ai-center');
  const ai = document.querySelector('#screen-ai-center .page-title')?.textContent || '';
  const coco = !!(window.COCO && window.CocoClaude && window.CocoUnified);
  const staging = !!(window.COCO_STAGING?.accessToken && window.COCO_STAGING?.marketingChatUrl);
  return { hubClient: a.length > 3, goalsTitle: g.length > 2, aiTitle: ai.length > 2, coco, staging };
});
Object.entries({
  'data:hub-client': dataFlow.hubClient,
  'data:goals-screen': dataFlow.goalsTitle,
  'data:ai-center-screen': dataFlow.aiTitle,
  'data:COCO-globals': dataFlow.coco,
  'data:staging-auth': dataFlow.staging,
}).forEach(([k, v]) => (v ? pass('flow', k) : fail('flow', k, 'missing')));

const unifiedChat = await page.evaluate(async () => {
  if (!window.CocoUnified?.marketingAiChat) return { ok: false, err: 'CocoUnified missing' };
  const r = await CocoUnified.marketingAiChat({ provider: 'openai', module: 'briefing', prompt: 'תדרוך יומי 3 שורות' });
  return { ok: !!(r.ok && r.text), len: r.text?.length || 0, err: r.error || r.message };
});
unifiedChat.ok ? pass('btn', 'CocoUnified.marketingAiChat:openai', { len: unifiedChat.len })
  : fail('btn', 'CocoUnified.marketingAiChat:openai', unifiedChat.err || 'failed');

const assistantUi = await page.evaluate(async () => {
  const fab = !!document.getElementById('cocoAiFab');
  const mic = !!document.getElementById('cocoAiMic');
  const panel = document.getElementById('cocoAiPanel');
  if (!fab || !mic) return { ok: false, err: 'fab/mic missing' };
  document.getElementById('cocoAiFab')?.click();
  await new Promise((r) => setTimeout(r, 400));
  const open = panel?.classList.contains('open');
  const micSupported = typeof window.COCO_ASSISTANT?.micSupported === 'function'
    ? window.COCO_ASSISTANT.micSupported() : !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const chips = document.querySelectorAll('.coco-ai-chip').length;
  if (window.COCO_ASSISTANT?.send) {
    window.COCO_ASSISTANT.send('ענה במילה אחת: ChatGPT');
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const msgs = document.querySelectorAll('#cocoAiMsgs .coco-ai-msg.bot:not(.thinking)');
      const last = msgs[msgs.length - 1];
      if (last && last.textContent && last.textContent.length > 3 && !/ממתין|שגיא/i.test(last.textContent)) {
        return { ok: true, open, micSupported, chips, replyLen: last.textContent.length };
      }
    }
    return { ok: false, err: 'chat timeout', open, micSupported, chips };
  }
  return { ok: open && micSupported, open, micSupported, chips, note: 'no send fn' };
});
assistantUi.ok ? pass('assistant', 'chat-fab-mic-send', { mic: assistantUi.micSupported, chips: assistantUi.chips, replyLen: assistantUi.replyLen })
  : fail('assistant', 'chat-fab-mic-send', assistantUi.err || 'failed', { mic: assistantUi.micSupported });

await browser.close();

report.summary.ok = report.summary.fail === 0
  && report.ui.consoleErrors.length === 0
  && report.ui.networkErrors.length === 0;

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\n=== PRE-DEPLOY OPENAI AUDIT ===');
console.log(JSON.stringify({
  ok: report.summary.ok,
  pass: report.summary.pass,
  fail: report.summary.fail,
  edgeModules: `${report.edge.modules.filter((m) => m.ok).length}/${report.edge.modules.length}`,
  edgeAgents: `${report.edge.agents.filter((a) => a.ok).length}/${report.edge.agents.length}`,
  openaiNetworkCalls: report.ui.openaiCalls,
  consoleErrors: report.ui.consoleErrors.length,
  networkErrors: report.ui.networkErrors.length,
}, null, 2));

process.exit(report.summary.ok ? 0 : 1);
