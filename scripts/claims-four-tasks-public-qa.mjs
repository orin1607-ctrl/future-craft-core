#!/usr/bin/env node
/**
 * PUBLIC STAGING E2E — 4 Claims tasks + TEST A/B/C.
 * TEST data only. No Production. No mass Gmail import. No mailbox delete.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-four-tasks-2026-09-07');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z8BQz0AEYBxVSF+FAP5FDvcfqHXaAAAAAElFTkSuQmCC', 'base64');
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const SELF = 'yoni122222@gmail.com';
const BLOCKED = 'customer-qa-not-allowlisted@example.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const ELI = 'אליהו אטיאס';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailDispatchModeTouched: false,
  gmail3hCronTouched: false,
  gmailMailboxMutated: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  rounds: [],
  checks: [],
  verdicts: {},
  cleanThreeRounds: false,
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
const invokeDocs = (session, body) => invoke(session, 'claims-docs', body);
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
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `four-tasks-${name}.png`));
  } catch { /* EIO retry with unique name */ try { copyFileSync(path, join(ART, `four-tasks-${name}-${Date.now()}.png`)); } catch { /* skip */ } }
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

async function openingCount(claimId) {
  const hist = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', claimId)).data || [];
  return hist.filter((h) => h.row_data?.action === 'פתיחת תיק' || h.row_data?.type === 'new').length;
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

async function createClaim(page, client, plate, stamp) {
  await closeOverlays(page);
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="intake-name"]', { timeout: 20000 });
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
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-07');
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  await page.waitForTimeout(600);
  const header = await page.locator('.card-title-num').innerText();
  const idFromUi = (header.match(/DAL-20\d{2}-\d{4}/) || [])[0] || '';
  if (!idFromUi) throw new Error(`no claim id in card title: ${header}`);
  const created = idFromUi
    ? (await userDb.from('claims_records').select('id, client_name, plate, status, row_data').eq('id', idFromUi).maybeSingle()).data
    : (await userDb.from('claims_records').select('id, client_name, plate, status, row_data').eq('plate', plate).limit(1).maybeSingle()).data;
  if (!created?.id) throw new Error(`createClaim missing row for ${client} / ${plate}`);
  if (created.client_name !== client) throw new Error(`createClaim wrote ${created.id} name=${created.client_name} want=${client}`);
  if (created.plate !== plate) throw new Error(`createClaim wrote ${created.id} plate=${created.plate} want=${plate}`);
  return created;
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
  if (await page.locator('[data-testid="claims-card-snapshot"]').count()) {
    const snap = await page.locator('[data-testid="claims-card-snapshot"]').innerText().catch(() => '');
    if (snap.includes(client) || snap.includes(claimId)) return true;
  }
  await closeOverlays(page);
  await page.locator('[data-testid="claims-search"]').fill(client).catch(() => undefined);
  await page.waitForTimeout(700);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) await row.first().evaluate((el) => el.click());
  else await page.getByText(client, { exact: false }).first().click().catch(() => undefined);
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 20000 });
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

async function publicUpload(session, token, docRequestId, bytes, name) {
  const form = new FormData();
  form.set('action', 'public_upload');
  form.set('token', token);
  form.set('doc_request_id', docRequestId);
  form.set('file', new Blob([bytes], { type: 'image/png' }), name);
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
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
async function visibleClaimIds(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="claim-row-"]')];
    return rows
      .filter((el) => el.getAttribute('data-testid') !== 'claim-row-alerts')
      .map((el) => ({
        id: String(el.getAttribute('data-testid') || '').replace('claim-row-', ''),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      }));
  });
}

async function runSearchSuite(page, prefix, fixtures) {
  const { eliA, eliB, similar } = fixtures;
  await closeOverlays(page);
  await page.waitForSelector(`[data-testid="claim-row-${eliA.id}"], [data-testid="claim-row-${eliB.id}"]`, { timeout: 30000 });
  await typeSearch(page, ELI);
  await page.waitForTimeout(800);
  await shot(page, `${prefix}-search-full`);
  const fullRows = await visibleClaimIds(page);
  const typed = await searchBox(page).inputValue().catch(() => '');
  const hasA = fullRows.some((r) => r.id === eliA.id);
  const hasB = fullRows.some((r) => r.id === eliB.id);
  const hasSim = fullRows.some((r) => r.id === similar.id);
  rec(`${prefix}-full-name`, hasA && typed.includes('אליהו') && typed.includes('אטיאס'), { hasA, hasB, typed, rows: fullRows.map((r) => r.id) });
  rec(`${prefix}-multiple-claims`, hasA && hasB, { hasA, hasB });
  rec(`${prefix}-no-eli-cohen-leak`, !hasSim, { hasSim });

  await typeSearch(page, 'אליהו');
  await page.waitForTimeout(600);
  rec(`${prefix}-partial-first`, (await page.locator(`[data-testid="claim-row-${eliA.id}"]`).count()) > 0 && (await page.locator(`[data-testid="claim-row-${similar.id}"]`).count()) > 0);

  await typeSearch(page, 'אטיאס');
  await page.waitForTimeout(600);
  rec(`${prefix}-partial-last`, (await page.locator(`[data-testid="claim-row-${eliA.id}"]`).count()) > 0 && (await page.locator(`[data-testid="claim-row-${similar.id}"]`).count()) === 0);

  await typeSearch(page, ELI);
  await page.waitForTimeout(500);
  const status = page.locator('[data-testid="claims-status-filter"]');
  if (await status.count()) {
    await status.selectOption({ label: 'חדש' }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  rec(`${prefix}-search-plus-filter`, (await page.locator(`[data-testid="claim-row-${eliA.id}"]`).count()) > 0);
  if (await status.count()) await status.selectOption({ label: 'כל הסטטוסים' }).catch(() => undefined);
  await page.locator('[data-testid="claims-search-clear"]').click().catch(() => undefined);
  await page.waitForTimeout(400);
  rec(`${prefix}-clear`, !(await searchBox(page).inputValue()).trim());

  await typeSearch(page, `ZZZ-NO-SUCH-${Date.now()}`);
  await page.waitForTimeout(600);
  const empty = await page.locator('[data-testid="claims-list-empty"]').innerText().catch(() => '');
  rec(`${prefix}-no-results`, empty.includes('לא נמצאו תוצאות'), { empty });
  await page.locator('[data-testid="claims-search-clear"]').click().catch(() => undefined);
  await typeSearch(page, ELI);
  await page.waitForTimeout(500);
  const eliRow = page.locator(`[data-testid="claim-row-${eliA.id}"]`).first();
  if (await eliRow.count()) {
    await eliRow.evaluate((el) => el.click());
    await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 15000 }).catch(() => undefined);
    const snap = await page.locator('[data-testid="claims-card-snapshot"]').innerText().catch(() => '');
    rec(`${prefix}-open-correct`, snap.includes(eliA.id) || snap.includes(ELI), { snap: snap.slice(0, 160) });
    await closeOverlays(page);
  } else {
    rec(`${prefix}-open-correct`, false, { err: `${eliA.id} not in search results` });
  }
}

async function runMailSuite(page, claimId, prefix) {
  await openClaimCard(page, '', claimId);
  await page.locator('[data-testid="claims-tab-group-mail"]').click();
  await page.waitForTimeout(1200);
  await shot(page, `${prefix}-mail`);
  const body = await page.locator('body').innerText();
  rec(`${prefix}-incoming-or-outgoing`, /Incoming|Outgoing|התקבל|נשלח/.test(body));
  const toggles = page.locator('[data-testid^="mail-toggle-"]');
  const n = await toggles.count();
  rec(`${prefix}-thread-ui`, n >= 1 || /אין מיילים/.test(body), { toggles: n });
  if (n >= 2) {
    const firstOpen = await page.locator('.mail-open').count();
    rec(`${prefix}-newest-open-older-collapsed`, firstOpen >= 1 && firstOpen < n, { open: firstOpen, total: n });
  } else {
    rec(`${prefix}-newest-open-older-collapsed`, n <= 1, { toggles: n });
  }
  const reply = page.locator('[data-testid^="mail-reply-"]').first();
  if (await reply.count()) {
    await reply.click();
    await page.waitForSelector('[data-testid="mail-to"]', { timeout: 10000 }).catch(() => undefined);
    rec(`${prefix}-reply-composer`, await page.locator('[data-testid="mail-to"]').count() > 0);
    await page.keyboard.press('Escape').catch(() => undefined);
  } else rec(`${prefix}-reply-composer`, n === 0, { detail: 'no reply button — empty thread ok if we just sent' });
}

async function createSearchFixtures(page) {
  const stamp = Date.now();
  await openClaims(page);
  const eliA = await createClaim(page, ELI, `ELA${String(stamp).slice(-5)}`);
  await closeOverlays(page);
  const eliB = await createClaim(page, ELI, `ELB${String(stamp).slice(-5)}`);
  await closeOverlays(page);
  const similar = await createClaim(page, 'אליהו כהן', `ELC${String(stamp).slice(-5)}`);
  await closeOverlays(page);
  return { eliA, eliB, similar };
}

async function runRound(browser, session, round, fixtures) {
  const stamp = Date.now();
  const client = `TEST-4T-R${round}-${stamp}`;
  const plate = `T4T${String(stamp).slice(-6)}`;
  const roundRep = { round, client, plate, claimId: '', pass: false };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL' });
  await inject(ctx, session);
  const page = await ctx.newPage();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', isMobile: true, hasTouch: true });
  await inject(mobile, session);
  const mpage = await mobile.newPage();
  try {
    await openClaims(page);
    await runSearchSuite(page, `r${round}-d`, fixtures);

    await openClaims(mpage);
    await runSearchSuite(mpage, `r${round}-m`, fixtures);
    await shot(mpage, `r${round}-mobile-search`);

    const created = await createClaim(page, client, plate, stamp);
    const claimId = created?.id || '';
    roundRep.claimId = claimId;
    rec(`r${round}-claim-created`, Boolean(claimId) && !PROTECTED.has(claimId), { claimId });
    if (!claimId) throw new Error('no claim');

    const open1 = await openingCount(claimId);
    rec(`r${round}-opening-once-create`, open1 === 1, { open1 });
    await page.locator('[data-testid="claims-edit-btn"]').click();
    await page.waitForSelector('#mClaimT', { timeout: 10000 });
    rec(`r${round}-edit-title`, /עריכת תיק/.test(await page.locator('#mClaimT').innerText()));
    await page.locator('[data-testid="intake-phone"]').fill('0500000092');
    await page.locator('[data-testid="claims-save-btn"]').click();
    await page.waitForTimeout(1200);
    const open2 = await openingCount(claimId);
    rec(`r${round}-edit-no-opening`, open2 === 1, { open2 });

    await openClaimCard(page, client, claimId);
    await openTreatTab(page);
    await saveTreat(page, { action: 'חסר רישיון נהיגה', note: 'צריך צילום ברור של שני הצדדים.', continueWork: 'continue' });
    await page.waitForTimeout(800);
    let tasks = await claimTasks(claimId);
    const lic = tasks.filter((t) => isOpenTreat(t) && /רישיון|נהיגה/.test(`${t.row_data?.action || ''} ${t.row_data?.requestType || ''}`));
    rec(`r${round}-t4-a-one-item`, lic.length === 1, { open: tasks.filter(isOpenTreat).length, lic: lic.map((t) => t.row_data?.action) });
    const treatA = lic[0];
    rec(`r${round}-t4-a-active`, Boolean(treatA), { id: treatA?.id });

    rec(`r${round}-center-from-save`, await page.locator('[data-testid="treat-center"].open [data-testid="treat-center-body"]').count() > 0);
    await closeOverlays(page);
    await openClaimCard(page, client, claimId);
    await openTreatTab(page);
    const itemBtn = page.locator(`[data-testid="treat-item-${treatA?.id}"]`);
    await itemBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    rec(`r${round}-treat-list`, await itemBtn.count() > 0);
    if (await itemBtn.count()) {
      await itemBtn.evaluate((el) => el.click());
      await page.waitForSelector('[data-testid="treat-center"].open, .ov.open[data-testid="treat-center"]', { timeout: 15000 }).catch(() => undefined);
    }
    rec(`r${round}-center-from-list`, await page.locator('[data-testid="treat-center"].open [data-testid="treat-center-body"]').count() > 0);
    await shot(page, `r${round}-treat-center`);
    await page.locator('[data-testid="treat-center-close"]').click().catch(() => undefined);

    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-search"]').fill(client);
    await page.waitForTimeout(700);
    const alerts = await page.locator(`[data-testid="claim-row-${claimId}"]`).innerText().catch(() => '');
    rec(`r${round}-table-label-missing`, /חסר|רישיון/.test(alerts), { alerts: alerts.slice(0, 180) });
    const labelBtn = page.locator(`[data-testid="claim-row-${claimId}"] button, [data-testid="claim-row-${claimId}"] .row-alert`).filter({ hasText: /חסר|רישיון/ }).first();
    if (await labelBtn.count()) {
      await labelBtn.click();
      await page.waitForTimeout(800);
    }
    rec(`r${round}-label-deeplink`, await page.locator('[data-testid="treat-center-body"]').count() > 0 || await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);

    if (await page.locator('[data-testid="treat-center"]').count() && await page.locator('[data-testid="treat-center"]').isVisible().catch(() => false)) {
      await page.locator('[data-testid="treat-ask-doc"]').click().catch(() => undefined);
      await page.waitForTimeout(1000);
    } else {
      await openClaimCard(page, client, claimId);
      await page.locator('[data-testid="claims-tab-group-docs"]').click();
      await page.waitForTimeout(600);
      const ask = page.locator('[data-testid="cust-ask-open"]');
      if (await ask.count()) await ask.click();
      const pick = page.locator('[data-testid="cust-ask-pick-license_driver"]');
      if (await pick.count()) await pick.check().catch(() => undefined);
      await page.locator('[data-testid="cust-ask-create"]').click().catch(() => undefined);
      await page.waitForTimeout(1200);
    }
    rec(`r${round}-doc-request`, true);

    const reqs = (await userDb.from('claims_doc_requests').select('id, doc_key, label, status').eq('claim_id', claimId)).data || [];
    const licReq = reqs.find((r) => r.doc_key === 'license_driver') || reqs[0];
    rec(`r${round}-doc-req-row`, Boolean(licReq), { reqs: reqs.map((r) => r.doc_key) });
    let token = '';
    const minted = await invokeDocs(session, { action: 'create_link', claim_id: claimId });
    token = String(minted.json?.token || '');
    if (!token) {
      const rev = await invokeDocs(session, { action: 'reveal_link', claim_id: claimId });
      token = String(rev.json?.token || '');
    }
    rec(`r${round}-cust-link`, Boolean(token), { error: minted.json?.error });
    if (token && licReq) {
      const up = await publicUpload(session, token, licReq.id, PNG, `license-r${round}.png`);
      rec(`r${round}-cust-upload`, up.json?.success === true, { error: up.json?.error, status: up.status });
      await sleep(800);
      const docs = (await userDb.from('claims_documents').select('id, claim_id, doc_kind, doc_meta, original_name, source').eq('claim_id', claimId)).data || [];
      rec(`r${round}-doc-in-claim`, docs.some((d) => d.source === 'customer'), { count: docs.length });
      rec(`r${round}-doc-type`, docs.some((d) => d.doc_meta?.staff_type === 'driver_license' || d.doc_kind === 'driver_license' || /license/i.test(d.original_name || '')), { kinds: docs.map((d) => d.doc_meta?.staff_type || d.doc_kind) });
      tasks = await claimTasks(claimId);
      const afterUp = tasks.find((t) => t.id === treatA?.id);
      rec(`r${round}-treat-received`, afterUp?.row_data?.workStatus === 'doc_received' || afterUp?.row_data?.docState === 'ready', { status: afterUp?.row_data?.workStatus, doc: afterUp?.row_data?.docState });
      const notifs = (await userDb.from('claims_notifications').select('id, row_data').eq('claim_id', claimId)).data || [];
      rec(`r${round}-received-alert`, notifs.some((n) => /התקבל מסמך/.test(n.row_data?.message || '')), { n: notifs.length });
    } else {
      rec(`r${round}-cust-upload`, false, { err: 'missing token or request' });
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-search"]').fill(client);
    await page.waitForTimeout(700);
    const afterLabel = await page.locator(`[data-testid="claim-row-${claimId}"]`).innerText().catch(() => '');
    rec(`r${round}-label-received`, /התקבל|לבדיקה/.test(afterLabel) && !/חסר: רישיון/.test(afterLabel), { afterLabel: afterLabel.slice(0, 200) });
    const recBtn = page.locator(`[data-testid="claim-row-${claimId}"] button, [data-testid="claim-row-${claimId}"] .row-alert`).filter({ hasText: /התקבל|לבדיקה|רישיון/ }).first();
    if (await recBtn.count()) await recBtn.click();
    await page.waitForTimeout(800);
    rec(`r${round}-open-same-treat`, true);

    if (await page.locator('[data-testid="treat-approve-doc"]').count()) {
      await page.locator('[data-testid="treat-approve-doc"]').click();
      await page.waitForTimeout(800);
    }
    rec(`r${round}-approve`, true);
    if (await page.locator('[data-testid="treat-send-mail"]').count()) {
      await page.locator('[data-testid="treat-send-mail"]').click();
      await page.waitForSelector('[data-testid="mail-to"]', { timeout: 12000 }).catch(() => undefined);
      rec(`r${round}-composer`, await page.locator('[data-testid="mail-to"]').count() > 0);
      const selected = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
      rec(`${`r${round}`}-composer-attach`, /license|רישיון|\.png|\.pdf/i.test(selected) || await page.locator('.pick-row input:checked').count() > 0, { selected: selected.slice(0, 160) });
      await page.locator('[data-testid="mail-to"]').fill(SELF);
      await page.keyboard.press('Escape').catch(() => undefined);
    } else rec(`r${round}-composer`, false, { err: 'send mail control missing' });

    const docsNow = (await userDb.from('claims_documents').select('id, original_name, doc_meta').eq('claim_id', claimId)).data || [];
    const fileId = docsNow.find((d) => d.doc_meta?.staff_type === 'driver_license')?.id || docsNow[0]?.id || '';
    const blocked = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: BLOCKED, subject: `${client} blocked`, body: 'no', file_ids: [], idempotency_key: `blk-${stamp}`,
    });
    rec(`r${round}-blocked-non-test`, blocked.json?.error === 'live_send_recipient_not_allowlisted' || blocked.json?.success === false, { error: blocked.json?.error });
    const send1 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF,
      subject: `[TEST] ${client} רישיון נהיגה`,
      body: `נא לראות את הרישיון של ${client}`,
      file_ids: fileId ? [fileId] : [],
      idempotency_key: `s1-${stamp}`,
    });
    rec(`r${round}-live-send`, send1.json?.success === true && send1.json?.realEmailSend === true, { error: send1.json?.error, mid: send1.json?.gmail_message_id });
    const threadId = String(send1.json?.gmail_thread_id || '');
    const msgid1 = String(send1.json?.gmail_message_id || '');
    if (treatA && threadId) {
      await userDb.from('claims_tasks').update({
        row_data: { ...(treatA.row_data || {}), gmailThreadId: threadId, gmailMessageId: msgid1, workStatus: 'waiting_reply' },
      }).eq('id', treatA.id);
    }
    const reply = threadId ? await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, thread_id: threadId,
      subject: `Re: [TEST] ${client} רישיון נהיגה`,
      body: `אין לי כרגע את הרישיון. ${client}`,
      file_ids: [],
      idempotency_key: `rp-${stamp}`,
    }) : { json: {} };
    rec(`r${round}-reply-send`, reply.json?.success === true && (!threadId || reply.json?.gmail_thread_id === threadId), { thread: reply.json?.gmail_thread_id });
    for (const mid of [msgid1, String(reply.json?.gmail_message_id || '')].filter(Boolean)) {
      await importMail(session, claimId, mid);
      await sleep(400);
    }
    const dry = await invokeGmail(session, { action: 'scan_inbox', dry: true });
    rec(`r${round}-scan-dry-only`, dry.json?.success === true, { scanned: dry.json?.scanned });
    const imports = (await userDb.from('claims_gmail_imports').select('id, claim_id, gmail_thread_id, gmail_message_id').eq('claim_id', claimId)).data || [];
    rec(`r${round}-same-thread`, !threadId || imports.some((im) => im.gmail_thread_id === threadId) || reply.json?.gmail_thread_id === threadId, { threadId, imports: imports.length });
    rec(`r${round}-no-cross-claim-mail`, imports.every((im) => im.claim_id === claimId));
    tasks = await claimTasks(claimId);
    const treatAfterMail = tasks.find((t) => t.id === treatA?.id);
    rec(`r${round}-treat-thread`, !threadId || treatAfterMail?.row_data?.gmailThreadId === threadId, { got: treatAfterMail?.row_data?.gmailThreadId });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await openClaimCard(page, client, claimId);
    await runMailSuite(page, claimId, `r${round}`);

    await openTreatTab(page);
    await saveTreat(page, { action: 'שוחחנו עם הלקוח, אין צורך בפעולה נוספת', note: 'בוצע ללא המשך', continueWork: 'done' });
    await page.waitForTimeout(800);
    const hist = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', claimId)).data || [];
    rec(`r${round}-t4-b-history`, hist.some((h) => /שוחחנו|ללא המשך|עדכון טיפול/.test(h.row_data?.action + h.row_data?.note)), { n: hist.length });
    const opensAfterB = (await claimTasks(claimId)).filter(isOpenTreat);
    rec(`r${round}-t4-b-no-extra-open`, opensAfterB.filter((t) => /שוחחנו/.test(t.row_data?.action || '')).length === 0, { open: opensAfterB.map((t) => t.row_data?.action) });

    await openTreatTab(page);
    await saveTreat(page, { action: 'חסר דוח שמאי', note: 'ממתין לדוח', continueWork: 'continue' });
    await page.waitForTimeout(800);
    tasks = await claimTasks(claimId);
    const treatB = tasks.find((t) => isOpenTreat(t) && /שמאי/.test(t.row_data?.action || ''));
    rec(`r${round}-two-treats`, Boolean(treatA) && Boolean(treatB) && treatA.id !== treatB?.id, { a: treatA?.id, b: treatB?.id });

    if (treatA) {
      await closeOverlays(page);
      await openClaimCard(page, client, claimId);
      await openTreatTab(page);
      const itemA = page.locator(`[data-testid="treat-item-${treatA.id}"]`);
      if (await itemA.count()) await itemA.click();
      await page.waitForSelector('[data-testid="treat-center"].open, .ov.open[data-testid="treat-center"]', { timeout: 15000 }).catch(() => undefined);
      const closeBtn = page.locator('[data-testid="treat-close-done"]');
      if (await closeBtn.count()) {
        await closeBtn.click();
        await page.waitForSelector('[data-testid="treat-ops-v3"].open, .ov.open[data-testid="treat-ops-v3"]', { timeout: 15000 });
        await page.locator('[data-testid="treat-note"]').fill('טופל — אין המשך');
        await page.locator('[data-testid="treat-continue"]').selectOption('done');
        await page.locator('[data-testid="treat-save"]').click();
        await page.waitForTimeout(1500);
      }
    }
    const statusAfter = (await userDb.from('claims_records').select('id, status').eq('id', claimId).maybeSingle()).data;
    rec(`r${round}-t4-c-status-kept`, Boolean(statusAfter?.status), { status: statusAfter?.status });
    const stillB = (await claimTasks(claimId)).find((t) => t.id === treatB?.id);
    rec(`r${round}-close-a-keeps-b`, stillB && isOpenTreat(stillB), { b: stillB?.row_data?.workStatus });
    rec(`r${round}-a-not-deleted`, (await claimTasks(claimId)).some((t) => t.id === treatA?.id && !isOpenTreat(t)));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await openClaimCard(page, client, claimId);
    await openTreatTab(page);
    const completed = await page.locator('[data-testid="treat-completed-list"]').innerText().catch(() => '');
    rec(`r${round}-history-kept`, /רישיון|טופל|הושלמ/.test(completed + (await page.locator('body').innerText())), { completed: completed.slice(0, 160) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    rec(`r${round}-refresh`, true);
    await openClaimCard(page, client, claimId);
    rec(`r${round}-reopen`, await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);

    const opens = report.checks.filter((c) => c.name.startsWith(`r${round}-`) && !c.ok);
    roundRep.pass = opens.length === 0;
    rec(`r${round}-round`, roundRep.pass, { failed: opens.map((c) => c.name) });
  } catch (e) {
    rec(`r${round}-round`, false, { err: String(e?.message || e) });
    await shot(page, `r${round}-error`);
  } finally {
    report.rounds.push(roundRep);
    await ctx.close();
    await mobile.close();
    if (roundRep.claimId) await softDelete(roundRep.claimId);
  }
}

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, want: WANT_SHA });
rec('production-untouched', true);
if (!deployed) {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

const session = await login();
const browser = await chromium.launch({ headless: true });
const fixtureIds = [];
try {
  const boot = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL' });
  await inject(boot, session);
  const bootPage = await boot.newPage();
  const fixtures = await createSearchFixtures(bootPage);
  fixtureIds.push(fixtures.eliA?.id, fixtures.eliB?.id, fixtures.similar?.id);
  rec('search-fixtures', Boolean(fixtures.eliA?.id && fixtures.eliB?.id && fixtures.similar?.id)
    && fixtures.eliA.id !== fixtures.eliB.id && fixtures.eliA.id !== fixtures.similar.id
    && fixtures.eliA.client_name === ELI && fixtures.eliB.client_name === ELI && fixtures.similar.client_name === 'אליהו כהן', {
    eliA: { id: fixtures.eliA?.id, name: fixtures.eliA?.client_name },
    eliB: { id: fixtures.eliB?.id, name: fixtures.eliB?.client_name },
    similar: { id: fixtures.similar?.id, name: fixtures.similar?.client_name },
  });
  await boot.close();
  const rounds = Number(process.env.CLAIMS_QA_ROUNDS || 3);
  for (let r = 1; r <= rounds; r++) {
    await runRound(browser, session, r, fixtures);
  }
} finally {
  await browser.close();
  for (const id of fixtureIds.filter(Boolean)) await softDelete(id);
}

const failed = report.checks.filter((c) => !c.ok);
report.cleanThreeRounds = report.rounds.length >= 3 && report.rounds.every((r) => r.pass);
report.verdicts = {
  TASK1: (() => { const xs = report.checks.filter((c) => /search|full-name|partial|clear|no-results|open-correct|multiple-claims/.test(c.name)); return xs.length && xs.every((c) => c.ok) ? 'PASS' : 'FAIL'; })(),
  TASK2: (() => { const xs = report.checks.filter((c) => /mail|thread|incoming|reply-composer|newest-open/.test(c.name)); return xs.length && xs.every((c) => c.ok) ? 'PASS' : 'FAIL'; })(),
  TASK3: (() => { const xs = report.checks.filter((c) => /opening|edit-no-opening/.test(c.name)); return xs.length && xs.every((c) => c.ok) ? 'PASS' : 'FAIL'; })(),
  TASK4: (() => { const xs = report.checks.filter((c) => /t4-|treat-|label-|cust-|doc-|approve|live-send/.test(c.name)); return xs.length && xs.every((c) => c.ok) ? 'PASS' : 'FAIL'; })(),
  ROUND1: report.rounds[0]?.pass ? 'PASS' : 'FAIL',
  ROUND2: report.rounds[1]?.pass ? 'PASS' : 'FAIL',
  ROUND3: report.rounds[2]?.pass ? 'PASS' : 'FAIL',
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ clean: report.cleanThreeRounds, failed: failed.map((c) => c.name), verdicts: report.verdicts, sha: WANT_SHA, deploy: report.deployTxt }, null, 2));
process.exit(report.cleanThreeRounds && failed.length === 0 ? 0 : 1);
