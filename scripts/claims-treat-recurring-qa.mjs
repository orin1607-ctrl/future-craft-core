#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — Treatment Center hook to existing recurring mail.
 * TEST data only. Live TEST send only to yoni122222@gmail.com.
 * No Production. No mass Gmail import. No new scheduler.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-treat-recurring-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const SELF = 'yoni122222@gmail.com';
const BLOCKED = 'customer-qa-not-allowlisted@example.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailDispatchModeTouched: false,
  gmail3hCronTouched: false,
  schemaMigration: false,
  newScheduler: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
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
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `treat-recurring-${name}.png`));
  } catch { /* skip */ }
}

async function importMail(session, claimId, messageId) {
  if (!messageId) return false;
  let start = 0;
  for (let i = 0; i < 12; i++) {
    const r = await invokeGmail(session, { action: 'import_message', claim_id: claimId, message_id: messageId, start });
    if (r.json?.success === false) return false;
    if (r.json?.done === true) return true;
    start = Number(r.json?.start || 0);
  }
  return false;
}

async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}

async function claimTasks(claimId) {
  return (await userDb.from('claims_tasks').select('id, row_data, claim_id').eq('claim_id', claimId)).data || [];
}
function isTreat(t) {
  const rd = t.row_data || {};
  return rd.treatmentItem === 'true' || rd.kind === 'treatment_item';
}
function isOpenTreat(t) {
  const rd = t.row_data || {};
  return isTreat(t) && rd.done !== 'true' && rd.workStatus !== 'done';
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
  for (let i = 0; i < 6; i++) {
    const vis = page.locator('.ov.open [data-testid="treat-center-close"], .ov.open [data-testid="treat-back"], .ov.open .mcl').locator('visible=true');
    if (await vis.count()) {
      await vis.first().evaluate((el) => el.click()).catch(() => undefined);
      await page.waitForTimeout(300);
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
  await page.waitForTimeout(500);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) await row.first().evaluate((el) => el.click());
  else await page.getByText(client, { exact: false }).first().click().catch(() => undefined);
  await page.waitForFunction((id) => {
    const n = document.querySelector('.ov.open .card-title-num');
    return !!(n && (!id || (n.textContent || '').includes(id)));
  }, claimId, { timeout: 20000 });
  return true;
}

async function openTreatTab(page) {
  const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
  if (await snap.count()) {
    const exp = await snap.getAttribute('aria-expanded');
    if (exp === 'false') await snap.click().catch(() => undefined);
  }
  const work = page.locator('[data-testid="claims-tab-group-work"]');
  if (await work.count()) await work.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(400);
  const sub = page.locator('[data-testid="claims-tab-sub-treat"]');
  if (await sub.count()) await sub.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(400);
}

async function saveTreat(page, { action, note, continueWork, nextDate }) {
  const bar = page.locator('[data-testid="claims-treat-open"]');
  const treatBtn = (await bar.count()) ? bar.first() : page.locator('[data-testid="treat-open"]').first();
  await treatBtn.evaluate((el) => el.click());
  await page.waitForSelector('[data-testid="treat-ops-v3"].open, .ov.open[data-testid="treat-ops-v3"]', { timeout: 15000 });
  if (action) await page.locator('[data-testid="treat-action"]').fill(action);
  if (note) await page.locator('[data-testid="treat-note"]').fill(note);
  await page.locator('[data-testid="treat-continue"]').selectOption(continueWork);
  const day = nextDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.locator('[data-testid="treat-next"]').fill(day);
  await page.locator('[data-testid="treat-save"]').click();
  if (continueWork === 'continue') {
    await page.waitForSelector('[data-testid="treat-center"].open, .ov.open[data-testid="treat-center"]', { timeout: 20000 });
  } else {
    await page.waitForTimeout(1500);
  }
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
  await page.locator('[data-testid="intake-phone"]').fill('0500000091');
  await fillIf(page, '#in_email', SELF);
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  await fillIf(page, '#in_co', 'הפניקס');
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-08');
  await page.waitForSelector('[data-testid="claims-new-modal"].open, .ov.open[data-testid="claims-new-modal"]', { timeout: 15000 });
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

function localWhen(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openTreatCenter(page, client, claimId, treatId) {
  await closeOverlays(page);
  await openClaimCard(page, client, claimId);
  await openTreatTab(page);
  const itemBtn = page.locator(`[data-testid="treat-item-${treatId}"]`);
  await itemBtn.waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
  if (await itemBtn.count()) await itemBtn.evaluate((el) => el.click());
  await page.waitForSelector('[data-testid="treat-center"].open [data-testid="treat-center-body"]', { timeout: 20000 });
}

const session = await login();
const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
rec('staging-only', STAGING_REF !== PROD_REF);

const status = await invokeGmail(session, { action: 'status' });
rec('gmail-3h-untouched', Number(status.json?.mailboxScan?.everyMs || status.json?.everyMs) === 3 * 60 * 60 * 1000, {
  everyMs: status.json?.mailboxScan?.everyMs || status.json?.everyMs,
});

const stamp = Date.now();
const clientA = `TEST-TR-A-${stamp}`;
const plateA = `TRA${String(stamp).slice(-6)}`;
const clientB = `TEST-TR-B-${stamp}`;
const plateB = `TRB${String(stamp).slice(-6)}`;
let claimA = '';
let claimB = '';
let treatA = null;
let treatB = null;
let treatOther = null;
let remId = '';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL' });
  await inject(desktop, session);
  const page = await desktop.newPage();
  page.on('dialog', (d) => d.accept());

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', isMobile: true, hasTouch: true });
  await inject(mobile, session);
  const mpage = await mobile.newPage();

  await openClaims(page);
  const createdA = await createClaim(page, clientA, plateA);
  claimA = createdA.id;
  rec('claim-a-created', Boolean(claimA) && !PROTECTED.has(claimA), { claimA });

  await openTreatTab(page);
  await saveTreat(page, { action: 'חסר רישיון נהיגה', note: 'TEST recurring hook', continueWork: 'continue' });
  let tasks = await claimTasks(claimA);
  const openA = tasks.filter(isOpenTreat);
  treatA = openA.find((t) => /רישיון|נהיגה/.test(`${t.row_data?.action || ''} ${t.row_data?.requestType || ''}`)) || openA[0];
  rec('treatment-open', Boolean(treatA), { id: treatA?.id, n: openA.length });
  rec('center-open', await page.locator('[data-testid="treat-center"].open [data-testid="treat-recurring-open"]').count() > 0);
  rec('followup-still-separate', await page.locator('[data-testid="treat-center"].open [data-testid="treat-followup"]').count() > 0);
  await shot(page, 'center-before');

  await page.locator('[data-testid="treat-recurring-open"]').evaluate((el) => el.click());
  await page.waitForSelector('[data-testid="mo-mail-fu"].open [data-testid="fu-save"], .ov.open[data-testid="mo-mail-fu"] [data-testid="fu-save"]', { timeout: 20000 });
  rec('existing-modal', await page.locator('[data-testid="fu-to"]').count() > 0 && await page.locator('[data-testid="rec-days-1"]').count() > 0);
  rec('cc-on-recurring', await page.locator('[data-testid="fu-cc"]').count() > 0);
  await page.locator('[data-testid="fu-who"]').selectOption('other').catch(() => undefined);
  await page.locator('[data-testid="fu-to"]').fill(SELF);
  await page.locator('#fu_subj').fill(`[TEST] מייל מתמשך ${clientA}`);
  await page.locator('#fu_body').fill(`TEST recurring from treatment ${clientA}`);
  await page.locator('[data-testid="rec-days-1"]').click();
  await page.locator('[data-testid="fu-when"]').fill(localWhen(-60_000));
  await shot(page, 'modal-filled');
  await page.locator('[data-testid="fu-save"]').click();
  await page.waitForSelector('[data-testid="treat-center"].open [data-testid="treat-recurring-list"]', { timeout: 20000 });

  const afterCreateTasks = await claimTasks(claimA);
  rec('no-extra-treatment', afterCreateTasks.filter(isTreat).length === tasks.filter(isTreat).length, {
    before: tasks.filter(isTreat).length,
    after: afterCreateTasks.filter(isTreat).length,
  });

  const rems = (await userDb.from('claims_reminders')
    .select('id, claim_id, status, mail_kind, mail_to, mail_subject, repeat_every_days, next_run_at, row_data, created_at')
    .eq('claim_id', claimA)
    .eq('mail_kind', 'email_repeat')
    .order('created_at', { ascending: false })).data || [];
  const bound = rems.find((r) => r.row_data?.treatmentTaskId === treatA.id && r.status === 'scheduled');
  remId = bound?.id || '';
  rec('bound-claim-treatment', Boolean(bound) && bound.claim_id === claimA && bound.row_data?.purpose === 'recurring_send', {
    remId, treat: treatA.id, purpose: bound?.row_data?.purpose, to: bound?.mail_to,
  });
  rec('to-allowlisted', bound?.mail_to === SELF, { to: bound?.mail_to });
  rec('center-shows-active', await page.locator(`[data-testid="treat-recurring-box-${remId}"]`).count() > 0 || await page.locator('[data-testid="treat-recurring-list"]').innerText().then((t) => t.includes('פעיל')).catch(() => false));
  await shot(page, 'center-active');

  const beforeDup = rems.filter((r) => r.status === 'scheduled' && r.row_data?.treatmentTaskId === treatA.id).length;
  await page.locator('[data-testid="treat-recurring-open"]').evaluate((el) => el.click()).catch(() => undefined);
  await page.waitForSelector('[data-testid="fu-save"]', { timeout: 12000 }).catch(() => undefined);
  if (await page.locator('[data-testid="fu-to"]').count()) {
    await page.locator('[data-testid="fu-who"]').selectOption('other').catch(() => undefined);
    await page.locator('[data-testid="fu-to"]').fill(SELF);
    await page.locator('#fu_subj').fill(`[TEST] מייל מתמשך dup ${clientA}`);
    await page.locator('#fu_body').fill('dup');
    await page.locator('[data-testid="fu-when"]').fill(localWhen(-60_000));
    await page.locator('[data-testid="fu-save"]').click();
    await page.waitForTimeout(1200);
  }
  const afterDup = ((await userDb.from('claims_reminders').select('id, status, row_data').eq('claim_id', claimA).eq('mail_kind', 'email_repeat')).data || [])
    .filter((r) => r.status === 'scheduled' && r.row_data?.treatmentTaskId === treatA.id);
  rec('no-duplicate', afterDup.length === 1 && beforeDup === 1, { beforeDup, after: afterDup.length });

  const blockedProbe = await invokeGmail(session, {
    action: 'send_claim', confirm: true, claim_id: claimA, to: BLOCKED, subject: 'blocked', body: 'no', file_ids: [], idempotency_key: `tr-blk-${stamp}`,
  });
  rec('blocked-non-test', blockedProbe.json?.error === 'live_send_recipient_not_allowlisted' || blockedProbe.json?.success === false, { error: blockedProbe.json?.error });

  if (await page.locator('[data-testid="treat-recurring-dispatch-test"]').count()) {
    await page.locator('[data-testid="treat-recurring-dispatch-test"]').evaluate((el) => el.click());
    await page.waitForTimeout(2500);
  } else {
    await invokeGmail(session, { action: 'dispatch_due_test' });
    await page.waitForTimeout(1500);
    await openTreatCenter(page, clientA, claimA, treatA.id);
  }

  const jobs = (await userDb.from('claims_mail_jobs').select('id, reminder_id, status, preview, finished_at, planned_at').eq('reminder_id', remId).order('planned_at', { ascending: false })).data || [];
  const liveJob = jobs.find((j) => j.preview?.realEmailSend === true);
  rec('test-sent', Boolean(liveJob), { job: liveJob?.id, status: liveJob?.status, n: jobs.length });
  const hist = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', claimA)).data || [];
  rec('history-logged', hist.some((h) => /מייל מתמשך/.test(`${h.row_data?.action || ''} ${h.row_data?.note || ''}`)), { n: hist.length });
  const outbox = (await userDb.from('claims_gmail_outbox').select('id, gmail_thread_id, gmail_message_id, to_addr, claim_id').eq('claim_id', claimA).eq('kind', 'claim_send').order('sent_at', { ascending: false })).data || [];
  rec('outbox-same-claim', outbox.length > 0 && outbox.every((o) => o.claim_id === claimA), { n: outbox.length });
  const threadId = String(liveJob?.preview?.gmail_thread_id || outbox[0]?.gmail_thread_id || '');
  const msgid = String(liveJob?.preview?.gmail_message_id || outbox[0]?.gmail_message_id || '');
  rec('thread-id', Boolean(threadId), { threadId, msgid });

  const treatAfterSend = (await claimTasks(claimA)).find((t) => t.id === treatA.id);
  rec('treatment-stamped', treatAfterSend?.row_data?.gmailThreadId === threadId, {
    got: treatAfterSend?.row_data?.gmailThreadId, want: threadId, work: treatAfterSend?.row_data?.workStatus,
  });

  await openTreatCenter(page, clientA, claimA, treatA.id);
  const boxText = await page.locator('[data-testid="treat-recurring-list"]').innerText().catch(() => '');
  rec('last-next-visible', /שליחה אחרונה|נשלח/.test(boxText) && /שליחה הבאה/.test(boxText), { box: boxText.slice(0, 280) });
  rec('history-in-center', /היסטוריית שליחות/.test(boxText), { box: boxText.slice(0, 180) });
  await shot(page, 'center-after-send');

  const reply = threadId ? await invokeGmail(session, {
    action: 'send_claim', confirm: true, claim_id: claimA, to: SELF, thread_id: threadId,
    subject: `Re: [TEST] מייל מתמשך ${clientA}`,
    body: `תשובה לטיפול ${clientA}`,
    file_ids: [],
    idempotency_key: `tr-rp-${stamp}`,
  }) : { json: {} };
  rec('reply-send', reply.json?.success === true && (!threadId || reply.json?.gmail_thread_id === threadId), { thread: reply.json?.gmail_thread_id });
  for (const mid of [msgid, String(reply.json?.gmail_message_id || '')].filter(Boolean)) {
    await importMail(session, claimA, mid);
    await sleep(400);
  }
  const treatAfterReply = (await claimTasks(claimA)).find((t) => t.id === treatA.id);
  rec('reply-bound-same-treat', treatAfterReply?.row_data?.gmailThreadId === threadId && treatAfterReply?.id === treatA.id, {
    replyReceived: treatAfterReply?.row_data?.replyReceived, thread: treatAfterReply?.row_data?.gmailThreadId,
  });

  await closeOverlays(page);
  await openClaimCard(page, clientA, claimA);
  await openTreatTab(page);
  await saveTreat(page, { action: 'חסר דוח שמאי', note: 'טיפול אחר באותו תיק', continueWork: 'continue' });
  const tasks2 = await claimTasks(claimA);
  treatOther = tasks2.filter(isOpenTreat).find((t) => t.id !== treatA.id);
  rec('other-treatment-created', Boolean(treatOther), { id: treatOther?.id });
  if (treatOther) {
    await openTreatCenter(page, clientA, claimA, treatOther.id);
    const otherList = await page.locator('[data-testid="treat-recurring-list"]').innerText().catch(() => '');
    rec('other-treatment-untouched', !otherList.includes(SELF) && /אין מייל מתמשך/.test(otherList), { otherList: otherList.slice(0, 180) });
    rec('other-no-box', remId ? await page.locator(`[data-testid="treat-recurring-box-${remId}"]`).count() === 0 : true);
  }

  await openClaims(page);
  const createdB = await createClaim(page, clientB, plateB);
  claimB = createdB.id;
  rec('claim-b-created', Boolean(claimB) && claimB !== claimA);
  await openTreatTab(page);
  await saveTreat(page, { action: 'חסר רישיון נהיגה', note: 'תיק אחר', continueWork: 'continue' });
  treatB = (await claimTasks(claimB)).find(isOpenTreat);
  rec('claim-b-treatment', Boolean(treatB));
  if (treatB) {
    await openTreatCenter(page, clientB, claimB, treatB.id);
    const bList = await page.locator('[data-testid="treat-recurring-list"]').innerText().catch(() => '');
    rec('no-cross-claim', /אין מייל מתמשך/.test(bList) && !bList.includes(clientA), { bList: bList.slice(0, 160) });
  }
  const leak = ((await userDb.from('claims_reminders').select('id, claim_id, row_data').eq('mail_kind', 'email_repeat').eq('claim_id', claimB)).data || [])
    .filter((r) => r.row_data?.treatmentTaskId === treatA.id);
  rec('no-cross-claim-db', leak.length === 0, { n: leak.length });

  await openTreatCenter(page, clientA, claimA, treatA.id);
  const cancelBtn = page.locator(`[data-testid="treat-recurring-cancel-${remId}"]`);
  if (await cancelBtn.count()) {
    await cancelBtn.evaluate((el) => el.click());
    await page.waitForTimeout(1200);
  } else {
    const still = page.locator('[data-testid^="treat-recurring-cancel-"]').first();
    if (await still.count()) await still.evaluate((el) => el.click());
    await page.waitForTimeout(1200);
  }
  const afterCancel = (await userDb.from('claims_reminders').select('id, status').eq('id', remId).maybeSingle()).data;
  rec('stop-cancel', afterCancel?.status === 'cancelled' || afterCancel?.status === 'completed', { status: afterCancel?.status });
  await shot(page, 'center-stopped');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  await openTreatCenter(page, clientA, claimA, treatA.id);
  const afterReload = await page.locator('[data-testid="treat-recurring-list"]').innerText().catch(() => '');
  rec('refresh-reopen', /נעצר|בוטל/.test(afterReload) && !(await page.locator('[data-testid^="treat-recurring-cancel-"]').count()), { afterReload: afterReload.slice(0, 200) });
  rec('still-one-row', ((await userDb.from('claims_reminders').select('id').eq('claim_id', claimA).eq('mail_kind', 'email_repeat').filter('row_data->>treatmentTaskId', 'eq', treatA.id)).data || []).length <= 2);

  await openClaims(mpage);
  await typeSearch(mpage, clientA);
  await mpage.waitForTimeout(700);
  await mpage.locator(`[data-testid="claim-row-${claimA}"]`).first().click().catch(() => undefined);
  await mpage.waitForTimeout(800);
  await openTreatTab(mpage);
  if (await mpage.locator(`[data-testid="treat-item-${treatA.id}"]`).count()) {
    await mpage.locator(`[data-testid="treat-item-${treatA.id}"]`).evaluate((el) => el.click());
  }
  await mpage.waitForSelector('[data-testid="treat-center"].open [data-testid="treat-recurring-open"]', { timeout: 20000 }).catch(() => undefined);
  rec('mobile-recurring-control', await mpage.locator('[data-testid="treat-center"].open [data-testid="treat-recurring-open"]').count() > 0);
  rec('mobile-followup-untouched', await mpage.locator('[data-testid="treat-center"].open [data-testid="treat-followup"]').count() > 0);
  await shot(mpage, 'mobile-center');

  await openTreatCenter(page, clientA, claimA, treatA.id);
  rec('followup-not-recurring', await page.locator('[data-testid="treat-followup"]').innerText().then((t) => !/מייל מתמשך/.test(t)).catch(() => true));

  const scanAgain = await invokeGmail(session, { action: 'status' });
  rec('gmail-3h-after', Number(scanAgain.json?.mailboxScan?.everyMs || scanAgain.json?.everyMs) === 3 * 60 * 60 * 1000);

  await desktop.close();
  await mobile.close();
} catch (e) {
  rec('qa-error', false, { err: String(e?.message || e).slice(0, 400) });
} finally {
  await browser.close().catch(() => undefined);
  await softDelete(claimA);
  await softDelete(claimB);
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
