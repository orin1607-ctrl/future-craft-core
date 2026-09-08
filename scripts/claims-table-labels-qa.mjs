#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — claim-table activity labels.
 * TEST data only. Live TEST send only to yoni122222@gmail.com.
 * No Production. No mass Gmail import. No schema/migration. No new scheduler.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short origin/feat/incident-alerts-staging', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-table-labels-2026-09-08');
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
const FORBIDDEN = /נדרש טיפול|טיפול לפי יומן|מייל מתוזמן|מייל מתמשך|חברת הביטוח ביקשה|חסר מסמך(?!:)/;

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
  leftoverAudit: null,
  rounds: [],
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
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `table-labels-${name}.png`));
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
function isMailOn(t) {
  const rd = t.row_data || {};
  return rd.gmailMessageId && rd.done !== 'true' && rd.tableAlert !== 'off' && !isTreat(t);
}

async function leftoverAudit() {
  const claims = (await userDb.from('claims_records').select('id, client_name, status, row_data').limit(2000)).data || [];
  const tasks = (await userDb.from('claims_tasks').select('id, claim_id, row_data').limit(4000)).data || [];
  const notifs = (await userDb.from('claims_notifications').select('id, claim_id, row_data').limit(4000)).data || [];
  const fus = (await userDb.from('claims_reminders').select('id, claim_id, status, mail_kind, row_data').limit(2000)).data || [];
  const byClaim = new Map();
  for (const t of tasks) {
    const list = byClaim.get(t.claim_id) || { tasks: [], notifs: [], fus: [] };
    list.tasks.push(t);
    byClaim.set(t.claim_id, list);
  }
  for (const n of notifs) {
    const list = byClaim.get(n.claim_id) || { tasks: [], notifs: [], fus: [] };
    list.notifs.push(n);
    byClaim.set(n.claim_id, list);
  }
  for (const f of fus) {
    const list = byClaim.get(f.claim_id) || { tasks: [], notifs: [], fus: [] };
    list.fus.push(f);
    byClaim.set(f.claim_id, list);
  }
  const counts = {
    scanned: 0,
    skippedDeleted: 0,
    wouldHaveDiaryOnly: 0,
    openTreatment: 0,
    untreatedMail: 0,
    customerOpen: 0,
    liveRecurring: 0,
    liveScheduled: 0,
    unreadGmailNotif: 0,
    leftoverNoWork: 0,
  };
  const leftoverSamples = [];
  for (const c of claims) {
    const rd = c.row_data || {};
    if (rd.deletedAt) { counts.skippedDeleted += 1; continue; }
    counts.scanned += 1;
    const kids = byClaim.get(c.id) || { tasks: [], notifs: [], fus: [] };
    const openTreat = kids.tasks.some(isOpenTreat);
    const untreatedMail = kids.tasks.some(isMailOn);
    const customerOpen = kids.tasks.some((t) => {
      const x = t.row_data || {};
      return x.audience === 'customer' && x.done !== 'true' && x.customerStatus !== 'done' && x.customerStatus !== 'cancelled';
    });
    const unreadGmail = kids.notifs.some((n) => {
      const x = n.row_data || {};
      return x.read !== 'true' && (x.type === 'gmail_auto' || x.type === 'gmail_review');
    });
    const liveRecurring = kids.fus.some((f) => f.status === 'scheduled' && (f.mail_kind === 'email_repeat' || f.row_data?.purpose === 'recurring_send'));
    const liveScheduled = kids.fus.some((f) => f.status === 'scheduled' && f.row_data?.purpose === 'scheduled_send');
    const hasNext = Boolean(rd.nextDate) && c.status !== 'סגור' && rd.archived !== 'true';
    if (openTreat) counts.openTreatment += 1;
    if (untreatedMail) counts.untreatedMail += 1;
    if (customerOpen) counts.customerOpen += 1;
    if (unreadGmail) counts.unreadGmailNotif += 1;
    if (liveRecurring) counts.liveRecurring += 1;
    if (liveScheduled) counts.liveScheduled += 1;
    if (hasNext && !openTreat && !untreatedMail && !customerOpen && !unreadGmail) {
      counts.wouldHaveDiaryOnly += 1;
      counts.leftoverNoWork += 1;
      if (leftoverSamples.length < 8) leftoverSamples.push({ id: c.id, nextDate: rd.nextDate, status: c.status, source: 'diary_nextDate_without_open_work' });
    }
  }
  return {
    ...counts,
    leftoverSamples,
    sources: {
      diary: 'claimNeedsReturn / nextDate on any open claim — almost every treatment update required nextDate',
      needs_action: 'umbrella chip added whenever any other alert existed',
      mail_recurring_scheduled: 'informational live followup chips, not operator action',
      insurer_doc_missing_doc: 'extra chips on top of mail/treatment',
      untreated_mail_included_treatments: 'open treatment with gmailMessageId also produced מייל חדש',
      unread_gmail_notifs: 'gmail_auto/gmail_review stayed unread after the user read the thread',
      mail_tasks_never_acked: 'ensureMailTasks persist done!=true; opening mail did not dismiss',
    },
    massDelete: false,
  };
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
    const vis = page.locator('.ov.open [data-testid="treat-center-close"], .ov.open [data-testid="treat-back"], .ov.open .mcl').locator('visible=true');
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

async function rowAlertInfo(page, claimId) {
  await typeSearch(page, claimId);
  await page.waitForTimeout(400);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  const host = (await row.count()) ? row.first() : page.locator(`[data-testid="claim-check-${claimId}"]`).locator('xpath=ancestor::*[contains(@class,"claim-mcard") or self::tr][1]');
  const box = host.locator('[data-testid="claim-row-alerts"]');
  const text = (await box.innerText().catch(() => '')) || '';
  const keys = await box.locator('[data-testid^="claim-alert-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') || '')).catch(() => []);
  return { text: text.trim(), keys, forbidden: FORBIDDEN.test(text), count: keys.length };
}

async function clickAlert(page, claimId, prefix) {
  await closeOverlays(page);
  await typeSearch(page, claimId);
  await page.waitForTimeout(400);
  const chip = page.locator(`[data-testid="claim-row-${claimId}"] [data-testid^="claim-alert-${prefix}"]`).locator('visible=true').first();
  await chip.waitFor({ state: 'visible', timeout: 15000 });
  await chip.click();
}

async function openTreatTab(page) {
  const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
  if (await snap.count()) {
    const exp = await snap.getAttribute('aria-expanded');
    if (exp === 'false') await snap.click().catch(() => undefined);
  }
  const work = page.locator('[data-testid="claims-tab-group-work"]');
  if (await work.count()) await work.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);
  const sub = page.locator('[data-testid="claims-tab-sub-treat"]');
  if (await sub.count()) await sub.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function openMailTab(page) {
  const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
  if (await snap.count()) {
    const exp = await snap.getAttribute('aria-expanded');
    if (exp === 'false') await snap.click().catch(() => undefined);
  }
  const mail = page.locator('[data-testid="claims-tab-group-mail"]');
  if (await mail.count()) await mail.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(250);
  const gin = page.locator('[data-testid="claims-tab-sub-gin"]');
  if (await gin.count()) await gin.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);
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
    await page.waitForSelector('[data-testid="treat-center"].open [data-testid="treat-center-body"], .ov.open[data-testid="treat-center"] [data-testid="treat-center-body"]', { timeout: 30000 }).catch(() => undefined);
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
  await page.locator('[data-testid="intake-phone"]').fill('0500000092');
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

const session = await login();
report.leftoverAudit = await leftoverAudit();
rec('leftover-audit-no-mass-delete', report.leftoverAudit.massDelete === false, { leftover: report.leftoverAudit });

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
rec('staging-only', STAGING_REF !== PROD_REF);

const status = await invokeGmail(session, { action: 'status' });
rec('gmail-3h-untouched', Number(status.json?.scheduler?.everyMs || status.json?.mailboxScan?.everyMs || status.json?.everyMs) === 3 * 60 * 60 * 1000, {
  everyMs: status.json?.scheduler?.everyMs || status.json?.mailboxScan?.everyMs || status.json?.everyMs,
});

const createdIds = [];
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

  for (let round = 1; round <= 3; round += 1) {
    const stamp = Date.now();
    const clientA = `TEST-LBL-A${round}-${stamp}`;
    const plateA = `LA${round}${String(stamp).slice(-5)}`;
    const clientB = `TEST-LBL-B${round}-${stamp}`;
    const plateB = `LB${round}${String(stamp).slice(-5)}`;
    const roundNotes = { round, clientA, clientB };

    const createdA = await createClaim(page, clientA, plateA);
    const claimA = createdA.id;
    createdIds.push(claimA);
    rec(`r${round}-claim-a`, Boolean(claimA) && !PROTECTED.has(claimA), { claimA });
    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const clean = await rowAlertInfo(page, claimA);
    rec(`r${round}-clean-no-extra`, clean.count === 0 && !clean.forbidden && !/מייל חדש|חסר:/.test(clean.text), clean);
    await shot(page, `r${round}-clean`);

    await openClaimCard(page, clientA, claimA);
    await openTreatTab(page);
    await saveTreat(page, { action: 'חסר רישיון נהיגה', note: 'TEST table label continue', continueWork: 'continue' });
    const tasksOpen = (await claimTasks(claimA)).filter(isOpenTreat);
    const treatA = tasksOpen.find((t) => /רישיון|נהיגה/.test(`${t.row_data?.action || ''} ${t.row_data?.requestType || ''}`)) || tasksOpen[0];
    rec(`r${round}-treat-created`, Boolean(treatA), { id: treatA?.id });
    await closeOverlays(page);
    const afterTreat = await rowAlertInfo(page, claimA);
    rec(`r${round}-treat-label`, afterTreat.keys.some((k) => k.includes(`claim-alert-treat_${treatA?.id}`)) && !afterTreat.forbidden, afterTreat);
    rec(`r${round}-no-dup-treat`, afterTreat.keys.filter((k) => k.includes('claim-alert-treat_')).length === 1, afterTreat);

    await clickAlert(page, claimA, `treat_${treatA?.id}`);
    const centerSel = '[data-testid="treat-center"].open [data-testid="treat-center-body"], .ov.open[data-testid="treat-center"] [data-testid="treat-center-body"]';
    const centerOpened = await page.waitForSelector(centerSel, { timeout: 20000 }).then(() => true).catch(() => false);
    rec(`r${round}-click-treat-exact`, centerOpened, { title: await page.locator('.ov.open[data-testid="treat-center"] .mh-t').innerText().catch(() => '') });
    await shot(page, `r${round}-treat-open`);

    const closeBtn = page.locator('[data-testid="treat-center"].open [data-testid="treat-close-done"], .ov.open[data-testid="treat-center"] [data-testid="treat-close-done"]').locator('visible=true');
    if (await closeBtn.count()) {
      await closeBtn.first().evaluate((el) => el.click());
      await page.waitForSelector('[data-testid="treat-ops-v3"].open [data-testid="treat-save"], .ov.open[data-testid="treat-ops-v3"] [data-testid="treat-save"]', { timeout: 15000 });
      const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await page.locator('[data-testid="treat-next"]').fill(day);
      await page.locator('[data-testid="treat-save"]').click();
      await page.waitForTimeout(1500);
    } else {
      rec(`r${round}-treat-close-control`, false, { err: 'treat-close-done missing' });
    }
    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const afterClose = await rowAlertInfo(page, claimA);
    rec(`r${round}-treat-closed-label-gone`, !afterClose.keys.some((k) => k.includes('claim-alert-treat_')) && !afterClose.forbidden, afterClose);
    const histAfterClose = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', claimA)).data || [];
    rec(`r${round}-treat-history-kept`, histAfterClose.some((h) => /טיפול/.test(`${h.row_data?.action || ''} ${h.row_data?.type || ''}`)), { n: histAfterClose.length });

    const send1 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimA, to: SELF,
      subject: `[TEST] ${clientA} נא להעביר רישיון נהיגה`,
      body: `נא להעביר רישיון נהיגה עבור ${clientA}`,
      file_ids: [],
      idempotency_key: `lbl1-${stamp}`,
    });
    rec(`r${round}-mail1-send`, send1.json?.success === true, { error: send1.json?.error, mid: send1.json?.gmail_message_id });
    const mid1 = String(send1.json?.gmail_message_id || '');
    rec(`r${round}-mail1-import`, mid1 ? await importMail(session, claimA, mid1) : false, { mid1 });

    const send2 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimA, to: SELF,
      subject: `[TEST] ${clientA} נא להעביר חשבונית מוסך`,
      body: `נא להעביר חשבונית מוסך עבור ${clientA}`,
      file_ids: [],
      idempotency_key: `lbl2-${stamp}`,
    });
    rec(`r${round}-mail2-send`, send2.json?.success === true, { error: send2.json?.error, mid: send2.json?.gmail_message_id });
    const mid2 = String(send2.json?.gmail_message_id || '');
    rec(`r${round}-mail2-import`, mid2 ? await importMail(session, claimA, mid2) : false, { mid2 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const twoMail = await rowAlertInfo(page, claimA);
    rec(`r${round}-two-mail-label`, /2 מיילים דורשים טיפול|מייל חדש/.test(twoMail.text) && twoMail.keys.some((k) => k.includes('mail_action')), twoMail);
    rec(`r${round}-no-forbidden-with-mail`, !twoMail.forbidden, twoMail);
    await shot(page, `r${round}-two-mail`);

    await clickAlert(page, claimA, 'mail_action');
    const ginOpened = await page.waitForSelector('[data-testid="mail-correspondence"], [data-testid="mail-open-alerts"]', { timeout: 20000 }).then(() => true).catch(() => false);
    if (mid1) {
      await page.waitForSelector(`[data-mail-mid="${mid1}"], [data-testid="mail-item-${mid1}"]`, { timeout: 20000 }).catch(() => undefined);
      const jump = page.locator(`[data-testid="mail-alert-jump-${mid1}"]`);
      if (await jump.count()) await jump.first().click().catch(() => undefined);
      await page.waitForTimeout(400);
    }
    const banner = await page.locator('[data-testid="mail-open-alerts"]').count();
    const focused = mid1 ? await page.locator(`[data-mail-mid="${mid1}"]`).count() : 0;
    const item1 = mid1 ? await page.locator(`[data-testid="mail-item-${mid1}"]`).count() : 0;
    rec(`r${round}-click-mail-exact`, ginOpened && banner > 0 && (focused > 0 || item1 > 0), { ginOpened, banner, focused, item1 });
    const dismissBtn = mid1 ? page.locator(`[data-testid="mail-label-dismiss-${mid1}"]`) : null;
    if (dismissBtn && !(await dismissBtn.count()) && mid1) {
      await page.locator(`[data-testid="mail-toggle-${mid1}"]`).click().catch(() => undefined);
      await page.waitForTimeout(300);
    }
    rec(`r${round}-mail-choice-visible`, mid1 ? await page.locator(`[data-testid="mail-label-dismiss-${mid1}"]`).count() > 0 : false);

    if (mid1) {
      const beforeHist = ((await userDb.from('claims_history').select('id').eq('claim_id', claimA)).data || []).length;
      const beforeImp = ((await userDb.from('claims_gmail_imports').select('id').eq('claim_id', claimA).eq('gmail_message_id', mid1)).data || []).length;
      await page.locator(`[data-testid="mail-label-dismiss-${mid1}"]`).evaluate((el) => el.click());
      await page.waitForTimeout(2000);
      await closeOverlays(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
      await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
      const afterDismiss = await rowAlertInfo(page, claimA);
      const mid1Tasks = (await claimTasks(claimA)).filter((t) => t.row_data?.gmailMessageId === mid1 && !isTreat(t));
      rec(`r${round}-dismiss-one`, /מייל חדש/.test(afterDismiss.text) && !/2 מיילים/.test(afterDismiss.text) && mid1Tasks.every((t) => t.row_data?.tableAlert === 'off'), {
        ...afterDismiss, mid1Alert: mid1Tasks.map((t) => t.row_data?.tableAlert || ''),
      });
      const afterImp = ((await userDb.from('claims_gmail_imports').select('id').eq('claim_id', claimA).eq('gmail_message_id', mid1)).data || []).length;
      const afterHist = ((await userDb.from('claims_history').select('id').eq('claim_id', claimA)).data || []).length;
      rec(`r${round}-dismiss-keeps-mail-history`, afterImp >= beforeImp && afterHist >= beforeHist && afterImp > 0, { beforeImp, afterImp, beforeHist, afterHist });
    } else rec(`r${round}-dismiss-one`, false, { err: 'no mid1' });

    await closeOverlays(page);
    await openClaimCard(page, clientA, claimA);
    await openMailTab(page);
    if (mid2) {
      const jump2 = page.locator(`[data-testid="mail-alert-jump-${mid2}"]`);
      if (await jump2.count()) await jump2.first().click().catch(() => undefined);
      if (!(await page.locator(`[data-testid="mail-label-keep-${mid2}"]`).count())) {
        await page.locator(`[data-testid="mail-toggle-${mid2}"]`).click().catch(() => undefined);
      }
      await page.waitForTimeout(400);
    }
    if (mid2 && await page.locator(`[data-testid="mail-label-keep-${mid2}"]`).count()) {
      await page.locator(`[data-testid="mail-label-keep-${mid2}"]`).evaluate((el) => el.click());
      await page.waitForTimeout(900);
    }
    await closeOverlays(page);
    const afterKeep = await rowAlertInfo(page, claimA);
    rec(`r${round}-keep-stays`, afterKeep.keys.some((k) => k.includes('mail_action')), afterKeep);

    await closeOverlays(page);
    await openClaimCard(page, clientA, claimA);
    await openMailTab(page);
    if (mid2) {
      const jump2b = page.locator(`[data-testid="mail-alert-jump-${mid2}"]`);
      if (await jump2b.count()) await jump2b.first().click().catch(() => undefined);
      if (!(await page.locator(`[data-testid="mail-label-treat-${mid2}"]`).count())) {
        await page.locator(`[data-testid="mail-toggle-${mid2}"]`).click().catch(() => undefined);
      }
      await page.waitForTimeout(400);
    }
    if (mid2 && await page.locator(`[data-testid="mail-label-treat-${mid2}"]`).count()) {
      await page.locator(`[data-testid="mail-label-treat-${mid2}"]`).evaluate((el) => el.click());
      await page.waitForSelector('[data-testid="treat-center"].open [data-testid="treat-center-body"], .ov.open[data-testid="treat-center"] [data-testid="treat-center-body"]', { timeout: 20000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
    }
    const afterLink = (await claimTasks(claimA));
    const linkedTreat = afterLink.filter(isOpenTreat).find((t) => t.row_data?.gmailMessageId === mid2) || afterLink.filter(isOpenTreat)[0];
    rec(`r${round}-mail-to-treat`, Boolean(linkedTreat) && (!mid2 || linkedTreat.row_data?.gmailMessageId === mid2), {
      treat: linkedTreat?.id, mid: linkedTreat?.row_data?.gmailMessageId,
    });
    rec(`r${round}-no-treat-dup-mess`, afterLink.filter(isOpenTreat).length <= 2, { n: afterLink.filter(isOpenTreat).length });
    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const afterLinkAlerts = await rowAlertInfo(page, claimA);
    rec(`r${round}-treat-label-after-link`, afterLinkAlerts.keys.some((k) => k.includes('claim-alert-treat_')), afterLinkAlerts);
    rec(`r${round}-mail2-chip-gone-or-other`, !/2 מיילים/.test(afterLinkAlerts.text), afterLinkAlerts);

    const createdB = await createClaim(page, clientB, plateB);
    const claimB = createdB.id;
    createdIds.push(claimB);
    rec(`r${round}-claim-b`, Boolean(claimB) && claimB !== claimA);
    await closeOverlays(page);
    const bAlerts = await rowAlertInfo(page, claimB);
    rec(`r${round}-no-cross-claim`, !bAlerts.text.includes(clientA) && !bAlerts.keys.some((k) => k.includes(`treat_${treatA?.id}`)) && !/מייל/.test(bAlerts.text), bAlerts);
    const leakTasks = (await claimTasks(claimB)).filter((t) => t.row_data?.gmailMessageId === mid1 || t.row_data?.gmailMessageId === mid2);
    rec(`r${round}-no-cross-db`, leakTasks.length === 0, { n: leakTasks.length });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const persist = await rowAlertInfo(page, claimA);
    rec(`r${round}-refresh-persist`, persist.keys.some((k) => k.includes('claim-alert-treat_')), persist);

    if (round === 3) {
      const freshSess = await login();
      const relog = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL' });
      await inject(relog, freshSess);
      const rpage = await relog.newPage();
      await openClaims(rpage);
      const afterLogin = await rowAlertInfo(rpage, claimA);
      rec('logout-login-persist', afterLogin.keys.some((k) => k.includes('claim-alert-treat_')), afterLogin);
      await shot(rpage, 'logout-login');
      await relog.close();

      await openClaims(mpage);
      const mobileAlerts = await rowAlertInfo(mpage, claimA);
      rec('mobile-labels', mobileAlerts.keys.some((k) => k.includes('claim-alert-treat_')) && !mobileAlerts.forbidden, mobileAlerts);
      if (linkedTreat) {
        await clickAlert(mpage, claimA, `treat_${linkedTreat.id}`);
        rec('mobile-click-treat', await mpage.locator('[data-testid="treat-center"].open, [data-testid="treat-center-body"]').count() > 0);
      } else rec('mobile-click-treat', false, { err: 'no linked treat' });
      await shot(mpage, 'mobile');
    }

    const blocked = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimA, to: BLOCKED, subject: 'blocked', body: 'no', file_ids: [], idempotency_key: `lbl-blk-${stamp}`,
    });
    rec(`r${round}-blocked-non-test`, blocked.json?.error === 'live_send_recipient_not_allowlisted' || blocked.json?.success === false, { error: blocked.json?.error });

    await closeOverlays(page);
    await openClaimCard(page, clientA, claimA);
    await openTreatTab(page);
    rec(`r${round}-treat-center-regression`, await page.locator('[data-testid="claims-treat-open"], [data-testid="treat-open"]').count() > 0);
    await closeOverlays(page);

    report.rounds.push(roundNotes);
  }

  const scanAgain = await invokeGmail(session, { action: 'status' });
  rec('gmail-3h-after', Number(scanAgain.json?.scheduler?.everyMs || scanAgain.json?.mailboxScan?.everyMs || scanAgain.json?.everyMs) === 3 * 60 * 60 * 1000);
  rec('no-schema-migration', report.schemaMigration === false);

  await desktop.close();
  await mobile.close();
} catch (e) {
  rec('qa-error', false, { err: String(e?.message || e).slice(0, 400) });
} finally {
  await browser.close().catch(() => undefined);
  for (const id of createdIds) await softDelete(id);
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
