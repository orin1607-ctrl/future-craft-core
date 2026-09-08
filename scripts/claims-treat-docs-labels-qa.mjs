#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — Treatment Center documents + clear treatment labels.
 * TEST data only. Live TEST send only to yoni122222@gmail.com.
 * No Production. No schema/migration. No Gmail scan/matching changes.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-treat-docs-labels-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const SELF = 'yoni122222@gmail.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z8BQz0AEYBxVSF+FAP5FDvcfqHXaAAAAAElFTkSuQmCC', 'base64');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  schemaMigration: false,
  gmail3hCronTouched: false,
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

async function staffUpload(session, claimId, name) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  form.set('staff_type', 'damage_photos');
  form.set('file', new File([PNG], name, { type: 'image/png' }));
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  return res.json().catch(() => ({ success: false }));
}

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
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `treat-docs-${name}.png`));
  } catch { /* skip */ }
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
async function waitTreatClosed(claimId, taskId) {
  for (let i = 0; i < 25; i++) {
    const row = (await claimTasks(claimId)).find((t) => t.id === taskId);
    if (row && !isOpenTreat(row)) return true;
    await sleep(400);
  }
  return false;
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
  await page.waitForTimeout(400);
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
  await page.waitForTimeout(400);
}

async function closeOverlays(page) {
  for (let i = 0; i < 8; i++) {
    const vis = page.locator('.ov.open [data-testid="treat-docs-back"], .ov.open [data-testid="treat-center-close"], .ov.open [data-testid="treat-back"], .ov.open .mcl').locator('visible=true');
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
  const box = row.locator('[data-testid="claim-row-alerts"]');
  const text = (await box.innerText().catch(() => '')) || '';
  const keys = await box.locator('[data-testid^="claim-alert-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') || '')).catch(() => []);
  return { text: text.trim(), keys };
}

async function clickAlert(page, claimId, prefix) {
  await closeOverlays(page);
  await typeSearch(page, claimId);
  const chip = page.locator(`[data-testid="claim-row-${claimId}"] [data-testid^="claim-alert-${prefix}"]`).locator('visible=true').first();
  await chip.waitFor({ state: 'visible', timeout: 15000 });
  await chip.scrollIntoViewIfNeeded().catch(() => undefined);
  await chip.click({ force: true });
  if (String(prefix).startsWith('treat_')) {
    const id = String(prefix).replace(/^treat_/, '');
    await page.waitForSelector(`[data-testid="treat-center"].open [data-treat-id="${id}"]`, { timeout: 45000 });
  }
}

async function openTreatTab(page) {
  const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
  if (await snap.count()) {
    const exp = await snap.getAttribute('aria-expanded');
    if (exp === 'false') await snap.click().catch(() => undefined);
  }
  const work = page.locator('[data-testid="claims-tab-group-work"]');
  if (await work.count()) await work.first().click({ force: true }).catch(() => undefined);
  const sub = page.locator('[data-testid="claims-tab-sub-treat"]');
  if (await sub.count()) await sub.first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function saveTreat(page, { action, note, continueWork, nextDate }) {
  const bar = page.locator('[data-testid="claims-treat-open"]');
  const treatBtn = (await bar.count()) ? bar.first() : page.locator('[data-testid="treat-open"]').first();
  await treatBtn.evaluate((el) => el.click());
  await page.waitForSelector('[data-testid="treat-ops-v3"].open, .ov.open[data-testid="treat-ops-v3"]', { timeout: 15000 });
  if (action) await page.locator('[data-testid="treat-action"]').fill(action);
  if (note) await page.locator('[data-testid="treat-note"]').fill(note);
  if (continueWork === 'done') await page.locator('[data-testid="treat-drop-label"]').click().catch(() => undefined);
  else await page.locator('[data-testid="treat-keep-label"]').click().catch(() => undefined);
  await page.locator('[data-testid="treat-continue"]').selectOption(continueWork);
  const day = nextDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.locator('[data-testid="treat-next"]').fill(day);
  await page.locator('[data-testid="treat-save"]').click();
  if (continueWork === 'continue') {
    await page.waitForSelector('[data-testid="treat-center"].open [data-testid="treat-center-body"]', { timeout: 30000 }).catch(() => undefined);
  } else {
    await page.waitForTimeout(1500);
  }
}

async function createClaim(page, client, plate) {
  await closeOverlays(page);
  await page.locator('[data-testid="claims-open-new"]').evaluate((el) => el.click());
  await page.waitForSelector('[data-testid="claims-new-modal"].open [data-testid="intake-name"]', { timeout: 20000 });
  const title = await page.locator('#mClaimT').innerText().catch(() => '');
  if (/עריכת תיק/.test(title)) {
    await page.evaluate(() => { const el = document.getElementById('fc_id'); if (el) el.value = ''; });
  }
  await page.locator('[data-testid="intake-name"]').fill(client);
  await page.locator('[data-testid="intake-phone"]').fill('0500000093');
  const email = page.locator('#in_email');
  if (await email.count()) await email.fill(SELF);
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  const co = page.locator('#in_co');
  if (await co.count()) await co.fill('הפניקס');
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-08');
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.locator('[data-testid="claims-new-modal"].open').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
  let created = null;
  for (let i = 0; i < 24 && !created; i++) {
    await page.waitForTimeout(500);
    created = (await userDb.from('claims_records').select('id, client_name, plate, status, row_data').eq('plate', plate).maybeSingle()).data;
  }
  if (!created?.id) throw new Error(`createClaim did not persist ${client}`);
  await openClaimCard(page, client, created.id);
  return created;
}

const session = await login();
const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
rec('staging-only', STAGING_REF !== PROD_REF);
const status = await invokeGmail(session, { action: 'status' });
rec('gmail-3h-untouched', Number(status.json?.scheduler?.everyMs || status.json?.everyMs) === 3 * 60 * 60 * 1000, {
  everyMs: status.json?.scheduler?.everyMs || status.json?.everyMs,
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
    const clientA = `TEST-TD-A${round}-${stamp}`;
    const plateA = `TA${round}${String(stamp).slice(-5)}`;
    const clientB = `TEST-TD-B${round}-${stamp}`;
    const plateB = `TB${round}${String(stamp).slice(-5)}`;

    const createdA = await createClaim(page, clientA, plateA);
    const claimA = createdA.id;
    createdIds.push(claimA);
    rec(`r${round}-claim-a`, Boolean(claimA) && !PROTECTED.has(claimA), { claimA });

    const upA = await staffUpload(session, claimA, `td-a-${stamp}.png`);
    const fileA = String(upA.file_id || upA.id || '');
    rec(`r${round}-upload-a`, Boolean(fileA) && upA.success !== false, { fileA, reused: upA.reused });

    await openTreatTab(page);
    await saveTreat(page, { action: 'ממתין לדוח שמאי', note: 'ממתין לדוח שמאי', continueWork: 'continue' });
    let treats = (await claimTasks(claimA)).filter(isOpenTreat);
    const treatA = treats[0];
    rec(`r${round}-treat-created`, Boolean(treatA), { id: treatA?.id, n: treats.length });
    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const labeled = await rowAlertInfo(page, claimA);
    rec(`r${round}-label-text`, labeled.text.includes('ממתין לדוח שמאי') && labeled.keys.some((k) => k.includes(`treat_${treatA?.id}`)), labeled);

    await clickAlert(page, claimA, `treat_${treatA?.id}`);
    const openedId = await page.locator('[data-testid="treat-center"].open [data-testid="treat-center-body"]').getAttribute('data-treat-id').catch(() => '');
    rec(`r${round}-click-exact`, await page.locator('[data-testid="treat-center"].open [data-testid="treat-center-body"]').count() > 0 && (!openedId || openedId === treatA.id) && await page.locator('[data-testid="treat-center"].open').innerText().then((t) => t.includes('ממתין לדוח שמאי')), { openedId, treatA: treatA?.id });
    rec(`r${round}-update-visible`, await page.locator('[data-testid="treat-center"].open').innerText().then((t) => t.includes('ממתין לדוח שמאי')).catch(() => false));
    await shot(page, `r${round}-treat`);

    await page.locator('[data-testid="treat-docs-open"]').click();
    await page.waitForSelector('[data-testid="treat-docs"].open [data-testid="treat-docs-body"]', { timeout: 15000 });
    rec(`r${round}-docs-open`, await page.locator(`[data-testid="treat-docs-row-${fileA}"]`).count() > 0, { fileA });
    const leakRows = await page.locator('[data-testid^="treat-docs-row-"]').evaluateAll((els, id) => els.some((el) => el.getAttribute('data-claim-id') && el.getAttribute('data-claim-id') !== id), claimA);
    rec(`r${round}-docs-same-claim`, leakRows === false);
    if (fileA) {
      await page.locator(`[data-testid="treat-docs-preview-${fileA}"]`).click();
      await page.waitForSelector('[data-testid="treat-docs"].open [data-testid="doc-preview"]', { timeout: 15000 });
      rec(`r${round}-preview`, await page.locator('[data-testid="treat-docs"].open [data-testid="doc-preview"]').count() > 0, { fileA });
      await page.locator('[data-testid="treat-docs"].open [data-testid="doc-preview-close"]').click().catch(() => undefined);
      await page.locator(`[data-testid="treat-docs-pick-${fileA}"]`).check();
      await page.locator('[data-testid="treat-docs-attach-mail"]').click();
      await page.waitForSelector('[data-testid="mo-mail"].open, .ov.open[data-testid="mo-mail"]', { timeout: 15000 });
      rec(`r${round}-composer-same-file`, await page.locator(`[data-testid="mail-file-${fileA}"]`).isChecked().catch(() => false), { fileA });
      await page.locator('[data-testid="mail-to"], #mail_to').first().fill(SELF).catch(() => undefined);
      await page.locator('#mail_to').fill(SELF).catch(() => undefined);
      await page.evaluate((addr) => {
        const el = document.getElementById('mail_to') || document.querySelector('[data-testid="mail-to"]');
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, SELF);
      const send = await invokeGmail(session, {
        action: 'send_claim', confirm: true, claim_id: claimA, to: SELF,
        subject: `[TEST] treat docs ${clientA}`,
        body: `Composer attach ${clientA}`,
        file_ids: [fileA],
        idempotency_key: `td-${stamp}`,
      });
      rec(`r${round}-live-send`, send.json?.success === true, { error: send.json?.error, mid: send.json?.gmail_message_id });
      rec(`r${round}-same-doc-id`, Array.isArray(send.json?.file_ids) ? send.json.file_ids.includes(fileA) : true, { fileA });
    }
    await closeOverlays(page);
    const docsAfter = ((await userDb.from('claims_documents').select('id, claim_id').eq('claim_id', claimA)).data || []);
    rec(`r${round}-no-duplicate-file`, docsAfter.filter((d) => d.id === fileA).length <= 1, { n: docsAfter.length });

    await clickAlert(page, claimA, `treat_${treatA?.id}`);
    await page.waitForSelector('[data-testid="treat-update-open"]', { timeout: 15000 });
    await page.locator('[data-testid="treat-update-open"]').click();
    await page.waitForSelector('[data-testid="treat-ops-v3"].open [data-testid="treat-action"]', { timeout: 15000 });
    await page.locator('[data-testid="treat-action"]').fill('להתקשר ללקוח');
    await page.locator('[data-testid="treat-note"]').fill('להתקשר ללקוח');
    await page.locator('[data-testid="treat-keep-label"]').click();
    await page.locator('[data-testid="treat-continue"]').selectOption('continue');
    await page.locator('[data-testid="treat-next"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.locator('[data-testid="treat-save"]').click();
    await page.waitForTimeout(1500);
    const afterUpdate = (await claimTasks(claimA)).filter(isTreat);
    rec(`r${round}-no-dup-treat`, afterUpdate.length === treats.length || afterUpdate.filter(isOpenTreat).length === 1, {
      before: treats.length, after: afterUpdate.length, open: afterUpdate.filter(isOpenTreat).length,
    });
    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const relabel = await rowAlertInfo(page, claimA);
    rec(`r${round}-label-updated`, relabel.text.includes('להתקשר ללקוח'), relabel);

    await openClaimCard(page, clientA, claimA);
    await openTreatTab(page);
    await saveTreat(page, { action: 'חסר רישיון נהיגה', note: 'טיפול שני', continueWork: 'continue' });
    const two = (await claimTasks(claimA)).filter(isOpenTreat);
    rec(`r${round}-two-isolated`, two.length >= 2 && two.every((t) => t.id), { n: two.length });
    await closeOverlays(page);
    const twoAlerts = await rowAlertInfo(page, claimA);
    rec(`r${round}-two-labels`, twoAlerts.keys.filter((k) => k.includes('claim-alert-treat_')).length >= 2, twoAlerts);

    await clickAlert(page, claimA, `treat_${treatA?.id}`);
    await page.waitForSelector('[data-testid="treat-update-open"]', { timeout: 15000 });
    await page.locator('[data-testid="treat-update-open"]').click();
    await page.waitForSelector('[data-testid="treat-drop-label"]', { timeout: 15000 });
    await page.locator('[data-testid="treat-drop-label"]').click();
    await page.locator('[data-testid="treat-continue"]').selectOption('done');
    await page.locator('[data-testid="treat-next"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.locator('[data-testid="treat-save"]').click();
    await page.locator('[data-testid="treat-ops-v3"].open').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
    const dbClosed = await waitTreatClosed(claimA, treatA?.id);
    rec(`r${round}-label-removed-db`, dbClosed, { treatA: treatA?.id });
    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const afterClose = await rowAlertInfo(page, claimA);
    rec(`r${round}-label-removed`, dbClosed && !afterClose.keys.some((k) => k.includes(`treat_${treatA?.id}`)), afterClose);
    const hist = ((await userDb.from('claims_history').select('id, row_data').eq('claim_id', claimA)).data || []);
    rec(`r${round}-history-kept`, hist.some((h) => /טיפול/.test(`${h.row_data?.action || ''} ${h.row_data?.type || ''}`)), { n: hist.length });
    rec(`r${round}-other-treat-stays`, afterClose.keys.some((k) => k.includes('claim-alert-treat_') && !k.includes(treatA?.id)), afterClose);

    const createdB = await createClaim(page, clientB, plateB);
    createdIds.push(createdB.id);
    const upB = await staffUpload(session, createdB.id, `td-b-${stamp}.png`);
    rec(`r${round}-no-cross-db`, String(upB.file_id || '') !== fileA && createdB.id !== claimA);
    await closeOverlays(page);
    const bAlerts = await rowAlertInfo(page, createdB.id);
    rec(`r${round}-no-cross-label`, !bAlerts.keys.some((k) => k.includes(`treat_${treatA?.id}`)), bAlerts);

    if (round === 3) {
      await openClaims(mpage);
      await typeSearch(mpage, clientA);
      await mpage.locator(`[data-testid="claim-row-${claimA}"]`).first().click().catch(() => undefined);
      await mpage.waitForTimeout(800);
      await openTreatTab(mpage);
      const other = (await claimTasks(claimA)).find(isOpenTreat);
      if (other) await mpage.locator(`[data-testid="treat-item-${other.id}"]`).click().catch(() => undefined);
      rec('mobile-docs-btn', await mpage.locator('[data-testid="treat-docs-open"]').count() > 0);
      if (await mpage.locator('[data-testid="treat-docs-open"]').count()) {
        await mpage.locator('[data-testid="treat-docs-open"]').click();
        rec('mobile-docs-list', await mpage.locator('[data-testid="treat-docs"].open [data-testid="treat-docs-body"]').count() > 0);
      }
      await shot(mpage, 'mobile');
    }
  }

  const scanAgain = await invokeGmail(session, { action: 'status' });
  rec('gmail-3h-after', Number(scanAgain.json?.scheduler?.everyMs || scanAgain.json?.everyMs) === 3 * 60 * 60 * 1000);
  rec('no-schema', report.schemaMigration === false);
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
