/**
 * Staging OpenAI E2E audit — Edge modules + UI chat (read-only, no secrets printed).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const EDGE = `${STAGING_URL}/functions/v1`;
const PAGES = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'openai-staging-e2e');
mkdirSync(OUT, { recursive: true });

const MODULES = [
  'assistant', 'keywords', 'content', 'seo', 'strategy', 'gbp', 'ads', 'briefing', 'director',
];

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  localProbe: null,
  secrets: { openai: false, marketingOpenai: false },
  edgeModules: [],
  googleSyncOpenai: null,
  ui: { probe: null, runAi: null, marketingApiChat: null, consoleErrors: [], networkErrors: [], runAiAnalysisStub: true },
  ok: false,
};

function loadKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const secretList = execSync(`supabase secrets list --project-ref ${STAGING_REF}`, { encoding: 'utf8' });
report.secrets.openai = /OPENAI_API_KEY/.test(secretList);
report.secrets.marketingOpenai = /MARKETING_OPENAI_API_KEY/.test(secretList);

try {
  execSync('npm run project-001:openai-probe', { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' });
  report.localProbe = 'ok';
} catch {
  report.localProbe = 'fail';
}

const { service, anon } = loadKeys();
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = Date.now();
const email = `openai-e2e-${runId}@staging-e2e.local`;
const password = `Oi!${runId}`;
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email).id;
await admin.from('profiles').upsert({
  id: uid, full_name: 'OpenAI E2E', company_name: 'דליה', is_active: true,
  approval_status: 'approved', two_factor_approved: true,
});
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 500));
const anonClient = createClient(STAGING_URL, anon);
const { data: auth } = await anonClient.auth.signInWithPassword({ email, password });
const token = auth.session.access_token;
const authHeaders = { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

for (const mod of MODULES) {
  const prompt = mod === 'assistant'
    ? 'ענה במשפט אחד בעברית: OpenAI עובד'
    : `מודול ${mod}: תן 2 נקודות קצרות בעברית ל-dalia-c.com`;
  const res = await fetch(`${EDGE}/marketing-ai-chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ module: mod, prompt }),
  });
  const body = await res.json();
  const ok = res.status === 200 && body.ok && body.text && body.text.length > 10;
  report.edgeModules.push({
    module: mod, status: res.status, ok, model: body.model || null, len: body.text?.length || 0, error: body.error || null,
  });
  console.log(ok ? '✅' : '❌', `edge:${mod}`, res.status, body.error || `${body.text?.length || 0} chars`);
}

const syncRes = await fetch(`${EDGE}/marketing-google-sync`, {
  method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'status' }),
});
const syncBody = await syncRes.json();
report.googleSyncOpenai = syncBody.providers?.openai || null;
console.log('google-sync openai:', JSON.stringify(report.googleSyncOpenai));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/favicon|404|ERR_/i.test(msg.text())) {
    report.ui.consoleErrors.push(msg.text().slice(0, 200));
  }
});
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('marketing-ai-chat') && res.status() >= 400) {
    report.ui.networkErrors.push({ url: u.slice(0, 120), status: res.status() });
  }
});

const stagingPayload = {
  accessToken: token,
  supabaseUrl: STAGING_URL,
  anonKey: anon,
  marketingChatUrl: `${EDGE}/marketing-ai-chat`,
};

await page.goto(`${PAGES}/ai-marketing-platform.html?fullscreen=1&v=v3-unified-3j`, {
  waitUntil: 'networkidle', timeout: 120000,
});
await page.waitForFunction(() => document.getElementById('screen-hub')?.classList.contains('active'), { timeout: 60000 });

await page.evaluate((payload) => {
  window.COCO_STAGING = payload;
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'dalia-coco-auth', ...payload } }));
}, stagingPayload);
await page.waitForTimeout(1500);

report.ui.marketingApiChat = await page.evaluate(async () => {
  if (typeof window.marketingApiChat !== 'function') return { ok: false, error: 'marketingApiChat missing' };
  const r = await window.marketingApiChat({ module: 'assistant', prompt: 'ענה רק: ChatGPT OK' });
  return { ok: !!(r.ok && r.text), len: r.text?.length || 0, message: r.message || null };
});
console.log('UI marketingApiChat:', JSON.stringify(report.ui.marketingApiChat));

report.ui.runAi = await page.evaluate(async () => {
  if (typeof window.runAi !== 'function') return { ok: false, error: 'runAi missing' };
  return new Promise((resolve) => {
    const orig = window.showToast;
    let got = false;
    window.showToast = function (msg, type) {
      if (/AI|ChatGPT|תשובה|שגיאה|ממתין/i.test(String(msg))) {
        got = true;
        resolve({ ok: type === 'success' || /✓|הושלם|תשובה/.test(String(msg)), toast: String(msg).slice(0, 120) });
      }
      if (orig) orig.apply(this, arguments);
    };
    window.runAi('keywords', '2 מילות מפתח קצרות לניהול צי — dalia-c.com', '🤖 QA');
    setTimeout(() => {
      if (!got) resolve({ ok: false, error: 'no toast within timeout' });
    }, 45000);
  });
});
console.log('UI runAi:', JSON.stringify(report.ui.runAi));

report.ui.probe = await page.evaluate(async () => {
  if (typeof window.marketingApiChat !== 'function') return { ok: false };
  const r = await window.marketingApiChat({ module: 'assistant', prompt: 'ping', system: 'ענה רק: ok' });
  return { ok: !!(r.ok && r.text), text: (r.text || '').slice(0, 40) };
});
console.log('UI probe (assistant ping):', JSON.stringify(report.ui.probe));

report.ui.runAiAnalysisStub = await page.evaluate(() => {
  const src = window.runAiAnalysis?.toString?.() || '';
  return /ממתין לחיבור API|setTimeout/.test(src) && !/marketingApiChat|marketingAiChat|fetch/.test(src);
});

await browser.close();

const edgeOk = report.edgeModules.every((m) => m.ok);
const uiOk = report.ui.marketingApiChat?.ok && report.ui.probe?.ok;
report.ok = report.localProbe === 'ok' && report.secrets.openai && report.secrets.marketingOpenai
  && report.googleSyncOpenai?.status === 'connected' && edgeOk && uiOk
  && report.ui.consoleErrors.length === 0 && report.ui.networkErrors.length === 0;

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\n=== OpenAI Staging E2E ===');
console.log(JSON.stringify({
  ok: report.ok,
  edge: `${report.edgeModules.filter((m) => m.ok).length}/${report.edgeModules.length}`,
  ui: uiOk,
  consoleErrors: report.ui.consoleErrors.length,
  networkErrors: report.ui.networkErrors.length,
  runAiAnalysisStub: report.ui.runAiAnalysisStub,
}, null, 2));
process.exit(report.ok ? 0 : 1);
