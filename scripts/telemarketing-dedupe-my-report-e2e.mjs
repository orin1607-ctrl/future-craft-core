/**
 * Staging E2E: duplicate lower stats removed from agent my-report. No DB writes.
 * node scripts/telemarketing-dedupe-my-report-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dedupe-my-report-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const TAIR = { email: 'tairmizrahi311@gmail.com' };
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
  dbWrites: false,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

async function waitLive(timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    const indexHtml = await fetch(`${BASE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    const asset = (indexHtml.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
    let js = '';
    if (asset) js = await fetch(`${BASE}/${asset}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    const hasSummary = js.includes('workday-summary');
    const noDup = !js.includes('my-report-stats');
    last = { deployTxt: deployTxt.trim(), asset, hasSummary, noDup };
    if (hasSummary && noDup && /feat\/incident-alerts-staging/.test(deployTxt)) return last;
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

try {
  const live = await waitLive();
  report.deployed_ref = live.deployTxt;
  report.liveBundle = live.asset;
  check('deploy-staging', /feat\/incident-alerts-staging/.test(live.deployTxt), live.deployTxt);
  check('deploy-not-prod', !live.deployTxt.includes(PROD_REF) && !live.deployTxt.includes('dalia-car') && !live.deployTxt.includes('dalia-c.com'), live.deployTxt);
  check('bundle-has-upper-summary', live.hasSummary, live.asset);
  check('bundle-no-lower-dup', live.noDup, live.asset);

  const { count: dirCount } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
  const { data: nums } = await adminDb.from('telemarketing_lead_directory').select('lead_number');
  const have = new Set((nums || []).map((r) => String(r.lead_number)));
  const missing = Array.from({ length: 29 }, (_, i) => String(i + 1)).filter((n) => !have.has(n));
  check('keep-1-29', missing.length === 0, { dirCount, missing });

  const tairSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await contextWithSession(browser, tairSession, { width: viewport.width, height: viewport.height });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.getByTestId('tele-my-report').click({ force: true });
    await page.getByTestId('tele-my-report-screen').waitFor({ timeout: 30000 });
    await page.getByTestId('workday-summary').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    check(`${viewport.name}-summary-once`, (await page.getByTestId('workday-summary').count()) === 1);
    check(`${viewport.name}-no-lower-dup`, (await page.getByTestId('my-report-stats').count()) === 0);
    const text = await page.getByTestId('tele-my-report-screen').innerText();
    check(`${viewport.name}-upper-title`, text.includes('סיכום יום עבודה') || text.includes('סיכום תקופה'));
    check(`${viewport.name}-tabs`, ['היום', 'אתמול', 'השבוע', 'החודש', 'טווח מותאם'].every((t) => text.includes(t)));
    check(`${viewport.name}-presets`, (await page.getByTestId('my-report-preset-today').count()) > 0 && (await page.getByTestId('my-report-preset-week').count()) > 0 && (await page.getByTestId('my-report-preset-month').count()) > 0 && (await page.getByTestId('my-report-preset-custom').count()) > 0 && (await page.getByTestId('my-report-preset-yesterday').count()) > 0);
    check(`${viewport.name}-dates`, (await page.getByTestId('my-report-from').count()) > 0 && (await page.getByTestId('my-report-to').count()) > 0);
    check(`${viewport.name}-hours`, (await page.getByTestId('my-report-from-time').count()) > 0 && (await page.getByTestId('my-report-to-time').count()) > 0);
    check(`${viewport.name}-export`, (await page.getByTestId('my-report-export').count()) > 0);
    check(`${viewport.name}-nav`, (await page.getByTestId('tele-nav-back').count()) > 0 && (await page.getByTestId('tele-nav-home').count()) > 0);
    check(`${viewport.name}-times`, text.includes('זמן שיחות') && text.includes('זמן דיווח') && (text.includes('טיפול כולל בשיחות') || text.includes('זמן טיפול')));
    const call = Number(await page.getByTestId('workday-summary-callsec').getAttribute('data-value'));
    const reportSec = Number(await page.getByTestId('workday-summary-reportsec').getAttribute('data-value'));
    const treat = Number(await page.getByTestId('workday-summary-treatsec').getAttribute('data-value'));
    check(`${viewport.name}-no-double-count`, call + reportSec === treat, { call, reportSec, treat });
    check(`${viewport.name}-leads-heading`, text.includes('פירוט לידים'));
    await page.screenshot({ path: join(OUT, `agent-${viewport.name}.png`), fullPage: true });

    await page.getByTestId('my-report-preset-yesterday').click({ force: true });
    await page.waitForTimeout(1500);
    check(`${viewport.name}-yesterday`, (await page.getByTestId('workday-summary').count()) === 1 && (await page.getByTestId('my-report-stats').count()) === 0);
    await page.getByTestId('my-report-preset-week').click({ force: true });
    await page.waitForTimeout(1500);
    check(`${viewport.name}-week`, (await page.getByTestId('workday-summary').count()) === 1 && (await page.getByTestId('my-report-preset-week').count()) > 0);
    await page.getByTestId('my-report-preset-month').click({ force: true });
    await page.waitForTimeout(1500);
    check(`${viewport.name}-month`, (await page.getByTestId('workday-summary').count()) === 1);
    await page.getByTestId('my-report-preset-today').click({ force: true });
    await page.waitForTimeout(1500);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 12000 }).catch(() => null),
      page.getByTestId('my-report-export').click({ force: true }),
    ]);
    check(`${viewport.name}-export-click`, Boolean(download), download ? download.suggestedFilename() : 'no download');
    await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(800);
    check(`${viewport.name}-back`, (await page.getByTestId('telemarketing-agent-home').count()) > 0);
    await ctx.close();
  }

  const adminCtx = await contextWithSession(browser, adminSession, { width: 1440, height: 900 });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(5000);
  await adminPage.locator('#activity-report').waitFor({ timeout: 30000 });
  check('admin-report-present', (await adminPage.locator('#activity-report').count()) > 0);
  check('admin-totals-kept', (await adminPage.getByTestId('activity-totals').count()) > 0);
  await adminPage.screenshot({ path: join(OUT, 'admin-report.png'), fullPage: true });
  await adminCtx.close();
  await browser.close();

  const after = await directoryKeepSafe();
  check('keep-1-29-after', after.ok, after);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
  process.exit(report.pass ? 0 : 1);
}

async function directoryKeepSafe() {
  const { data } = await adminDb.from('telemarketing_lead_directory').select('lead_number');
  const have = new Set((data || []).map((r) => String(r.lead_number)));
  const missing = Array.from({ length: 29 }, (_, i) => String(i + 1)).filter((n) => !have.has(n));
  return { count: (data || []).length, missing, ok: missing.length === 0 };
}
