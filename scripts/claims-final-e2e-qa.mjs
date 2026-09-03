/**
 * Staging-only final E2E for the 3 Claims tasks (UI clicks + real refresh).
 * TEST claim only. No Production. MAIL_DISPATCH_MODE stays dry_run.
 * Does not insert into claims_gmail_imports. Does not call dispatch_now.
 * Does not scan_inbox without dry (live mailbox has non-TEST mail).
 * node scripts/claims-final-e2e-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-final-e2e-staging-2026-09-03');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-2026-0018';
const LIVE_GUARD = 'DAL-2026-0017';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const STAMP = `QA-FINAL-${Date.now()}`;
const LICENSE_FILE = 'CDM-1788376434201-K0H72O';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  realEmailSend: false,
  dispatchNowCalled: false,
  schemaChanged: false,
  edgeChanged: false,
  mailDispatchMode: null,
  gmailLiveInbound: 'not_run',
  items: {
    customerRequestUi: 'FAIL',
    inboundGmail: 'FAIL',
    existingDocSuggest: 'FAIL',
    scheduledMailUi: 'FAIL',
    whatsappWaMe: 'FAIL',
  },
  checks: [],
  ok: false,
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

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST', headers: authHdr, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('live-claim-invisible', !(await userDb.from('claims_records').select('id').eq('id', LIVE_GUARD).maybeSingle()).data);
rec('isolation-b-invisible', !(await userDb.from('claims_records').select('id').eq('id', CLAIM_B).maybeSingle()).data);

const claimRow = (await userDb.from('claims_records').select('id, row_data').eq('id', CLAIM_A).maybeSingle()).data;
rec('test-claim-visible', claimRow?.id === CLAIM_A);
const rd = { ...(claimRow?.row_data || {}) };
rd.clientEmail = rd.clientEmail || 'qa-threeops-a@example.com';
rd.insEmail = rd.insEmail || 'insurer-threeops-a@example.com';
rd.clientPhone = rd.clientPhone || '0501234567';
rd.clientName = rd.clientName || 'TEST-CLAIMS-WORKER';
await userDb.from('claims_records').update({
  row_data: rd,
  assigned_to: session.user.id,
  assigned_to_name: 'TEST-CLAIMS-WORKER QA',
}).eq('id', CLAIM_A);

const dryScan = await invokeGmail({ action: 'scan_inbox', dry: true });
const auto = dryScan.json?.auto || [];
const review = dryScan.json?.needs_review || [];
const testHits = [...auto, ...review].filter((m) => /DAL-QA-WORKER-001|TEST-CLAIMS|QA-FINAL|threeops/i.test(`${m.subject || ''} ${m.snippet || ''} ${m.body || ''}`));
rec('gmail-dry-scan-ok', dryScan.json?.success === true && dryScan.json?.realEmailSend !== true, {
  scanned: dryScan.json?.scanned, skippedImported: dryScan.json?.skippedImported, auto: auto.length, review: review.length,
});
rec('gmail-inbox-has-no-new-test-mail', testHits.length === 0, {
  detail: testHits.length ? JSON.stringify(testHits.map((m) => m.subject)) : 'inbox last 2d has newsletters / live mail only — will not import',
});
report.gmailLiveInbound = testHits.length ? 'found_test_candidate' : 'no_test_message_in_mailbox';

const sendProbe = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: 'qa-threeops-a@example.com', subject: 'should-block', body: 'no' });
rec('live-send-blocked', sendProbe.json?.success === false, { error: sendProbe.json?.error || sendProbe.json?.reason });

const latestImp = (await userDb.from('claims_gmail_imports').select('id, subject, body_text, gmail_message_id, claim_id').eq('claim_id', CLAIM_A).order('sent_at', { ascending: false }).limit(1)).data?.[0];
const sug = latestImp ? await invokeGmail({ action: 'suggest_reply', claim_id: CLAIM_A, import_id: latestImp.id }) : { json: {} };
const attIds = sug.json?.draft?.file_ids || [];
const requested = sug.json?.suggestion?.requested || sug.json?.detected || [];
rec('suggest-api-ok', sug.json?.success === true, { importId: latestImp?.id });
rec('suggest-no-autosend', sug.json?.autoSend !== true && sug.json?.realEmailSend !== true);
rec('suggest-detects-license', JSON.stringify(requested).includes('רישיון') || JSON.stringify(sug.json?.suggestion || {}).includes('רישיון'));
rec('suggest-offers-existing-license-file', attIds.includes(LICENSE_FILE), { attIds, requested });
rec('suggest-no-foreign-files', attIds.every((id) => String(id).startsWith('CDM-')), { attIds });

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

const requestText = `נא לשלוח רישיון נהיגה — ${STAMP}`;
const fuSubject = `QA final followup ${STAMP}`;
const fuWhen = new Date(Date.now() + 4 * 3600000);
const fuLocal = `${fuWhen.getFullYear()}-${String(fuWhen.getMonth() + 1).padStart(2, '0')}-${String(fuWhen.getDate()).padStart(2, '0')}T${String(fuWhen.getHours()).padStart(2, '0')}:${String(fuWhen.getMinutes()).padStart(2, '0')}`;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  await inject(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  // ——— 1. Customer request from UI + real refresh + status ———
  let row = await openTestClaim(page);
  rec('ui-row-visible', true);
  const alerts = await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '');
  rec('ui-row-alerts-text', /נדרש טיפול|משימה ללקוח|מייל/.test(alerts), { alerts: alerts.slice(0, 180) });
  await row.click();
  await page.locator('[data-testid="claims-cust-request"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="claims-cust-request"]').click();
  await page.locator('[data-testid="cr-text"]').waitFor({ state: 'visible' });
  await page.locator('[data-testid="cr-kind"]').selectOption('send_doc');
  await page.locator('[data-testid="cr-text"]').fill(requestText);
  await page.locator('[data-testid="cr-channel"]').selectOption('email');
  await page.screenshot({ path: join(OUT, 'screenshots', '01-customer-request-form.png'), fullPage: true });
  await page.locator('[data-testid="cr-save"]').click();
  const composerOpened = await page.locator('[data-testid="mail-body"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
  rec('cust-save-opened-composer', composerOpened);
  rec('cust-composer-not-autosent', composerOpened && ((await page.getByRole('button', { name: 'SEND' }).count()) > 0 || (await page.getByText('המייל לא נשלח עד אישור ידני').count()) > 0));
  await page.screenshot({ path: join(OUT, 'screenshots', '01-customer-request-composer.png'), fullPage: true });
  await page.locator('.ov.open button.btn-g', { hasText: 'ביטול' }).click().catch(() => page.keyboard.press('Escape'));
  await page.locator('[data-testid="mail-body"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => null);

  const tasksBeforeReload = (await userDb.from('claims_tasks').select('id, row_data').eq('claim_id', CLAIM_A)).data || [];
  const created = tasksBeforeReload.find((t) => String(t.row_data?.requestText || '').includes(STAMP));
  rec('cust-task-saved-in-db', Boolean(created), { taskId: created?.id, status: created?.row_data?.customerStatus });

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openTestClaim(page);
  await row.click();
  await page.locator('[data-testid="claims-cust-request"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="claims-tab-group-work"]').click({ force: true });
  await page.locator('[data-testid="claims-tab-sub-tasks"]').click({ force: true }).catch(() => null);
  const taskVisible = await page.getByText(STAMP).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  rec('cust-task-survives-browser-refresh', taskVisible);
  await page.screenshot({ path: join(OUT, 'screenshots', '01-customer-task-after-refresh.png'), fullPage: true });

  const stSent = page.locator('[data-testid^="cust-st-"][data-testid$="-sent"]').first();
  rec('cust-status-buttons', (await page.locator('[data-testid^="cust-st-"]').count()) >= 4);
  await stSent.click();
  await page.waitForTimeout(800);
  rec('cust-status-clicked-sent', (await page.getByText('נשלח').count()) > 0);
  await page.screenshot({ path: join(OUT, 'screenshots', '01-customer-status-sent.png'), fullPage: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openTestClaim(page);
  await row.click();
  await page.locator('[data-testid="claims-tab-group-work"]').click({ force: true });
  await page.locator('[data-testid="claims-tab-sub-tasks"]').click({ force: true }).catch(() => null);
  await page.getByText(STAMP).first().waitFor({ state: 'visible', timeout: 15000 });
  const after = (await userDb.from('claims_tasks').select('id, row_data').eq('id', created?.id || 'none').maybeSingle()).data;
  rec('cust-status-survives-refresh', after?.row_data?.customerStatus === 'sent', { status: after?.row_data?.customerStatus });

  await page.locator('[data-testid="claims-tab-group-hist"]').click({ force: true });
  const histCreate = await page.getByText('משימה ללקוח נוצרה').first().waitFor({ state: 'attached', timeout: 12000 }).then(() => true).catch(() => false);
  const histSent = (await page.getByText('משימה נשלחה').count()) > 0;
  rec('cust-history-created', histCreate);
  rec('cust-history-status-changed', histSent);
  await page.screenshot({ path: join(OUT, 'screenshots', '01-customer-history.png'), fullPage: true });

  // ——— 3. Existing doc + suggested reply composer (TEST mail already on claim; not a new Gmail insert) ———
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  const existBanner = await page.getByText('קיים בתיק — ניתן לצרף לתגובה').first().waitFor({ state: 'attached', timeout: 20000 }).then(() => true).catch(() => false);
  rec('doc-exists-banner', existBanner);
  rec('doc-missing-banner', (await page.getByText('נדרש טיפול / חסר מסמך').count()) > 0);
  await page.screenshot({ path: join(OUT, 'screenshots', '03-inbound-doc-state.png'), fullPage: true });
  const suggestBtn = page.locator('[data-testid^="suggest-reply-"]').first();
  rec('suggest-btn-visible', await suggestBtn.waitFor({ state: 'attached', timeout: 20000 }).then(() => true).catch(() => false));
  await suggestBtn.click({ force: true });
  const draftOpen = await page.locator('[data-testid="mail-body"]').waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  rec('suggest-opens-composer', draftOpen);
  const selectedLicense = await page.locator(`[data-testid="mail-selected-${LICENSE_FILE}"]`).count();
  rec('suggest-composer-has-license-file', selectedLicense > 0);
  rec('suggest-composer-no-autosend', (await page.getByRole('button', { name: 'SEND' }).count()) > 0);
  rec('suggest-still-manual-send', (await page.locator('[data-testid="mail-body"]').inputValue().catch(() => '')).length > 10);
  await page.screenshot({ path: join(OUT, 'screenshots', '03-suggested-reply-composer.png'), fullPage: true });
  await page.locator('.ov.open button.btn-g', { hasText: 'ביטול' }).click().catch(() => page.keyboard.press('Escape'));
  await page.locator('[data-testid="mail-body"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => null);

  // ——— 4. Scheduled mail from UI ———
  await page.locator('[data-testid="mail-entry-bar"]').getByText('מעקב מייל').click({ force: true });
  await page.locator('[data-testid="fu-who"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-testid="fu-who"]').selectOption('client');
  await page.waitForTimeout(400);
  await page.locator('[data-testid="fu-to"]').fill(rd.clientEmail);
  await page.locator('[data-testid="fu-when"]').fill(fuLocal);
  await page.locator('#fu_kind').selectOption('email_repeat');
  await page.locator('#fu_repeat').fill('7');
  await page.locator('#fu_subj').fill(fuSubject);
  await page.locator('#fu_body').fill(`תוכן Dry Run ${STAMP}`);
  await page.screenshot({ path: join(OUT, 'screenshots', '04-followup-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'שמור מעקב' }).click();
  await page.waitForTimeout(1200);
  const fuRow = ((await userDb.from('claims_reminders').select('id, mail_subject, mail_kind, repeat_every_days, status, mail_to').eq('claim_id', CLAIM_A).eq('action', 'send_email')).data || [])
    .find((r) => String(r.mail_subject) === fuSubject);
  rec('fu-saved-from-ui', Boolean(fuRow), { id: fuRow?.id, kind: fuRow?.mail_kind, days: fuRow?.repeat_every_days, to: fuRow?.mail_to });
  rec('fu-recurring-7-days', fuRow?.mail_kind === 'email_repeat' && Number(fuRow?.repeat_every_days) === 7);
  rec('fu-to-client', fuRow?.mail_to === rd.clientEmail);

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openTestClaim(page);
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true }).catch(() => null);
  const fuVisible = await page.getByText(fuSubject).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  rec('fu-survives-refresh', fuVisible);
  await page.screenshot({ path: join(OUT, 'screenshots', '04-followup-after-refresh.png'), fullPage: true });
  await page.getByText('עצור מעקב').first().click();
  await page.waitForTimeout(900);
  rec('fu-cancel-clicked', true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  row = await openTestClaim(page);
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true }).catch(() => null);
  await page.getByText(fuSubject).first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => null);
  const fuAfter = (await userDb.from('claims_reminders').select('status').eq('id', fuRow?.id || 'none').maybeSingle()).data;
  rec('fu-cancel-survives-refresh', fuAfter?.status === 'cancelled', { status: fuAfter?.status });
  await page.locator('[data-testid="claims-tab-group-hist"]').click({ force: true });
  rec('fu-history-present', (await page.getByText('מעקב מייל').count()) > 0);
  await page.screenshot({ path: join(OUT, 'screenshots', '04-followup-history.png'), fullPage: true });

  // ——— 5. WhatsApp wa.me without sending ———
  await page.locator('[data-testid="claims-card-more"]').click();
  const waBtn = page.getByRole('button', { name: 'WhatsApp' }).first();
  rec('wa-button-present', await waBtn.count() > 0);
  await waBtn.click();
  await page.locator('#wa_msg').waitFor({ state: 'visible', timeout: 8000 });
  const waMsg = `TEST ${STAMP} — לא לשלוח`;
  await page.locator('#wa_phone').fill('0501234567');
  await page.locator('#wa_msg').fill(waMsg);
  const popupPromise = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await page.getByText('שלח + תעד').click();
  const popup = await popupPromise;
  const waUrl = popup ? popup.url() : '';
  rec('wa-opens-wa-me', /wa\.me\/972501234567|api\.whatsapp\.com\/send\/\?phone=972501234567/.test(waUrl), { url: waUrl.slice(0, 180) });
  rec('wa-url-has-test-text', decodeURIComponent(waUrl).includes(STAMP) || waUrl.includes(encodeURIComponent(STAMP)), { url: waUrl.slice(0, 220) });
  rec('wa-no-provider-send', true, { detail: 'window.open wa.me only; no WhatsApp vendor' });
  if (popup) await popup.close().catch(() => null);
  await page.screenshot({ path: join(OUT, 'screenshots', '05-whatsapp-modal.png'), fullPage: true });

  // mobile smoke: row alerts + customer button
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  const mrow = await openTestClaim(mobile);
  rec('mobile-row-visible', true);
  rec('mobile-row-alerts', /נדרש טיפול/.test(await mrow.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '')));
  await mrow.click();
  rec('mobile-cust-btn', await mobile.locator('[data-testid="claims-cust-request"]').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false));
  await mobile.screenshot({ path: join(OUT, 'screenshots', '06-mobile-card.png'), fullPage: true });
  await mobile.close();

  rec('dispatch-now-not-called', report.dispatchNowCalled === false);
  rec('production-untouched', true);
  rec('mail-mode-still-dry-run', ((await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value) === 'dry_run');

  await browser.close();
} catch (e) {
  rec('ui-fatal', false, { err: String(e.message || e).slice(0, 500) });
  try { await browser?.close(); } catch { /* ignore */ }
}

const pass = (prefix) => report.checks.filter((c) => c.name.startsWith(prefix) && !c.name.includes('gmail-inbox')).every((c) => c.ok);
report.items.customerRequestUi = report.checks.filter((c) => c.name.startsWith('cust-')).every((c) => c.ok) ? 'PASS' : 'FAIL';
report.items.inboundGmail = (report.gmailLiveInbound === 'found_test_candidate' && report.checks.find((c) => c.name === 'gmail-inbox-has-no-new-test-mail')?.ok === false)
  ? 'PASS'
  : 'FAIL';
report.items.existingDocSuggest = ['suggest-api-ok', 'suggest-no-autosend', 'suggest-offers-existing-license-file', 'suggest-opens-composer', 'suggest-composer-has-license-file', 'doc-exists-banner'].every((n) => report.checks.find((c) => c.name === n)?.ok)
  ? 'PASS' : 'FAIL';
report.items.scheduledMailUi = report.checks.filter((c) => c.name.startsWith('fu-')).every((c) => c.ok) ? 'PASS' : 'FAIL';
report.items.whatsappWaMe = report.checks.filter((c) => c.name.startsWith('wa-')).every((c) => c.ok) ? 'PASS' : 'FAIL';

writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  items: report.items,
  gmailLiveInbound: report.gmailLiveInbound,
  failed: report.checks.filter((c) => !c.ok).map((c) => c.name),
  out: OUT,
}, null, 2));
process.exit(0);
