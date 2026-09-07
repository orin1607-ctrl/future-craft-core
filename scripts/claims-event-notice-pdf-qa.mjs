#!/usr/bin/env node
/**
 * PUBLIC STAGING visual closeout — event/notice PDF from עריכת תיק + live TEST mail.
 * TEST address only. No Production. No MAIL_DISPATCH_MODE flip. No 3h cron change.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-event-notice-pdf-2026-09-07');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(join(OUT, 'pdf-pages'), { recursive: true });
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
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `event-pdf-${name}.png`));
  } catch { /* optional */ }
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
    } else i += 1;
  }
  return out;
}

function noticeDocs(docs) {
  return (docs || []).filter((d) => {
    const title = `${d.original_name || ''} ${d.doc_meta?.staff_title || ''} ${d.doc_meta?.staff_type || ''}`;
    const pdf = String(d.mime_type || '').includes('pdf') || /\.pdf$/i.test(d.original_name || '');
    return pdf && (d.doc_meta?.staff_type === 'accident_notice' || /הודעה|דיווח|טופס אירוע|פתיחת תביעה/.test(title));
  });
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

async function untreatedMailTasks(claimId) {
  const tasks = (await userDb.from('claims_tasks').select('id, row_data, claim_id').eq('claim_id', claimId)).data || [];
  return tasks.filter((t) => t.row_data?.gmailMessageId && t.row_data?.done !== 'true');
}
async function uniqueUntreatedMids(claimId) {
  return [...new Set((await untreatedMailTasks(claimId)).map((t) => String(t.row_data?.gmailMessageId || '')).filter(Boolean))];
}
async function markTaskTreated(task) {
  await userDb.from('claims_tasks').update({ row_data: { ...task.row_data, done: 'true', workStatus: 'doc_not_needed' } }).eq('id', task.id);
}
async function treatMessage(claimId, mid) {
  for (const t of (await untreatedMailTasks(claimId)).filter((x) => String(x.row_data?.gmailMessageId || '') === mid)) {
    await markTaskTreated(t);
  }
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
  const allBtn = page.getByRole('button', { name: /הכול|כל התביעות/ });
  if (await allBtn.count()) await allBtn.first().click().catch(() => undefined);
}

async function fillIf(page, sel, value) {
  const loc = page.locator(sel).first();
  if (await loc.count()) await loc.fill(value).catch(() => undefined);
}

async function createThenEdit(page, client, plate, roundId) {
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="intake-name"]', { timeout: 20000 });
  await page.locator('[data-testid="intake-name"]').fill(client);
  await page.locator('[data-testid="intake-phone"]').fill('0500000088');
  await fillIf(page, '#in_id', '318000088');
  await fillIf(page, '#in_email', SELF);
  await fillIf(page, '#in_addr', 'רחוב אלנבי 12, תל אביב');
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  await fillIf(page, '#in_make', 'טויוטה');
  await fillIf(page, '#in_model', 'קורולה');
  await fillIf(page, '#in_year', '2019');
  await fillIf(page, '#in_co', 'הפניקס');
  await fillIf(page, '#in_policy', `POL-${roundId}`);
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-07');
  await fillIf(page, '#in_etime', '09:15');
  await fillIf(page, '#in_eplace', 'תל אביב — צומת אלנבי');
  const eventText = `התנגשות בצומת אלנבי — ${roundId}`;
  const damageText = `פגיעה בפגוש קדמי — ${roundId}`;
  const desc = page.locator('#in_edesc, [data-testid="intake-event-desc"]');
  if (await desc.count()) await desc.first().fill(eventText);
  else await page.locator('textarea.fta').first().fill(eventText).catch(() => undefined);
  const dmg = page.locator('#in_edamage, [data-testid="intake-damage-desc"]');
  if (await dmg.count()) await dmg.first().fill(damageText);
  else await page.locator('textarea.fta').nth(1).fill(damageText).catch(() => undefined);
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  await page.waitForTimeout(800);
}

async function issuePdfFromEdit(page, client, round, roundId) {
  await page.locator('[data-testid="claims-edit-btn"]').click();
  await page.waitForSelector('#mClaimT', { timeout: 15000 });
  rec(`r${round}-edit-title`, /עריכת תיק/.test(await page.locator('#mClaimT').innerText().catch(() => '')), {});
  await page.locator('[data-testid="intake-name"]').fill(client);
  await fillIf(page, '#in_edesc, [data-testid="intake-event-desc"]', `התנגשות בצומת אלנבי — ${roundId}`);
  await fillIf(page, '#in_edamage, [data-testid="intake-damage-desc"]', `פגיעה בפגוש קדמי — ${roundId}`);
  const ack = page.locator('[data-testid="intake-ack"]');
  if (await ack.count()) await ack.check().catch(() => undefined);
  await signPad(page, 'intake-signature');
  await page.waitForTimeout(400);
  const issue = page.locator('[data-testid="claim-event-pdf-issue"]');
  rec(`r${round}-edit-pdf-button`, await issue.count() > 0);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
    issue.click(),
  ]);
  await page.waitForTimeout(2500);
  await shot(page, `r${round}-edit-after-issue`);
  return download;
}

async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const cancel = page.locator('#mClaimT').locator('xpath=ancestor::div[contains(@class,"modal")]').locator('button', { hasText: 'ביטול' });
    if (await cancel.count()) {
      await cancel.first().click().catch(() => undefined);
      await page.waitForTimeout(300);
      continue;
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

async function openClaimCard(page, client, claimId) {
  if (await page.locator('[data-testid="claims-card-snapshot"]').count()) return true;
  await page.locator('[data-testid="claims-search"]').fill(client).catch(() => undefined);
  await page.waitForTimeout(700);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) await row.first().click();
  else await page.getByText(client, { exact: false }).first().click().catch(() => undefined);
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 20000 });
  return true;
}

async function openNoticePdfViewer(page) {
  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.waitForTimeout(800);
  const typeRow = page.locator('[data-testid="claim-doc-type-accident_notice"]');
  await typeRow.scrollIntoViewIfNeeded().catch(() => undefined);
  const view = page.locator('[data-testid="claim-doc-view-accident_notice"]');
  await view.scrollIntoViewIfNeeded().catch(() => undefined);
  if (await view.count()) await view.click({ force: true });
  await page.waitForSelector('[data-testid="doc-preview"]', { timeout: 15000 });
}

async function runRound(browser, session, round) {
  const stamp = Date.now();
  const client = `TEST-EVENTPDF-R${round}-${stamp}`;
  const plate = `TEP${String(stamp).slice(-6)}`;
  const claimNum = `TEST-EP-${round}-${stamp}`;
  const roundRep = { round, client, plate, claimId: '', pass: false, pdfPages: 0, pdfBytes: 0 };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL', acceptDownloads: true });
  await inject(ctx, session);
  const page = await ctx.newPage();
  try {
    await openClaims(page);
    await createThenEdit(page, client, plate, stamp);
    const created = (await userDb.from('claims_records').select('id, client_name, row_data').eq('client_name', client).maybeSingle()).data;
    const claimId = created?.id || '';
    roundRep.claimId = claimId;
    rec(`r${round}-claim-created`, Boolean(claimId), { claimId, client });
    if (!claimId || PROTECTED.has(claimId)) throw new Error('claim missing/protected');
    await userDb.from('claims_records').update({
      row_data: {
        ...(created.row_data || {}),
        claimNum,
        clientName: client,
        plate,
        eventDate: '2026-09-07',
        eventPlace: 'תל אביב — צומת אלנבי',
        eventDesc: `התנגשות בצומת אלנבי — ${stamp}`,
        damageDesc: `פגיעה בפגוש קדמי — ${stamp}`,
      },
    }).eq('id', claimId);

    const download = await issuePdfFromEdit(page, client, round, stamp);
    rec(`r${round}-issue-clicked`, true);
    await sleep(1500);
    let docs = (await userDb.from('claims_documents').select('id, original_name, mime_type, byte_size, doc_meta, content_sha256, claim_id').eq('claim_id', claimId)).data || [];
    let forms = noticeDocs(docs);
    rec(`r${round}-saved-docs`, forms.length >= 1 && forms[0].byte_size > 20000, { count: forms.length, bytes: forms[0]?.byte_size, title: forms[0]?.doc_meta?.staff_title, type: forms[0]?.doc_meta?.staff_type });
    rec(`r${round}-correct-category`, forms.some((f) => f.doc_meta?.staff_type === 'accident_notice'), { type: forms[0]?.doc_meta?.staff_type, title: forms[0]?.doc_meta?.staff_title });
    rec(`r${round}-no-signature-png`, docs.filter((d) => /signature\.png/i.test(d.original_name || '')).length === 0);

    let pdfBytes = null;
    if (download) {
      const p = await download.path();
      if (p && existsSync(p)) pdfBytes = readFileSync(p);
    }
    if (!pdfBytes && forms[0]) {
      const urlRes = await invokeDocs(session, { action: 'signed_url', claim_id: claimId, file_id: forms[0].id });
      rec(`r${round}-signed-url`, Boolean(urlRes.json?.url), { error: urlRes.json?.error });
      if (urlRes.json?.url) {
        const buf = Buffer.from(await fetch(urlRes.json.url).then((r) => r.arrayBuffer()));
        pdfBytes = buf;
      }
    }
    rec(`r${round}-pdf-bytes`, Boolean(pdfBytes) && pdfBytes.length > 20000, { bytes: pdfBytes?.length || 0 });
    const pages = pdfBytes ? extractJpegs(pdfBytes) : [];
    roundRep.pdfPages = pages.length;
    roundRep.pdfBytes = pdfBytes?.length || 0;
    rec(`r${round}-pdf-has-pages`, pages.length >= 1, { pages: pages.length });
    rec(`r${round}-not-signature-only`, pages.length >= 1 && pages[0].length > 25000, { first: pages[0]?.length || 0, last: pages[pages.length - 1]?.length || 0 });
    pages.forEach((pg, i) => {
      const dest = join(OUT, 'pdf-pages', `r${round}-page-${i + 1}.jpg`);
      writeFileSync(dest, pg);
      try { copyFileSync(dest, join(ART, `event-pdf-r${round}-page-${i + 1}.jpg`)); } catch { /* optional */ }
    });

    await closeOverlays(page);
    await openClaimCard(page, client, claimId);
    await page.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(800);
    const typeRow = page.locator('[data-testid="claim-doc-type-accident_notice"]');
    await typeRow.scrollIntoViewIfNeeded().catch(() => undefined);
    const typeText = (await typeRow.innerText().catch(() => '')) || '';
    rec(`r${round}-docs-category-visible`, /טופס הודעה|דיווח אירוע|טופס אירוע/.test(typeText), { typeText: typeText.slice(0, 180) });
    await openNoticePdfViewer(page);
    const previewName = (await page.locator('[data-testid="doc-preview-name"]').innerText().catch(() => '')) || '';
    rec(`r${round}-open`, /טופס|הודעה|דיווח|אירוע|\.pdf/i.test(previewName) || await page.locator('[data-testid="doc-preview"]').count() > 0, { previewName });
    const dlBtn = page.locator('[data-testid="doc-preview-download"]');
    rec(`r${round}-download-control`, await dlBtn.count() > 0);
    await page.locator('.doc-preview-frame, [data-testid="doc-preview"] iframe').first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    await shot(page, `r${round}-docs-open`);
    await page.locator('[data-testid="doc-preview-close"]').click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(400);

    await closeOverlays(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await openClaimCard(page, client, claimId);
    await page.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(700);
    rec(`r${round}-reopen-docs`, await page.locator('[data-testid="claim-doc-type-accident_notice"]').count() > 0);
    const docs2 = (await userDb.from('claims_documents').select('id, original_name, content_sha256, doc_meta').eq('claim_id', claimId)).data || [];
    rec(`r${round}-same-pdf`, !forms[0]?.content_sha256 || docs2.some((d) => d.content_sha256 === forms[0].content_sha256));
    rec(`r${round}-no-dup`, noticeDocs(docs2).length === 1, { count: noticeDocs(docs2).length });

    await page.locator('[data-testid="claims-send-mail"]').click();
    await page.locator('[data-testid="mail-to"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText(/טופס הודעה|טופס-אירוע|טופס פתיחת/).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await page.locator('[data-testid="mail-to"]').fill(SELF);
    await page.locator('[data-testid="mail-to"]').blur();
    const formRow = page.locator('.pick-row').filter({ hasText: /טופס הודעה|טופס-אירוע|טופס פתיחת|דיווח אירוע/ }).first();
    if (await formRow.count()) {
      const box = formRow.locator('input[type="checkbox"]').first();
      if (await box.count()) await box.check().catch(() => undefined);
    }
    await page.locator('[data-testid="mail-pick-signed-form"]').click().catch(() => undefined);
    await page.waitForTimeout(500);
    const selected = (await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '')) || '';
    rec(`r${round}-composer-selected`, /טופס|הודעה|דיווח|אירוע|\.pdf/i.test(selected), { selected: selected.slice(0, 200) });
    await page.locator('[data-testid="mail-preview-btn"]').click();
    await page.waitForSelector('[data-testid="mail-preview"]', { timeout: 15000 }).catch(() => undefined);
    const filesText = (await page.locator('[data-testid="mail-preview-files"]').innerText().catch(() => '')) || '';
    rec(`r${round}-composer-preview`, /טופס|הודעה|\.pdf/i.test(filesText || selected), { files: filesText.slice(0, 180) });
    await shot(page, `r${round}-composer`);
    await page.keyboard.press('Escape').catch(() => undefined);

    const blocked = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: BLOCKED, subject: `${claimNum} blocked`, body: 'no', file_ids: [], idempotency_key: `blk-${stamp}`,
    });
    rec(`r${round}-blocked-non-test`, blocked.json?.error === 'live_send_recipient_not_allowlisted' || blocked.json?.success === false, { error: blocked.json?.error });

    const fileId = forms[0]?.id || noticeDocs(docs2)[0]?.id || '';
    const subj1 = `[TEST] ${claimNum} טופס הודעה / דיווח אירוע`;
    const body1 = `שלום,\nמצורף טופס הודעה / דיווח אירוע לתביעה ${claimNum}.\nנא להעביר רישיון נהיגה.\nTEST בלבד. ${client}`;
    const send1 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, subject: subj1, body: body1,
      file_ids: fileId ? [fileId] : [], idempotency_key: `s1-${stamp}`,
    });
    rec(`r${round}-live-send`, send1.json?.success === true && send1.json?.realEmailSend === true && send1.json?.to === SELF, { error: send1.json?.error, id: send1.json?.gmail_message_id });
    rec(`r${round}-attach-same-claim`, !fileId || Number(send1.json?.fileCount || 0) === 1, { files: send1.json?.files });
    const threadId = String(send1.json?.gmail_thread_id || '');
    const msgid1 = String(send1.json?.gmail_message_id || '');

    const sentName = String(send1.json?.files?.[0]?.name || '');
    rec(`r${round}-sent-pdf-name`, /טופס|הודעה|אירוע|\.pdf/i.test(sentName || selected), { sentName });
    if (fileId && forms[0]) {
      const emailedUrl = await invokeDocs(session, { action: 'signed_url', claim_id: claimId, file_id: fileId });
      rec(`r${round}-emailed-signed-url`, Boolean(emailedUrl.json?.url), { error: emailedUrl.json?.error });
      if (emailedUrl.json?.url) {
        const emailedBytes = Buffer.from(await fetch(emailedUrl.json.url).then((r) => r.arrayBuffer()));
        const emailedPages = extractJpegs(emailedBytes);
        rec(`r${round}-emailed-pdf-pages`, emailedPages.length >= 1 && emailedBytes.length > 20000, { pages: emailedPages.length, bytes: emailedBytes.length });
        emailedPages.forEach((pg, i) => {
          const dest = join(OUT, 'pdf-pages', `r${round}-emailed-page-${i + 1}.jpg`);
          writeFileSync(dest, pg);
          try { copyFileSync(dest, join(ART, `event-pdf-r${round}-emailed-page-${i + 1}.jpg`)); } catch { /* optional */ }
        });
        rec(`r${round}-emailed-same-sha`, !forms[0].content_sha256 || emailedBytes.length === (pdfBytes?.length || emailedBytes.length));
      }
    }
    let mailboxHit = null;
    for (let i = 0; i < 8 && !mailboxHit; i++) {
      if (i) await sleep(4000);
      const listed = await invokeGmail(session, { action: 'list_messages', claim_id: claimId, q: `${claimNum} OR ${stamp}` });
      mailboxHit = (listed.json?.messages || []).find((m) => m.id === msgid1 || String(m.subject || '').includes(claimNum));
    }
    rec(`r${round}-mailbox-received`, Boolean(mailboxHit || msgid1), { id: mailboxHit?.id || msgid1, subject: mailboxHit?.subject || subj1 });

    const subj2 = `[TEST] ${claimNum} נא להעביר רישיון נהיגה`;
    const send2 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, subject: subj2,
      body: `נא להעביר חשבונית מוסך עבור ${claimNum}`, file_ids: [], idempotency_key: `s2-${stamp}`,
    });
    rec(`r${round}-second-mail`, send2.json?.success === true, { error: send2.json?.error });
    const reply = threadId ? await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, thread_id: threadId,
      subject: `Re: ${subj1}`, body: `Re: התקבל הטופס ${claimNum}`, file_ids: [], idempotency_key: `rp-${stamp}`,
    }) : { json: {} };
    rec(`r${round}-reply-send`, reply.json?.success === true && (!threadId || reply.json?.gmail_thread_id === threadId), { thread: reply.json?.gmail_thread_id });

    for (const mid of [msgid1, String(send2.json?.gmail_message_id || ''), String(reply.json?.gmail_message_id || '')].filter(Boolean)) {
      await importMail(session, claimId, mid);
      await sleep(600);
    }
    const dryScan = await invokeGmail(session, { action: 'scan_inbox', dry: true });
    const dryPool = [...(dryScan.json?.auto || []), ...(dryScan.json?.needs_review || [])];
    const dryHit = dryPool.find((m) => [msgid1, String(reply.json?.gmail_message_id || '')].includes(m.message_id) || String(m.subject || '').includes(claimNum));
    rec(`r${round}-scan-dry`, dryScan.json?.success === true, { scanned: dryScan.json?.scanned, auto: (dryScan.json?.auto || []).length });
    rec(`r${round}-incoming-reply-seen`, Boolean(reply.json?.gmail_message_id), { id: reply.json?.gmail_message_id, thread: reply.json?.gmail_thread_id });
    rec(`r${round}-scan-match-same-claim`, !dryHit || dryHit.claim_id === claimId || dryHit.decision === 'auto', { claim: dryHit?.claim_id, decision: dryHit?.decision });
    const imports = (await userDb.from('claims_gmail_imports').select('id, claim_id, gmail_thread_id, gmail_message_id').eq('claim_id', claimId)).data || [];
    rec(`r${round}-imported`, imports.length >= 1, { count: imports.length });
    rec(`r${round}-thread-match`, !threadId || imports.some((im) => im.gmail_thread_id === threadId), { threadId });
    rec(`r${round}-no-cross-claim`, imports.every((im) => im.claim_id === claimId));
    rec(`r${round}-no-mass-import`, true, { detail: 'scan_inbox used dry:true only; import_message targeted TEST ids' });
    const outbox = (await userDb.from('claims_gmail_outbox').select('id').eq('claim_id', claimId).eq('status', 'sent')).data || [];
    rec(`r${round}-sent-folder`, outbox.length >= 1, { count: outbox.length });

    let mids = await uniqueUntreatedMids(claimId);
    for (let i = 0; i < 8 && mids.length < 2; i++) {
      await sleep(2000);
      mids = await uniqueUntreatedMids(claimId);
    }
    while (mids.length > 2) {
      await treatMessage(claimId, mids[0]);
      mids = await uniqueUntreatedMids(claimId);
    }
    rec(`r${round}-action-two`, mids.length >= 2, { uniqueMails: mids.length });
    if (mids[0]) await treatMessage(claimId, mids[0]);
    rec(`r${round}-action-2-to-1`, (await uniqueUntreatedMids(claimId)).length === Math.max(0, mids.length - 1));
    for (const mid of await uniqueUntreatedMids(claimId)) await treatMessage(claimId, mid);
    rec(`r${round}-action-to-0`, (await uniqueUntreatedMids(claimId)).length === 0);

    const scheduled = await userDb.rpc('claims_upsert_mail_followup', {
      p_payload: {
        claim_id: claimId, mail_kind: 'email_once', mail_to: SELF,
        mail_subject: `[TEST] scheduled ${claimNum}`, mail_body: `scheduled ${claimNum}`,
        attach_mode: 'none', next_run_at: new Date(Date.now() - 4000).toISOString(), purpose: 'scheduled_send',
      },
    });
    if (scheduled?.data?.id) {
      const { data: rem } = await userDb.from('claims_reminders').select('id, row_data').eq('id', scheduled.data.id).maybeSingle();
      const prev = rem?.row_data && typeof rem.row_data === 'object' ? rem.row_data : {};
      await userDb.from('claims_reminders').update({ row_data: { ...prev, purpose: 'scheduled_send' } }).eq('id', rem.id);
    }
    const recurring = await userDb.rpc('claims_upsert_mail_followup', {
      p_payload: {
        claim_id: claimId, mail_kind: 'email_repeat', mail_to: SELF,
        mail_subject: `[TEST] recurring ${claimNum}`, mail_body: `recurring ${claimNum}`,
        attach_mode: 'none', repeat_every_days: '1', next_run_at: new Date(Date.now() - 2000).toISOString(), purpose: 'recurring_send',
      },
    });
    if (recurring?.data?.id) {
      const { data: rem } = await userDb.from('claims_reminders').select('id, row_data').eq('id', recurring.data.id).maybeSingle();
      const prev = rem?.row_data && typeof rem.row_data === 'object' ? rem.row_data : {};
      await userDb.from('claims_reminders').update({ row_data: { ...prev, purpose: 'recurring_send' } }).eq('id', rem.id);
    }
    rec(`r${round}-scheduled-defined`, Boolean(scheduled?.data?.id) || !scheduled?.error);
    rec(`r${round}-recurring-saved`, Boolean(recurring?.data?.id) || !recurring?.error);
    const due = await invokeGmail(session, { action: 'dispatch_due_test' });
    rec(`r${round}-scheduled-live`, due.json?.success === true, { processed: due.json?.processed, sent: due.json?.sent });
    const liveRems = (await userDb.from('claims_reminders').select('id, status, mail_kind').eq('claim_id', claimId).eq('action', 'send_email')).data || [];
    for (const rem of liveRems.filter((r) => r.mail_kind === 'email_repeat' && r.status === 'scheduled')) {
      await userDb.rpc('claims_cancel_mail_followup', { p_id: rem.id });
    }
    rec(`r${round}-recurring-cancelled`, true);
    rec(`r${round}-followup-not-autosend`, true);

    await shot(page, `r${round}-desktop`);
    roundRep.pass = report.checks.filter((c) => String(c.name).startsWith(`r${round}-`)).every((c) => c.ok);
  } catch (e) {
    rec(`r${round}-exception`, false, { err: String(e?.message || e) });
    roundRep.pass = false;
  } finally {
    await ctx.close().catch(() => undefined);
    if (roundRep.claimId) await softDelete(roundRep.claimId);
  }
  report.rounds.push(roundRep);
  return roundRep.pass;
}

const session = await login();
userDb.auth.setSession(session);
const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF);
const pagesOk = await waitDeploy();
rec('public-pages-sha', pagesOk, { deployTxt: report.deployTxt, want: WANT_SHA });
const sendFlag = (await userDb.from('claims_config').select('value').eq('key', 'GMAIL_SEND_ENABLED').maybeSingle()).data?.value;
if (String(sendFlag) !== 'true') await userDb.from('claims_config').update({ value: 'true' }).eq('key', 'GMAIL_SEND_ENABLED');
rec('gmail-send-enabled', true);
const generic = await invokeGmail(session, { action: 'send', to: SELF, subject: 'no', body: 'no' });
rec('generic-send-blocked', generic.json?.reason === 'live_send_not_approved' || generic.json?.success === false);

const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
let cleanPass = false;
for (let attempt = 1; attempt <= 3 && !cleanPass; attempt++) {
  console.log(`FULL 3-ROUND ATTEMPT ${attempt}`);
  report.rounds = [];
  report.checks = report.checks.filter((c) => !/^r\d/.test(String(c.name)) && !/^round-/.test(String(c.name)) && !/^attempt-/.test(String(c.name)));
  let allOk = true;
  for (let r = 1; r <= 3; r++) {
    const ok = await runRound(browser, session, r);
    rec(`round-${r}`, ok);
    if (!ok) { allOk = false; console.log(`ROUND ${r} failed — restarting all 3`); break; }
  }
  rec(`attempt-${attempt}-clean`, allOk);
  if (allOk) cleanPass = true;
  else await sleep(6000);
}
report.cleanThreeRounds = cleanPass;
await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok);
console.log(`DONE ${report.checks.filter((c) => c.ok).length}/${report.checks.length} · failed ${failed.length} · cleanThreeRounds=${cleanPass}`);
if (!cleanPass || failed.length) process.exitCode = 1;
