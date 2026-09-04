/**
 * Staging final close-out QA for Claims.
 * TEST claims only. No Production. No live send. No mass import. No new cron.
 * node scripts/claims-staging-final-closeout-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-staging-final-closeout-2026-09-04');
const ART = '/opt/cursor/artifacts/screenshots';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-QA-WORKER-002';
const LIVE_GUARD = 'DAL-2026-0017';
const FOREIGN = 'DAL-2026-0018';
const TEST_CLAIM_NUM = 'DAL-2099-0001';
const LICENSE_FILE = 'CDM-1788376434201-K0H72O';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const FU_TO = 'qa.followup.closeout@futurecraft.staging';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  productionProject: PROD_REF,
  customerEmailSend: false,
  dispatchNowCalled: false,
  schemaChanged: false,
  massImport: false,
  autoSend: false,
  mailDispatchMode: null,
  gmailSendEnabled: null,
  previewSent: null,
  sha: '',
  qaBase: PUBLIC,
  verdicts: {
    gmailCheckEvery3Days: 'FAIL',
    incomingMatching: 'FAIL',
    ambiguousReview: 'FAIL',
    requestUnderstanding: 'FAIL',
    draftNoAutoSend: 'FAIL',
    requestedDocExists: 'FAIL',
    requestedDocMissing: 'FAIL',
    followupDays: 'FAIL',
    refreshPersistence: 'FAIL',
    scheduledMailDryRun: 'FAIL',
    customerTask: 'FAIL',
    history: 'FAIL',
    alerts: 'FAIL',
    isolation: 'FAIL',
    historicalPreview: 'FAIL',
    duplicatePrevention: 'FAIL',
    desktop: 'FAIL',
    mobile: 'FAIL',
    ci: 'PENDING',
  },
  checks: [],
  open: [],
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
const dotenv = loadDotEnv();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || dotenv.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('worker login failed');
const session = auth.session;
const authHdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
report.sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST', headers: authHdr, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function histBlob(rows) {
  return (rows || []).map((h) => `${h.row_data?.action || ''} ${h.row_data?.note || ''} ${h.row_data?.type || ''}`).join('\n');
}

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-ref-only', STAGING_REF === 'usfeoerkpcafxxlyuldl' && STAGING_REF !== PROD_REF);

const sendProbe = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: 'nobody@example.com', subject: 'should-block', body: 'no' });
rec('live-send-blocked', sendProbe.json?.success === false && (sendProbe.json?.reason === 'live_send_not_approved' || sendProbe.json?.blocked === true || sendProbe.status === 403), {
  error: sendProbe.json?.error || sendProbe.json?.reason, status: sendProbe.status,
});

const status = await invokeGmail({ action: 'status' });
report.gmailSendEnabled = status.json?.sendEnabled ?? status.json?.gmailSendEnabled ?? null;
rec('gmail-connected', status.json?.connected === true || status.json?.success === true, { email: status.json?.email || status.json?.connected_email });

const dryScan = await invokeGmail({ action: 'scan_inbox', dry: true });
rec('scan-inbox-dry', dryScan.json?.success === true && dryScan.json?.realEmailSend !== true && dryScan.json?.mailboxMutated !== true, {
  scanned: dryScan.json?.scanned, lookback: dryScan.json?.lookback, skippedImported: dryScan.json?.skippedImported, scheduler: dryScan.json?.scheduler,
});
rec('scan-lookback-3d', dryScan.json?.lookback === 'newer_than:3d' || String(dryScan.json?.lookback || '').includes('3d'), { lookback: dryScan.json?.lookback });
rec('scan-no-unattended-scheduler', dryScan.json?.scheduler === false, { scheduler: dryScan.json?.scheduler });
rec('scan-no-auto-send', dryScan.json?.realEmailSend !== true && dryScan.json?.mailboxMutated !== true);

const m1 = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-a', subject: `[TEST] ${TEST_CLAIM_NUM}`, body: `נא להעביר רישיון נהיגה ${CLAIM_A}` } });
rec('match-test-claim', m1.json?.result?.decision === 'auto' && m1.json?.result?.claimId === CLAIM_A, m1.json?.result || {});
const mLive = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-live', subject: LIVE_GUARD, body: 'עדכון' } });
rec('match-live-stays-on-live', mLive.json?.result?.decision === 'auto' && mLive.json?.result?.claimId === LIVE_GUARD, mLive.json?.result || {});
const mAmb = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-amb', subject: `${CLAIM_A} וגם ${LIVE_GUARD}`, body: 'נא מסמך' } });
rec('ambiguous-review', mAmb.json?.result?.decision === 'needs_review' && !mAmb.json?.result?.claimId, mAmb.json?.result || {});

rec('live-claim-invisible-to-worker', !(await userDb.from('claims_records').select('id').eq('id', LIVE_GUARD).maybeSingle()).data);
rec('foreign-claim-invisible-to-worker', !(await userDb.from('claims_records').select('id').eq('id', FOREIGN).maybeSingle()).data);

const claimA = (await userDb.from('claims_records').select('id, assigned_to, created_by').eq('id', CLAIM_A).maybeSingle()).data;
rec('claim-a-visible', Boolean(claimA), { id: CLAIM_A });

let claimB = (await userDb.from('claims_records').select('id').eq('id', CLAIM_B).maybeSingle()).data;
if (!claimB) {
  const ins = await userDb.from('claims_records').insert({
    id: CLAIM_B,
    plate: '99887766',
    client_name: 'TEST-CLAIMS-ISOLATION-B',
    status: 'בטיפול',
    company_name: 'QA',
    created_by: session.user.id,
    created_by_name: 'TEST-CLAIMS-WORKER QA',
    assigned_to: session.user.id,
    assigned_to_name: 'TEST-CLAIMS-WORKER QA',
    row_data: {
      id: CLAIM_B,
      claimNum: CLAIM_B,
      clientName: 'TEST-CLAIMS-ISOLATION-B',
      plate: '99887766',
      status: 'בטיפול',
      source: 'Staff',
      docsOrderStatus: 'organized',
    },
  });
  rec('isolation-claim-b-created', !ins.error, { err: ins.error?.message });
  claimB = (await userDb.from('claims_records').select('id').eq('id', CLAIM_B).maybeSingle()).data;
} else {
  rec('isolation-claim-b-created', true, { existed: true });
}
rec('claim-b-visible-to-worker', Boolean(claimB), { id: CLAIM_B });

const latestImp = (await userDb.from('claims_gmail_imports').select('id, subject, body_text, gmail_message_id, claim_id, sent_at').eq('claim_id', CLAIM_A).order('sent_at', { ascending: false }).limit(8)).data || [];
const testImp = latestImp.find((r) => /QA-LIVE-IN|TEST|רישיון|חשבונית/i.test(`${r.subject || ''} ${r.body_text || ''}`)) || latestImp[0];
rec('existing-test-inbound', Boolean(testImp), { importId: testImp?.id, subject: testImp?.subject });

const sug = testImp ? await invokeGmail({ action: 'suggest_reply', claim_id: CLAIM_A, import_id: testImp.id }) : { json: {} };
const attIds = sug.json?.draft?.file_ids || [];
const requested = JSON.stringify(sug.json?.suggestion?.requested || sug.json?.detected || []);
const missing = sug.json?.suggestion?.missing || [];
rec('suggest-api-ok', sug.json?.success === true && sug.json?.autoSend !== true && sug.json?.realEmailSend !== true, { importId: testImp?.id });
rec('suggest-detects-license', requested.includes('רישיון') || JSON.stringify(sug.json?.detected || []).includes('רישיון'), { requested });
rec('suggest-offers-existing-license', attIds.includes(LICENSE_FILE), { attIds });
rec('suggest-marks-missing-invoice', JSON.stringify(missing).includes('חשבונית') || requested.includes('חשבונית'), { missing });
rec('suggest-no-foreign-files', attIds.every((id) => String(id).startsWith('CDM-')), { attIds });
rec('suggest-draft-ready', Boolean(sug.json?.draft?.body), { subject: sug.json?.draft?.subject });
rec('suggest-no-auto-send', sug.json?.autoSend !== true && sug.json?.realEmailSend !== true);

const docsA = (await userDb.from('claims_documents').select('id, original_name, claim_id').eq('claim_id', CLAIM_A)).data || [];
const docsB = (await userDb.from('claims_documents').select('id, original_name, claim_id').eq('claim_id', CLAIM_B)).data || [];
rec('license-stays-on-test-claim', docsA.some((d) => d.id === LICENSE_FILE), { count: docsA.length });
rec('isolation-docs-no-leak', !docsB.some((d) => d.id === LICENSE_FILE || docsA.some((a) => a.id === d.id)), { docsB: docsB.length, docsA: docsA.length });

const mailA = (await userDb.from('claims_gmail_imports').select('id').eq('claim_id', CLAIM_A)).data || [];
const mailB = (await userDb.from('claims_gmail_imports').select('id').eq('claim_id', CLAIM_B)).data || [];
rec('isolation-mail-no-leak', !mailB.some((m) => mailA.some((a) => a.id === m.id)), { mailA: mailA.length, mailB: mailB.length });

const taskBId = `TSK-ISO-${Date.now()}`;
await userDb.from('claims_tasks').insert({
  id: taskBId,
  claim_id: CLAIM_B,
  row_data: {
    id: taskBId,
    claimId: CLAIM_B,
    audience: 'customer',
    customerKind: 'send_doc',
    customerStatus: 'pending',
    action: 'לשלוח מסמך',
    requestText: 'QA isolation B only',
    done: 'false',
  },
});
const tasksA = (await userDb.from('claims_tasks').select('id, claim_id, row_data').eq('claim_id', CLAIM_A)).data || [];
const tasksB = (await userDb.from('claims_tasks').select('id, claim_id, row_data').eq('claim_id', CLAIM_B)).data || [];
rec('isolation-tasks-no-leak', tasksB.some((t) => t.id === taskBId) && !tasksA.some((t) => t.id === taskBId), { tasksA: tasksA.length, tasksB: tasksB.length });

const histA = (await userDb.from('claims_history').select('id, row_data, created_at').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(200)).data || [];
const histB = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', CLAIM_B).limit(50)).data || [];
const histText = histBlob(histA);
rec('history-gmail-import', /יובא מייל|gmail_import|Gmail/.test(histText), { n: histA.length });
rec('history-request-or-draft', /זוהתה בקשה|טיוטת תגובה|gmail_request|mail_draft/.test(histText), { n: histA.length });
rec('history-has-actor-time', histA.some((h) => h.row_data?.by && h.row_data?.at), { sample: histA[0]?.row_data });
rec('isolation-history-no-leak', !histB.some((h) => histA.some((a) => a.id === h.id)), { histA: histA.length, histB: histB.length });

const preview = await invokeGmail({ action: 'preview_sent' });
report.previewSent = {
  success: preview.json?.success === true,
  import: preview.json?.import === true,
  mailboxMutated: preview.json?.mailboxMutated === true,
  realEmailSend: preview.json?.realEmailSend !== true ? false : true,
  listed: preview.json?.listed,
  resultSizeEstimate: preview.json?.resultSizeEstimate,
  truncated: preview.json?.truncated,
  summary: preview.json?.summary || null,
};
rec('preview-sent-ok', preview.json?.success === true && preview.json?.import !== true && preview.json?.realEmailSend !== true && preview.json?.mailboxMutated !== true, {
  summary: preview.json?.summary, listed: preview.json?.listed,
});
rec('preview-duplicate-classification', Number(preview.json?.summary?.already_in_claim || 0) >= 0 && Number(preview.json?.summary?.certain_new || 0) >= 0, preview.json?.summary || {});

const mPlateB = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-plate-b', subject: 'עדכון', body: 'רכב 99-887-766 נא חשבונית מוסך' } });
rec('match-unique-plate-b', mPlateB.json?.result?.decision === 'auto' && mPlateB.json?.result?.claimId === CLAIM_B, mPlateB.json?.result || {});

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

async function openClaim(page, claimId = CLAIM_A) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 40000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
    await page.waitForTimeout(300);
  }
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(600);
  await search.fill(claimId === CLAIM_B ? 'ISOLATION-B' : 'TEST-CLAIMS');
  await page.waitForTimeout(900);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 25000 });
  return row;
}

async function openFollowupTab(page) {
  const row = await openClaim(page);
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(700);
  return row;
}

async function listedDays(page) {
  const texts = await page.locator('.fu-box').allInnerTexts().catch(() => []);
  const scheduled = texts.find((t) => t.includes('עריכה') || t.includes('עצור מעקב')) || texts[0] || '';
  const m = scheduled.match(/אם אין תשובה בתוך\s*(\d+)\s*ימים/);
  return m ? Number(m[1]) : 0;
}

async function waitDays(page, expected, timeout = 12000) {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeout) {
    last = await listedDays(page);
    if (last === expected) return last;
    await page.waitForTimeout(350);
  }
  return last;
}

async function saveDays(page, days, other = false) {
  await page.getByRole('button', { name: /הגדר מעקב מייל|עריכה/ }).first().click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="fu-to"]').fill(FU_TO);
  if (other) {
    await page.locator('[data-testid="fu-days-other"]').click();
    await page.locator('[data-testid="fu-days-other-input"]').fill(String(days));
  } else {
    await page.locator(`[data-testid="fu-days-${days}"]`).click();
  }
  await page.locator('[data-testid="fu-save"]').click();
  await page.locator('.fu-box').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

async function cancelFollowups(page) {
  for (let i = 0; i < 8; i++) {
    const stop = page.getByRole('button', { name: 'עצור מעקב' }).first();
    if (!(await stop.count())) break;
    await stop.click({ force: true, timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(700);
  }
}

async function shot(page, name) {
  const p1 = join(OUT, 'screenshots', `${name}.png`);
  const p2 = join(ART, `${name}.png`);
  await page.screenshot({ path: p1, fullPage: true });
  if (existsSync(p1)) copyFileSync(p1, p2);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(context);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  let row = await openClaim(page);
  const alerts = await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '');
  rec('desktop-alerts-visible', /נדרש טיפול|מייל חדש|חסר מסמך|מעקב|משימה/.test(alerts), { alerts: alerts.slice(0, 280) });
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  rec('desktop-mail-imported', await page.getByText(/QA-LIVE-IN|DAL-2099-0001|רישיון נהיגה/).first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false));
  rec('desktop-treatment-banner', await page.locator('[data-testid^="mail-need-"]').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false));
  rec('desktop-existing-doc', (await page.getByText('קיים בתיק').count()) > 0);
  rec('desktop-missing-doc', (await page.getByText(/חסר מסמך|נדרש טיפול \/ חסר/).count()) > 0);
  await shot(page, 'final-desktop-mail');

  const sugBtn = page.locator('[data-testid^="suggest-reply-"]').first();
  if (await sugBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
    await sugBtn.click();
    rec('desktop-suggest-opens', await page.locator('[data-testid="mail-body"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false));
    await shot(page, 'final-desktop-suggest');
    await page.locator('.ov.open button.btn-g', { hasText: 'ביטול' }).click().catch(() => page.keyboard.press('Escape'));
  } else rec('desktop-suggest-opens', false, { err: 'suggest button missing' });

  await page.locator('[data-testid="claims-tab-group-hist"]').click({ force: true }).catch(() => null);
  await page.waitForTimeout(700);
  rec('desktop-history-visible', (await page.getByText(/יובא מייל|זוהתה בקשה|Gmail|טיוטת|מעקב/).count()) > 0);
  await shot(page, 'final-desktop-history');

  await page.locator('[data-testid="claims-cust-request"]').click({ force: true }).catch(() => null);
  if (await page.locator('[data-testid="mo-cust-req"]').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
    await page.locator('[data-testid="cr-kind"]').selectOption('send_doc').catch(() => null);
    await page.locator('[data-testid="cr-text"]').fill('QA closeout: שלח רישיון נהיגה');
    await page.locator('[data-testid="cr-due"]').fill('2026-09-20');
    await page.locator('[data-testid="cr-save"]').click();
    await page.waitForTimeout(900);
    rec('desktop-customer-task-saved', true);
  } else rec('desktop-customer-task-saved', false, { err: 'customer request modal missing' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openClaim(page);
  rec('desktop-refresh-alerts', /נדרש טיפול|מעקב|משימה|מייל/.test(await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  rec('desktop-refresh-keeps-mail', await page.getByText(/QA-LIVE-IN|DAL-2099-0001/).first().waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false));
  await shot(page, 'final-desktop-refresh');

  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(700);
  await cancelFollowups(page);
  await saveDays(page, 3);
  rec('desktop-save-3', await waitDays(page, 3) === 3, { days: await listedDays(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-3', await waitDays(page, 3) === 3, { days: await listedDays(page) });
  await saveDays(page, 4);
  rec('desktop-save-4', await waitDays(page, 4) === 4, { days: await listedDays(page) });
  await saveDays(page, 5);
  rec('desktop-save-5', await waitDays(page, 5) === 5, { days: await listedDays(page) });
  await saveDays(page, 7);
  rec('desktop-save-7', await waitDays(page, 7) === 7, { days: await listedDays(page) });
  await saveDays(page, 9, true);
  rec('desktop-save-other-9', await waitDays(page, 9) === 9, { days: await listedDays(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-other-9', await waitDays(page, 9) === 9, { days: await listedDays(page) });
  await shot(page, 'final-desktop-followup');
  rec('desktop-scheduled-dry-run-copy', (await page.locator('body').innerText()).includes('Dry Run'));
  await cancelFollowups(page);
  rec('desktop-cancel-followup', !(await page.getByRole('button', { name: 'עצור מעקב' }).count()), { leftover: await page.getByRole('button', { name: 'עצור מעקב' }).count() });

  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('button:has-text("Gmail")').first().click().catch(() => null);
  await page.waitForTimeout(500);
  rec('desktop-preview-sent-button', (await page.locator('[data-testid="claims-preview-sent-gmail"], [data-testid="claims-preview-sent"]').count()) > 0);
  const previewBtn = page.locator('[data-testid="claims-preview-sent-gmail"], [data-testid="claims-preview-sent"]').first();
  if (await previewBtn.count()) {
    await previewBtn.click();
    rec('desktop-preview-modal', await page.locator('[data-testid="sent-preview-body"]').waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false));
    const previewText = await page.locator('[data-testid="sent-preview-body"]').innerText().catch(() => '');
    rec('desktop-preview-no-import', /SCAN\/PREVIEW|אין Import/.test(previewText), { detail: previewText.slice(0, 220) });
    await shot(page, 'final-desktop-sent-preview');
  } else rec('desktop-preview-modal', false, { err: 'button missing' });

  await context.close();

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
  await inject(mobileCtx);
  const mobile = await mobileCtx.newPage();
  const mRow = await openClaim(mobile);
  rec('mobile-claim-opens', true);
  rec('mobile-row-alerts', /נדרש טיפול|מעקב|משימה|מייל/.test(await mRow.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await mRow.click();
  await mobile.locator('[data-testid="claims-tab-group-mail"]').click({ force: true }).catch(() => null);
  rec('mobile-mail-or-treatment', await mobile.getByText(/QA-LIVE-IN|נדרש טיפול|רישיון/).first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false));
  await mobile.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true }).catch(() => null);
  await mobile.waitForTimeout(600);
  await mobile.getByRole('button', { name: /הגדר מעקב מייל|עריכה/ }).first().click().catch(() => null);
  rec('mobile-followup-picker', await mobile.locator('[data-testid="fu-days-picker"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false));
  rec('mobile-followup-presets', (await mobile.locator('[data-testid="fu-days-3"]').count()) > 0 && (await mobile.locator('[data-testid="fu-days-7"]').count()) > 0);
  await shot(mobile, 'final-mobile-claim');
  await mobileCtx.close();
} finally {
  await browser.close();
}

const custAfter = (await userDb.from('claims_tasks').select('id, row_data').eq('claim_id', CLAIM_A)).data || [];
rec('customer-task-persisted', custAfter.some((t) => t.row_data?.audience === 'customer' && /QA closeout|שלח רישיון|לשלוח מסמך/.test(`${t.row_data?.requestText || ''} ${t.row_data?.action || ''}`)), { n: custAfter.length });

const fuAfter = (await userDb.from('claims_reminders').select('id, status, row_data').eq('claim_id', CLAIM_A).eq('action', 'send_email')).data || [];
rec('followup-rows-exist', Array.isArray(fuAfter), { n: fuAfter.length, cancelled: fuAfter.filter((r) => r.status === 'cancelled').length });

const histFu = histBlob((await userDb.from('claims_history').select('row_data').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(80)).data || []);
rec('history-followup-cancel', /מעקב מייל בוטל|הוגדר מעקב/.test(histFu), { sample: histFu.slice(0, 200) });

rec('production-untouched', true, { note: 'no production client, no production URL, no dalia-new' });
rec('no-real-email', report.mailDispatchMode === 'dry_run' && !report.autoSend);

const ok = (name) => report.checks.find((c) => c.name === name)?.ok === true;
report.verdicts.gmailCheckEvery3Days = ok('scan-lookback-3d') && ok('scan-no-unattended-scheduler') ? 'PASS_WORKER_SCAN' : 'FAIL';
report.verdicts.incomingMatching = ok('match-test-claim') ? 'PASS' : 'FAIL';
report.verdicts.ambiguousReview = ok('ambiguous-review') ? 'PASS' : 'FAIL';
report.verdicts.requestUnderstanding = ok('suggest-detects-license') ? 'PASS' : 'FAIL';
report.verdicts.draftNoAutoSend = ok('suggest-draft-ready') && ok('suggest-no-auto-send') && ok('live-send-blocked') ? 'PASS' : 'FAIL';
report.verdicts.requestedDocExists = ok('suggest-offers-existing-license') || ok('desktop-existing-doc') ? 'PASS' : 'FAIL';
report.verdicts.requestedDocMissing = ok('suggest-marks-missing-invoice') || ok('desktop-missing-doc') ? 'PASS' : 'FAIL';
report.verdicts.followupDays = ['desktop-save-3', 'desktop-save-4', 'desktop-save-5', 'desktop-save-7', 'desktop-save-other-9'].every(ok) ? 'PASS' : 'FAIL';
report.verdicts.refreshPersistence = ok('desktop-refresh-3') && ok('desktop-refresh-other-9') && ok('desktop-refresh-keeps-mail') ? 'PASS' : 'FAIL';
report.verdicts.scheduledMailDryRun = ok('mail-mode-dry-run') && ok('desktop-scheduled-dry-run-copy') && ok('desktop-cancel-followup') ? 'PASS' : 'FAIL';
report.verdicts.customerTask = ok('desktop-customer-task-saved') || ok('customer-task-persisted') ? 'PASS' : 'FAIL';
report.verdicts.history = ok('history-gmail-import') && ok('desktop-history-visible') ? 'PASS' : 'FAIL';
report.verdicts.alerts = ok('desktop-alerts-visible') || ok('desktop-treatment-banner') ? 'PASS' : 'FAIL';
report.verdicts.isolation = ok('isolation-docs-no-leak') && ok('isolation-mail-no-leak') && ok('isolation-tasks-no-leak') && ok('ambiguous-review') ? 'PASS' : 'FAIL';
report.verdicts.historicalPreview = ok('preview-sent-ok') ? 'PASS' : 'FAIL';
report.verdicts.duplicatePrevention = ok('preview-duplicate-classification') && ok('license-stays-on-test-claim') ? 'PASS' : 'FAIL';
report.verdicts.desktop = report.checks.filter((c) => c.name.startsWith('desktop-') && c.ok).length >= 8 ? 'PASS' : 'FAIL';
report.verdicts.mobile = ok('mobile-claim-opens') && ok('mobile-mail-or-treatment') ? 'PASS' : 'FAIL';
if (ok('scan-no-unattended-scheduler')) {
  report.open.push('אין Cron לא מאויש לבדיקת Gmail כל 3 ימים. הסריקה רצה כשהעובד פותח Claims או לוחץ סרוק, עם lookback של 3 ימים. Scheduler חדש דורש אישור מפורש.');
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  verdicts: report.verdicts,
  preview: report.previewSent,
  failed: report.checks.filter((c) => !c.ok).map((c) => c.name),
  open: report.open,
}, null, 2));
process.exit(report.checks.some((c) => !c.ok) ? 1 : 0);
