/**
 * Staging E2E: agent home 4 buttons. Restores any claim created during the run.
 * EXPECTED_SHA=<short-or-full> node scripts/telemarketing-agent-home-buttons-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-agent-home-buttons-2026-08-27');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const t0 = new Date().toISOString();

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
  expectedSha: EXPECTED_SHA || null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

async function snapshotClaims() {
  const { data } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, claimed_by, claimed_at').in('lead_number', NUMS);
  return data || [];
}

async function restoreClaims(snap) {
  if (!snap) return;
  for (const row of snap) {
    await adminDb.from('telemarketing_lead_directory').update({ claimed_by: row.claimed_by, claimed_at: row.claimed_at }).eq('id', row.id);
  }
}

async function abortCallsSince(sinceIso) {
  const { data } = await adminDb.from('telemarketing_calls').select('id, started_at').eq('employee_id', TAIR.id).eq('status', 'in_progress');
  const ids = (data || []).filter((r) => r.started_at && r.started_at >= sinceIso).map((r) => r.id);
  if (!ids.length) return [];
  await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
  await adminDb.from('telemarketing_calls').delete().in('id', ids);
  return ids;
}

async function keep129() {
  const { data } = await adminDb.from('telemarketing_lead_directory').select('lead_number');
  const have = new Set((data || []).map((r) => String(r.lead_number)));
  const missing = NUMS.filter((n) => !have.has(n));
  return { count: (data || []).length, missing, ok: missing.length === 0 };
}

async function waitLive(timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  let last = null;
  const needle = EXPECTED_SHA ? EXPECTED_SHA.slice(0, 7) : null;
  while (Date.now() - start < timeoutMs) {
    const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    const indexHtml = await fetch(`${BASE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    const asset = (indexHtml.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
    last = { deployTxt: deployTxt.trim(), asset };
    const shaOk = needle ? deployTxt.includes(needle) : true;
    if (shaOk && /feat\/incident-alerts-staging/.test(deployTxt) && asset) return last;
    await sleep(20000);
  }
  throw new Error(`live timeout ${JSON.stringify(last)}`);
}

async function contextWithSession(browser, session, viewport) {
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  return context;
}

function buttonOrderOk(text) {
  const iCall = text.indexOf('התחל שיחה');
  const iDalia = text.indexOf('פניות צוות דליה');
  const iReport = text.indexOf('הדוח שלי');
  const iList = text.indexOf('עבודה מרשימת לידים');
  return iCall >= 0 && iDalia > iCall && iReport > iDalia && iList > iReport && !text.includes('התחל משימת עבודה');
}

let claimSnap = [];

try {
  const live = await waitLive();
  report.deployed_ref = live.deployTxt;
  report.liveBundle = live.asset;
  check('deploy-staging', /feat\/incident-alerts-staging/.test(live.deployTxt), live.deployTxt);
  check('deploy-not-prod', !live.deployTxt.includes(PROD_REF) && !live.deployTxt.includes('dalia-car') && !live.deployTxt.includes('dalia-c.com'), live.deployTxt);
  check('deploy-expected-sha', !EXPECTED_SHA || live.deployTxt.includes(EXPECTED_SHA.slice(0, 7)), { expected: EXPECTED_SHA, deployTxt: live.deployTxt });

  claimSnap = await snapshotClaims();
  check('keep-1-29-before', (await keep129()).ok, await keep129());

  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  async function assertHome(page, name) {
    await page.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
    const home = page.getByTestId('telemarketing-agent-home');
    const text = await home.innerText();
    check(`${name}-four-buttons`, (await page.getByTestId('tele-start-call').count()) > 0 && (await page.getByTestId('dalia-open-inbox').count()) > 0 && (await page.getByTestId('tele-my-report').count()) > 0 && (await page.getByTestId('tele-work-from-list').count()) > 0, text.slice(0, 250));
    check(`${name}-no-start-work`, (await page.getByTestId('tele-start-work').count()) === 0 && !text.includes('התחל משימת עבודה'));
    check(`${name}-order`, buttonOrderOk(text), text.slice(0, 250));
  }

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await contextWithSession(browser, tairSession, { width: viewport.width, height: viewport.height });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    await assertHome(page, viewport.name);
    await page.screenshot({ path: join(OUT, `${viewport.name}-home.png`), fullPage: true });

    await page.getByTestId('dalia-open-inbox').click({ force: true });
    await page.waitForTimeout(1200);
    check(`${viewport.name}-dalia-open`, (await page.getByTestId('dalia-agent-chat-screen').count()) > 0 || (await page.getByTestId('tele-nav-back').count()) > 0);
    if (await page.getByTestId('tele-nav-home').count()) await page.getByTestId('tele-nav-home').first().click({ force: true });
    else if (await page.getByTestId('tele-nav-back').count()) await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(1200);
    await assertHome(page, `${viewport.name}-after-dalia`);

    await page.getByTestId('tele-my-report').click({ force: true });
    await page.waitForTimeout(1500);
    check(`${viewport.name}-my-report`, (await page.getByTestId('tele-my-report-screen').count()) > 0 && (await page.getByTestId('workday-summary').count()) > 0);
    await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(1000);
    await assertHome(page, `${viewport.name}-after-report`);
    check(`${viewport.name}-continue-treatment`, (await page.getByTestId('tele-continue-treatment').count()) > 0);
    await ctx.close();
  }

  const ctx = await contextWithSession(browser, tairSession, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.getByTestId('tele-work-from-list').click({ force: true });
  await page.waitForTimeout(2500);
  const preview = page.getByTestId('tele-lead-preview');
  const leadNo = page.getByTestId('tele-lead-number').first();
  const leadText = await leadNo.innerText().catch(() => '');
  check('work-from-list-preview', (await preview.count()) > 0 && (await page.getByTestId('tele-lead-number').count()) > 0, await page.locator('body').innerText().then((t) => t.slice(0, 300)));
  check('lead-number-shown', /ליד #/.test(leadText), leadText);
  check('details-before-call', (await page.getByTestId('directory-lead-card').count()) > 0 && ((await page.locator('body').innerText()).includes('השיחה לא התחילה')));
  check('call-not-auto-started', (await page.getByTestId('tele-end-call').count()) === 0);
  await page.screenshot({ path: join(OUT, 'work-from-list-preview.png'), fullPage: true });

  await page.getByTestId('tele-start-call').click({ force: true });
  await page.waitForTimeout(2500);
  check('call-starts-only-after-click', (await page.getByTestId('tele-end-call').count()) > 0);
  await page.screenshot({ path: join(OUT, 'after-start-call.png'), fullPage: true });
  await abortCallsSince(t0);
  await restoreClaims(claimSnap);
  await ctx.close();
  await browser.close();

  check('keep-1-29-after', (await keep129()).ok, await keep129());
  const after = await snapshotClaims();
  const claimMismatch = claimSnap.filter((row) => {
    const now = after.find((r) => r.id === row.id);
    return !now || now.claimed_by !== row.claimed_by;
  });
  check('claims-restored', claimMismatch.length === 0, claimMismatch.map((r) => r.lead_number));
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
  try {
    await abortCallsSince(t0);
    await restoreClaims(claimSnap);
  } catch { /* keep */ }
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
