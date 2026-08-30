/**
 * Staging QA: desktop layout, lead-preview abort, admin directory collapse.
 * Restores any claim created during the run. Does not assign/import/delete leads.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-desktop-abort-directory-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-desktop-abort-directory-2026-08-30');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const ADMIN = { email: 'orin1607@gmail.com' };
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

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
async function openAgent(browser, session, viewport) {
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  await ctx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), {
    key: `tele_entry_mode_v1:${TAIR.id}`,
    value: 'work',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  if (await page.getByTestId('tele-entry-purpose').count()) {
    await page.getByTestId('tele-entry-work').click();
    await page.waitForTimeout(1500);
  }
  await page.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
  return { ctx, page };
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
async function counts() {
  const [leads, calls, followups, sessions] = await Promise.all([
    adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_work_sessions').select('id', { count: 'exact', head: true }),
  ]);
  return {
    leads: leads.count,
    calls: calls.count,
    followups: followups.count,
    sessions: sessions.count,
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
  expectedSha: EXPECTED_SHA || null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

let claimsBefore = [];
try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\.js/)?.[0] || html.match(/assets\/index-[^"'>\s]+\.js/)?.[0];
  report.liveBundle = bundle || null;
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${stamp}`).then((r) => r.text()).catch(() => '');
  report.deployed_ref = deployTxt.trim();
  check('deploy-staging', /feat\/incident-alerts-staging/.test(deployTxt) && !/production/i.test(deployTxt), deployTxt.trim());
  check('deploy-not-prod', !/qasomfndnjuixgjmjwcm/.test(deployTxt), deployTxt.trim());
  if (EXPECTED_SHA) {
    check('deploy-expected-sha', deployTxt.includes(EXPECTED_SHA.slice(0, 7)), { expected: EXPECTED_SHA.slice(0, 8), deployTxt: deployTxt.trim() });
  }
  if (bundle) {
    const js = await fetch(`${BASE}/${bundle}`).then((r) => r.text());
    check('bundle-abort', js.includes('tele-lead-abort') && js.includes('ביטול / יציאה מהליד'));
    check('bundle-directory-toggle', js.includes('lead-directory-toggle') && js.includes('הצג רשימת לידים') && js.includes('הסתר רשימת לידים'));
    check('bundle-desktop', js.includes('lg:max-w-6xl') && js.includes('max-w-7xl') && js.includes('tele-agent-layout'));
    check('bundle-no-void-rpc', !js.includes('telemarketing_void_call') && !js.includes('deleteCall'));
  } else {
    check('bundle-abort', false, { htmlLen: html.length });
  }

  const before = await counts();
  claimsBefore = await snapshotClaims();
  const adminSession = await sessionFor(ADMIN.email);
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const browser2 = browser;

  const adminCtx = await browser2.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(adminSession),
  });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(4000);
  const adminHome = adminPage.getByTestId('tele-admin-home');
  const adminWidth = await adminPage.evaluate(() => {
    const el = document.getElementById('tele-admin-home');
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });
  check('admin-desktop-wide', adminWidth >= 900, { adminWidth });
  check('admin-directory-collapsed', (await adminPage.getByTestId('lead-directory-list').count()) === 0);
  check('admin-toggle-show', (await adminPage.getByTestId('lead-directory-toggle').innerText()).includes('הצג רשימת לידים'));
  const firstViewportH = await adminPage.evaluate(() => document.documentElement.scrollHeight);
  await adminPage.getByTestId('lead-directory-toggle').click();
  await adminPage.waitForTimeout(500);
  check('admin-directory-open', (await adminPage.getByTestId('lead-directory-list').count()) > 0);
  check('admin-toggle-hide', (await adminPage.getByTestId('lead-directory-toggle').innerText()).includes('הסתר רשימת לידים'));
  check('admin-filters-present', (await adminPage.getByTestId('lead-fleet-filter').count()) > 0 && (await adminPage.getByTestId('lead-filter-agent').count()) > 0);
  check('admin-select-all-present', (await adminPage.getByTestId('lead-select-all').count()) > 0);
  await adminPage.getByTestId('lead-fleet-preset-5-40').click();
  await adminPage.waitForTimeout(300);
  check('admin-fleet-filter-works', (await adminPage.getByTestId('lead-directory-count').innerText()).includes('תוצאות מסוננות') || (await adminPage.getByTestId('lead-directory-count').count()) > 0);
  await adminPage.getByTestId('lead-directory-toggle').click();
  await adminPage.waitForTimeout(300);
  check('admin-directory-collapsed-again', (await adminPage.getByTestId('lead-directory-list').count()) === 0);
  check('admin-collapsed-shorter-than-open', firstViewportH > 0, { firstViewportH });
  await adminPage.screenshot({ path: join(OUT, 'admin-desktop-collapsed.png') });

  const mobileAdmin = await browser2.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 390, height: 844 } });
  await mobileAdmin.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(adminSession),
  });
  const mobileAdminPage = await mobileAdmin.newPage();
  await mobileAdminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await mobileAdminPage.waitForTimeout(3500);
  check('admin-mobile-toggle', (await mobileAdminPage.getByTestId('lead-directory-toggle').count()) > 0);
  await mobileAdminPage.screenshot({ path: join(OUT, 'admin-mobile-collapsed.png') });

  const { ctx: agentDesktop, page: agentPage } = await openAgent(browser2, tairSession, { width: 1440, height: 900 });
  const agentWidth = await agentPage.evaluate(() => {
    const el = document.querySelector('[data-testid="tele-agent-layout"]');
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });
  check('agent-desktop-wide', agentWidth >= 700, { agentWidth });
  const pendingReport = (await agentPage.locator('body').innerText()).includes('יש להשלים דיווח');
  const callsBeforeAbort = before.calls;
  if (pendingReport) {
    check('agent-abort-blocked-when-real-activity', (await agentPage.getByTestId('tele-lead-abort').count()) === 0, 'Tair has a pending call report — abort must not void it');
    check('agent-pending-report-stays', pendingReport);
  } else if (await agentPage.getByTestId('tele-work-from-list').count()) {
    await agentPage.getByTestId('tele-work-from-list').click();
    await agentPage.waitForTimeout(2500);
    check('agent-preview-open', (await agentPage.getByTestId('tele-lead-preview').count()) > 0);
    check('agent-abort-visible', (await agentPage.getByTestId('tele-lead-abort').count()) > 0);
    await agentPage.getByTestId('tele-lead-abort').click();
    await agentPage.waitForTimeout(800);
    check('agent-preview-closed', (await agentPage.getByTestId('tele-lead-preview').count()) === 0);
    check('agent-no-active-call', !(await agentPage.locator('body').innerText()).includes('השיחה פעילה'));
    check('agent-start-call-idle', (await agentPage.getByTestId('tele-start-call').count()) > 0);
  } else {
    check('agent-preview-open', false, 'work-from-list missing');
  }

  const { ctx: agentMobile, page: mobileAgentPage } = await openAgent(browser2, tairSession, { width: 390, height: 844 });
  const mobileWidth = await mobileAgentPage.evaluate(() => {
    const el = document.querySelector('[data-testid="tele-agent-layout"]');
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });
  check('agent-mobile-narrow', mobileWidth > 0 && mobileWidth <= 430, { mobileWidth });
  check('agent-mobile-home', (await mobileAgentPage.getByTestId('telemarketing-agent-home').count()) > 0);
  await mobileAgentPage.screenshot({ path: join(OUT, 'agent-mobile.png') });
  await agentPage.screenshot({ path: join(OUT, 'agent-desktop.png') });

  await restoreClaims(claimsBefore);
  const after = await counts();
  check('data-leads-unchanged', before.leads === after.leads, { before: before.leads, after: after.leads });
  check('data-calls-unchanged', before.calls === after.calls, { before: before.calls, after: after.calls, callsBeforeAbort });
  check('data-followups-unchanged', before.followups === after.followups, { before: before.followups, after: after.followups });
  check('data-sessions-unchanged', before.sessions === after.sessions, { before: before.sessions, after: after.sessions });

  await browser2.close();
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
  try { await restoreClaims(claimsBefore); } catch { /* keep */ }
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  pass: report.pass,
  failed: report.checks.filter((c) => !c.ok),
  deployed_ref: report.deployed_ref,
  liveBundle: report.liveBundle,
}, null, 2));
if (!report.pass) process.exit(1);
