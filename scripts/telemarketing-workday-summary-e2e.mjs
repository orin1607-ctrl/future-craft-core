/**
 * Staging E2E: work-day summary layer on agent + admin reports.
 * node scripts/telemarketing-workday-summary-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-workday-summary-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const AVI = { id: 'e260ae41-c144-4545-bbf3-36f1d2735180', name: 'אבי טלמיטינג' };
const ADMIN = { email: 'orin1607@gmail.com' };
const MARKER = 'qa-workday-summary-e2e';
const QA_TODAY = 'QA-WORKDAY-TODAY';
const QA_YDAY = 'QA-WORKDAY-YDAY';
const QA_OTHER = 'QA-WORKDAY-OTHER';

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

function jerusalemDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function shiftDay(iso, delta) {
  const dt = new Date(`${iso}T12:00:00+03:00`);
  dt.setDate(dt.getDate() + delta);
  return jerusalemDate(dt);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  expectedVsActual: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
  tairKept: true,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 500) : '');
}

async function waitLiveNeedle(needle, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    const indexHtml = await fetch(`${BASE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    const asset = (indexHtml.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
    let hasNeedle = false;
    if (asset) {
      const js = await fetch(`${BASE}/${asset}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
      hasNeedle = js.includes(needle);
    }
    last = { deployTxt: deployTxt.trim(), asset, hasNeedle };
    if (hasNeedle && /feat\/incident-alerts-staging/.test(deployTxt)) return last;
    await sleep(20000);
  }
  throw new Error(`live bundle timeout ${JSON.stringify(last)}`);
}

async function contextWithSession(browser, session, viewport) {
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  return context;
}

async function directoryKeep() {
  const { data } = await adminDb.from('telemarketing_lead_directory').select('lead_number');
  const nums = new Set((data || []).map((r) => String(r.lead_number)));
  const missing = Array.from({ length: 29 }, (_, i) => String(i + 1)).filter((n) => !nums.has(n));
  return { count: (data || []).length, missing, ok: missing.length === 0 };
}

async function cleanupQa() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').in('company_name', [QA_TODAY, QA_YDAY, QA_OTHER]);
  const extra = await adminDb.from('telemarketing_calls').select('id').eq('summary', MARKER);
  const ids = [...new Set([...(calls || []), ...(extra.data || [])].map((c) => c.id))];
  if (ids.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
    await adminDb.from('telemarketing_calls').delete().in('id', ids);
  }
  await adminDb.from('telemarketing_work_sessions').delete().eq('description', MARKER);
  await adminDb.from('telemarketing_work_sessions').delete().eq('company_name', QA_TODAY);
}

async function insertCall(row) {
  const { error } = await adminDb.from('telemarketing_calls').insert(row);
  if (error) throw new Error(`insert call: ${error.message}`);
}

async function insertQa(today, yesterday) {
  const stamp = Date.now();
  await insertCall({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_TODAY,
    phone: '0501999001',
    started_at: `${today}T08:00:00+03:00`,
    ended_at: `${today}T08:10:00+03:00`,
    duration_seconds: 600,
    report_started_at: `${today}T08:10:00+03:00`,
    report_ended_at: `${today}T08:12:00+03:00`,
    report_duration_seconds: 120,
    treated_ended_at: `${today}T08:12:00+03:00`,
    treatment_duration_seconds: 720,
    status: 'completed',
    result: 'מעוניין',
    lead_rating: 'חם',
    summary: MARKER,
    client_token: `qa-workday-a-${stamp}`,
    created_by: TAIR.id,
  });
  await insertCall({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_TODAY,
    phone: '0501999001',
    started_at: `${today}T16:00:00+03:00`,
    ended_at: `${today}T16:05:00+03:00`,
    duration_seconds: 300,
    report_started_at: `${today}T16:05:00+03:00`,
    report_ended_at: `${today}T16:06:00+03:00`,
    report_duration_seconds: 60,
    treated_ended_at: `${today}T16:06:00+03:00`,
    treatment_duration_seconds: 360,
    status: 'completed',
    result: 'לא ענה',
    lead_rating: 'קר',
    summary: MARKER,
    client_token: `qa-workday-b-${stamp}`,
    created_by: TAIR.id,
  });
  await insertCall({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_YDAY,
    phone: '0501999002',
    started_at: `${yesterday}T11:00:00+03:00`,
    ended_at: `${yesterday}T11:08:00+03:00`,
    duration_seconds: 480,
    report_started_at: `${yesterday}T11:08:00+03:00`,
    report_ended_at: `${yesterday}T11:09:00+03:00`,
    report_duration_seconds: 60,
    treated_ended_at: `${yesterday}T11:09:00+03:00`,
    treatment_duration_seconds: 540,
    status: 'completed',
    result: 'ביקש הצעת מחיר',
    lead_rating: 'פושר',
    summary: MARKER,
    client_token: `qa-workday-c-${stamp}`,
    created_by: TAIR.id,
  });
  await insertCall({
    employee_id: AVI.id,
    employee_name: AVI.name,
    company_name: QA_OTHER,
    phone: '0501999099',
    started_at: `${today}T09:00:00+03:00`,
    ended_at: `${today}T09:20:00+03:00`,
    duration_seconds: 999,
    report_duration_seconds: 100,
    treatment_duration_seconds: 1099,
    status: 'completed',
    result: 'מעוניין',
    summary: MARKER,
    client_token: `qa-workday-avi-${stamp}`,
    created_by: AVI.id,
  });
  const { error: workErr } = await adminDb.from('telemarketing_work_sessions').insert({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_TODAY,
    phone: '0501999001',
    task_type: 'חיפוש מידע',
    description: MARKER,
    started_at: `${today}T12:00:00+03:00`,
    ended_at: `${today}T12:10:00+03:00`,
    duration_seconds: 600,
    report_started_at: `${today}T12:10:00+03:00`,
    report_ended_at: `${today}T12:11:00+03:00`,
    report_duration_seconds: 60,
    treated_ended_at: `${today}T12:11:00+03:00`,
    treatment_duration_seconds: 660,
    status: 'completed',
    client_token: `qa-workday-w-${stamp}`,
    created_by: TAIR.id,
  });
  if (workErr) throw new Error(`insert work: ${workErr.message}`);
}

async function raw(page, testId) {
  return page.getByTestId(testId).getAttribute('data-value');
}

try {
  const live = await waitLiveNeedle('workday-summary');
  report.deployed_ref = live.deployTxt;
  report.liveBundle = live.asset;
  check('deploy-staging', /feat\/incident-alerts-staging/.test(live.deployTxt), live.deployTxt);
  check('deploy-not-prod', !live.deployTxt.includes(PROD_REF) && !live.deployTxt.includes('dalia-car') && !live.deployTxt.includes('dalia-c.com'), live.deployTxt);
  check('bundle-workday-summary', live.hasNeedle, live.asset);

  const today = jerusalemDate();
  const yesterday = shiftDay(today, -1);
  await cleanupQa();
  await insertQa(today, yesterday);
  check('keep-1-29-before', (await directoryKeep()).ok, await directoryKeep());

  const tairSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const tairCli = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  await tairCli.auth.setSession({ access_token: tairSession.access_token, refresh_token: tairSession.refresh_token });
  const { data: leaked } = await tairCli.from('telemarketing_calls').select('id').eq('company_name', QA_OTHER);
  check('rls-hides-other-employee', !leaked?.length, leaked);

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  async function runAgent(viewport) {
    const ctx = await contextWithSession(browser, tairSession, viewport);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.getByTestId('tele-my-report').click({ force: true });
    await page.getByTestId('tele-my-report-screen').waitFor({ timeout: 30000 });
    await page.getByTestId('workday-summary').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    check(`agent-${viewport.name}-summary`, (await page.getByTestId('workday-summary').count()) > 0);
    check(`agent-${viewport.name}-title-today`, (await page.getByTestId('workday-summary').innerText()).includes('סיכום יום עבודה'));
    check(`agent-${viewport.name}-nav`, (await page.getByTestId('tele-nav-back').count()) > 0 && (await page.getByTestId('tele-nav-home').count()) > 0);
    check(`agent-${viewport.name}-no-employee-select`, (await page.locator('[data-testid="tele-my-report-screen"] select').count()) === 0);
    check(`agent-${viewport.name}-readonly`, (await page.getByTestId('tele-submit-report').count()) === 0);
    const body = await page.getByTestId('tele-my-report-screen').innerText();
    check(`agent-${viewport.name}-self-only`, body.includes('תאיר') && !body.includes(AVI.name) && !body.includes(QA_OTHER));
    check(`agent-${viewport.name}-leads-remain`, (await page.getByTestId('my-report-lead').count()) >= 1);

    const stats = {
      first: await raw(page, 'workday-summary-first'),
      last: await raw(page, 'workday-summary-last'),
      window: Number(await raw(page, 'workday-summary-window')),
      measured: Number(await raw(page, 'workday-summary-measured')),
      call: Number(await raw(page, 'workday-summary-callsec')),
      reportSec: Number(await raw(page, 'workday-summary-reportsec')),
      treat: Number(await raw(page, 'workday-summary-treatsec')),
      work: Number(await raw(page, 'workday-summary-worksec')),
      workreport: Number(await raw(page, 'workday-summary-workreportsec')),
      worktreat: Number(await raw(page, 'workday-summary-worktreatsec')),
      dials: await raw(page, 'workday-summary-dials'),
      answered: await raw(page, 'workday-summary-answered'),
      noanswer: await raw(page, 'workday-summary-noanswer'),
      leads: await raw(page, 'workday-summary-leads'),
      followups: await raw(page, 'workday-summary-followups'),
      interested: await raw(page, 'workday-summary-interested'),
      hot: await raw(page, 'workday-summary-hot'),
      meetings: await raw(page, 'workday-summary-meetings'),
      quotes: await raw(page, 'workday-summary-quotes'),
      continued: await raw(page, 'workday-summary-continued'),
    };
    check(`agent-${viewport.name}-window-vs-measured`, stats.window !== stats.measured && stats.window > stats.measured, { window: stats.window, measured: stats.measured });
    check(`agent-${viewport.name}-no-double-call`, stats.call + stats.reportSec === stats.treat, stats);
    check(`agent-${viewport.name}-no-double-work`, stats.work + stats.workreport === stats.worktreat, stats);
    check(`agent-${viewport.name}-measured-once`, stats.treat + stats.worktreat === stats.measured, stats);
    check(`agent-${viewport.name}-not-window-as-work`, stats.measured !== stats.window, stats);
    await page.screenshot({ path: join(OUT, `agent-${viewport.name}-today.png`), fullPage: true });

    await page.getByTestId('my-report-preset-week').click({ force: true });
    await page.waitForTimeout(2500);
    check(`agent-${viewport.name}-week-days`, (await page.getByTestId('workday-by-day').count()) > 0);
    check(`agent-${viewport.name}-week-yday-row`, (await page.getByTestId(`workday-day-${yesterday}`).count()) > 0);
    await page.screenshot({ path: join(OUT, `agent-${viewport.name}-week.png`), fullPage: true });
    await page.getByTestId(`workday-day-${yesterday}`).click({ force: true });
    await page.waitForTimeout(2000);
    const afterClick = await page.getByTestId('workday-summary').innerText();
    check(`agent-${viewport.name}-click-day`, afterClick.includes('סיכום יום עבודה') && (await page.getByTestId('workday-by-day').count()) === 0, afterClick.slice(0, 180));

    await page.getByTestId('my-report-preset-today').click({ force: true });
    await page.waitForTimeout(2000);
    await page.getByTestId('my-report-preset-month').click({ force: true });
    await page.waitForTimeout(2000);
    check(`agent-${viewport.name}-month`, (await page.getByTestId('workday-summary').count()) > 0);

    await page.getByTestId('my-report-from').fill(today);
    await page.getByTestId('my-report-to').fill(today);
    await page.waitForTimeout(2000);
    await page.getByTestId('my-report-from-time').fill('09:00');
    await page.getByTestId('my-report-to-time').fill('14:00');
    await page.waitForTimeout(2000);
    const hourDials = Number(await raw(page, 'workday-summary-dials'));
    check(`agent-${viewport.name}-hours`, hourDials < Number(stats.dials), { hourDials, todayDials: stats.dials });

    await page.getByTestId('my-report-preset-today').click({ force: true });
    await page.waitForTimeout(2000);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      page.getByTestId('my-report-export').click({ force: true }),
    ]);
    if (download) {
      const path = join(OUT, `export-${viewport.name}.csv`);
      await download.saveAs(path);
      const csv = readFileSync(path, 'utf8');
      check(`agent-${viewport.name}-export`, csv.includes('תאיר') && csv.includes('חלון פעילות (משך)') && csv.includes('סה״כ זמן עבודה מדוד') && !csv.includes(AVI.name), csv.slice(0, 250));
    } else {
      check(`agent-${viewport.name}-export`, false, 'no download');
    }

    await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(800);
    check(`agent-${viewport.name}-back`, (await page.getByTestId('telemarketing-agent-home').count()) > 0);
    await ctx.close();
    return stats;
  }

  const desktop = await runAgent({ name: 'desktop', width: 1280, height: 900 });
  await runAgent({ name: 'mobile', width: 390, height: 844 });

  const adminCtx = await contextWithSession(browser, adminSession, { width: 1440, height: 900 });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(6000);
  await adminPage.locator('#activity-report').waitFor({ timeout: 30000 });
  await adminPage.getByTestId('activity-from-date').fill(today);
  await adminPage.getByTestId('activity-to-date').fill(today);
  await adminPage.waitForTimeout(1200);
  await adminPage.getByTestId('activity-employee-filter').selectOption(TAIR.name);
  await adminPage.waitForTimeout(2500);
  check('admin-summary', (await adminPage.getByTestId('workday-summary').count()) > 0);
  const admin = {
    first: await raw(adminPage, 'workday-summary-first'),
    last: await raw(adminPage, 'workday-summary-last'),
    window: await raw(adminPage, 'workday-summary-window'),
    measured: await raw(adminPage, 'workday-summary-measured'),
    call: await raw(adminPage, 'workday-summary-callsec'),
    reportSec: await raw(adminPage, 'workday-summary-reportsec'),
    treat: await raw(adminPage, 'workday-summary-treatsec'),
    dials: await raw(adminPage, 'workday-summary-dials'),
    answered: await raw(adminPage, 'workday-summary-answered'),
    noanswer: await raw(adminPage, 'workday-summary-noanswer'),
    leads: await raw(adminPage, 'workday-summary-leads'),
    followups: await raw(adminPage, 'workday-summary-followups'),
    interested: await raw(adminPage, 'workday-summary-interested'),
    hot: await raw(adminPage, 'workday-summary-hot'),
    meetings: await raw(adminPage, 'workday-summary-meetings'),
    quotes: await raw(adminPage, 'workday-summary-quotes'),
  };
  await adminPage.screenshot({ path: join(OUT, 'admin-tair-today.png'), fullPage: true });
  const pairs = [
    ['first', desktop.first, admin.first],
    ['last', desktop.last, admin.last],
    ['window', String(desktop.window), admin.window],
    ['measured', String(desktop.measured), admin.measured],
    ['call', String(desktop.call), admin.call],
    ['report', String(desktop.reportSec), admin.reportSec],
    ['treat', String(desktop.treat), admin.treat],
    ['dials', desktop.dials, admin.dials],
    ['answered', desktop.answered, admin.answered],
    ['noanswer', desktop.noanswer, admin.noanswer],
    ['leads', desktop.leads, admin.leads],
    ['followups', desktop.followups, admin.followups],
    ['interested', desktop.interested, admin.interested],
    ['hot', desktop.hot, admin.hot],
    ['meetings', desktop.meetings, admin.meetings],
    ['quotes', desktop.quotes, admin.quotes],
  ];
  report.expectedVsActual = pairs.map(([id, agentVal, adminVal]) => ({ id, agentVal, adminVal, match: agentVal === adminVal }));
  for (const [id, agentVal, adminVal] of pairs) {
    check(`manager-vs-employee-${id}`, agentVal != null && agentVal === adminVal, { agentVal, adminVal });
  }
  await adminCtx.close();
  await browser.close();

  await cleanupQa();
  check('keep-1-29-after', (await directoryKeep()).ok, await directoryKeep());
  const { data: leftover } = await adminDb.from('telemarketing_calls').select('id').eq('summary', MARKER);
  check('qa-cleaned', !leftover?.length, leftover);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
  try { await cleanupQa(); } catch { /* keep */ }
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    failed: report.checks.filter((c) => !c.ok),
    deployed_ref: report.deployed_ref,
    liveBundle: report.liveBundle,
    expectedVsActual: report.expectedVsActual,
  }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
