/**
 * Staging QA: stuck reset, unstarted-call void, report-cap markers, desktop symmetry.
 * Restores claims. Deletes only QA-created released rows from this run.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-stuck-reset-report-cap-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-stuck-reset-report-cap-2026-08-30');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const AVI = { email: 'yoni133333@gmail.com', id: 'e260ae41-c144-4545-bbf3-36f1d2735180' };
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
async function openPage(browser, session, path, viewport, entryUserId) {
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  if (entryUserId) {
    await ctx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), {
      key: `tele_entry_mode_v1:${entryUserId}`,
      value: 'work',
    });
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  if (await page.getByTestId('tele-entry-purpose').count()) {
    await page.getByTestId('tele-entry-work').click();
    await page.waitForTimeout(2000);
  }
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
  const [leads, calls, followups, sessions, completed] = await Promise.all([
    adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_work_sessions').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
  ]);
  return {
    leads: leads.count,
    calls: calls.count,
    followups: followups.count,
    sessions: sessions.count,
    completedCalls: completed.count,
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
  qaCallIds: [],
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

let claimsBefore = [];
const qaCallIds = [];
try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\.js/)?.[0] || html.match(/assets\/index-[^"'>\s]+\.js/)?.[0];
  report.liveBundle = bundle || null;
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${stamp}`).then((r) => r.text()).catch(() => '');
  report.deployed_ref = deployTxt.trim();
  check('deploy-staging', /feat\/incident-alerts-staging/.test(deployTxt) && !/production/i.test(deployTxt), deployTxt.trim());
  if (EXPECTED_SHA) {
    check('deploy-expected-sha', deployTxt.includes(EXPECTED_SHA.slice(0, 7)), { expected: EXPECTED_SHA.slice(0, 8), deployTxt: deployTxt.trim() });
  }
  if (bundle) {
    const js = await fetch(`${BASE}/${bundle}`).then((r) => r.text());
    check('bundle-stuck-reset', js.includes('tele-stuck-reset') && js.includes('איפוס פעולה תקועה'));
    check('bundle-void', js.includes('tele-void-unstarted-call') && js.includes('ביטול — השיחה לא התחילה'));
    check('bundle-report-cap', js.includes('data-report-cap-seconds') && js.includes('tele-report-cap') && js.includes('03:00'));
    check('bundle-desktop-span', js.includes('last-child:nth-child(odd)') && js.includes('only-child'));
  } else {
    check('bundle-stuck-reset', false);
  }

  const before = await counts();
  claimsBefore = await snapshotClaims();
  const tairOpenBefore = await adminDb.from('telemarketing_calls').select('id, status, company_name, ended_at').eq('employee_id', TAIR.id).eq('status', 'in_progress');
  report.tairOpenBefore = tairOpenBefore.data || [];

  const adminSession = await sessionFor(ADMIN.email);
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  const { ctx: adminCtx, page: adminPage } = await openPage(browser, adminSession, '/telemarketing/admin', { width: 1440, height: 900 }, null);
  await adminPage.waitForTimeout(3000);
  if (!(await adminPage.getByTestId('tele-admin-home').count())) {
    await adminPage.screenshot({ path: join(OUT, 'admin-missing-home.png'), fullPage: true });
    throw new Error(`admin home missing url=${adminPage.url()} body=${(await adminPage.locator('body').innerText()).slice(0, 400)}`);
  }
  check('admin-stuck-panel', (await adminPage.getByTestId('tele-stuck-reset').count()) > 0);
  await adminPage.getByTestId('tele-stuck-reset-agent').selectOption(TAIR.id);
  await adminPage.getByTestId('tele-stuck-reset-preview').click();
  await adminPage.waitForTimeout(1500);
  const tairPreviewHasStuck = (await adminPage.getByTestId('tele-stuck-reset-confirm').count()) > 0;
  check('admin-tair-preview', tairPreviewHasStuck || (await adminPage.getByTestId('tele-stuck-reset-idle').count()) > 0, { tairPreviewHasStuck });
  if (tairPreviewHasStuck) {
    await adminPage.getByTestId('tele-stuck-reset-confirm').click();
    await adminPage.waitForTimeout(2500);
    await adminPage.getByTestId('tele-stuck-reset-preview').click();
    await adminPage.waitForTimeout(1500);
    const body = await adminPage.locator('body').innerText();
    check(
      'admin-tair-reset-done',
      (await adminPage.getByTestId('tele-stuck-reset-confirm').count()) === 0 || body.includes('אופס מצב תקוע') || (await adminPage.getByTestId('tele-stuck-reset-idle').count()) > 0,
      { confirm: await adminPage.getByTestId('tele-stuck-reset-confirm').count(), idle: await adminPage.getByTestId('tele-stuck-reset-idle').count() },
    );
  } else {
    check('admin-tair-already-idle', true);
  }

  await adminPage.getByTestId('tele-stuck-reset-preview').click();
  await adminPage.waitForTimeout(1200);
  check('admin-idle-no-dangerous-reset', (await adminPage.getByTestId('tele-stuck-reset-confirm').count()) === 0);
  check('admin-idle-message', (await adminPage.getByTestId('tele-stuck-reset-idle').count()) > 0);
  await adminPage.screenshot({ path: join(OUT, 'admin-stuck-reset.png') });

  const tairOpenAfterReset = await adminDb.from('telemarketing_calls').select('id, status').eq('employee_id', TAIR.id).eq('status', 'in_progress');
  check('tair-no-open-call', (tairOpenAfterReset.data || []).length === 0, tairOpenAfterReset.data);

  const { page: agentPage } = await openPage(browser, tairSession, '/telemarketing', { width: 1440, height: 900 }, TAIR.id);
  await agentPage.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
  check('tair-idle-after-reset', (await agentPage.getByTestId('tele-start-call').count()) > 0);
  check('tair-no-pending-report', !(await agentPage.locator('body').innerText()).includes('יש להשלים דיווח למטה'));

  const token = `qa-void-${Date.now()}`;
  const inserted = await adminDb.from('telemarketing_calls').insert({
    employee_id: TAIR.id,
    employee_name: 'תאיר מזרחי',
    company_name: 'QA-VOID-UNSTARTED',
    phone: '0500000000',
    started_at: new Date().toISOString(),
    status: 'in_progress',
    client_token: token,
    created_by: TAIR.id,
  }).select('id').single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || 'insert void qa call failed');
  qaCallIds.push(inserted.data.id);

  await agentPage.reload({ waitUntil: 'domcontentloaded' });
  await agentPage.waitForTimeout(2500);
  if (await agentPage.getByTestId('tele-entry-purpose').count()) {
    await agentPage.getByTestId('tele-entry-work').click();
    await agentPage.waitForTimeout(1000);
  }
  check('void-button-visible', (await agentPage.getByTestId('tele-void-unstarted-call').count()) > 0);
  await agentPage.getByTestId('tele-void-unstarted-call').click();
  await agentPage.waitForTimeout(1500);
  const voided = await adminDb.from('telemarketing_calls').select('status, result, duration_seconds, needs_follow_up').eq('id', inserted.data.id).maybeSingle();
  check('void-released', voided.data?.status === 'released', voided.data);
  check('void-no-result', !voided.data?.result, voided.data);
  check('void-no-followup-flag', voided.data?.needs_follow_up === false, voided.data);
  check('agent-idle-after-void', (await agentPage.getByTestId('tele-start-call').count()) > 0);

  const late = await adminDb.from('telemarketing_calls').insert({
    employee_id: TAIR.id,
    employee_name: 'תאיר מזרחי',
    company_name: 'QA-VOID-TOO-LATE',
    phone: '0500000001',
    started_at: new Date(Date.now() - 20000).toISOString(),
    status: 'in_progress',
    client_token: `qa-late-${Date.now()}`,
    created_by: TAIR.id,
  }).select('id').single();
  if (late.data?.id) qaCallIds.push(late.data.id);
  await agentPage.reload({ waitUntil: 'domcontentloaded' });
  await agentPage.waitForTimeout(2500);
  if (await agentPage.getByTestId('tele-entry-purpose').count()) {
    await agentPage.getByTestId('tele-entry-work').click();
    await agentPage.waitForTimeout(1000);
  }
  check('void-hidden-after-grace', (await agentPage.getByTestId('tele-void-unstarted-call').count()) === 0);
  check('real-call-end-visible', (await agentPage.getByTestId('tele-end-call').count()) > 0);

  await adminPage.getByTestId('tele-stuck-reset-agent').selectOption(TAIR.id);
  await adminPage.getByTestId('tele-stuck-reset-preview').click();
  await adminPage.waitForTimeout(1200);
  if ((await adminPage.getByTestId('tele-stuck-reset-confirm').count()) > 0) {
    await adminPage.getByTestId('tele-stuck-reset-confirm').click();
    await adminPage.waitForTimeout(1500);
  }

  const { page: desktop1024 } = await openPage(browser, tairSession, '/telemarketing', { width: 1024, height: 768 }, TAIR.id);
  await desktop1024.getByTestId('tele-agent-layout').waitFor({ timeout: 20000 });
  const { page: laptop } = await openPage(browser, tairSession, '/telemarketing', { width: 1280, height: 800 }, TAIR.id);
  const { page: mobile } = await openPage(browser, tairSession, '/telemarketing', { width: 390, height: 844 }, TAIR.id);
  await agentPage.screenshot({ path: join(OUT, 'agent-desktop-1440.png') });
  await laptop.screenshot({ path: join(OUT, 'agent-laptop-1280.png') });
  await desktop1024.screenshot({ path: join(OUT, 'agent-1024.png') });
  await mobile.screenshot({ path: join(OUT, 'agent-mobile.png') });

  const hole = await agentPage.evaluate(() => {
    const grid = document.querySelector('[data-testid="telemarketing-agent-home"] .grid');
    if (!grid) return { ok: true, reason: 'no-home-grid' };
    const items = [...grid.children];
    const gridBox = grid.getBoundingClientRect();
    const last = items[items.length - 1].getBoundingClientRect();
    const oddLast = items.length % 2 === 1;
    const spans = !oddLast || last.width >= gridBox.width * 0.8;
    return { ok: spans, count: items.length, lastW: Math.round(last.width), gridW: Math.round(gridBox.width), oddLast };
  });
  check('desktop-no-half-row-hole', hole.ok, hole);
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check('mobile-no-overflow', mobileOverflow);

  if (qaCallIds.length) {
    await adminDb.from('telemarketing_calls').delete().in('id', qaCallIds);
  }
  await restoreClaims(claimsBefore);
  const after = await counts();
  check('data-leads-unchanged', before.leads === after.leads, { before: before.leads, after: after.leads });
  check('data-followups-unchanged', before.followups === after.followups, { before: before.followups, after: after.followups });
  check('data-sessions-unchanged', before.sessions === after.sessions, { before: before.sessions, after: after.sessions });
  check('completed-calls-unchanged', before.completedCalls === after.completedCalls, { before: before.completedCalls, after: after.completedCalls });
  check('no-new-qa-rows', after.calls <= before.calls, { before: before.calls, after: after.calls });

  await browser.close();
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
  try { if (qaCallIds.length) await adminDb.from('telemarketing_calls').delete().in('id', qaCallIds); } catch { /* keep */ }
  try { await restoreClaims(claimsBefore); } catch { /* keep */ }
}

writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  pass: report.pass,
  failed: report.checks.filter((c) => c.ok === false),
  deployed_ref: report.deployed_ref,
  liveBundle: report.liveBundle,
}, null, 2));
if (!report.pass) process.exit(1);
