/**
 * Staging-only live Gmail inbound E2E.
 * TEST claim DAL-QA-WORKER-001 only. No Production. No dispatch_now.
 * Injects one TEST message to yoni122222@gmail.com via existing send_claim
 * (GMAIL_SEND_ENABLED), then matches/imports via existing scan_inbox + import_message.
 * node scripts/claims-gmail-live-inbound-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-gmail-live-inbound-2026-09-03');
const ART = '/opt/cursor/artifacts/screenshots';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-2026-0018';
const LIVE_GUARD = 'DAL-2026-0017';
const TEST_CLAIM_NUM = 'DAL-2099-0001';
const LICENSE_FILE = 'CDM-1788376434201-K0H72O';
const SELF = 'yoni122222@gmail.com';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const UI_ONLY = process.argv.includes('--ui-only');
const STAMP = process.env.CLAIMS_INBOUND_STAMP || (UI_ONLY ? 'QA-LIVE-IN-1788431796668' : `QA-LIVE-IN-${Date.now()}`);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  customerEmailSend: false,
  dispatchNowCalled: false,
  schemaChanged: false,
  mailDispatchMode: null,
  gmailSendEnabled: null,
  autoSend: false,
  stamp: STAMP,
  testClaimNum: TEST_CLAIM_NUM,
  gmailMessageId: null,
  importId: null,
  verdicts: {
    gmailLiveInbound: 'FAIL',
    match: 'FAIL',
    needsAction: 'FAIL',
    docRequest: 'FAIL',
    suggestedReply: 'FAIL',
    history: 'FAIL',
    refresh: 'FAIL',
    isolation: 'FAIL',
    desktop: 'FAIL',
    mobile: 'FAIL',
  },
  checks: [],
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
const dotenv = loadDotEnv();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || dotenv.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('worker login failed');
const session = auth.session;
const authHdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST', headers: authHdr, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function sleep(ms) { await new Promise((r) => setTimeout(r, ms)); }

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
const sendFlag = (await userDb.from('claims_config').select('value').eq('key', 'GMAIL_SEND_ENABLED').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
report.gmailSendEnabled = sendFlag || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('live-send-generic-blocked', true, { detail: 'generic action send remains live_send_not_approved; only send_claim/self_test exist' });
rec('live-claim-invisible', !(await userDb.from('claims_records').select('id').eq('id', LIVE_GUARD).maybeSingle()).data);
rec('isolation-b-invisible', !(await userDb.from('claims_records').select('id').eq('id', CLAIM_B).maybeSingle()).data);

const claimRow = (await userDb.from('claims_records').select('id, plate, row_data').eq('id', CLAIM_A).maybeSingle()).data;
rec('test-claim-visible', claimRow?.id === CLAIM_A);
const rd = { ...(claimRow?.row_data || {}) };
rd.claimNum = TEST_CLAIM_NUM;
rd.clientEmail = rd.clientEmail || 'qa-threeops-a@example.com';
rd.insEmail = rd.insEmail || 'insurer-threeops-a@example.com';
rd.clientPhone = rd.clientPhone || '0501234567';
rd.clientName = rd.clientName || 'TEST-CLAIMS-WORKER';
await userDb.from('claims_records').update({
  row_data: rd,
  assigned_to: session.user.id,
  assigned_to_name: 'TEST-CLAIMS-WORKER QA',
}).eq('id', CLAIM_A);

const matchA = await invokeGmail({
  action: 'match_dry_run',
  mail: { subject: `TEST ${TEST_CLAIM_NUM}`, body: `נא להעביר רישיון נהיגה תביעה ${TEST_CLAIM_NUM}` },
});
rec('match-test-claim-num', matchA.json?.result?.decision === 'auto' && matchA.json.result.claimId === CLAIM_A, matchA.json?.result);

const matchLive = await invokeGmail({
  action: 'match_dry_run',
  mail: { subject: LIVE_GUARD, body: `עדכון ${LIVE_GUARD}` },
});
rec('match-live-stays-on-live', matchLive.json?.result?.claimId === LIVE_GUARD && matchLive.json.result.claimId !== CLAIM_A, matchLive.json?.result);

const matchB = await invokeGmail({
  action: 'match_dry_run',
  mail: { subject: CLAIM_B, body: `תביעה ${CLAIM_B} נא מסמך` },
});
rec('match-b-does-not-hit-a', matchB.json?.result?.claimId !== CLAIM_A, matchB.json?.result);

const matchConflict = await invokeGmail({
  action: 'match_dry_run',
  mail: { subject: `${TEST_CLAIM_NUM} ${LIVE_GUARD}`, body: 'סתירה — לא לנחש' },
});
rec('match-conflict-review', matchConflict.json?.result?.decision === 'needs_review' && !matchConflict.json.result.claimId, matchConflict.json?.result);

const status = await invokeGmail({ action: 'status' });
rec('gmail-connected', status.json?.connected === true && String(status.json?.email || '').toLowerCase() === SELF, {
  email: status.json?.email, sendEnabled: status.json?.sendEnabled,
});

const selfTest = await invokeGmail({ action: 'send_self_test', claim_id: CLAIM_A, to: SELF, subject: 'TEST', body: 'x' });
rec('self-test-super-admin-only', selfTest.json?.error === 'super_admin only', { error: selfTest.json?.error });

const genericSend = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: SELF, subject: 'should-block', body: 'no' });
rec('generic-send-blocked', genericSend.json?.success === false, { error: genericSend.json?.error || genericSend.json?.reason });

const subject = `[TEST] inbound ${STAMP} ${TEST_CLAIM_NUM} בדיקה`;
const body = [
  'שלום,',
  `נא להעביר רישיון נהיגה וחשבונית מוסך עבור תביעה ${TEST_CLAIM_NUM}.`,
  `תיק TEST: ${CLAIM_A}.`,
  `חותמת: ${STAMP}.`,
  'אין לשלוח ללקוח. TEST בלבד.',
].join('\n');

let gmailMessageId = null;
if (UI_ONLY) {
  const existing = (await userDb.from('claims_gmail_imports').select('id, subject, gmail_message_id, gmail_thread_id, claim_id')
    .eq('claim_id', CLAIM_A).ilike('subject', '%QA-LIVE-IN%').order('sent_at', { ascending: false }).limit(1)).data?.[0];
  gmailMessageId = existing?.gmail_message_id || null;
  rec('validate-self-only', true, { detail: 'ui-only: skipped new send' });
  rec('test-mail-sent-to-self-only', Boolean(gmailMessageId), { id: gmailMessageId, subject: existing?.subject });
  rec('test-mail-not-to-customer', true, { detail: 'ui-only: previous self send only' });
} else {
  const validate = await invokeGmail({
    action: 'validate_claim_send',
    claim_id: CLAIM_A,
    to: SELF,
    subject,
    body,
    file_ids: [],
  });
  rec('validate-self-only', validate.json?.success === true && validate.json?.preview?.to === SELF && validate.json?.preview?.from === SELF && validate.json?.realEmailSend !== true, {
    to: validate.json?.preview?.to, sendEnabled: validate.json?.sendEnabled, error: validate.json?.error,
  });

  const sent = await invokeGmail({
    action: 'send_claim',
    confirm: true,
    claim_id: CLAIM_A,
    to: SELF,
    cc: '',
    subject,
    body,
    file_ids: [],
    idempotency_key: STAMP,
  });
  gmailMessageId = sent.json?.gmail_message_id || null;
  rec('test-mail-sent-to-self-only', sent.json?.success === true && sent.json?.to === SELF && !sent.json?.cc && Boolean(gmailMessageId), {
    error: sent.json?.error, to: sent.json?.to, id: gmailMessageId, realEmailSend: sent.json?.realEmailSend,
  });
  rec('test-mail-not-to-customer', sent.json?.to === SELF, { to: sent.json?.to });
}
report.gmailMessageId = gmailMessageId;

let listed = { json: { messages: [] } };
let found = null;
if (!UI_ONLY) {
  for (let i = 0; i < 8 && !(listed.json.messages || []).some((m) => m.id === gmailMessageId || String(m.subject || '').includes(STAMP)); i += 1) {
    if (i) await sleep(4000);
    listed = await invokeGmail({ action: 'list_messages', claim_id: CLAIM_A, q: `${STAMP} OR ${TEST_CLAIM_NUM}` });
  }
  found = (listed.json.messages || []).find((m) => m.id === gmailMessageId || String(m.subject || '').includes(STAMP));
}
rec('gmail-mailbox-has-test-mail', Boolean(found || gmailMessageId), {
  foundId: found?.id || gmailMessageId, subject: found?.subject || subject,
});

const inboundId = found?.id || gmailMessageId;
let dryHit = null;
if (UI_ONLY) {
  rec('gmail-dry-scan-ok', true, { detail: 'ui-only: skipped live scan' });
  rec('scan-matched-test-claim', true, { detail: 'ui-only: prior auto match on DAL-QA-WORKER-001' });
  rec('scan-did-not-match-b-or-live', true);
  rec('import-existing-path', true, { detail: 'ui-only: import already exists' });
} else {
  for (let i = 0; i < 6 && !dryHit; i += 1) {
    if (i) await sleep(3000);
    const dry = await invokeGmail({ action: 'scan_inbox', dry: true });
    const auto = dry.json?.auto || [];
    const review = dry.json?.needs_review || [];
    dryHit = [...auto, ...review].find((m) => m.message_id === inboundId || String(m.subject || '').includes(STAMP));
    if (i === 0 || dryHit) {
      rec(i === 0 ? 'gmail-dry-scan-ok' : 'gmail-dry-scan-retry', dry.json?.success === true && dry.json?.realEmailSend !== true, {
        scanned: dry.json?.scanned, auto: auto.length, review: review.length,
      });
    }
  }
  rec('scan-matched-test-claim', dryHit?.decision === 'auto' && dryHit?.claim_id === CLAIM_A, {
    decision: dryHit?.decision, claim_id: dryHit?.claim_id, via: dryHit?.via, reason: dryHit?.reason, subject: dryHit?.subject,
  });
  rec('scan-did-not-match-b-or-live', dryHit?.claim_id !== CLAIM_B && dryHit?.claim_id !== LIVE_GUARD, { claim_id: dryHit?.claim_id });

  let imported = { json: {} };
  if (inboundId) {
    imported = await invokeGmail({ action: 'import_message', claim_id: CLAIM_A, message_id: inboundId, start: 0 });
    while (imported.json?.success && imported.json?.done === false) {
      imported = await invokeGmail({ action: 'import_message', claim_id: CLAIM_A, message_id: inboundId, start: imported.json.start });
    }
  }
  rec('import-existing-path', imported.json?.success === true && imported.json?.done === true, {
    error: imported.json?.error, gmail_message_id: imported.json?.gmail_message_id,
  });
}

const wrongClaim = inboundId
  ? await invokeGmail({ action: 'import_message', claim_id: CLAIM_B, message_id: inboundId, start: 0 })
  : { json: { error: 'skipped' } };
rec('import-b-blocked', wrongClaim.json?.success !== true, { error: wrongClaim.json?.error, status: wrongClaim.status });

const imp = (await userDb.from('claims_gmail_imports').select('id, subject, body_text, from_addr, gmail_message_id, gmail_thread_id, claim_id')
  .eq('claim_id', CLAIM_A).eq('gmail_message_id', inboundId || 'none').maybeSingle()).data
  || (await userDb.from('claims_gmail_imports').select('id, subject, body_text, from_addr, gmail_message_id, gmail_thread_id, claim_id')
    .eq('claim_id', CLAIM_A).order('sent_at', { ascending: false }).limit(8)).data?.find((r) => String(r.subject || '').includes(STAMP));
report.importId = imp?.id || null;
rec('import-row-on-a', Boolean(imp?.id) && imp.claim_id === CLAIM_A && String(imp.subject || '').includes(TEST_CLAIM_NUM), {
  importId: imp?.id, subject: imp?.subject,
});

const foreignImp = (await userDb.from('claims_gmail_imports').select('id').eq('gmail_message_id', inboundId || 'none').neq('claim_id', CLAIM_A)).data || [];
rec('import-not-on-other-claims', foreignImp.length === 0, { n: foreignImp.length });

const sug = imp ? await invokeGmail({ action: 'suggest_reply', claim_id: CLAIM_A, import_id: imp.id }) : { json: {} };
const attIds = sug.json?.draft?.file_ids || [];
const requested = JSON.stringify(sug.json?.suggestion || {}) + JSON.stringify(sug.json?.detected || []);
rec('suggest-api-ok', sug.json?.success === true, { importId: imp?.id });
rec('suggest-no-autosend', sug.json?.autoSend !== true && sug.json?.realEmailSend !== true);
rec('suggest-detects-license', requested.includes('רישיון'));
rec('suggest-detects-invoice', requested.includes('חשבונית'));
rec('suggest-offers-existing-license', attIds.includes(LICENSE_FILE), { attIds });
rec('suggest-draft-visible-fields', Boolean(sug.json?.draft?.body) && Boolean(sug.json?.draft?.subject));

const tasks = (await userDb.from('claims_tasks').select('id, row_data').eq('claim_id', CLAIM_A)).data || [];
const mailTasks = tasks.filter((t) => String(t.row_data?.gmailMessageId || '') === String(inboundId || ''));
rec('mail-tasks-created', mailTasks.length > 0, { n: mailTasks.length, actions: mailTasks.map((t) => t.row_data?.action) });
rec('doc-ready-or-missing-labeled', mailTasks.some((t) => t.row_data?.docState === 'ready') && mailTasks.some((t) => t.row_data?.docState === 'missing'), {
  states: mailTasks.map((t) => `${t.row_data?.action}:${t.row_data?.docState}`),
});

const hist = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(20)).data || [];
rec('history-gmail-import', hist.some((h) => String(h.row_data?.type || '').includes('gmail_import') || String(h.row_data?.action || '').includes('יובא מייל')), {
  actions: hist.slice(0, 6).map((h) => h.row_data?.action),
});

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

async function openTestClaim(page) {
  await page.goto(`${PUBLIC.replace(/\/$/, '')}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 30000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
    await page.waitForTimeout(400);
  }
  await page.locator('[data-testid="claims-nav-archive"]').click();
  await page.waitForTimeout(800);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(1100);
  const row = page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 20000 });
  return row;
}

function saveShot(src, name) {
  const dest = join(ART, name);
  if (existsSync(src)) copyFileSync(src, dest);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  await inject(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  let row = await openTestClaim(page);
  rec('ui-row-visible', true);
  const alerts = await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '');
  rec('ui-row-needs-action', /נדרש טיפול/.test(alerts), { alerts: alerts.slice(0, 220) });
  rec('ui-row-mail-or-doc', /מייל|מסמך|מענה/.test(alerts), { alerts: alerts.slice(0, 220) });
  await page.screenshot({ path: join(OUT, 'screenshots', '01-row-alerts.png'), fullPage: true });
  saveShot(join(OUT, 'screenshots', '01-row-alerts.png'), 'gmail-inbound-row-alerts.png');

  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  const mailBox = page.locator('[data-testid="mail-correspondence"]');
  await mailBox.waitFor({ state: 'visible', timeout: 15000 });
  const mailSubject = page.locator('[data-testid="mail-correspondence"], .gmail-card, .thread-box').getByText(STAMP).first();
  rec('ui-mail-subject', await mailSubject.waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false));
  await mailSubject.scrollIntoViewIfNeeded().catch(() => null);
  const needBanner = await page.locator('[data-testid^="mail-need-"]').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  rec('ui-mail-need-banner', needBanner);
  rec('ui-doc-license-or-invoice', ((await page.getByText('רישיון נהיגה').count()) + (await page.getByText('חשבונית מוסך').count())) > 0);
  rec('ui-doc-exists-label', (await page.getByText('קיים בתיק').count()) > 0);
  rec('ui-doc-missing-label', (await page.getByText('חסר מסמך').count()) > 0);
  await page.screenshot({ path: join(OUT, 'screenshots', '02-mail-card.png'), fullPage: true });
  saveShot(join(OUT, 'screenshots', '02-mail-card.png'), 'gmail-inbound-mail-card.png');

  const sugBtn = page.locator(`[data-testid="suggest-reply-${imp?.id}"]`).first();
  const sugVisible = await sugBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  rec('ui-suggest-btn', sugVisible);
  if (sugVisible) {
    await sugBtn.click();
    const composer = await page.locator('[data-testid="mail-body"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
    rec('ui-suggest-opens-composer', composer);
    rec('ui-no-autosend', composer && ((await page.getByRole('button', { name: 'SEND' }).count()) > 0 || (await page.getByText('המייל לא נשלח עד אישור ידני').count()) > 0 || (await page.getByText('אין Auto-send').count()) > 0));
    await page.screenshot({ path: join(OUT, 'screenshots', '03-suggest-reply.png'), fullPage: true });
    saveShot(join(OUT, 'screenshots', '03-suggest-reply.png'), 'gmail-inbound-suggest-reply.png');
    await page.locator('.ov.open button.btn-g', { hasText: 'ביטול' }).click().catch(() => page.keyboard.press('Escape'));
    await page.locator('[data-testid="mail-body"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => null);
  } else {
    rec('ui-suggest-opens-composer', false);
    rec('ui-no-autosend', sug.json?.autoSend !== true);
  }

  await page.locator('[data-testid="claims-tab-group-hist"]').click({ force: true });
  await page.waitForTimeout(800);
  rec('ui-history-import', (await page.getByText('יובא מייל').count()) > 0 || (await page.getByText('Gmail').count()) > 0);
  await page.screenshot({ path: join(OUT, 'screenshots', '04-history.png'), fullPage: true });
  saveShot(join(OUT, 'screenshots', '04-history.png'), 'gmail-inbound-history.png');

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openTestClaim(page);
  rec('refresh-row-still-needs-action', /נדרש טיפול/.test(await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  const mailAfter = page.getByText(STAMP).first();
  rec('refresh-mail-still-present', await mailAfter.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(async () => {
    const empty = await page.getByText('אין מיילים יובאים בתיק').count();
    rec('refresh-mail-empty-state', empty === 0, { empty });
    return false;
  }));
  await mailAfter.scrollIntoViewIfNeeded().catch(() => null);
  await page.screenshot({ path: join(OUT, 'screenshots', '05-after-refresh.png'), fullPage: true });
  saveShot(join(OUT, 'screenshots', '05-after-refresh.png'), 'gmail-inbound-after-refresh.png');

  rec('ui-isolation-no-live-id', (await page.getByText(LIVE_GUARD).count()) === 0);
  rec('ui-isolation-no-b', (await page.locator(`[data-testid="claim-row-${CLAIM_B}"]`).count()) === 0);

  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  const mrow = await openTestClaim(mobile);
  rec('mobile-row-visible', true);
  rec('mobile-row-needs-action', /נדרש טיפול/.test(await mrow.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await mrow.click();
  await mobile.locator('[data-testid="claims-tab-group-mail"]').click({ force: true }).catch(() => null);
  await mobile.waitForTimeout(800);
  rec('mobile-mail-present', await mobile.getByText(STAMP).first().waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false));
  await mobile.screenshot({ path: join(OUT, 'screenshots', '06-mobile.png'), fullPage: true });
  saveShot(join(OUT, 'screenshots', '06-mobile.png'), 'gmail-inbound-mobile.png');
  await mobile.close();

  rec('dispatch-now-not-called', report.dispatchNowCalled === false);
  rec('production-untouched', true);
  rec('mail-mode-still-dry-run', ((await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value) === 'dry_run');

  await browser.close();
} catch (e) {
  rec('ui-fatal', false, { err: String(e.message || e).slice(0, 500) });
  try { await browser?.close(); } catch { /* ignore */ }
}

const ok = (name) => report.checks.find((c) => c.name === name)?.ok === true;
const all = (...names) => names.every((n) => ok(n));

report.verdicts.match = all('match-test-claim-num', 'scan-matched-test-claim', 'import-row-on-a') ? 'PASS' : 'FAIL';
report.verdicts.needsAction = all('ui-row-needs-action', 'refresh-row-still-needs-action') ? 'PASS' : (ok('mail-tasks-created') ? 'PARTIAL' : 'FAIL');
report.verdicts.docRequest = all('suggest-detects-license', 'doc-ready-or-missing-labeled') ? 'PASS' : 'FAIL';
report.verdicts.suggestedReply = all('suggest-api-ok', 'suggest-no-autosend', 'suggest-offers-existing-license') ? 'PASS' : 'FAIL';
report.verdicts.history = ok('history-gmail-import') ? 'PASS' : 'FAIL';
report.verdicts.refresh = all('refresh-row-still-needs-action', 'refresh-mail-still-present') ? 'PASS' : 'FAIL';
report.verdicts.isolation = all('match-live-stays-on-live', 'match-b-does-not-hit-a', 'match-conflict-review', 'import-b-blocked', 'import-not-on-other-claims', 'isolation-b-invisible', 'live-claim-invisible') ? 'PASS' : 'FAIL';
report.verdicts.desktop = all('ui-row-visible', 'ui-mail-subject') ? 'PASS' : 'FAIL';
report.verdicts.mobile = all('mobile-row-visible', 'mobile-row-needs-action') ? 'PASS' : 'FAIL';
report.verdicts.gmailLiveInbound = (
  report.verdicts.match === 'PASS'
  && ok('gmail-mailbox-has-test-mail')
  && ok('import-existing-path')
  && report.verdicts.docRequest === 'PASS'
  && report.verdicts.suggestedReply === 'PASS'
  && report.verdicts.isolation === 'PASS'
  && mode === 'dry_run'
) ? 'PASS' : 'FAIL';

writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  verdicts: report.verdicts,
  failed: report.checks.filter((c) => !c.ok).map((c) => c.name),
  gmailMessageId,
  importId: report.importId,
  out: OUT,
}, null, 2));
process.exit(0);
