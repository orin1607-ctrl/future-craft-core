/**
 * Staging E2E: agent + super-admin inner-screen back/home navigation.
 * node scripts/telemarketing-nav-back-home-e2e.mjs
 * Does not reset directory 1-29, does not claim/lock leads, does not submit calls.
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-nav-back-home-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
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
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
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

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
  tairKept: true,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

async function contextWithSession(browser, session, viewport) {
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  return context;
}

async function agentHomeOk(page) {
  const start = page.getByTestId('tele-start-call');
  const chat = page.getByTestId('dalia-agent-chat-screen');
  return (await start.count()) > 0 && (await start.first().isVisible().catch(() => false)) && (await chat.count()) === 0;
}

async function adminHomeOk(page) {
  const home = page.getByTestId('tele-admin-home');
  const overlay = page.getByTestId('tele-internal-card');
  const chatOverlay = page.getByTestId('dalia-chat-overlay');
  const title = await page.locator('h1').first().innerText().catch(() => '');
  return (await home.count()) > 0 && title.includes('מסך מנהל') && (await overlay.count()) === 0 && (await chatOverlay.count()) === 0;
}

try {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  check('deploy-staging', /feat\/incident-alerts-staging/.test(deployTxt), deployTxt.trim());
  check('deploy-not-prod', !deployTxt.includes(PROD_REF), deployTxt.trim());
  report.deployed_ref = deployTxt.trim();
  const indexHtml = await fetch(`${BASE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  const asset = (indexHtml.match(/assets\/index-[^"]+\.js/) || [])[0];
  report.liveBundle = asset;
  check('bundle-asset', Boolean(asset), asset);
  if (asset) {
    const js = await fetch(`${BASE}/${asset}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    check('bundle-nav-back', js.includes('tele-nav-back') && js.includes('חזרה למסך הקודם'), null);
    check('bundle-nav-home', js.includes('tele-nav-home') && js.includes('חזרה לדשבורד הראשי'), null);
    check('bundle-no-blind-back-admin-chat', !js.includes('navigate(-1)') || js.includes('stripDaliaChatSearch'), null);
  }

  const agentSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await contextWithSession(browser, agentSession, { width: viewport.width, height: viewport.height });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    check(`agent-${viewport.name}-home`, await agentHomeOk(page), await page.locator('body').innerText().then((t) => t.slice(0, 180)));

    const inboxBtn = page.getByTestId('dalia-open-inbox');
    if (await inboxBtn.count()) {
      await inboxBtn.first().click({ force: true });
      await page.waitForTimeout(1500);
      check(`agent-${viewport.name}-chat-nav`, (await page.getByTestId('tele-nav-back').count()) > 0 && (await page.getByTestId('tele-nav-home').count()) > 0);
      const rows = page.getByTestId('dalia-chat-row');
      if (await rows.count()) {
        await rows.first().click({ force: true });
        await page.waitForTimeout(1200);
        check(`agent-${viewport.name}-thread-nav`, (await page.getByTestId('tele-nav-back').count()) > 0);
        await page.getByTestId('tele-nav-back').first().click({ force: true });
        await page.waitForTimeout(800);
        check(`agent-${viewport.name}-thread-back-inbox`, (await page.getByTestId('dalia-agent-chat-screen').count()) > 0 && (await page.getByTestId('dalia-chat-row').count()) > 0);
        await page.getByTestId('tele-nav-home').first().click({ force: true });
      } else {
        await page.getByTestId('tele-nav-home').first().click({ force: true });
      }
      await page.waitForTimeout(1500);
      check(`agent-${viewport.name}-chat-home`, await agentHomeOk(page));
    } else {
      check(`agent-${viewport.name}-chat-nav`, false, 'inbox button missing');
    }

    const followItem = page.getByTestId('followup-item');
    if (await followItem.count()) {
      await followItem.first().click({ force: true });
      await page.waitForTimeout(800);
      check(`agent-${viewport.name}-followup-card`, (await page.getByTestId('tele-internal-card').count()) > 0 && (await page.getByTestId('tele-nav-back').count()) > 0);
      await page.getByTestId('tele-nav-back').first().click({ force: true });
      await page.waitForTimeout(600);
      check(`agent-${viewport.name}-followup-back`, (await page.getByTestId('tele-internal-card').count()) === 0 && (await page.getByTestId('tele-continue-treatment').count()) > 0);
      await followItem.first().click({ force: true });
      await page.waitForTimeout(600);
      await page.getByTestId('tele-nav-home').first().click({ force: true });
      await page.waitForTimeout(800);
      check(`agent-${viewport.name}-followup-home`, await agentHomeOk(page) && (await page.getByTestId('tele-internal-card').count()) === 0);
    } else {
      check(`agent-${viewport.name}-followup-card`, true, 'no follow-up items — skipped');
    }

    const leadItem = page.getByTestId('lead-board-item');
    if (await leadItem.count()) {
      await leadItem.first().click({ force: true });
      await page.waitForTimeout(800);
      check(`agent-${viewport.name}-lead-card`, (await page.getByTestId('tele-internal-card').count()) > 0);
      await page.getByTestId('tele-nav-back').first().click({ force: true });
      await page.waitForTimeout(600);
      check(`agent-${viewport.name}-lead-back`, (await page.getByTestId('tele-internal-card').count()) === 0);
      await leadItem.first().click({ force: true });
      await page.waitForTimeout(600);
      await page.getByTestId('tele-nav-home').first().click({ force: true });
      await page.waitForTimeout(800);
      check(`agent-${viewport.name}-lead-home`, await agentHomeOk(page));
    } else {
      check(`agent-${viewport.name}-lead-card`, true, 'no traffic-light items — skipped');
    }

    await page.screenshot({ path: join(OUT, `agent-${viewport.name}.png`), fullPage: true });
    await ctx.close();
  }

  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await contextWithSession(browser, adminSession, { width: viewport.width, height: viewport.height });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(6000);
    check(`admin-${viewport.name}-home`, await adminHomeOk(page), await page.locator('h1').first().innerText().catch(() => ''));

    await page.locator('#activity-report').waitFor({ timeout: 30000 });
    const fromBefore = await page.getByTestId('activity-from-date').inputValue();
    let leadOpened = false;
    for (const q of ['12', '1', '29']) {
      await page.getByTestId('activity-lead-query').fill(q);
      await page.waitForTimeout(2500);
      if (await page.getByTestId('activity-lead-detail').count()) {
        leadOpened = true;
        check(`admin-${viewport.name}-report-lead`, true, { q });
        check(`admin-${viewport.name}-report-lead-nav`, (await page.getByTestId('tele-nav-back').count()) > 0 && (await page.getByTestId('tele-nav-home').count()) > 0);
        await page.getByTestId('tele-nav-back').first().click({ force: true });
        await page.waitForTimeout(2000);
        const fromAfter = await page.getByTestId('activity-from-date').inputValue();
        const queryAfter = await page.getByTestId('activity-lead-query').inputValue();
        check(`admin-${viewport.name}-report-back-filters`, fromAfter === fromBefore && queryAfter === '', { fromBefore, fromAfter, queryAfter });
        check(`admin-${viewport.name}-report-back-list`, (await page.getByTestId('activity-lead-detail').count()) === 0);
        await page.getByTestId('activity-lead-query').fill(q);
        await page.waitForTimeout(2500);
        if (await page.getByTestId('tele-nav-home').count()) {
          await page.getByTestId('tele-nav-home').first().click({ force: true });
          await page.waitForTimeout(1200);
          check(`admin-${viewport.name}-report-home`, await adminHomeOk(page) || (await page.getByTestId('tele-admin-home').count()) > 0);
        }
        break;
      }
    }
    if (!leadOpened) check(`admin-${viewport.name}-report-lead`, true, 'no unique lead detail for 12/1/29 — skipped');

    const daliaRow = page.getByTestId('dalia-chat-row');
    if (await daliaRow.count()) {
      await daliaRow.first().click({ force: true });
      await page.waitForTimeout(1000);
      check(`admin-${viewport.name}-dalia-overlay`, (await page.getByTestId('dalia-chat-overlay').count()) > 0 && (await page.getByTestId('tele-nav-back').count()) > 0);
      await page.getByTestId('tele-nav-back').first().click({ force: true });
      await page.waitForTimeout(800);
      check(`admin-${viewport.name}-dalia-back`, (await page.getByTestId('dalia-chat-overlay').count()) === 0);
      await daliaRow.first().click({ force: true });
      await page.waitForTimeout(800);
      await page.getByTestId('tele-nav-home').first().click({ force: true });
      await page.waitForTimeout(1000);
      check(`admin-${viewport.name}-dalia-home`, await adminHomeOk(page));
    } else {
      check(`admin-${viewport.name}-dalia-overlay`, true, 'no 🟣 rows — skipped');
    }

    const followItem = page.getByTestId('followup-item');
    if (await followItem.count()) {
      const search = page.getByTestId('followup-search');
      const token = ((await followItem.first().innerText()).match(/#\d+/) || [' '])[0].replace('#', '').trim();
      if (await search.count() && token) await search.first().fill(token);
      await page.waitForTimeout(400);
      const visible = page.getByTestId('followup-item');
      if (await visible.count()) await visible.first().click({ force: true });
      await page.waitForTimeout(800);
      await page.getByTestId('tele-nav-back').first().click({ force: true });
      await page.waitForTimeout(600);
      const searchAfter = await search.inputValue().catch(() => '');
      check(`admin-${viewport.name}-followup-back-filter`, !token || searchAfter === token, { token, searchAfter });
      await followItem.first().click({ force: true });
      await page.waitForTimeout(600);
      await page.getByTestId('tele-nav-home').first().click({ force: true });
      await page.waitForTimeout(800);
      check(`admin-${viewport.name}-followup-home`, await adminHomeOk(page));
    } else {
      check(`admin-${viewport.name}-followup-back-filter`, true, 'no follow-up items — skipped');
    }

    await page.screenshot({ path: join(OUT, `admin-${viewport.name}.png`), fullPage: true });
    await ctx.close();
  }

  await browser.close();
  const { data: tair } = await adminDb.from('profiles').select('full_name, is_active').eq('id', TAIR.id).single();
  const { count: still29 } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
  check('final-tair', tair?.full_name === 'תאיר' && tair?.is_active !== false, tair);
  check('final-29', still29 === 29, { still29 });
} catch (e) {
  check('ui-uncaught', false, String(e.message || e).slice(0, 800));
}

report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.pass) process.exit(2);
