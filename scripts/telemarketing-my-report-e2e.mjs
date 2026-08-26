/**
 * Staging E2E: agent «הדוח שלי» vs super-admin activity report for Tair.
 * node scripts/telemarketing-my-report-e2e.mjs
 * Does not reset directory 1-29. Cleans only qa-my-report-e2e rows.
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-my-report-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const AVI = { email: 'yoni133333@gmail.com', id: 'e260ae41-c144-4545-bbf3-36f1d2735180', name: 'אבי טלמיטינג' };
const ADMIN = { email: 'orin1607@gmail.com' };
const MARKER = 'qa-my-report-e2e';
const QA_COMPANY = 'QA-MY-REPORT-E2E';
const QA_QUOTE = 'QA-MY-REPORT-QUOTE';
const QA_OTHER = 'QA-MY-REPORT-OTHER';
async function directoryKeep() {
  const { data } = await adminDb.from('telemarketing_lead_directory').select('lead_number, company_name');
  const nums = new Set((data || []).map((r) => String(r.lead_number)));
  const missing = Array.from({ length: 29 }, (_, i) => String(i + 1)).filter((n) => !nums.has(n));
  return { count: (data || []).length, missing, ok: missing.length === 0 };
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  compare: {},
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

async function cleanupQa() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').in('company_name', [QA_COMPANY, QA_QUOTE, QA_OTHER]);
  const extra = await adminDb.from('telemarketing_calls').select('id').eq('summary', MARKER);
  const ids = [...new Set([...(calls || []), ...(extra.data || [])].map((c) => c.id))];
  if (ids.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', ids);
    await adminDb.from('telemarketing_calls').delete().in('id', ids);
  }
  await adminDb.from('telemarketing_work_sessions').delete().eq('description', MARKER);
  await adminDb.from('telemarketing_work_sessions').delete().eq('company_name', QA_COMPANY);
}

async function insertQa(today) {
  const stamp = Date.now();
  const call = async (row) => {
    const { error } = await adminDb.from('telemarketing_calls').insert(row);
    if (error) throw new Error(`insert call: ${error.message}`);
  };
  await call({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_COMPANY,
    phone: '0501888001',
    started_at: `${today}T10:00:00+03:00`,
    ended_at: `${today}T10:02:00+03:00`,
    duration_seconds: 120,
    report_started_at: `${today}T10:02:00+03:00`,
    report_ended_at: `${today}T10:02:30+03:00`,
    report_duration_seconds: 30,
    treated_ended_at: `${today}T10:02:30+03:00`,
    treatment_duration_seconds: 150,
    status: 'completed',
    result: 'מעוניין',
    lead_rating: 'חם',
    summary: MARKER,
    needs_follow_up: true,
    next_action: 'לחזור',
    follow_up_date: today,
    follow_up_time: '15:00',
    client_token: `qa-my-report-a-${stamp}`,
    created_by: TAIR.id,
  });
  await call({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_COMPANY,
    phone: '0501888001',
    started_at: `${today}T11:00:00+03:00`,
    ended_at: `${today}T11:00:40+03:00`,
    duration_seconds: 40,
    report_started_at: `${today}T11:00:40+03:00`,
    report_ended_at: `${today}T11:01:00+03:00`,
    report_duration_seconds: 20,
    treated_ended_at: `${today}T11:01:00+03:00`,
    treatment_duration_seconds: 60,
    status: 'completed',
    result: 'לא ענה',
    lead_rating: 'קר',
    summary: MARKER,
    client_token: `qa-my-report-b-${stamp}`,
    created_by: TAIR.id,
  });
  await call({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_QUOTE,
    phone: '0501888002',
    started_at: `${today}T16:00:00+03:00`,
    ended_at: `${today}T16:01:00+03:00`,
    duration_seconds: 60,
    report_started_at: `${today}T16:01:00+03:00`,
    report_ended_at: `${today}T16:01:15+03:00`,
    report_duration_seconds: 15,
    treated_ended_at: `${today}T16:01:15+03:00`,
    treatment_duration_seconds: 75,
    status: 'completed',
    result: 'ביקש הצעת מחיר',
    lead_rating: 'פושר',
    summary: MARKER,
    client_token: `qa-my-report-c-${stamp}`,
    created_by: TAIR.id,
  });
  await call({
    employee_id: AVI.id,
    employee_name: AVI.name,
    company_name: QA_OTHER,
    phone: '0501888099',
    started_at: `${today}T10:30:00+03:00`,
    ended_at: `${today}T10:31:00+03:00`,
    duration_seconds: 999,
    report_duration_seconds: 100,
    treatment_duration_seconds: 1099,
    status: 'completed',
    result: 'מעוניין',
    summary: MARKER,
    client_token: `qa-my-report-avi-${stamp}`,
    created_by: AVI.id,
  });
  const { error: workErr } = await adminDb.from('telemarketing_work_sessions').insert({
    employee_id: TAIR.id,
    employee_name: TAIR.name,
    company_name: QA_COMPANY,
    phone: '0501888001',
    task_type: 'חיפוש מידע',
    description: MARKER,
    started_at: `${today}T12:00:00+03:00`,
    ended_at: `${today}T12:03:00+03:00`,
    duration_seconds: 180,
    report_started_at: `${today}T12:03:00+03:00`,
    report_ended_at: `${today}T12:03:20+03:00`,
    report_duration_seconds: 20,
    treated_ended_at: `${today}T12:03:20+03:00`,
    treatment_duration_seconds: 200,
    status: 'completed',
    client_token: `qa-my-report-w-${stamp}`,
    created_by: TAIR.id,
  });
  if (workErr) throw new Error(`insert work: ${workErr.message}`);
}

async function labeledValue(page, root, label) {
  const loc = page.locator(`${root} [data-stat-label="${label}"]`).locator('p').last();
  if ((await loc.count()) === 0) return null;
  return loc.innerText();
}

async function agentRaw(page, testId) {
  return page.getByTestId(testId).getAttribute('data-value');
}

try {
  const live = await waitLiveNeedle('tele-my-report');
  report.deployed_ref = live.deployTxt;
  report.liveBundle = live.asset;
  check('deploy-staging', /feat\/incident-alerts-staging/.test(live.deployTxt), live.deployTxt);
  check('deploy-not-prod', !live.deployTxt.includes(PROD_REF) && !live.deployTxt.includes('dalia-car') && !live.deployTxt.includes('dalia-c.com'), live.deployTxt);
  check('bundle-my-report', live.hasNeedle, live.asset);

  const today = jerusalemDate();
  await cleanupQa();
  await insertQa(today);
  const dirBefore = await directoryKeep();
  check('keep-1-29-before', dirBefore.ok, dirBefore);

  const tairSession = await sessionFor(TAIR.email);
  const adminSession = await sessionFor(ADMIN.email);
  const tairCli = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  await tairCli.auth.setSession({ access_token: tairSession.access_token, refresh_token: tairSession.refresh_token });
  const { data: leaked } = await tairCli.from('telemarketing_calls').select('id, employee_name, company_name').eq('company_name', QA_OTHER);
  check('rls-hides-other-employee-calls', !leaked?.length, leaked);

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  async function runAgentViewport(viewport) {
    const ctx = await contextWithSession(browser, tairSession, viewport);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    check(`agent-${viewport.name}-home-button`, (await page.getByTestId('tele-my-report').count()) > 0);
    await page.getByTestId('tele-my-report').click({ force: true });
    await page.getByTestId('tele-my-report-screen').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    check(`agent-${viewport.name}-nav`, (await page.getByTestId('tele-nav-back').count()) > 0 && (await page.getByTestId('tele-nav-home').count()) > 0);
    check(`agent-${viewport.name}-no-employee-select`, (await page.locator('[data-testid="tele-my-report-screen"] select').count()) === 0);
    check(`agent-${viewport.name}-readonly`, (await page.getByTestId('tele-submit-report').count()) === 0);
    const body = await page.locator('[data-testid="tele-my-report-screen"]').innerText();
    check(`agent-${viewport.name}-self-only`, body.includes('תאיר') && !body.includes(AVI.name) && !body.includes(QA_OTHER), body.slice(0, 400));
    await page.getByTestId('my-report-stats').waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(OUT, `agent-${viewport.name}-today.png`), fullPage: true });
    const todayStats = {
      dials: await agentRaw(page, 'my-report-stat-dials'),
      answered: await agentRaw(page, 'my-report-stat-answered'),
      noanswer: await agentRaw(page, 'my-report-stat-noanswer'),
      callsec: await agentRaw(page, 'my-report-stat-callsec'),
      reportsec: await agentRaw(page, 'my-report-stat-reportsec'),
      treatsec: await agentRaw(page, 'my-report-stat-treatsec'),
      worksec: await agentRaw(page, 'my-report-stat-worksec'),
      workreportsec: await agentRaw(page, 'my-report-stat-workreportsec'),
      worktreatsec: await agentRaw(page, 'my-report-stat-worktreatsec'),
      measured: await agentRaw(page, 'my-report-stat-measured'),
      leads: await agentRaw(page, 'my-report-stat-leads'),
      interested: await agentRaw(page, 'my-report-stat-interested'),
      hot: await agentRaw(page, 'my-report-stat-hot'),
      meetings: await agentRaw(page, 'my-report-stat-meetings'),
      quotes: await agentRaw(page, 'my-report-stat-quotes'),
      continued: await agentRaw(page, 'my-report-stat-continued'),
      followups: await agentRaw(page, 'my-report-stat-followups'),
      dalia: await agentRaw(page, 'my-report-stat-dalia'),
      display: {
        dials: await labeledValue(page, '[data-testid="my-report-stats"]', 'ניסיונות חיוג'),
        call: await labeledValue(page, '[data-testid="my-report-stats"]', 'זמן שיחות'),
        report: await labeledValue(page, '[data-testid="my-report-stats"]', 'זמן דיווחי שיחה'),
        treat: await labeledValue(page, '[data-testid="my-report-stats"]', 'זמן טיפול בשיחות'),
        work: await labeledValue(page, '[data-testid="my-report-stats"]', 'זמן משימות'),
        measured: await labeledValue(page, '[data-testid="my-report-stats"]', 'סה״כ זמן עבודה מדוד'),
        interested: await labeledValue(page, '[data-testid="my-report-stats"]', 'מתעניינים'),
        hot: await labeledValue(page, '[data-testid="my-report-stats"]', 'לידים חמים'),
        meetings: await labeledValue(page, '[data-testid="my-report-stats"]', 'פגישות'),
        continued: await labeledValue(page, '[data-testid="my-report-stats"]', 'המשך טיפול'),
        followups: await labeledValue(page, '[data-testid="my-report-stats"]', 'Follow-up'),
        dalia: await labeledValue(page, '[data-testid="my-report-stats"]', 'פניות 🟣'),
        noanswer: await labeledValue(page, '[data-testid="my-report-stats"]', 'לא ענו'),
        answered: await labeledValue(page, '[data-testid="my-report-stats"]', 'נענו'),
        workreport: await labeledValue(page, '[data-testid="my-report-stats"]', 'דיווחי משימות'),
        worktreat: await labeledValue(page, '[data-testid="my-report-stats"]', 'טיפול במשימות'),
      },
    };
    check(`agent-${viewport.name}-includes-qa-dials`, Number(todayStats.dials) >= 3, todayStats);
    check(`agent-${viewport.name}-quotes-today`, Number(todayStats.quotes) >= 1, todayStats.quotes);
    check(`agent-${viewport.name}-leads`, (await page.getByTestId('my-report-lead').count()) >= 1);
    const lead = page.getByTestId('my-report-lead').filter({ hasText: QA_COMPANY }).first();
    if (await lead.count()) {
      await lead.click({ force: true });
      await page.waitForTimeout(400);
      check(`agent-${viewport.name}-lead-expand`, (await page.getByTestId('my-report-lead-attempts').count()) > 0);
    } else {
      check(`agent-${viewport.name}-lead-expand`, false, 'QA company row missing');
    }

    await page.getByTestId('my-report-preset-week').click({ force: true });
    await page.waitForTimeout(2000);
    const weekDials = await agentRaw(page, 'my-report-stat-dials');
    check(`agent-${viewport.name}-week`, Number(weekDials) >= Number(todayStats.dials), { weekDials, today: todayStats.dials });

    await page.getByTestId('my-report-preset-month').click({ force: true });
    await page.waitForTimeout(2000);
    const monthDials = await agentRaw(page, 'my-report-stat-dials');
    check(`agent-${viewport.name}-month`, Number(monthDials) >= Number(weekDials), { monthDials, weekDials });

    await page.getByTestId('my-report-from').fill(today);
    await page.getByTestId('my-report-to').fill(today);
    await page.waitForTimeout(2000);
    check(`agent-${viewport.name}-custom-day`, (await agentRaw(page, 'my-report-stat-dials')) === todayStats.dials);

    await page.getByTestId('my-report-from-time').fill('09:00');
    await page.getByTestId('my-report-to-time').fill('14:00');
    await page.waitForTimeout(2000);
    const hourDials = await agentRaw(page, 'my-report-stat-dials');
    const hourQuotes = await agentRaw(page, 'my-report-stat-quotes');
    const hourBody = await page.locator('[data-testid="tele-my-report-screen"]').innerText();
    check(`agent-${viewport.name}-hour-window`, Number(hourQuotes) === 0 && !hourBody.includes(QA_QUOTE) && hourBody.includes(QA_COMPANY) && Number(hourDials) < Number(todayStats.dials), { hourDials, hourQuotes, today: todayStats.dials });
    await page.screenshot({ path: join(OUT, `agent-${viewport.name}-hours.png`), fullPage: true });

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
      check(`agent-${viewport.name}-export`, csv.includes('תאיר') && csv.includes('ניסיונות חיוג') && !csv.includes(AVI.name) && !csv.includes('כל העובדים'), csv.slice(0, 300));
    } else {
      check(`agent-${viewport.name}-export`, false, 'no download');
    }

    await page.getByTestId('tele-nav-back').first().click({ force: true });
    await page.waitForTimeout(800);
    check(`agent-${viewport.name}-back-home`, (await page.getByTestId('telemarketing-agent-home').count()) > 0 && (await page.getByTestId('tele-my-report-screen').count()) === 0);

    await page.getByTestId('tele-my-report').click({ force: true });
    await page.getByTestId('tele-my-report-screen').waitFor({ timeout: 20000 });
    await page.getByTestId('tele-nav-home').first().click({ force: true });
    await page.waitForTimeout(800);
    check(`agent-${viewport.name}-home-btn`, (await page.getByTestId('telemarketing-agent-home').count()) > 0);

    await ctx.close();
    return todayStats;
  }

  const desktopStats = await runAgentViewport({ name: 'desktop', width: 1280, height: 900 });
  await runAgentViewport({ name: 'mobile', width: 390, height: 844 });

  const adminCtx = await contextWithSession(browser, adminSession, { width: 1440, height: 900 });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(6000);
  await adminPage.locator('#activity-report').waitFor({ timeout: 30000 });
  await adminPage.getByTestId('activity-from-date').fill(today);
  await adminPage.getByTestId('activity-to-date').fill(today);
  await adminPage.waitForTimeout(1500);
  const emp = adminPage.getByTestId('activity-employee-filter');
  await emp.waitFor({ timeout: 15000 });
  await emp.selectOption({ label: TAIR.name }).catch(async () => {
    await emp.selectOption(TAIR.name);
  });
  await adminPage.waitForTimeout(2500);
  const adminBody = await adminPage.locator('#activity-report').innerText();
  check('admin-tair-body', adminBody.includes('תאיר'), adminBody.slice(0, 200));
  const selected = await emp.inputValue();
  check('admin-employee-is-tair', selected === TAIR.name, selected);
  const adminDisplay = {
    dials: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'ניסיונות חיוג'),
    answered: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'נענו'),
    noanswer: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'לא ענו'),
    continued: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'המשך טיפול'),
    interested: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'מתעניינים'),
    hot: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'לידים חמים/דחופים'),
    meetings: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'פגישות (רוצה פגישה)'),
    followups: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'חזרות בטווח'),
    dalia: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'פניות דליה'),
    call: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'משך שיחות'),
    report: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'זמן דיווחי שיחה'),
    treat: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'סה״כ טיפול בשיחות'),
    work: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'זמן משימות'),
    workreport: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'דיווחי משימות'),
    worktreat: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'טיפול במשימות'),
    measured: await labeledValue(adminPage, '[data-testid="activity-totals"]', 'סה״כ זמן עבודה מדוד'),
  };
  await adminPage.screenshot({ path: join(OUT, 'admin-tair-today.png'), fullPage: true });
  const pairs = [
    ['dials', desktopStats.display.dials, adminDisplay.dials],
    ['answered', desktopStats.display.answered, adminDisplay.answered],
    ['noanswer', desktopStats.display.noanswer, adminDisplay.noanswer],
    ['continued', desktopStats.display.continued, adminDisplay.continued],
    ['interested', desktopStats.display.interested, adminDisplay.interested],
    ['hot', desktopStats.display.hot, adminDisplay.hot],
    ['meetings', desktopStats.display.meetings, adminDisplay.meetings],
    ['followups', desktopStats.display.followups, adminDisplay.followups],
    ['dalia', desktopStats.display.dalia, adminDisplay.dalia],
    ['call', desktopStats.display.call, adminDisplay.call],
    ['report', desktopStats.display.report, adminDisplay.report],
    ['treat', desktopStats.display.treat, adminDisplay.treat],
    ['work', desktopStats.display.work, adminDisplay.work],
    ['workreport', desktopStats.display.workreport, adminDisplay.workreport],
    ['worktreat', desktopStats.display.worktreat, adminDisplay.worktreat],
    ['measured', desktopStats.display.measured, adminDisplay.measured],
  ];
  report.compare = { agent: desktopStats, admin: adminDisplay, pairs };
  for (const [id, agentVal, adminVal] of pairs) {
    check(`manager-vs-employee-${id}`, agentVal != null && agentVal === adminVal, { agentVal, adminVal });
  }
  check('admin-not-avi-totals', !String(adminDisplay.dials).includes('999'), adminDisplay);

  await adminCtx.close();
  await browser.close();

  await cleanupQa();
  const dirAfter = await directoryKeep();
  check('keep-1-29-after', dirAfter.ok, dirAfter);
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
  }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
