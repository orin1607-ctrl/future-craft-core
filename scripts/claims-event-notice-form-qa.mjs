#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — טופס הודעה על תאונת רכב 1:1 + PDF.
 * TEST claims only. No Production. No schema / Gmail / SEND / cron changes.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-event-notice-form-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(join(OUT, 'pdf-pages'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const SELF = 'yoni122222@gmail.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  checks: [],
  fieldReport: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
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
const invokeDocs = (session, body) => invoke(session, 'claims-docs', body);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

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

async function signPad(page, testId = 'intake-signature') {
  const canvas = page.locator(`[data-testid="${testId}"]:visible`).last();
  await canvas.waitFor({ state: 'visible', timeout: 20000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 80);
  await page.mouse.move(box.x + 160, box.y + 28);
  await page.mouse.move(box.x + 210, box.y + 90);
  await page.mouse.up();
}

async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  try {
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `notice-form-${name}.png`));
  } catch { /* optional */ }
  return path;
}

function extractJpegs(bytes) {
  const buf = Buffer.from(bytes);
  const out = [];
  let i = 0;
  while (i < buf.length - 1) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8) {
      let j = i + 2;
      while (j < buf.length - 1) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
          out.push(buf.subarray(i, j + 2));
          i = j + 2;
          break;
        }
        j += 1;
      }
      if (j >= buf.length - 1) break;
      continue;
    }
    i += 1;
  }
  return out;
}

async function fillIf(page, sel, value) {
  const loc = page.locator(sel).first();
  if (await loc.count()) await loc.fill(value).catch(() => undefined);
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

async function softDelete(id) {
  if (!id || PROTECTED.has(id)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', id).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', id);
}

async function listDocs(session, claimId) {
  const fromTable = (await userDb.from('claims_documents').select('id, original_name, mime_type, byte_size, doc_meta, claim_id').eq('claim_id', claimId)).data || [];
  if (fromTable.length) return fromTable;
  const r = await invokeDocs(session, { action: 'list_docs', claim_id: claimId });
  return r.json?.files || r.json?.documents || [];
}

function isNoticePdf(f) {
  const meta = f.doc_meta || {};
  const title = `${meta.staff_title || ''} ${f.original_name || ''}`;
  return meta.staff_type === 'accident_notice' && /pdf/i.test(`${f.mime_type || ''} ${f.original_name || ''}`) && !/signature/i.test(f.original_name || '');
}

const FORM_SELECTORS = [
  ['זהות המדווח', '[data-testid="intake-reporter"]'],
  ['שם מבוטח', '[data-testid="intake-name"]'],
  ['טלפון נייד', '[data-testid="intake-phone"]'],
  ['שם הסוכן', '[data-testid="intake-agent"]'],
  ['בתוקף עד', '[data-testid="intake-policy-valid"]'],
  ['עוסק מורשה', '[data-testid="intake-licensed-dealer"]'],
  ['רחוב מבוטח', '[data-testid="intake-address-street"]'],
  ['ישוב מבוטח', '[data-testid="intake-address-city"]'],
  ['מס׳ רישוי', '[data-testid="intake-plate"]'],
  ['שם בעל הרכב', '[data-testid="intake-vehicle-owner"]'],
  ['פרטי הנהג', '[data-testid="intake-section-driver"]'],
  ['פרטי התאונה', '[data-testid="intake-section-event"]'],
  ['מכבי אש', '[data-testid="intake-fire"]'],
  ['מס׳ יומן', '[data-testid="intake-journal"]'],
  ['תרשים', '[data-testid="intake-diagram"]'],
  ['המקרה אירע', '[data-testid="intake-trip-purpose"]'],
  ['מוסך', '[data-testid="intake-garage"]'],
  ['עד 1', '[data-testid="intake-witness1"]'],
  ['צד ג׳', '[data-testid="intake-section-third"]'],
  ['כתובת צד ג׳', '[data-testid="intake-third-address"]'],
  ['תביעת צד ג׳ נגדי', '[data-testid="intake-third-against"]'],
  ['תאריך הצהרה', '[data-testid="intake-decl-date"]'],
  ['הצהרה', '[data-testid="intake-ack"]'],
  ['חתימה', '[data-testid="intake-signature"]'],
];

async function main() {
  const session = await login();
  rec('worker-login', true, { email: WORKER_EMAIL });
  const deployed = process.env.SKIP_DEPLOY_WAIT === '1' ? true : await waitDeploy();
  rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
  if (!deployed && process.env.SKIP_DEPLOY_WAIT !== '1') {
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    throw new Error(`public SHA ${WANT_SHA} not deployed`);
  }

  const stamp = Date.now();
  const client = `TEST-NOTICE-FORM-${stamp}`;
  const plate = `TNF${String(stamp).slice(-6)}`;
  const leakClient = `TEST-NOTICE-LEAK-${stamp}`;
  const leakPlate = `TNL${String(stamp).slice(-6)}`;
  let claimId = '';
  let leakId = '';

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'he-IL' });
    await inject(context, session);
    const page = await context.newPage();
    await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 30000 });
    rec('desktop-claims-loaded', true);

    await page.locator('[data-testid="claims-open-new"]').click();
    await page.waitForSelector('[data-testid="accident-notice-form"]', { timeout: 20000 });
    rec('open-form-visible', await page.locator('[data-testid="accident-notice-form"]').count() > 0);
    rec('section-insured', await page.locator('[data-testid="intake-section-insured"]').count() > 0);
    rec('section-driver-always', await page.locator('[data-testid="intake-section-driver"]').count() > 0);
    rec('section-event', await page.locator('[data-testid="intake-section-event"]').count() > 0);
    rec('section-third-always', await page.locator('[data-testid="intake-section-third"]').count() > 0);
    rec('section-sign', await page.locator('[data-testid="intake-section-sign"]').count() > 0);
    rec('staff-slot-kept', await page.getByText('פנימי לעובד').count() > 0);
    rec('no-manual-pdf-transfer-btn', await page.locator('[data-testid="claim-event-pdf-save"]').count() === 0);
    rec('open-claim-btn', /פתח תיק/.test(await page.locator('[data-testid="claims-save-btn"]').innerText().catch(() => '')));

    for (const [label, sel] of FORM_SELECTORS) {
      const ok = await page.locator(sel).count() > 0;
      report.fieldReport.push({ field: label, onScreen: ok });
      rec(`field-on-screen:${label}`, ok);
    }
    await shot(page, 'desktop-open-form');

    await page.locator('[data-testid="intake-name"]').fill(client);
    await page.locator('[data-testid="intake-phone"]').fill('0507000111');
    await fillIf(page, '#in_id', '111222333');
    await fillIf(page, '#in_email', SELF);
    await fillIf(page, '[data-testid="intake-reporter"]', client);
    await fillIf(page, '[data-testid="intake-agent"]', 'סוכן בדיקה');
    await fillIf(page, '[data-testid="intake-policy-valid"]', '2027-06-01');
    await fillIf(page, '#in_policy', `POL-${stamp}`);
    await fillIf(page, '#in_co', 'הראל');
    await page.locator('label.pick-row', { hasText: 'מקיף' }).first().click().catch(() => undefined);
    await fillIf(page, '#in_addr', 'הרצל 10');
    await fillIf(page, '[data-testid="intake-address-street"]', 'הרצל');
    await fillIf(page, '[data-testid="intake-address-city"]', 'תל אביב');
    await fillIf(page, '#in_zip', '61000');
    await page.locator('[data-testid="intake-plate"]').fill(plate);
    await fillIf(page, '#in_make', 'טויוטה');
    await fillIf(page, '#in_model', 'קורולה');
    await fillIf(page, '#in_year', '2020');
    await fillIf(page, '[data-testid="intake-vehicle-owner"]', client);
    await fillIf(page, '#in_dname', client);
    await fillIf(page, '#in_did', '111222333');
    await fillIf(page, '#in_dphone', '0507000111');
    await fillIf(page, '#in_dlic', 'LIC-7788');
    await page.locator('[data-testid="intake-event-date"]').fill('2026-09-08');
    await fillIf(page, '#in_etime', '08:40');
    await fillIf(page, '#in_eplace', 'צומת אלנבי תל אביב');
    await fillIf(page, '#in_ecity', 'תל אביב');
    await fillIf(page, '#in_estreet', 'אלנבי');
    await page.locator('[data-testid="intake-fire"]').check().catch(() => undefined);
    await page.locator('label.pick-row', { hasText: 'משטרה' }).first().click().catch(() => undefined);
    await fillIf(page, '#in_pstat', 'תחנת תל אביב');
    await fillIf(page, '#in_pfile', 'PF-909');
    await fillIf(page, '[data-testid="intake-journal"]', 'YM-404');
    await page.locator('[data-testid="intake-event-desc"]').fill('התנגשות בצומת אלנבי — בדיקת טופס הודעה על תאונת רכב');
    await fillIf(page, '[data-testid="intake-diagram"]', 'רכב המבוטח פנה ימינה, צד ג׳ הגיע ממול');
    await page.locator('[data-testid="intake-damage-desc"]').fill('פגיעה בפגוש קדמי ובכנף ימין');
    await page.locator('label.pick-row', { hasText: 'חזית' }).first().click().catch(() => undefined);
    await fillIf(page, '[data-testid="intake-witness1"]', 'עד ראשון');
    await fillIf(page, '#in_w1a', 'דיזנגוף 1');
    await page.locator('[data-testid="intake-trip-purpose"] label', { hasText: 'בדרך לעבודה' }).click().catch(() => undefined);
    await fillIf(page, '[data-testid="intake-garage"]', 'מוסך בדיקה');
    await fillIf(page, '#in_tdrv', 'נהג צד ג');
    await fillIf(page, '#in_tphone', '0508000222');
    await fillIf(page, '[data-testid="intake-third-address"]', 'ויצמן 5');
    await fillIf(page, '#in_tplate', '98-765-43');
    await fillIf(page, '#in_tmm', 'מאזדה 3');
    await fillIf(page, '#in_tins', 'הפניקס');
    await page.locator('[data-testid="intake-third-against"] input[type="radio"]').first().check().catch(() => undefined);
    await page.locator('[data-testid="intake-ack"]').check();
    await fillIf(page, '[data-testid="intake-decl-date"]', '2026-09-08');
    await fillIf(page, '#in_filled', 'עובד QA');
    await signPad(page);
    await shot(page, 'desktop-form-filled');

    await page.locator('[data-testid="claims-save-btn"]').click();
    await page.locator('[data-testid="claims-new-modal"].open, .ov.open[data-testid="claims-new-modal"]').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
    let created = null;
    for (let i = 0; i < 30 && !created; i++) {
      await sleep(500);
      created = (await userDb.from('claims_records').select('id, client_name, plate, row_data').eq('plate', plate).maybeSingle()).data;
    }
    rec('one-claim-created', !!created?.id, { id: created?.id || '' });
    claimId = created?.id || '';
    const row = created?.row_data || {};
    rec('saved-journal', row.journalNumber === 'YM-404', { journalNumber: row.journalNumber });
    rec('saved-fire', row.fireDept === 'true', { fireDept: row.fireDept });
    rec('saved-trip', row.tripPurpose === 'work_to', { tripPurpose: row.tripPurpose });
    rec('saved-witness', row.witness1Name === 'עד ראשון', { witness1Name: row.witness1Name });
    rec('saved-third-address', row.thirdAddress === 'ויצמן 5', { thirdAddress: row.thirdAddress });
    rec('saved-signature', !!row.eventFormSignature, {});
    rec('no-cross-id', !PROTECTED.has(claimId), { claimId });

    const samePlate = (await userDb.from('claims_records').select('id').eq('plate', plate)).data || [];
    rec('no-duplicate-claim', samePlate.length === 1, { count: samePlate.length });

    await page.waitForSelector('[data-testid="claims-card-snapshot"], [data-testid="claims-tab-group-docs"]', { timeout: 20000 }).catch(() => undefined);
    await page.locator('[data-testid="claims-tab-group-docs"]').evaluate((el) => el.click()).catch(() => undefined);
    await page.locator('[data-testid="claim-doc-type-accident_notice"]').waitFor({ timeout: 20000 }).catch(() => undefined);
    await page.locator('[data-testid="claim-doc-type-accident_notice"]').scrollIntoViewIfNeeded().catch(() => undefined);
    await page.locator('[data-testid="claim-doc-view-accident_notice"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    await shot(page, 'desktop-docs');

    let files = [];
    for (let i = 0; i < 16 && !files.length; i++) {
      files = (await listDocs(session, claimId)).filter(isNoticePdf);
      if (!files.length) await sleep(700);
    }
    rec('one-notice-pdf', files.length === 1, { count: files.length, names: files.map((f) => f.original_name) });
    rec('pdf-on-same-claim', files.every((f) => String(f.claim_id || claimId) === claimId), {});
    rec('no-signature-only-name', files.every((f) => !/signature-only|חתימה בלבד/i.test(`${f.original_name || ''} ${f.doc_meta?.staff_title || ''}`)));

    const view = page.locator('[data-testid="claim-doc-view-accident_notice"]');
    rec('preview-button', await view.count() > 0);
    if (await view.count()) {
      await view.first().evaluate((el) => el.click());
      await page.waitForSelector('[data-testid="doc-preview"]', { timeout: 15000 }).catch(() => undefined);
      rec('preview-open', await page.locator('[data-testid="doc-preview"]').count() > 0);
      rec('download-control', await page.locator('[data-testid="doc-preview-download"]').count() > 0);
      await shot(page, 'desktop-preview');
      await page.locator('[data-testid="doc-preview-close"]').evaluate((el) => el.click()).catch(() => undefined);
    } else {
      rec('download-control', false, { err: 'no preview button yet' });
    }

    let pdfBytes = null;
    if (files[0]?.id) {
      const signed = await invokeDocs(session, { action: 'signed_url', file_id: files[0].id, claim_id: claimId });
      const url = signed.json?.url || signed.json?.signedUrl || signed.json?.signed_url;
      if (url) {
        const res = await fetch(url);
        pdfBytes = Buffer.from(await res.arrayBuffer());
      }
    }
    rec('opened-real-pdf', !!(pdfBytes && pdfBytes.slice(0, 4).toString() === '%PDF'), { bytes: pdfBytes?.length || 0 });
    if (pdfBytes) {
      writeFileSync(join(OUT, 'notice-form.pdf'), pdfBytes);
      try { copyFileSync(join(OUT, 'notice-form.pdf'), join(ART, 'notice-form.pdf')); } catch { /* optional */ }
      const jpegs = extractJpegs(pdfBytes);
      rec('pdf-two-pages', jpegs.length >= 2, { pages: jpegs.length });
      jpegs.forEach((jpg, i) => {
        const p = join(OUT, 'pdf-pages', `page-${i + 1}.jpg`);
        writeFileSync(p, jpg);
        try { copyFileSync(p, join(ART, `notice-form-page-${i + 1}.jpg`)); } catch { /* optional */ }
      });
      rec('pdf-has-visual-pages', jpegs.length > 0);
    }

    await closeOverlays(page);
    try {
      const send = page.locator('[data-testid="claims-send-mail"]');
      if (await send.count()) {
        await send.evaluate((el) => el.click());
        await page.locator('[data-testid="mo-mail"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
        const pick = page.locator('.pick-row').filter({ hasText: /טופס הודעה|תאונת רכב|טופס-הודעה/ });
        rec('composer-can-attach-pdf', await pick.count() > 0, { text: await pick.first().innerText().catch(() => '') });
        await shot(page, 'desktop-composer');
        await closeOverlays(page);
      } else {
        rec('composer-can-attach-pdf', false, { err: 'no composer button' });
      }
    } catch (err) {
      rec('composer-can-attach-pdf', false, { err: String(err?.message || err) });
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 30000 });
    const search = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
    await search.fill(client);
    await page.waitForTimeout(600);
    rec('refresh-row-visible', await page.locator(`[data-testid="claim-row-${claimId}"]`).count() > 0 || await page.getByText(client).count() > 0);
    if (await page.locator(`[data-testid="claim-row-${claimId}"]`).count()) {
      await page.locator(`[data-testid="claim-row-${claimId}"]`).first().click();
      await page.waitForTimeout(800);
      await page.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
      rec('reopen-docs', await page.locator('[data-testid="claim-doc-type-accident_notice"]').count() > 0);
    }

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'he-IL',
    });
    await inject(mobile, session);
    const mpage = await mobile.newPage();
    await mpage.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mpage.waitForSelector('[data-testid="claims-open-new"]', { timeout: 30000 });
    await mpage.locator('[data-testid="claims-open-new"]').click();
    await mpage.waitForSelector('[data-testid="accident-notice-form"]', { timeout: 20000 });
    rec('mobile-form-open', await mpage.locator('[data-testid="intake-section-insured"]').count() > 0);
    rec('mobile-driver', await mpage.locator('[data-testid="intake-section-driver"]').count() > 0);
    rec('mobile-third', await mpage.locator('[data-testid="intake-section-third"]').count() > 0);
    rec('mobile-sign', await mpage.locator('[data-testid="intake-signature"]').count() > 0);
    await shot(mpage, 'mobile-open-form');
    await mpage.locator('.ov.open .mcl').first().click().catch(() => undefined);
    const msearch = mpage.locator('[data-testid="claims-search"]').locator('visible=true').first();
    await msearch.fill(client);
    await mpage.waitForTimeout(600);
    if (await mpage.locator(`[data-testid="claim-row-${claimId}"]`).count()) {
      await mpage.locator(`[data-testid="claim-row-${claimId}"]`).first().click();
      await mpage.waitForTimeout(800);
      await mpage.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
      rec('mobile-docs', await mpage.locator('[data-testid="claim-doc-type-accident_notice"]').count() > 0);
      await shot(mpage, 'mobile-docs');
    }
    await mobile.close();

    try {
      await closeOverlays(page);
      await page.locator('[data-testid="claims-open-new"]').evaluate((el) => el.click());
      await page.locator('[data-testid="claims-new-modal"].open [data-testid="intake-name"]').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('[data-testid="claims-new-modal"].open [data-testid="intake-name"]').fill(leakClient);
      await page.locator('[data-testid="claims-new-modal"].open [data-testid="intake-phone"]').fill('0507000333');
      await page.locator('[data-testid="claims-new-modal"].open [data-testid="intake-plate"]').fill(leakPlate);
      await page.locator('[data-testid="claims-new-modal"].open [data-testid="intake-event-date"]').fill('2026-09-08');
      await page.locator('[data-testid="claims-save-btn"]').click();
      await page.waitForTimeout(2500);
      leakId = (await userDb.from('claims_records').select('id').eq('plate', leakPlate).maybeSingle()).data?.id || '';
      rec('leak-claim-created', !!leakId && leakId !== claimId, { leakId });
      if (leakId) {
        const leakFiles = (await listDocs(session, leakId)).filter(isNoticePdf);
        rec('no-cross-claim-pdf', leakFiles.length === 0, { count: leakFiles.length });
        const originFiles = (await listDocs(session, claimId)).filter(isNoticePdf);
        rec('origin-pdf-untouched', originFiles.length === 1, { count: originFiles.length });
      }
    } catch (err) {
      rec('leak-claim-created', false, { err: String(err?.message || err) });
    }
  } finally {
    await browser.close();
    if (claimId) await softDelete(claimId);
    if (leakId) await softDelete(leakId);
    rec('soft-deleted-test-only', !PROTECTED.has(claimId) && !PROTECTED.has(leakId), { claimId, leakId });
  }

  const failed = report.checks.filter((c) => !c.ok);
  report.verdict = failed.length ? 'FAIL' : 'PASS';
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const md = [
    '# טופס הודעה על תאונת רכב — QA PUBLIC STAGING',
    '',
    `Verdict: **${report.verdict}**`,
    `SHA wanted: ${WANT_SHA}`,
    `Pages: ${report.deployTxt}`,
    `Production touched: ${report.productionTouched}`,
    '',
    '## Checks',
    ...report.checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.name}`),
  ].join('\n');
  writeFileSync(join(OUT, 'report.md'), md);
  console.log(`\nVERDICT ${report.verdict} · failed=${failed.length}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  report.verdict = 'FAIL';
  report.checks.push({ name: 'script', ok: false, err: String(err?.stack || err) });
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});
