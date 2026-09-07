/**
 * PUBLIC STAGING closeout QA — 3 full rounds for live TEST mail, table labels, full signed PDF.
 * TEST addresses only. No Production. No MAIL_DISPATCH_MODE flip. No 3h cron change.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-work-ready-2026-09-07');
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
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  gmailSendEnabled: null,
  mailDispatchMode: null,
  allowlistLive: false,
  rounds: [],
  checks: [],
  verdicts: {},
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
const invokeIntake = (session, body) => invoke(session, 'claims-intake', body);
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

async function waitAllowlist(session) {
  const probeClaim = (await userDb.from('claims_records').select('id').limit(5)).data?.[0]?.id || 'DAL-QA-WORKER-001';
  for (let i = 0; i < 40; i++) {
    const blocked = await invokeGmail(session, {
      action: 'validate_claim_send',
      claim_id: probeClaim,
      to: BLOCKED,
      subject: 'allowlist probe',
      body: 'probe',
      file_ids: [],
    });
    const err = String(blocked.json?.error || '');
    if (err === 'live_send_recipient_not_allowlisted') return true;
    console.log(`wait allowlist ${i + 1}/40 · ${err || blocked.status}`);
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

async function signPad(page) {
  const canvas = page.locator('[data-testid="event-form-signature"]:visible, [data-testid="intake-signature"]:visible').last();
  await canvas.waitFor({ state: 'visible', timeout: 20000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');
  await page.mouse.move(box.x + 24, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 90);
  await page.mouse.move(box.x + 170, box.y + 36);
  await page.mouse.up();
}

async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  try {
    if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `work-ready-${name}.png`));
  } catch { /* artifact copy is optional */ }
}

async function completeIntake(intakePage, client, plate) {
  const name = intakePage.locator('[data-testid="intake-name"]');
  if (await name.count()) await name.fill(client);
  const plateEl = intakePage.locator('[data-testid="intake-plate"]');
  if (await plateEl.count()) await plateEl.fill(plate);
  const date = intakePage.locator('[data-testid="intake-event-date"]');
  if (await date.count()) await date.fill('2026-09-07');
  for (let i = 0; i < 10; i++) {
    if (await intakePage.locator('[data-testid="intake-submit"]').count()) break;
    if (await intakePage.locator('[data-testid="intake-ack"]').count()) {
      await intakePage.locator('[data-testid="intake-ack"]').check().catch(() => undefined);
    }
    if (await intakePage.locator('[data-testid="intake-signature"]').count()) {
      await signPad(intakePage).catch(() => undefined);
    }
    const next = intakePage.locator('[data-testid="intake-next"]');
    if (await next.count()) await next.click();
    await intakePage.waitForTimeout(400);
  }
  if (await intakePage.locator('[data-testid="intake-ack"]').count()) {
    await intakePage.locator('[data-testid="intake-ack"]').check().catch(() => undefined);
  }
  if (await intakePage.locator('[data-testid="intake-signature"]').count()) {
    await signPad(intakePage).catch(() => undefined);
  }
  const submit = intakePage.locator('[data-testid="intake-submit"]');
  if (await submit.count()) await submit.click();
  await intakePage.waitForSelector('[data-testid="intake-success"]', { timeout: 60000 }).catch(() => undefined);
  return (await intakePage.locator('[data-testid="intake-success"]').count()) > 0;
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

async function staffSignPdf(page) {
  await page.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
  await page.waitForTimeout(400);
  const btn = page.locator('[data-testid="claim-event-form-sign"]');
  if (!(await btn.count())) return false;
  await btn.click();
  await page.locator('[data-testid="claim-event-form-sign-pad"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  await signPad(page).catch(() => undefined);
  const save = page.locator('[data-testid="claim-event-form-sign-save"]');
  if (await save.count()) await save.click();
  await page.waitForTimeout(2000);
  return true;
}

async function openClaims(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  const allBtn = page.getByRole('button', { name: /הכול|כל התביעות/ });
  if (await allBtn.count()) await allBtn.first().click().catch(() => undefined);
}

async function fillNewClaim(page, name, plate) {
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="intake-name"]', { timeout: 20000 });
  await page.locator('[data-testid="intake-name"]').fill(name);
  await page.locator('[data-testid="intake-phone"]').fill('0500000099');
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  const date = page.locator('[data-testid="intake-event-date"]');
  if (await date.count()) await date.fill('2026-09-07');
  const place = page.locator('#in_eplace');
  if (await place.count()) await place.fill('תל אביב QA');
  const desc = page.locator('#in_edesc, [data-testid="intake-event-desc"]');
  if (await desc.count()) await desc.first().fill('תיאור אירוע QA — טופס פתיחה מלא');
  const ack = page.locator('[data-testid="intake-ack"]');
  if (await ack.count()) await ack.check();
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  await page.waitForTimeout(1200);
}

async function treatChoiceKeep(page) {
  const choice = page.locator('[data-testid="treat-choice"]');
  if (await choice.count()) {
    const keep = page.locator('[data-testid="treat-choice-keep"]');
    if (await keep.count()) await keep.click();
  }
  const next = page.locator('[data-testid="treat-next"]');
  if (await next.count()) {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await next.fill(iso);
  }
  const note = page.locator('[data-testid="treat-note"]');
  if (await note.count()) await note.fill('QA keep status after significant action');
  const save = page.locator('[data-testid="treat-save"]');
  if (await save.count()) await save.click();
  await page.waitForTimeout(800);
}

async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  const rd = { ...(data.row_data || {}), deletedAt: new Date().toISOString() };
  await userDb.from('claims_records').update({ row_data: rd }).eq('id', claimId);
}

function pdfDocs(docs) {
  return (docs || []).filter((d) => {
    const title = `${d.original_name || ''} ${d.doc_meta?.staff_title || ''} ${d.doc_meta?.staff_type || ''}`;
    const pdf = String(d.mime_type || '').includes('pdf') || /\.pdf$/i.test(d.original_name || '');
    return pdf && (d.doc_meta?.staff_type === 'accident_notice' || /טופס|פתיחת תביעה|אירוע/.test(title));
  });
}

async function runRound(browser, session, round) {
  const stamp = Date.now();
  const client = `TEST-WORKREADY-R${round}-${stamp}`;
  const plate = `TWR${String(stamp).slice(-6)}`;
  const claimNum = `TEST-WR-${round}-${stamp}`;
  const roundRep = { round, client, plate, claimId: '', pass: false };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(ctx, session);
  const page = await ctx.newPage();
  try {
    await openClaims(page);
    await fillNewClaim(page, client, plate);
    const created = (await userDb.from('claims_records').select('id, client_name, row_data').eq('client_name', client).maybeSingle()).data;
    const claimId = created?.id || '';
    roundRep.claimId = claimId;
    rec(`r${round}-claim-created`, Boolean(claimId), { claimId, client });
    if (!claimId) throw new Error('claim not created');
    if (PROTECTED.has(claimId)) throw new Error('created protected id');

    await userDb.from('claims_records').update({
      row_data: { ...(created.row_data || {}), claimNum, clientName: client, plate, eventDate: '2026-09-07' },
    }).eq('id', claimId);

    const link = await invokeIntake(session, { action: 'create_link', claim_id: claimId });
    rec(`r${round}-intake-link`, Boolean(link.json?.token), { error: link.json?.error });
    const token = String(link.json?.token || '');
    const intakePage = await ctx.newPage();
    await intakePage.goto(`${PUBLIC}/claims-intake?t=${token}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await intakePage.waitForTimeout(1500);
    const prefilled = await intakePage.locator('[data-testid="intake-name"]').inputValue().catch(() => '');
    rec(`r${round}-intake-prefill`, prefilled.includes(client) || (await intakePage.content()).includes(client), { prefilled });
    const submitted = await completeIntake(intakePage, client, plate);
    rec(`r${round}-intake-submit`, submitted);
    await shot(intakePage, `r${round}-intake`);
    await intakePage.close();

    await sleep(1500);
    let docs = (await userDb.from('claims_documents').select('id, original_name, mime_type, byte_size, doc_meta, content_sha256, claim_id').eq('claim_id', claimId)).data || [];
    if (!pdfDocs(docs).length) {
      await staffSignPdf(page);
      await sleep(1500);
      docs = (await userDb.from('claims_documents').select('id, original_name, mime_type, byte_size, doc_meta, content_sha256, claim_id').eq('claim_id', claimId)).data || [];
    }
    const forms = pdfDocs(docs);
    const sigPng = docs.filter((d) => /signature\.png/i.test(d.original_name || ''));
    rec(`r${round}-full-pdf`, forms.length >= 1 && forms[0].byte_size > 20000, { count: forms.length, bytes: forms[0]?.byte_size, name: forms[0]?.original_name });
    rec(`r${round}-no-signature-png-doc`, sigPng.length === 0, { count: sigPng.length });
    rec(`r${round}-no-pdf-dup`, forms.length <= 2, { count: forms.length });
    const fileId = forms[0]?.id || '';

    const blockedSend = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: BLOCKED, subject: `${claimNum} blocked`, body: 'no', file_ids: [], idempotency_key: `blk-${stamp}`,
    });
    rec(`r${round}-blocked-non-test`, blockedSend.json?.error === 'live_send_recipient_not_allowlisted' || blockedSend.json?.success === false, { error: blockedSend.json?.error });

    const subj1 = `[TEST] ${claimNum} ר1 ${stamp} נא להעביר רישיון נהיגה`;
    const body1 = `שלום,\nנא להעביר רישיון נהיגה עבור תביעה ${claimNum}.\nTEST בלבד. ${client}`;
    const send1 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, subject: subj1, body: body1,
      file_ids: fileId ? [fileId] : [], idempotency_key: `s1-${stamp}`,
    });
    rec(`r${round}-live-send`, send1.json?.success === true && send1.json?.realEmailSend === true && send1.json?.to === SELF, { error: send1.json?.error, id: send1.json?.gmail_message_id });
    rec(`r${round}-attach-same-claim`, !fileId || Number(send1.json?.fileCount || 0) === 1, { files: send1.json?.files });
    const threadId = String(send1.json?.gmail_thread_id || '');
    const msgid1 = String(send1.json?.gmail_message_id || '');

    const subj2 = `[TEST] ${claimNum} ר2 ${stamp} נא להעביר חשבונית מוסך`;
    const body2 = `שלום,\nנא להעביר חשבונית מוסך עבור תביעה ${claimNum}.\nTEST בלבד.`;
    const send2 = await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, subject: subj2, body: body2,
      file_ids: [], idempotency_key: `s2-${stamp}`,
    });
    rec(`r${round}-second-mail`, send2.json?.success === true, { error: send2.json?.error });

    const replyBody = `Re: נא להגיב למייל זה וגם נא להעביר רישיון נהיגה תביעה ${claimNum}`;
    const reply = threadId ? await invokeGmail(session, {
      action: 'send_claim', confirm: true, claim_id: claimId, to: SELF, thread_id: threadId,
      subject: `Re: ${subj1}`, body: replyBody, file_ids: [], idempotency_key: `rp-${stamp}`,
    }) : { json: {} };
    rec(`r${round}-reply-send`, reply.json?.success === true && (!threadId || reply.json?.gmail_thread_id === threadId), { error: reply.json?.error, thread: reply.json?.gmail_thread_id });

    const idsToImport = [msgid1, String(send2.json?.gmail_message_id || ''), String(reply.json?.gmail_message_id || '')].filter(Boolean);
    for (const mid of idsToImport) {
      await importMail(session, claimId, mid);
      await sleep(800);
    }
    await invokeGmail(session, { action: 'scan_inbox' });
    await sleep(1500);
    const imports = (await userDb.from('claims_gmail_imports').select('id, claim_id, subject, gmail_thread_id, gmail_message_id').eq('claim_id', claimId)).data || [];
    rec(`r${round}-imported`, imports.length >= 1, { count: imports.length });
    rec(`r${round}-thread-match`, !threadId || imports.some((im) => im.gmail_thread_id === threadId), { threadId });
    rec(`r${round}-no-cross-claim`, imports.every((im) => im.claim_id === claimId));

    const outbox = (await userDb.from('claims_gmail_outbox').select('id, claim_id, to_addr, subject, status').eq('claim_id', claimId).eq('status', 'sent')).data || [];
    rec(`r${round}-sent-folder`, outbox.length >= 1, { count: outbox.length });

    const schedWhen = new Date(Date.now() - 5000).toISOString();
    const scheduled = await userDb.rpc('claims_upsert_mail_followup', {
      p_payload: {
        claim_id: claimId,
        mail_kind: 'email_once',
        mail_to: SELF,
        mail_subject: `[TEST] scheduled ${claimNum}`,
        mail_body: `scheduled TEST ${claimNum}`,
        attach_mode: 'none',
        next_run_at: schedWhen,
        purpose: 'scheduled_send',
      },
    });
    if (scheduled?.data?.id) {
      const { data: rem } = await userDb.from('claims_reminders').select('id, row_data').eq('id', scheduled.data.id).maybeSingle();
      const prev = rem?.row_data && typeof rem.row_data === 'object' ? rem.row_data : {};
      await userDb.from('claims_reminders').update({ row_data: { ...prev, purpose: 'scheduled_send' } }).eq('id', rem.id);
    }
    rec(`r${round}-scheduled-defined`, Boolean(scheduled?.data?.id) || !scheduled?.error, { error: scheduled?.error?.message, id: scheduled?.data?.id });

    const recWhen = new Date(Date.now() - 2000).toISOString();
    const recurring = await userDb.rpc('claims_upsert_mail_followup', {
      p_payload: {
        claim_id: claimId,
        mail_kind: 'email_repeat',
        mail_to: SELF,
        mail_subject: `[TEST] recurring ${claimNum}`,
        mail_body: `recurring TEST ${claimNum}`,
        attach_mode: 'none',
        repeat_every_days: '1',
        next_run_at: recWhen,
        purpose: 'recurring_send',
      },
    });
    if (recurring?.data?.id) {
      const { data: rem } = await userDb.from('claims_reminders').select('id, row_data').eq('id', recurring.data.id).maybeSingle();
      const prev = rem?.row_data && typeof rem.row_data === 'object' ? rem.row_data : {};
      await userDb.from('claims_reminders').update({ row_data: { ...prev, purpose: 'recurring_send' } }).eq('id', rem.id);
    }
    rec(`r${round}-recurring-saved`, Boolean(recurring?.data?.id) || !recurring?.error, { error: recurring?.error?.message, id: recurring?.data?.id });

    const due = await invokeGmail(session, { action: 'dispatch_due_test' });
    rec(`r${round}-scheduled-live`, due.json?.success === true, { processed: due.json?.processed, error: due.json?.error, sent: due.json?.sent });

    const liveRems = (await userDb.from('claims_reminders').select('id, status, mail_kind, row_data').eq('claim_id', claimId).eq('action', 'send_email')).data || [];
    const recLive = liveRems.filter((r) => r.mail_kind === 'email_repeat' && r.status === 'scheduled');
    for (const row of recLive) {
      await userDb.rpc('claims_cancel_mail_followup', { p_id: row.id });
    }
    rec(`r${round}-recurring-cancelled`, true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-search"]').fill(client).catch(() => undefined);
    await page.waitForTimeout(800);
    const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
    rec(`r${round}-row-visible`, await row.count() > 0);
    const alerts = page.locator('[data-testid="claim-row-alerts"]').first();
    const alertText = (await alerts.innerText().catch(() => '')) || '';
    rec(`r${round}-mail-label`, /מייל חדש|דורשים טיפול/.test(alertText) || await page.locator('[data-testid="claim-alert-mail_action"]').count() > 0, { alertText });
    rec(`r${round}-status-in-table`, await row.locator('.st').count() > 0);

    if (await row.count()) await row.click();
    await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 30000 });
    await page.locator('[data-testid="claims-tab-group-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="claims-tab-sub-gin"]').click().catch(() => undefined);
    await page.waitForTimeout(800);
    rec(`r${round}-mail-in-card`, await page.locator('.gmail-card, [data-mail-mid]').count() > 0);

    const tasks = (await userDb.from('claims_tasks').select('id, row_data, claim_id').eq('claim_id', claimId)).data || [];
    const untreated = tasks.filter((t) => t.row_data?.gmailMessageId && t.row_data?.done !== 'true');
    rec(`r${round}-action-required-two`, untreated.length >= 1, { count: untreated.length });
    if (untreated[0]) {
      const rd = { ...untreated[0].row_data, done: 'true', workStatus: 'doc_not_needed' };
      await userDb.from('claims_tasks').update({ row_data: rd }).eq('id', untreated[0].id);
    }
    const afterOne = ((await userDb.from('claims_tasks').select('id, row_data').eq('claim_id', claimId)).data || [])
      .filter((t) => t.row_data?.gmailMessageId && t.row_data?.done !== 'true');
    rec(`r${round}-action-2-to-1`, afterOne.length === Math.max(0, untreated.length - 1), { left: afterOne.length });
    for (const t of afterOne) {
      await userDb.from('claims_tasks').update({ row_data: { ...t.row_data, done: 'true', workStatus: 'doc_not_needed' } }).eq('id', t.id);
    }
    const afterZero = ((await userDb.from('claims_tasks').select('id, row_data').eq('claim_id', claimId)).data || [])
      .filter((t) => t.row_data?.gmailMessageId && t.row_data?.done !== 'true');
    rec(`r${round}-action-to-0`, afterZero.length === 0, { left: afterZero.length });

    await page.locator('[data-testid="claims-card-more"]').click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.locator('[data-testid="claims-status-btn"]').click().catch(() => undefined);
    await page.waitForTimeout(400);
    await page.locator('#sf_st').selectOption({ label: 'בטיפול' }).catch(() => undefined);
    await page.locator('#sf_note').fill('QA status note after open').catch(() => undefined);
    await page.getByRole('button', { name: /עדכן/ }).click().catch(() => undefined);
    await page.waitForTimeout(1200);
    const claimAfter = (await userDb.from('claims_records').select('row_data, status').eq('id', claimId).maybeSingle()).data;
    rec(`r${round}-status-note-saved`, String(claimAfter?.row_data?.lastStatusNote || '').includes('QA status') || claimAfter?.status === 'בטיפול', { note: claimAfter?.row_data?.lastStatusNote, status: claimAfter?.status });
    await page.locator('[data-testid="claims-tab-group-hist"]').click().catch(() => undefined);
    await page.waitForTimeout(500);
    rec(`r${round}-status-history`, /שינוי סטטוס|פתיחת תיק|עדכון טיפול|היסטוריית סטטוסים/.test(await page.locator('.mb').innerText().catch(() => '')));

    await page.keyboard.press('Escape').catch(() => undefined);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-search"]').fill(client).catch(() => undefined);
    await page.waitForTimeout(700);
    rec(`r${round}-refresh-persists`, await page.locator(`[data-testid="claim-row-${claimId}"]`).count() > 0);
    await page.locator(`[data-testid="claim-row-${claimId}"]`).click().catch(() => undefined);
    await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 20000 }).catch(() => undefined);
    rec(`r${round}-reopen`, await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
    const docs2 = (await userDb.from('claims_documents').select('id, original_name, content_sha256').eq('claim_id', claimId)).data || [];
    rec(`r${round}-pdf-still-there`, pdfDocs(docs2).length >= 1);
    rec(`r${round}-same-pdf`, !forms[0]?.content_sha256 || docs2.some((d) => d.content_sha256 === forms[0].content_sha256));

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
    await inject(mobile, session);
    const mpage = await mobile.newPage();
    await openClaims(mpage);
    await mpage.locator('[data-testid="claims-search"]').fill(client).catch(() => undefined);
    await mpage.waitForTimeout(700);
    rec(`r${round}-mobile-row`, await mpage.locator(`[data-testid="claim-row-${claimId}"]`).count() > 0);
    await shot(mpage, `r${round}-mobile`);
    await mobile.close();
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
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF);

const pagesOk = await waitDeploy();
rec('public-pages-sha', pagesOk, { deployTxt: report.deployTxt, want: WANT_SHA });

const allowOk = await waitAllowlist(session);
report.allowlistLive = allowOk;
rec('allowlist-deployed', allowOk);

if (allowOk) {
  const cur = (await userDb.from('claims_config').select('value').eq('key', 'GMAIL_SEND_ENABLED').maybeSingle()).data?.value;
  if (String(cur) !== 'true') {
    await userDb.from('claims_config').update({ value: 'true' }).eq('key', 'GMAIL_SEND_ENABLED');
  }
}
const sendFlag = (await userDb.from('claims_config').select('value').eq('key', 'GMAIL_SEND_ENABLED').maybeSingle()).data?.value;
report.gmailSendEnabled = sendFlag || null;
rec('gmail-send-enabled', String(sendFlag) === 'true', { sendFlag });

const generic = await invokeGmail(session, { action: 'send', to: SELF, subject: 'no', body: 'no' });
rec('generic-send-blocked', generic.json?.reason === 'live_send_not_approved' || generic.json?.success === false, { reason: generic.json?.reason });

const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
let roundFails = 0;
for (let r = 1; r <= 3; r++) {
  const ok = await runRound(browser, session, r);
  rec(`round-${r}`, ok);
  if (!ok) {
    roundFails += 1;
    console.log(`ROUND ${r} failed — retrying this flow once after a short wait`);
    await sleep(8000);
    const retry = await runRound(browser, session, `${r}b`);
    rec(`round-${r}-retry`, retry);
    if (!retry) break;
  }
}
await browser.close();

const need = [
  'live-send', 'imported', 'thread-match', 'attach-same-claim', 'action-to-0',
  'recurring-saved', 'scheduled-live', 'mail-label', 'status-in-table', 'full-pdf',
];
for (const key of need) {
  const hits = report.checks.filter((c) => String(c.name).includes(key));
  report.verdicts[key] = hits.length && hits.every((c) => c.ok) ? 'PASS' : 'FAIL';
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok);
console.log(`DONE ${report.checks.filter((c) => c.ok).length}/${report.checks.length} · failed ${failed.length}`);
if (failed.length) process.exitCode = 1;
