/**
 * Public STAGING QA — Recurring Email as a real user sees it.
 * Base: https://orin1607-ctrl.github.io/future-craft-core/claims
 * TEST claim only. Dry Run. No live send. No Production. No inbox scan.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-recurring-email-public-2026-09-05');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const TEST_TO = 'qa.recurring.closeout@futurecraft.staging';
const SUBJ = `QA public recurring ${new Date().toISOString().slice(0, 16)}`;
const BODY = 'TEST recurring email on public STAGING — dry_run only. If no reply, send again.';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  qaBase: PUBLIC,
  deployTxt: '',
  sha: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  checks: [],
  verdicts: {},
  open: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || loadDotEnv().VITE_SUPABASE_ANON_KEY;
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('login failed');
const session = auth.session;

const deployTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text()).catch(() => '');
report.deployTxt = deployTxt.trim();
rec('public-pages', Boolean(deployTxt), { deployTxt: deployTxt.trim() });

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF && !String(process.env.VITE_SUPABASE_URL || '').includes(PROD_REF));

async function inject(context) {
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    },
  });
}

async function openComposer(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 50000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(500);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(900);
  await page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first().click();
  await page.locator('[data-testid="claims-send-mail"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"]').waitFor({ state: 'visible', timeout: 20000 });
}

async function openMailFu(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 50000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(400);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(800);
  await page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first().click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(250);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(800);
}

async function fillComposer(page, subject) {
  await page.locator('[data-testid="mail-to"]').fill(TEST_TO);
  await page.locator('[data-testid="mail-to"]').press('Enter');
  await page.locator('[data-testid="mail-subj"]').fill(subject);
  await page.locator('[data-testid="mail-body"]').fill(BODY);
  if (!(await page.locator('[data-testid="mail-recurring"]').isChecked())) {
    await page.locator('[data-testid="mail-recurring"]').check();
  }
}

async function saveRecurringDays(page, days) {
  if (days === 1 || days === 2 || days === 3) {
    await page.locator(`[data-testid="mail-recurring-days-${days}"]`).click();
  } else {
    await page.locator('[data-testid="mail-recurring-days-other"]').click();
    await page.locator('[data-testid="mail-recurring-days-other-input"]').fill(String(days));
  }
  await page.locator('[data-testid="mail-recurring-save"]').click();
  await page.waitForTimeout(1800);
}

async function latestRepeat() {
  const rows = (await userDb.from('claims_reminders')
    .select('id, status, mail_kind, mail_to, mail_subject, repeat_every_days, next_run_at, row_data, created_at')
    .eq('claim_id', CLAIM_A)
    .eq('mail_kind', 'email_repeat')
    .order('created_at', { ascending: false })
    .limit(8)).data || [];
  return rows.find((r) => r.mail_to === TEST_TO && r.status === 'scheduled') || rows[0] || null;
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const desktop = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
await inject(desktop);
const page = await desktop.newPage();

try {
  await openComposer(page);
  const visible = (await page.locator('[data-testid="mail-recurring"]').count()) > 0
    && (await page.locator('[data-testid="mail-recurring-block"]').count()) > 0
    && (await page.locator('[data-testid="mail-recurring-days-1"]').count()) > 0
    && (await page.locator('[data-testid="mail-recurring-days-2"]').count()) > 0
    && (await page.locator('[data-testid="mail-recurring-days-3"]').count()) > 0
    && (await page.locator('[data-testid="mail-recurring-days-other"]').count()) > 0;
  rec('recurring-visible', visible);
  rec('not-mixed-followup', (await page.locator('[data-testid="mail-followup"]').count()) > 0 && (await page.locator('[data-testid="mail-schedule"]').count()) > 0);
  rec('every-1-control', await page.locator('[data-testid="mail-recurring-days-1"]').innerText().then((t) => t.includes('כל יום')).catch(() => false));
  rec('every-2-control', await page.locator('[data-testid="mail-recurring-days-2"]').innerText().then((t) => t.includes('כל יומיים')).catch(() => false));
  rec('every-3-control', await page.locator('[data-testid="mail-recurring-days-3"]').innerText().then((t) => t.includes('כל 3')).catch(() => false));
  rec('custom-control', (await page.locator('[data-testid="mail-recurring-days-other"]').count()) > 0);

  await fillComposer(page, `${SUBJ} d1`);
  await page.screenshot({ path: join(OUT, 'screenshots', 'desktop-composer.png'), fullPage: true });
  await saveRecurringDays(page, 1);
  let row = await latestRepeat();
  rec('every-1-day', row?.repeat_every_days === 1 && row?.status === 'scheduled', { id: row?.id, days: row?.repeat_every_days });

  await openComposer(page);
  await fillComposer(page, `${SUBJ} d2`);
  await saveRecurringDays(page, 2);
  row = await latestRepeat();
  rec('every-2-days', Number(row?.repeat_every_days) === 2 && row?.status === 'scheduled', { id: row?.id, days: row?.repeat_every_days });

  await openComposer(page);
  await fillComposer(page, `${SUBJ} d3`);
  await saveRecurringDays(page, 3);
  row = await latestRepeat();
  rec('every-3-days', Number(row?.repeat_every_days) === 3 && row?.status === 'scheduled', { id: row?.id, days: row?.repeat_every_days });

  await openComposer(page);
  await fillComposer(page, `${SUBJ} custom`);
  await saveRecurringDays(page, 8);
  row = await latestRepeat();
  rec('custom', Number(row?.repeat_every_days) === 8 && row?.status === 'scheduled', { id: row?.id, days: row?.repeat_every_days });

  const beforeDup = ((await userDb.from('claims_reminders').select('id').eq('claim_id', CLAIM_A).eq('mail_kind', 'email_repeat').eq('mail_to', TEST_TO).eq('status', 'scheduled')).data || []).length;
  await openComposer(page);
  await fillComposer(page, `${SUBJ} custom-dup`);
  await saveRecurringDays(page, 8);
  const afterDup = ((await userDb.from('claims_reminders').select('id').eq('claim_id', CLAIM_A).eq('mail_kind', 'email_repeat').eq('mail_to', TEST_TO).eq('status', 'scheduled')).data || []).length;
  rec('no-duplicate-reminders', afterDup === 1 && beforeDup === 1, { beforeDup, afterDup });

  await openMailFu(page);
  const boxes = await page.locator('.fu-box').allInnerTexts();
  rec('listed-recurring', boxes.some((t) => t.includes('מייל חוזר') && (t.includes('כל 8 ימים') || t.includes(TEST_TO))), { n: boxes.length });
  rec('not-listed-as-followup-or-scheduled', boxes.some((t) => t.includes('מייל חוזר')) && !boxes.filter((t) => t.includes(TEST_TO) && t.includes('מייל חוזר')).some((t) => t.includes('מעקב (Follow-up)') || t.includes('מייל מתוזמן')));
  await page.screenshot({ path: join(OUT, 'screenshots', 'desktop-mailfu.png'), fullPage: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openMailFu(page);
  const afterReload = await page.locator('.fu-box').allInnerTexts();
  const persisted = await latestRepeat();
  rec('refresh-persistence', Number(persisted?.repeat_every_days) === 8 && afterReload.some((t) => t.includes('מייל חוזר') && t.includes('כל 8')), { days: persisted?.repeat_every_days });

  const hist = (await userDb.from('claims_history').select('row_data').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(20)).data || [];
  rec('history', hist.some((h) => /מייל חוזר/.test(JSON.stringify(h.row_data || {}))), { n: hist.length });
} catch (err) {
  rec('desktop-flow', false, { err: String(err?.message || err) });
  await page.screenshot({ path: join(OUT, 'screenshots', 'desktop-error.png'), fullPage: true }).catch(() => null);
}

const mobileCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await inject(mobileCtx);
const mobile = await mobileCtx.newPage();
try {
  await openComposer(mobile);
  rec('mobile-visible', (await mobile.locator('[data-testid="mail-recurring"]').count()) > 0 && (await mobile.locator('[data-testid="mail-recurring-days-1"]').count()) > 0);
  await fillComposer(mobile, `${SUBJ} mobile`);
  await saveRecurringDays(mobile, 3);
  const mobRow = await latestRepeat();
  rec('mobile-save', Number(mobRow?.repeat_every_days) === 3 && mobRow?.status === 'scheduled', { days: mobRow?.repeat_every_days });
  await mobile.screenshot({ path: join(OUT, 'screenshots', 'mobile-composer.png'), fullPage: true });
  await openMailFu(mobile);
  const mobBoxes = await mobile.locator('.fu-box').allInnerTexts();
  rec('mobile-listed', mobBoxes.some((t) => t.includes('מייל חוזר')));
  await mobile.screenshot({ path: join(OUT, 'screenshots', 'mobile-mailfu.png'), fullPage: true });
} catch (err) {
  rec('mobile-flow', false, { err: String(err?.message || err) });
  await mobile.screenshot({ path: join(OUT, 'screenshots', 'mobile-error.png'), fullPage: true }).catch(() => null);
}
await mobileCtx.close();
await desktop.close();
await browser.close();

const dueWhen = new Date(Date.now() - 40000).toISOString();
const { data: dueData, error: dueErr } = await userDb.rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_A,
    mail_kind: 'email_repeat',
    mail_to: TEST_TO,
    mail_subject: `${SUBJ} due`,
    mail_body: BODY,
    attach_mode: 'none',
    repeat_every_days: '1',
    next_run_at: dueWhen,
    recipient_kind: 'other',
    purpose: 'recurring_send',
  },
});
const dueId = dueData?.id || '';
if (dueId) {
  const { data: rem } = await userDb.from('claims_reminders').select('row_data').eq('id', dueId).maybeSingle();
  await userDb.from('claims_reminders').update({
    row_data: { ...(rem?.row_data || {}), purpose: 'recurring_send' },
  }).eq('id', dueId);
}
rec('due-saved', Boolean(dueId) && !dueErr, { id: dueId, err: dueErr?.message });

console.log('waiting up to 6.5 min for existing cron dry_run of recurring…');
let dueAfter = null;
let dueJobs = [];
const deadline = Date.now() + 6.5 * 60 * 1000;
while (Date.now() < deadline) {
  dueAfter = dueId ? (await userDb.from('claims_reminders').select('id, status, next_run_at, mail_kind, repeat_every_days').eq('id', dueId).maybeSingle()).data : null;
  dueJobs = dueId ? ((await userDb.from('claims_mail_jobs').select('id, status, preview, finished_at, planned_at').eq('reminder_id', dueId).order('created_at', { ascending: false }).limit(8)).data || []) : [];
  if (dueJobs.some((j) => j.status === 'dry_run_sent' || j.status === 'failed' || j.status === 'sent')) break;
  await new Promise((r) => setTimeout(r, 20000));
}
const sentJob = dueJobs.find((j) => j.status === 'dry_run_sent');
const nextPending = dueJobs.find((j) => j.status === 'pending');
const samePlanned = dueJobs.filter((j) => sentJob && j.planned_at === sentJob.planned_at);
rec('dispatch-dry-run', Boolean(sentJob) && sentJob?.preview?.realEmailSend !== true && dueAfter?.mail_kind === 'email_repeat' && dueAfter?.status === 'scheduled', { reminder: dueAfter, jobs: dueJobs.map((j) => ({ id: j.id, status: j.status, planned_at: j.planned_at })) });
rec('next-occurrence-scheduled', Boolean(nextPending) && dueAfter?.status === 'scheduled', { next: nextPending?.planned_at, reminderNext: dueAfter?.next_run_at });
rec('no-duplicate-jobs', samePlanned.length <= 1, { samePlanned: samePlanned.length });
rec('not-live-sent', !dueJobs.some((j) => j.status === 'sent') && sentJob?.preview?.realEmailSend !== true, { statuses: dueJobs.map((j) => j.status) });

const stopWhen = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const { data: stopData, error: stopErr } = await userDb.rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_A,
    mail_kind: 'email_repeat',
    mail_to: 'qa.recurring.stop@futurecraft.staging',
    mail_subject: `${SUBJ} stop-on-reply`,
    mail_body: BODY,
    attach_mode: 'none',
    repeat_every_days: '2',
    next_run_at: stopWhen,
    recipient_kind: 'other',
    purpose: 'recurring_send',
  },
});
const stopId = stopData?.id || '';
rec('stop-row-saved', Boolean(stopId) && !stopErr, { id: stopId, err: stopErr?.message });
if (stopId) {
  const commId = `COM-QA-REC-${Date.now()}`;
  const ins = await userDb.from('claims_comm_log').insert({
    id: commId,
    claim_id: CLAIM_A,
    row_data: {
      id: commId,
      claimId: CLAIM_A,
      type: 'mail',
      direction: 'in',
      body: 'TEST inbound reply after recurring was created',
      at: new Date().toISOString(),
      by: 'qa.inbound.reply@example.com',
    },
  });
  rec('inbound-comm-inserted', !ins.error, { err: ins.error?.message, commId });
  const stopBrowser = await chromium.launch({ headless: true, channel: 'chrome' });
  const stopCtx = await stopBrowser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
  await inject(stopCtx);
  const stopPage = await stopCtx.newPage();
  try {
    await openMailFu(stopPage);
    await stopPage.waitForTimeout(1500);
    const stopped = (await userDb.from('claims_reminders').select('id, status').eq('id', stopId).maybeSingle()).data;
    rec('stops-when-reply-received', stopped?.status === 'cancelled', { status: stopped?.status, id: stopId });
    const pendingAfter = (await userDb.from('claims_mail_jobs').select('id, status').eq('reminder_id', stopId).in('status', ['pending', 'sending'])).data || [];
    rec('no-send-after-reply', pendingAfter.length === 0, { pending: pendingAfter.length });
    await stopPage.screenshot({ path: join(OUT, 'screenshots', 'desktop-stop-on-reply.png'), fullPage: true });
  } catch (err) {
    rec('stops-when-reply-received', false, { err: String(err?.message || err) });
  } finally {
    await stopBrowser.close();
  }
  const stillStopped = (await userDb.from('claims_reminders').select('status').eq('id', stopId).maybeSingle()).data;
  const lateJobs = (await userDb.from('claims_mail_jobs').select('id, status').eq('reminder_id', stopId).in('status', ['dry_run_sent', 'sent', 'pending'])).data || [];
  rec('still-stopped-after-open', stillStopped?.status === 'cancelled' && lateJobs.filter((j) => j.status === 'dry_run_sent' || j.status === 'sent').length === 0, { status: stillStopped?.status, lateJobs });
}

report.verdicts = {
  visible: report.checks.find((c) => c.name === 'recurring-visible')?.ok ? 'PASS' : 'FAIL',
  every1: report.checks.find((c) => c.name === 'every-1-day')?.ok ? 'PASS' : 'FAIL',
  every2: report.checks.find((c) => c.name === 'every-2-days')?.ok ? 'PASS' : 'FAIL',
  every3: report.checks.find((c) => c.name === 'every-3-days')?.ok ? 'PASS' : 'FAIL',
  custom: report.checks.find((c) => c.name === 'custom')?.ok ? 'PASS' : 'FAIL',
  refresh: report.checks.find((c) => c.name === 'refresh-persistence')?.ok ? 'PASS' : 'FAIL',
  stopsOnReply: report.checks.find((c) => c.name === 'stops-when-reply-received')?.ok ? 'PASS' : 'FAIL',
  noDuplicates: report.checks.filter((c) => /no-duplicate/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  history: report.checks.find((c) => c.name === 'history')?.ok ? 'PASS' : 'FAIL',
  dispatchDryRun: report.checks.find((c) => c.name === 'dispatch-dry-run')?.ok ? 'PASS' : 'FAIL',
  liveSend: mode === 'dry_run' ? 'BLOCKED' : 'FAIL',
  desktop: report.checks.filter((c) => /recurring-visible|every-1-day|listed-recurring|refresh-persistence/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  mobile: report.checks.filter((c) => c.name.startsWith('mobile-')).every((c) => c.ok) ? 'PASS' : 'FAIL',
};
if (mode === 'dry_run') report.open.push('Live Send BLOCKED. MAIL_DISPATCH_MODE=dry_run. Do not flip for all Staging.');
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
for (const name of ['desktop-composer.png', 'desktop-mailfu.png', 'mobile-composer.png', 'mobile-mailfu.png', 'desktop-stop-on-reply.png']) {
  const src = join(OUT, 'screenshots', name);
  if (existsSync(src)) copyFileSync(src, join(ART, `public_recurring_${name}`));
}
console.log(JSON.stringify({ ok: report.checks.every((c) => c.ok), verdicts: report.verdicts, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
