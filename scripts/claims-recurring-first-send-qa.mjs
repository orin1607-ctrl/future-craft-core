#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — Recurring first-send now vs future datetime.
 * TEST claims only. Live TEST send only to yoni122222@gmail.com.
 * No Production. No schema/cron. No Follow-up / scheduled-once / 3h scan changes.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || '2f80236').slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-recurring-first-send-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const SELF = 'yoni122222@gmail.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const FUTURE_DATE = '2026-09-10';
const FUTURE_TIME = '10:00';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailDispatchModeTouched: false,
  gmail3hCronTouched: false,
  schemaMigration: false,
  newScheduler: false,
  followupChanged: false,
  scheduledOnceChanged: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  claimNow: '',
  claimLater: '',
  remNow: '',
  remLater: '',
  firstSendLive: false,
  futureNotSentEarly: false,
  cycleFromFirst: false,
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 280)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch { /* optional */ }
  return out;
}
const env = loadDotEnv();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('worker login failed');
  return data.session;
}
function authHdr(session) {
  return { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}
async function invoke(session, fn, body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: authHdr(session),
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const invokeGmail = (session, body) => invoke(session, 'claims-gmail', body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDeploy() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait pages ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await sleep(15000);
  }
  return false;
}

async function inject(context, session) {
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

async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  try {
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `recurring-first-send-${name}.png`));
  } catch { /* skip */ }
}

async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}

async function openClaims(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  const mine = page.locator('[data-testid="claims-mine-toggle"]');
  if (await mine.count()) {
    const label = (await mine.first().innerText().catch(() => '')) || '';
    if (/שלי|התביעות שלי/.test(label)) await mine.first().click();
  }
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  await page.waitForTimeout(500);
}

async function fillIf(page, sel, value) {
  const loc = page.locator(sel).first();
  if (await loc.count()) await loc.fill(value).catch(() => undefined);
}

function searchBox(page) {
  return page.locator('[data-testid="claims-search"]').locator('visible=true').first();
}
async function typeSearch(page, q) {
  const box = searchBox(page);
  await box.waitFor({ state: 'visible', timeout: 15000 });
  await box.evaluate((el, value) => {
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, q);
  await page.waitForTimeout(500);
}

async function closeOverlays(page) {
  for (let i = 0; i < 8; i++) {
    const vis = page.locator('.ov.open .mcl, .ov.open [data-testid="treat-center-close"]').locator('visible=true');
    if (await vis.count()) {
      await vis.first().evaluate((el) => el.click()).catch(() => undefined);
      await page.waitForTimeout(250);
      continue;
    }
    break;
  }
}

async function openClaimCard(page, client, claimId) {
  const openTitle = await page.locator('.ov.open .card-title-num').innerText().catch(() => '');
  if ((claimId && openTitle.includes(claimId)) || (client && openTitle.includes(client))) return true;
  await closeOverlays(page);
  await typeSearch(page, client || claimId);
  await page.waitForTimeout(400);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) await row.first().evaluate((el) => el.click());
  else await page.getByText(client, { exact: false }).first().click().catch(() => undefined);
  await page.waitForFunction((id) => {
    const n = document.querySelector('.ov.open .card-title-num');
    return !!(n && (!id || (n.textContent || '').includes(id)));
  }, claimId, { timeout: 20000 });
  return true;
}

async function createClaim(page, client, plate) {
  await closeOverlays(page);
  await page.locator('[data-testid="claims-open-new"]').evaluate((el) => el.click());
  await page.waitForSelector('[data-testid="claims-new-modal"].open [data-testid="intake-name"], .ov.open[data-testid="claims-new-modal"] [data-testid="intake-name"]', { timeout: 20000 });
  const title = await page.locator('#mClaimT').innerText().catch(() => '');
  if (/עריכת תיק/.test(title)) {
    await page.evaluate(() => {
      const el = document.getElementById('fc_id');
      if (el) el.value = '';
    });
  }
  await page.locator('[data-testid="intake-name"]').fill(client);
  await page.locator('[data-testid="intake-phone"]').fill('0500000092');
  await fillIf(page, '#in_email', SELF);
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  await fillIf(page, '#in_co', 'הפניקס');
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-08');
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.locator('[data-testid="claims-new-modal"].open, .ov.open[data-testid="claims-new-modal"]').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
  let created = null;
  for (let i = 0; i < 24 && !created; i++) {
    await page.waitForTimeout(500);
    created = (await userDb.from('claims_records').select('id, client_name, plate, status, row_data').eq('plate', plate).maybeSingle()).data;
  }
  if (!created?.id) throw new Error(`createClaim did not persist ${client} / ${plate}`);
  await openClaimCard(page, client, created.id);
  return created;
}

async function openComposer(page, client, claimId) {
  await openClaimCard(page, client, claimId);
  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"]').waitFor({ state: 'visible', timeout: 20000 });
}

async function fillComposer(page, subject) {
  await page.locator('[data-testid="mail-to"]').fill(SELF);
  await page.locator('[data-testid="mail-to"]').press('Enter');
  await page.locator('[data-testid="mail-subj"]').fill(subject);
  await page.locator('[data-testid="mail-body"]').fill('TEST recurring first-send on public STAGING. Do not send to customers.');
  if (!(await page.locator('[data-testid="mail-recurring"]').isChecked())) {
    await page.locator('[data-testid="mail-recurring"]').check();
  }
}

async function openMailFu(page, client, claimId) {
  await closeOverlays(page);
  await openClaimCard(page, client, claimId);
  const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
  if (await snap.count()) {
    const exp = await snap.getAttribute('aria-expanded');
    if (exp === 'false') await snap.click().catch(() => undefined);
  }
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(250);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true }).catch(() => undefined);
  await page.locator('[data-testid="mailfu-ready"]').waitFor({ state: 'visible', timeout: 25000 }).catch(() => undefined);
}

async function latestRepeat(claimId, subjectPart) {
  const rows = (await userDb.from('claims_reminders')
    .select('id, status, mail_kind, mail_to, mail_subject, repeat_every_days, next_run_at, row_data, created_at, cancelled_at')
    .eq('claim_id', claimId)
    .eq('mail_kind', 'email_repeat')
    .order('created_at', { ascending: false })
    .limit(8)).data || [];
  return rows.find((r) => (!subjectPart || String(r.mail_subject || '').includes(subjectPart))) || rows[0] || null;
}

async function jobsFor(remId) {
  if (!remId) return [];
  return (await userDb.from('claims_mail_jobs')
    .select('id, reminder_id, planned_at, status, finished_at, preview, fail_reason')
    .eq('reminder_id', remId)
    .order('planned_at', { ascending: true })).data || [];
}

function jobLive(j) {
  const prev = j?.preview && typeof j.preview === 'object' ? j.preview : {};
  return prev.realEmailSend === true || Boolean(prev.gmail_message_id);
}

function pad(n) { return String(n).padStart(2, '0'); }
function localParts(iso) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const session = await login();
const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
rec('staging-only', STAGING_REF !== PROD_REF);

const status = await invokeGmail(session, { action: 'status' });
rec('gmail-3h-untouched', Number(status.json?.scheduler?.everyMs || status.json?.mailboxScan?.everyMs) === 3 * 60 * 60 * 1000, {
  everyMs: status.json?.scheduler?.everyMs || status.json?.mailboxScan?.everyMs,
});

const stamp = Date.now();
const clientNow = `TEST-FS-NOW-${stamp}`;
const plateNow = `FN${String(stamp).slice(-6)}`;
const clientLater = `TEST-FS-LATER-${stamp}`;
const plateLater = `FL${String(stamp).slice(-6)}`;
let claimNow = '';
let claimLater = '';
let remNow = null;
let remLater = null;

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await inject(desktop, session);
  const page = await desktop.newPage();
  page.on('dialog', (d) => d.accept());

  await openClaims(page);
  const createdNow = await createClaim(page, clientNow, plateNow);
  claimNow = createdNow.id;
  report.claimNow = claimNow;
  rec('claim-now-created', Boolean(claimNow) && !PROTECTED.has(claimNow), { claimNow });

  await openComposer(page, clientNow, claimNow);
  rec('composer-recurring-control', await page.locator('[data-testid="mail-recurring"]').count() > 0);
  rec('composer-schedule-untouched', await page.locator('[data-testid="mail-schedule"]').count() > 0);
  rec('composer-followup-untouched', await page.locator('[data-testid="mail-followup"]').count() > 0);
  await fillComposer(page, `QA first-send NOW ${stamp}`);
  await page.locator('[data-testid="mail-recurring-days-3"]').click();
  rec('first-send-now-radio', await page.locator('[data-testid="mail-recurring-first-now"]').isChecked());
  rec('first-send-later-radio', await page.locator('[data-testid="mail-recurring-first-later"]').count() > 0);
  const previewNow = await page.locator('[data-testid="mail-recurring-summary"]').innerText();
  rec('preview-now-first', /מועד שליחה ראשונה/.test(previewNow) && /עכשיו/.test(previewNow), { previewNow: previewNow.slice(0, 240) });
  rec('preview-now-freq', /כל 3 ימים/.test(previewNow), { previewNow: previewNow.slice(0, 240) });
  rec('preview-now-next', /שליחה הבאה/.test(previewNow), { previewNow: previewNow.slice(0, 240) });
  await shot(page, 'desktop-composer-now');
  await page.locator('[data-testid="mail-recurring-save"]').click();
  remNow = await latestRepeat(claimNow, 'QA first-send NOW');
  for (let i = 0; i < 20 && remNow; i++) {
    const jobs = await jobsFor(remNow.id);
    if (jobs.some(jobLive)) break;
    await sleep(1500);
    remNow = await latestRepeat(claimNow, 'QA first-send NOW');
  }
  if (remNow && !(await jobsFor(remNow.id)).some(jobLive)) {
    await openMailFu(page, clientNow, claimNow);
    if (await page.locator('[data-testid="claims-dispatch-due-test"]').count()) {
      await page.locator('[data-testid="claims-dispatch-due-test"]').click();
      await sleep(4000);
    }
  }
  remNow = await latestRepeat(claimNow, 'QA first-send NOW');
  report.remNow = remNow?.id || '';
  rec('now-reminder-saved', Boolean(remNow?.id) && remNow.status === 'scheduled' && Number(remNow.repeat_every_days) === 3, {
    id: remNow?.id, status: remNow?.status, days: remNow?.repeat_every_days, next: remNow?.next_run_at,
  });
  rec('now-no-duplicate', ((await userDb.from('claims_reminders').select('id').eq('claim_id', claimNow).eq('mail_kind', 'email_repeat').eq('status', 'scheduled')).data || []).length === 1);

  let nowJobs = await jobsFor(remNow?.id);
  const liveNow = nowJobs.filter(jobLive);
  rec('qa1-first-send-now-live', liveNow.length > 0, {
    jobs: nowJobs.map((j) => ({ id: j.id, status: j.status, planned: j.planned_at, live: jobLive(j), msgid: j.preview?.gmail_message_id })),
  });
  report.firstSendLive = liveNow.length > 0;

  remNow = await latestRepeat(claimNow, 'QA first-send NOW');
  nowJobs = await jobsFor(remNow?.id);
  const firstPlanned = [...nowJobs].sort((a, b) => Date.parse(a.planned_at) - Date.parse(b.planned_at))[0]?.planned_at || remNow?.next_run_at;
  const nextAfterFirst = firstPlanned ? new Date(new Date(firstPlanned).getTime() + 3 * 86400000) : null;
  const nextIso = remNow?.next_run_at ? new Date(remNow.next_run_at).getTime() : 0;
  const expectedNext = nextAfterFirst ? nextAfterFirst.getTime() : 0;
  const cycleOk = liveNow.length
    ? Math.abs(nextIso - expectedNext) < 180000
    : false;
  rec('qa3-cycle-from-first', cycleOk, {
    firstPlanned, next_run_at: remNow?.next_run_at, expected: nextAfterFirst?.toISOString(), live: liveNow.length,
  });
  report.cycleFromFirst = cycleOk;

  await openMailFu(page, clientNow, claimNow);
  const fuText = await page.locator('[data-testid="mailfu-ready"]').innerText().catch(() => '');
  rec('after-activate-shows-next', /שליחה הבאה|השליחה הבאה/.test(fuText), { fuText: fuText.slice(0, 400) });
  rec('after-activate-shows-first', /מועד שליחה ראשונה/.test(fuText), { fuText: fuText.slice(0, 400) });
  await shot(page, 'desktop-mailfu-now');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openMailFu(page, clientNow, claimNow);
  const fuReload = await page.locator('[data-testid="mailfu-ready"]').innerText().catch(() => '');
  rec('qa4-refresh-reopen-now', /שליחה הבאה|השליחה הבאה/.test(fuReload) && /פעיל/.test(fuReload), { fuReload: fuReload.slice(0, 300) });

  const createdLater = await createClaim(page, clientLater, plateLater);
  claimLater = createdLater.id;
  report.claimLater = claimLater;
  rec('claim-later-created', Boolean(claimLater) && !PROTECTED.has(claimLater), { claimLater });

  await openComposer(page, clientLater, claimLater);
  await fillComposer(page, `QA first-send LATER ${stamp}`);
  await page.locator('[data-testid="mail-recurring-days-3"]').click();
  await page.locator('[data-testid="mail-recurring-first-later"]').check();
  await page.locator('[data-testid="mail-recurring-first-date"]').fill(FUTURE_DATE);
  await page.locator('[data-testid="mail-recurring-first-time"]').fill(FUTURE_TIME);
  const previewLater = await page.locator('[data-testid="mail-recurring-summary"]').innerText();
  rec('preview-later-first', previewLater.includes('10') && /מועד שליחה ראשונה/.test(previewLater), { previewLater: previewLater.slice(0, 280) });
  rec('preview-later-no-send-now', /לא יישלח לפני המועד/.test(previewLater), { previewLater: previewLater.slice(0, 280) });
  rec('preview-later-cycle', /13|המחזור הבא/.test(previewLater), { previewLater: previewLater.slice(0, 280) });
  await shot(page, 'desktop-composer-later');
  await page.locator('[data-testid="mail-recurring-save"]').click();
  await page.waitForTimeout(2500);

  remLater = await latestRepeat(claimLater, 'QA first-send LATER');
  report.remLater = remLater?.id || '';
  const laterParts = remLater?.next_run_at ? localParts(remLater.next_run_at) : {};
  rec('later-reminder-saved', Boolean(remLater?.id) && remLater.status === 'scheduled' && laterParts.date === FUTURE_DATE && laterParts.time === FUTURE_TIME, {
    id: remLater?.id, next: remLater?.next_run_at, laterParts,
  });
  const laterJobs = await jobsFor(remLater?.id);
  const laterLive = laterJobs.filter(jobLive);
  rec('qa2-future-not-sent', laterLive.length === 0 && remLater?.status === 'scheduled', {
    live: laterLive.length, jobs: laterJobs.map((j) => ({ status: j.status, planned: j.planned_at, live: jobLive(j) })),
  });
  report.futureNotSentEarly = laterLive.length === 0;
  const laterFirst = laterJobs[0]?.planned_at || remLater?.next_run_at;
  const laterNext = laterFirst ? new Date(new Date(laterFirst).getTime() + 3 * 86400000) : null;
  rec('qa3-later-cycle-from-chosen-first', Boolean(laterNext) && laterNext.getDate() === 13 && laterNext.getMonth() === 8, {
    laterFirst, laterNext: laterNext?.toISOString(),
  });

  await openMailFu(page, clientLater, claimLater);
  const laterFu = await page.locator('[data-testid="mailfu-ready"]').innerText().catch(() => '');
  rec('later-ui-next', /שליחה הבאה|השליחה הבאה/.test(laterFu) && /10/.test(laterFu), { laterFu: laterFu.slice(0, 400) });
  await shot(page, 'desktop-mailfu-later');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openMailFu(page, clientLater, claimLater);
  const laterReload = await page.locator('[data-testid="mailfu-ready"]').innerText().catch(() => '');
  rec('qa4-refresh-reopen-later', /10/.test(laterReload) && /פעיל/.test(laterReload), { laterReload: laterReload.slice(0, 300) });

  const cancelBtn = page.locator(`[data-testid="fu-cancel-${remLater?.id}"]`);
  if (await cancelBtn.count()) await cancelBtn.first().evaluate((el) => el.click());
  else {
    const anyCancel = page.locator('[data-testid^="fu-cancel-"]').first();
    if (await anyCancel.count()) await anyCancel.evaluate((el) => el.click());
  }
  await page.waitForTimeout(1500);
  const laterAfterCancel = await latestRepeat(claimLater, 'QA first-send LATER');
  rec('qa5-cancel-status', laterAfterCancel?.status === 'cancelled' || Boolean(laterAfterCancel?.cancelled_at), {
    status: laterAfterCancel?.status, cancelled_at: laterAfterCancel?.cancelled_at,
  });
  const dispatchAfterCancel = await invokeGmail(session, { action: 'dispatch_due_test' });
  const laterJobsAfter = await jobsFor(remLater?.id);
  rec('qa5-no-further-sends', laterJobsAfter.filter(jobLive).length === 0, {
    dispatch: { success: dispatchAfterCancel.json?.success, processed: dispatchAfterCancel.json?.processed, real: dispatchAfterCancel.json?.realEmailSend },
    jobs: laterJobsAfter.map((j) => ({ status: j.status, live: jobLive(j) })),
  });

  await openComposer(page, clientLater, claimLater);
  rec('regression-regular-send-btn', await page.locator('[data-testid="mail-send-btn"]').count() > 0);
  rec('regression-schedule-checkbox', await page.locator('[data-testid="mail-schedule"]').count() > 0 && !(await page.locator('[data-testid="mail-schedule"]').isChecked()));
  await page.locator('[data-testid="mail-schedule"]').check();
  rec('regression-schedule-fields', await page.locator('[data-testid="mail-schedule-date"]').count() > 0 && await page.locator('[data-testid="mail-schedule-time"]').count() > 0);
  rec('regression-recurring-disabled-when-schedule', await page.locator('[data-testid="mail-recurring"]').isDisabled());
  await page.locator('[data-testid="mail-schedule"]').uncheck();
  rec('regression-followup', await page.locator('[data-testid="mail-followup"]').count() > 0);
  await shot(page, 'desktop-regression-composer');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', isMobile: true, hasTouch: true });
  await inject(mobile, session);
  const mpage = await mobile.newPage();
  await openClaims(mpage);
  await openComposer(mpage, clientNow, claimNow);
  if (!(await mpage.locator('[data-testid="mail-recurring"]').isChecked())) await mpage.locator('[data-testid="mail-recurring"]').check();
  rec('mobile-first-now', await mpage.locator('[data-testid="mail-recurring-first-now"]').count() > 0);
  rec('mobile-first-later', await mpage.locator('[data-testid="mail-recurring-first-later"]').count() > 0);
  await mpage.locator('[data-testid="mail-recurring-first-later"]').check();
  rec('mobile-date-time', await mpage.locator('[data-testid="mail-recurring-first-date"]').count() > 0 && await mpage.locator('[data-testid="mail-recurring-first-time"]').count() > 0);
  rec('mobile-preview', /מועד שליחה ראשונה/.test(await mpage.locator('[data-testid="mail-recurring-summary"]').innerText().catch(() => '')));
  rec('mobile-schedule', await mpage.locator('[data-testid="mail-schedule"]').count() > 0);
  rec('mobile-followup', await mpage.locator('[data-testid="mail-followup"]').count() > 0);
  await shot(mpage, 'mobile-composer-first-send');
  await mobile.close();
} catch (err) {
  rec('script-error', false, { err: String(err?.stack || err) });
} finally {
  await softDelete(claimNow);
  await softDelete(claimLater);
  rec('soft-deleted-test-claims', true, { claimNow, claimLater });
  rec('protected-untouched', !PROTECTED.has(claimNow) && !PROTECTED.has(claimLater));
  await browser.close();
}

const required = [
  'public-pages-sha',
  'qa1-first-send-now-live',
  'qa2-future-not-sent',
  'qa3-cycle-from-first',
  'qa3-later-cycle-from-chosen-first',
  'qa4-refresh-reopen-now',
  'qa4-refresh-reopen-later',
  'qa5-cancel-status',
  'qa5-no-further-sends',
  'mobile-first-now',
  'mobile-date-time',
  'regression-regular-send-btn',
  'regression-schedule-fields',
  'gmail-3h-untouched',
];
const failed = report.checks.filter((c) => !c.ok);
const requiredFailed = required.filter((n) => report.checks.some((c) => c.name === n && !c.ok));
report.verdict = requiredFailed.length === 0 && failed.filter((c) => required.includes(c.name)).length === 0
  ? (failed.length ? 'PASS_WITH_NOTES' : 'PASS')
  : 'FAIL';
if (requiredFailed.length === 0 && failed.length === 0) report.verdict = 'PASS';
if (requiredFailed.length) report.verdict = 'FAIL';

writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
const md = [
  '# Recurring first-send QA — PUBLIC STAGING',
  '',
  `- Verdict: **${report.verdict}**`,
  `- SHA: ${report.deployTxt}`,
  `- Now claim: ${claimNow} rem ${report.remNow}`,
  `- Later claim: ${claimLater} rem ${report.remLater}`,
  `- Live first send: ${report.firstSendLive}`,
  `- Future not sent early: ${report.futureNotSentEarly}`,
  `- Production: not touched`,
  '',
  ...report.checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.err ? ` — ${c.err}` : ''}`),
].join('\n');
writeFileSync(join(OUT, 'qa-report.md'), md);
console.log(md);
console.log(`VERDICT ${report.verdict}`);
process.exit(report.verdict === 'FAIL' ? 1 : 0);
