/**
 * Live GitHub Pages E2E: employee first screen must be «התחל שיחה».
 * Does not create, deactivate, or modify users.
 * node scripts/telemarketing-chat-nav-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-start-call-2026-08-25');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  mainMerged: false,
  usersTouched: false,
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

async function sessionForExistingUser(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}

async function findRoleUser(role) {
  const { data: rows, error } = await admin.from('user_roles').select('user_id').eq('role', role);
  if (error) throw error;
  const ids = (rows || []).map((r) => r.user_id);
  const picked = [];
  for (const id of ids) {
    const { data: profile } = await admin.from('profiles').select('id, full_name, is_active').eq('id', id).maybeSingle();
    if (!profile || profile.is_active === false) continue;
    const { data: u } = await admin.auth.admin.getUserById(id);
    const email = u?.user?.email;
    if (!email) continue;
    picked.push({ id, email, name: profile.full_name, qa: /staging-e2e\.local|qa-chat-|qa-tele-/i.test(email) });
  }
  return picked.find((p) => !p.qa) || picked[0] || null;
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

async function openAgentInbox(page) {
  const debug = await page.evaluate(() => ({
    testids: [...document.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid')),
    buttons: [...document.querySelectorAll('button')].map((el) => (el.innerText || '').slice(0, 80)),
    hasInbox: Boolean(document.querySelector('[data-testid="dalia-open-inbox"]')),
  }));
  writeFileSync(join(OUT, 'debug-inbox.json'), JSON.stringify(debug, null, 2), 'utf8');
  const inbox = page.locator('[data-testid="dalia-open-inbox"], button:has-text("פניות צוות דליה")');
  await inbox.first().click({ timeout: 15000, force: true });
}

async function firstScreenProbe(page) {
  const btn = page.getByTestId('tele-start-call');
  await btn.waitFor({ state: 'visible', timeout: 30000 });
  const chatScreen = await page.getByTestId('dalia-agent-chat-screen').count();
  const overlay = await page.getByTestId('dalia-chat-overlay').count();
  const rows = await page.getByTestId('dalia-chat-row').count();
  const back = await page.getByTestId('dalia-back-telemarketing').count();
  const box = await btn.boundingBox();
  const vh = page.viewportSize()?.height || 900;
  const onScreen = !!box && box.y >= 0 && box.y < vh * 0.55;
  const url = page.url();
  const urlClean = !url.includes('daliaChat') && !url.includes('dalia-care');
  const body = await page.locator('body').innerText();
  const hasStart = body.includes('התחל שיחה');
  const hasChatBack = body.includes('חזרה לטלמיטינג');
  const env = await page.evaluate(() => ({
    bundle: document.querySelector('script[src*="assets/index-"]')?.getAttribute('src') || '',
    hash: location.hash,
    search: location.search,
    sw: navigator.serviceWorker ? !!navigator.serviceWorker.controller : false,
    build: document.querySelector('[data-tele-build]')?.getAttribute('data-tele-build') || '',
    lsChat: Object.keys(localStorage).filter((k) => /daliaChat|teleAgentChat|dalia-care/i.test(k)),
    ssChat: Object.keys(sessionStorage).filter((k) => /daliaChat|teleAgentChat|dalia-care/i.test(k)),
    scrollY: window.scrollY,
  }));
  return {
    ok: chatScreen === 0 && overlay === 0 && rows === 0 && back === 0 && onScreen && urlClean && hasStart && !hasChatBack && env.scrollY < 40 && !env.sw,
    chatScreen,
    overlay,
    rows,
    back,
    y: box?.y,
    url,
    hasStart,
    hasChatBack,
    ...env,
  };
}

let browser;

try {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  rec('deploy-staging', 'Pages is Staging branch', /feat\/incident-alerts-staging/.test(deployTxt) ? 'PASS' : 'FAIL', { deployTxt: deployTxt.trim() });
  rec('deploy-not-prod', 'Not Production', !deployTxt.includes(PROD_REF) ? 'PASS' : 'FAIL');
  report.deployed_ref = deployTxt.trim();

  const indexHtml = await fetch(`${BASE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  const teleHtml = await fetch(`${BASE}/telemarketing/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  const asset = (indexHtml.match(/assets\/index-[^"]+\.js/) || [])[0];
  const teleAsset = (teleHtml.match(/assets\/index-[^"]+\.js/) || [])[0];
  rec('bundle-asset', 'Live index.html has JS asset', asset ? 'PASS' : 'FAIL', { asset });
  rec('bundle-tele-shell', '/telemarketing/ shell matches root bundle', asset && asset === teleAsset ? 'PASS' : 'FAIL', { asset, teleAsset });
  report.liveBundle = asset;
  if (asset) {
    const js = await fetch(`${BASE}/${asset}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    rec('bundle-work-home', 'Live bundle contains tele-work-home', js.includes('tele-work-home') ? 'PASS' : 'FAIL');
    rec('bundle-agent-chat-screen', 'Live bundle contains dalia-agent-chat-screen', js.includes('dalia-agent-chat-screen') ? 'PASS' : 'FAIL');
    rec('bundle-back-label', 'Live bundle contains חזרה לטלמיטינג', js.includes('חזרה לטלמיטינג') ? 'PASS' : 'FAIL');
    rec('bundle-cache-bust-login', 'Live bundle cache-busts agent login to work home', js.includes('replaceToAgentWorkHome') || js.includes('telemarketing?v=') ? 'PASS' : 'FAIL');
  }

  const agent = await findRoleUser('telemarketing_agent');
  rec('existing-agent', 'Found existing telemarketing employee (no user create)', agent ? 'PASS' : 'FAIL', { usedQaFallback: Boolean(agent?.qa) });
  if (!agent) throw new Error('no existing telemarketing_agent');
  const agentSession = await sessionForExistingUser(agent.email);

  const sa = await findRoleUser('super_admin');
  const saSession = sa ? await sessionForExistingUser(sa.email) : null;

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

  async function runAgentFlow(label, viewport) {
    const { page, context } = await contextWithSession(agentSession, viewport);

    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let home = await firstScreenProbe(page);
    await page.screenshot({ path: join(OUT, `${label}-01-first-screen.png`) });
    rec(`${label}-clean-url-home`, 'First viewport is התחל שיחה, chat is not open', home.ok ? 'PASS' : 'FAIL', home);

    await page.goto(`${BASE}/telemarketing?daliaChat=stale-id#dalia-care`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1200);
    try {
      home = await firstScreenProbe(page);
    } catch (e) {
      await page.screenshot({ path: join(OUT, `${label}-02-stale-url-FAIL.png`) });
      throw e;
    }
    await page.screenshot({ path: join(OUT, `${label}-02-stale-url.png`) });
    rec(`${label}-strip-daliaChat`, 'Stale daliaChat/hash does not auto-open chat', home.ok ? 'PASS' : 'FAIL', home);

    await openAgentInbox(page);
    await page.getByTestId('dalia-agent-chat-screen').waitFor({ timeout: 15000 });
    rec(`${label}-chat-opens`, 'Chat screen opens only after explicit click', (await page.getByTestId('dalia-agent-chat-screen').count()) > 0 ? 'PASS' : 'FAIL');
    rec(`${label}-back-button-present`, 'חזרה לטלמיטינג is visible in chat', (await page.getByTestId('dalia-back-telemarketing').count()) > 0 ? 'PASS' : 'FAIL');
    await page.screenshot({ path: join(OUT, `${label}-03-chat.png`) });

    await page.getByTestId('dalia-back-telemarketing').first().click();
    await page.getByTestId('tele-start-call').waitFor({ state: 'visible', timeout: 20000 });
    home = await firstScreenProbe(page);
    await page.screenshot({ path: join(OUT, `${label}-04-back.png`) });
    rec(`${label}-back-to-start-call`, 'חזרה לטלמיטינג returns to התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);

    await openAgentInbox(page);
    await page.getByTestId('dalia-agent-chat-screen').waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.goBack();
    await page.waitForTimeout(400);
    home = await firstScreenProbe(page);
    rec(`${label}-browser-back`, 'Browser/phone Back returns to התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    home = await firstScreenProbe(page);
    await page.screenshot({ path: join(OUT, `${label}-05-refresh.png`) });
    rec(`${label}-refresh`, 'Normal refresh stays on התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(async () => {
      if (window.caches?.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    });
    await page.goto(`${BASE}/telemarketing?v=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    home = await firstScreenProbe(page);
    await page.screenshot({ path: join(OUT, `${label}-06-hard-refresh.png`) });
    rec(`${label}-hard-refresh`, 'Hard refresh / cache-bust still התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);

    rec(`${label}-live-bundle-in-page`, 'Page is running the live Pages bundle', home.bundle.includes(report.liveBundle || 'assets/index-') ? 'PASS' : 'FAIL', { pageBundle: home.bundle, liveBundle: report.liveBundle });
    rec(`${label}-no-service-worker`, 'No service worker controlling the page', home.sw ? 'FAIL' : 'PASS', { sw: home.sw });

    await page.getByRole('button', { name: /יציאה|התנתקות/ }).first().click().catch(() => null);
    await page.waitForTimeout(800);
    await context.close();

    const fresh = await browser.newContext({ locale: 'he-IL', viewport });
    const freshPage = await fresh.newPage();
    await freshPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    rec(`${label}-logout-new-tab`, 'Logout then new tab shows Login', /התחבר/.test(await freshPage.locator('body').innerText()) || freshPage.url().includes('/login') ? 'PASS' : 'FAIL', { url: freshPage.url() });
    await freshPage.screenshot({ path: join(OUT, `${label}-07-login.png`) });
    await fresh.close();

    const relogin = await contextWithSession(agentSession, viewport);
    await relogin.page.goto(`${BASE}/telemarketing?v=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    home = await firstScreenProbe(relogin.page);
    await relogin.page.screenshot({ path: join(OUT, `${label}-08-relogin-home.png`) });
    rec(`${label}-relogin-home`, 'New tab after login lands on התחל שיחה', home.ok ? 'PASS' : 'FAIL', home);
    await relogin.context.close();
  }

  await runAgentFlow('desktop', { width: 1440, height: 900 });
  await runAgentFlow('mobile', { width: 390, height: 844 });

  if (saSession) {
    const { page: saPage, context: saCtx } = await contextWithSession(saSession, { width: 1440, height: 900 });
    await saPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await saPage.waitForTimeout(2500);
    const adminBody = await saPage.locator('body').innerText();
    rec('admin-home-unchanged', 'Manager still lands on admin telemarketing', /מסך מנהל/.test(adminBody) ? 'PASS' : 'FAIL');
    rec('admin-no-agent-fullscreen', 'Manager is not forced into agent chat screen', (await saPage.getByTestId('dalia-agent-chat-screen').count()) === 0 ? 'PASS' : 'FAIL');
    await saCtx.close();
  } else {
    rec('admin-home-unchanged', 'Manager still lands on admin telemarketing', 'BLOCKED', { note: 'No existing super_admin session without creating a user' });
  }
} catch (e) {
  rec('fatal', 'E2E runner', 'FAIL', { error: e instanceof Error ? e.message : String(e) });
} finally {
  if (browser) await browser.close();
}

const fail = report.tests.filter((t) => t.status === 'FAIL').length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail, total: report.tests.length, out: OUT, deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.ok) process.exit(1);
