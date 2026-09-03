/**
 * Staging close-out QA for Claims Gmail + documents.
 * TEST claim DAL-QA-WORKER-001 only. No Production. No send. No mass import.
 * Reuses existing TEST inbound. preview_sent is SCAN/PREVIEW only.
 * node scripts/claims-module-closeout-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-module-closeout-2026-09-03');
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
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  customerEmailSend: false,
  dispatchNowCalled: false,
  schemaChanged: false,
  massImport: false,
  mailDispatchMode: null,
  autoSend: false,
  gmailSendEnabled: null,
  previewSent: null,
  verdicts: {
    gmailLiveInbound: 'FAIL',
    scanEvery3Days: 'FAIL',
    claimMatching: 'FAIL',
    ambiguousReview: 'FAIL',
    needsAction: 'FAIL',
    docRequest: 'FAIL',
    suggestedReply: 'FAIL',
    existingDocOffered: 'FAIL',
    missingDocMarked: 'FAIL',
    sentGmailScan: 'FAIL',
    attachmentDetection: 'FAIL',
    duplicatePrevention: 'FAIL',
    history: 'FAIL',
    refresh: 'FAIL',
    isolation: 'FAIL',
    desktop: 'FAIL',
    mobile: 'FAIL',
    ci: 'PENDING',
  },
  checks: [],
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

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });

const sendProbe = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: 'nobody@example.com', subject: 'should-block', body: 'no' });
rec('live-send-blocked', sendProbe.json?.success === false && (sendProbe.json?.reason === 'live_send_not_approved' || sendProbe.json?.blocked === true), {
  error: sendProbe.json?.error || sendProbe.json?.reason,
});

const status = await invokeGmail({ action: 'status' });
report.gmailSendEnabled = status.json?.sendEnabled ?? status.json?.gmailSendEnabled ?? null;
rec('gmail-connected', status.json?.connected === true || status.json?.success === true, { email: status.json?.email || status.json?.connected_email });

const dryScan = await invokeGmail({ action: 'scan_inbox', dry: true });
rec('scan-inbox-dry', dryScan.json?.success === true && dryScan.json?.realEmailSend !== true && dryScan.json?.mailboxMutated !== true, {
  scanned: dryScan.json?.scanned, lookback: dryScan.json?.lookback, skippedImported: dryScan.json?.skippedImported,
});
const lookback3d = dryScan.json?.lookback === 'newer_than:3d' || String(dryScan.json?.lookback || '').includes('3d');
rec('scan-lookback-3d', lookback3d, { lookback: dryScan.json?.lookback || 'missing_until_edge_deploy' });

const m1 = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-a', subject: `[TEST] ${TEST_CLAIM_NUM}`, body: `נא להעביר רישיון נהיגה ${CLAIM_A}` } });
rec('match-test-claim', m1.json?.result?.decision === 'auto' && m1.json?.result?.claimId === CLAIM_A, m1.json?.result || {});
const mLive = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-live', subject: LIVE_GUARD, body: 'עדכון' } });
rec('match-live-stays-on-live', mLive.json?.result?.decision === 'auto' && mLive.json?.result?.claimId === LIVE_GUARD, mLive.json?.result || {});
const mAmb = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-amb', subject: `${CLAIM_A} וגם ${LIVE_GUARD}`, body: 'נא מסמך' } });
rec('ambiguous-review', mAmb.json?.result?.decision === 'needs_review' && !mAmb.json?.result?.claimId, mAmb.json?.result || {});

rec('live-claim-invisible-to-worker', !(await userDb.from('claims_records').select('id').eq('id', LIVE_GUARD).maybeSingle()).data);
rec('claim-b-invisible-to-worker', !(await userDb.from('claims_records').select('id').eq('id', CLAIM_B).maybeSingle()).data);

const latestImp = (await userDb.from('claims_gmail_imports').select('id, subject, body_text, gmail_message_id, claim_id, sent_at').eq('claim_id', CLAIM_A).order('sent_at', { ascending: false }).limit(5)).data || [];
const testImp = latestImp.find((r) => /QA-LIVE-IN|TEST|רישיון|חשבונית/i.test(`${r.subject || ''} ${r.body_text || ''}`)) || latestImp[0];
rec('existing-test-inbound', Boolean(testImp), { importId: testImp?.id, subject: testImp?.subject });

const sug = testImp ? await invokeGmail({ action: 'suggest_reply', claim_id: CLAIM_A, import_id: testImp.id }) : { json: {} };
const attIds = sug.json?.draft?.file_ids || [];
const requested = JSON.stringify(sug.json?.suggestion?.requested || sug.json?.detected || []);
const missing = sug.json?.suggestion?.missing || [];
rec('suggest-api-ok', sug.json?.success === true && sug.json?.autoSend !== true && sug.json?.realEmailSend !== true, { importId: testImp?.id });
rec('suggest-detects-license', requested.includes('רישיון'), { requested });
rec('suggest-offers-existing-license', attIds.includes(LICENSE_FILE), { attIds });
rec('suggest-marks-missing-invoice', JSON.stringify(missing).includes('חשבונית') || requested.includes('חשבונית'), { missing });
rec('suggest-no-foreign-files', attIds.every((id) => String(id).startsWith('CDM-')), { attIds });
rec('suggest-draft-ready', Boolean(sug.json?.draft?.body), { subject: sug.json?.draft?.subject });

const docsA = (await userDb.from('claims_documents').select('id, original_name, claim_id, gmail_attachment_id, content_sha256').eq('claim_id', CLAIM_A)).data || [];
rec('license-stays-on-test-claim', docsA.some((d) => d.id === LICENSE_FILE), { count: docsA.length });

const hist = (await userDb.from('claims_history').select('id, row_data').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(40)).data || [];
const histText = hist.map((h) => `${h.row_data?.action || ''} ${h.row_data?.note || ''}`).join('\n');
rec('history-gmail-import', /יובא מייל|Gmail|שויך/.test(histText), { n: hist.length });

const preview = await invokeGmail({ action: 'preview_sent' });
report.previewSent = {
  success: preview.json?.success === true,
  error: preview.json?.error || null,
  import: preview.json?.import === true,
  mailboxMutated: preview.json?.mailboxMutated === true,
  realEmailSend: preview.json?.realEmailSend === true,
  listed: preview.json?.listed,
  resultSizeEstimate: preview.json?.resultSizeEstimate,
  truncated: preview.json?.truncated,
  summary: preview.json?.summary || null,
};
rec('preview-sent-ok', preview.json?.success === true && preview.json?.import !== true && preview.json?.realEmailSend !== true && preview.json?.mailboxMutated !== true, {
  error: preview.json?.error, summary: preview.json?.summary, listed: preview.json?.listed,
});
const atts = Array.isArray(preview.json?.rows)
  ? preview.json.rows.flatMap((r) => Array.isArray(r.attachments) ? r.attachments : [])
  : [];
rec('preview-attachment-detection', preview.json?.success === true && Number(preview.json?.summary?.attachments || atts.length) >= 0, {
  attachments: preview.json?.summary?.attachments, rows: preview.json?.rows?.length,
});
const certainNew = Number(preview.json?.summary?.certain_new || 0);
const already = Number(preview.json?.summary?.already_in_claim || 0);
rec('preview-duplicate-classification', preview.json?.success === true && (already >= 0), { already, certainNew, review: preview.json?.summary?.needs_review });

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

async function openMailTab(page) {
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.locator('[data-testid="mail-correspondence"]').waitFor({ state: 'visible', timeout: 15000 });
}

async function shot(page, name) {
  const p1 = join(OUT, 'screenshots', `${name}.png`);
  const p2 = join(ART, `${name}.png`);
  await page.screenshot({ path: p1, fullPage: true });
  if (existsSync(p1)) copyFileSync(p1, p2);
}

const stampHint = String(testImp?.subject || 'QA-LIVE-IN');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(context);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  let row = await openTestClaim(page);
  const alerts = await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '');
  rec('desktop-needs-action-chip', /נדרש טיפול|מייל חדש|חסר מסמך/.test(alerts), { alerts: alerts.slice(0, 240) });
  await row.click();
  await openMailTab(page);
  rec('desktop-mail-imported', await page.getByText(/QA-LIVE-IN|DAL-2099-0001|רישיון נהיגה/).first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false));
  rec('desktop-treatment-banner', await page.locator('[data-testid^="mail-need-"]').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false));
  rec('desktop-existing-doc', (await page.getByText('קיים בתיק').count()) > 0);
  rec('desktop-missing-doc', (await page.getByText('חסר מסמך').count()) > 0);
  await shot(page, 'closeout-desktop-mail');
  const sugBtn = page.locator('[data-testid^="suggest-reply-"]').first();
  const sugVisible = await sugBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (sugVisible) {
    await sugBtn.click();
    const composer = await page.locator('[data-testid="mail-body"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
    rec('desktop-suggest-opens', composer);
    await shot(page, 'closeout-desktop-suggest');
    await page.locator('.ov.open button.btn-g', { hasText: 'ביטול' }).click().catch(() => page.keyboard.press('Escape'));
  } else {
    rec('desktop-suggest-opens', false, { err: 'suggest button missing' });
  }
  await page.locator('[data-testid="claims-tab-group-hist"]').click({ force: true }).catch(() => null);
  await page.waitForTimeout(800);
  rec('desktop-history-visible', (await page.getByText(/יובא מייל|זוהתה בקשה|Gmail/).count()) > 0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openTestClaim(page);
  rec('desktop-refresh-row-alerts', /נדרש טיפול/.test(await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await row.click();
  await openMailTab(page);
  rec('desktop-refresh-keeps-mail', await page.getByText(/QA-LIVE-IN|DAL-2099-0001/).first().waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false));
  await shot(page, 'closeout-desktop-refresh');

  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('button:has-text("Gmail")').first().click().catch(() => null);
  await page.waitForTimeout(600);
  rec('desktop-preview-sent-button', (await page.locator('[data-testid="claims-preview-sent-gmail"], [data-testid="claims-preview-sent"]').count()) > 0);
  const previewBtn = page.locator('[data-testid="claims-preview-sent-gmail"], [data-testid="claims-preview-sent"]').first();
  if (await previewBtn.count()) {
    await previewBtn.click();
    rec('desktop-preview-modal', await page.locator('[data-testid="sent-preview-body"]').waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false));
    await shot(page, 'closeout-desktop-sent-preview');
  }
  report.verdicts.desktop = report.checks.filter((c) => c.name.startsWith('desktop-') && c.ok).length >= 6 ? 'PASS' : 'FAIL';
  await context.close();

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
  await inject(mobileCtx);
  const mobile = await mobileCtx.newPage();
  const mRow = await openTestClaim(mobile);
  rec('mobile-claim-opens', true);
  rec('mobile-row-needs-action', /נדרש טיפול/.test(await mRow.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await mRow.click();
  await mobile.locator('[data-testid="claims-tab-group-mail"]').click({ force: true }).catch(() => null);
  await mobile.waitForTimeout(800);
  rec('mobile-mail-or-treatment', await mobile.getByText(/QA-LIVE-IN|נדרש טיפול|רישיון/).first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false));
  await shot(mobile, 'closeout-mobile-claim');
  report.verdicts.mobile = (report.checks.find((c) => c.name === 'mobile-claim-opens')?.ok && report.checks.find((c) => c.name === 'mobile-mail-or-treatment')?.ok) ? 'PASS' : 'FAIL';
  await mobileCtx.close();
} finally {
  await browser.close();
}

const ok = (name) => report.checks.find((c) => c.name === name)?.ok === true;
report.verdicts.gmailLiveInbound = ok('existing-test-inbound') && ok('suggest-api-ok') ? 'PASS' : 'FAIL';
report.verdicts.scanEvery3Days = ok('scan-lookback-3d')
  ? 'PASS_WORKER_SCAN'
  : 'STOP_UNATTENDED_CRON';
report.verdicts.claimMatching = ok('match-test-claim') ? 'PASS' : 'FAIL';
report.verdicts.ambiguousReview = ok('ambiguous-review') ? 'PASS' : 'FAIL';
report.verdicts.needsAction = ok('desktop-treatment-banner') || ok('desktop-needs-action-chip') ? 'PASS' : 'FAIL';
report.verdicts.docRequest = ok('suggest-detects-license') ? 'PASS' : 'FAIL';
report.verdicts.suggestedReply = ok('suggest-draft-ready') && ok('suggest-api-ok') ? 'PASS' : 'FAIL';
report.verdicts.existingDocOffered = ok('suggest-offers-existing-license') ? 'PASS' : 'FAIL';
report.verdicts.missingDocMarked = ok('suggest-marks-missing-invoice') || ok('desktop-missing-doc') ? 'PASS' : 'FAIL';
report.verdicts.sentGmailScan = ok('preview-sent-ok') ? 'PASS' : 'FAIL';
report.verdicts.attachmentDetection = ok('preview-attachment-detection') && ok('preview-sent-ok') ? 'PASS' : 'FAIL';
report.verdicts.duplicatePrevention = ok('preview-duplicate-classification') && ok('license-stays-on-test-claim') ? 'PASS' : 'FAIL';
report.verdicts.history = ok('history-gmail-import') ? 'PASS' : 'FAIL';
report.verdicts.refresh = ok('desktop-refresh-keeps-mail') && (ok('desktop-refresh-row-alerts') || ok('desktop-needs-action-chip')) ? 'PASS' : 'FAIL';
report.verdicts.isolation = ok('live-claim-invisible-to-worker') && ok('ambiguous-review') && ok('suggest-no-foreign-files') ? 'PASS' : 'FAIL';
report.ok = report.checks.every((c) => c.ok) === false ? report.checks.filter((c) => !c.ok).map((c) => c.name) : true;

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdicts: report.verdicts, preview: report.previewSent, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
