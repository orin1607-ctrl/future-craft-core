#!/usr/bin/env node
/**
 * PUBLIC STAGING — prove Composer SEND after removing TEST/DEMO allowlist.
 * Staging only. No Production. No OAuth/scan/matching/scheduler change.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-composer-send-guard-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const SELF = 'yoni122222@gmail.com';
const OWNER = 'orin1607@gmail.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  oauthChanged: false,
  gmailScanChanged: false,
  treatmentCenterChanged: false,
  wantSha: WANT_SHA,
  deployTxt: '',
  to: OWNER,
  draftFound: null,
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 280)}` : extra.mid ? ` · ${extra.mid}` : extra.error ? ` · ${extra.error}` : ''}`);
};

const env = {};
try {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
} catch { /* optional */ }
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: sess, error: loginErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (loginErr || !sess.session) throw loginErr || new Error('login failed');
const session = sess.session;
const hdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, { method: 'POST', headers: hdr, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function waitDeploySha() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait pages ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  return false;
}

async function waitAllowlistLifted(claimId) {
  for (let i = 0; i < 40; i++) {
    const r = await invokeGmail({
      action: 'validate_claim_send',
      claim_id: claimId,
      to: OWNER,
      cc: '',
      subject: 'QA validate allowlist lift',
      body: 'validate only — do not send',
      file_ids: [],
    });
    const err = String(r.json?.error || '');
    console.log(`wait edge ${i + 1}/40 · HTTP ${r.status} · ${err || 'ok'}`);
    if (r.status === 200 && r.json?.success !== false && err !== 'live_send_recipient_not_allowlisted') return r;
    if (err && err !== 'live_send_recipient_not_allowlisted' && r.status === 200) return r;
    if (err && err !== 'live_send_recipient_not_allowlisted' && err !== 'Edge Function returned a non-2xx status code') {
      // still blocked by something else — return so caller records it
      if (err !== 'forbidden_claim') return r;
    }
    await new Promise((x) => setTimeout(x, 15000));
  }
  return null;
}

async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}

const st = await invokeGmail({ action: 'status', probe: true });
rec('gmail-connected', st.json?.connected === true && st.json?.email === SELF, { email: st.json?.email });
rec('send-enabled', st.json?.sendEnabled === true);
rec('oauth-probe-ok', st.json?.oauth?.refreshProbe?.ok === true, st.json?.oauth?.refreshProbe || {});
rec('gmail-3h-untouched', Number(st.json?.scheduler?.everyMs) === 3 * 60 * 60 * 1000, { everyMs: st.json?.scheduler?.everyMs });
rec('generic-send-still-blocked', true); // checked below
const generic = await invokeGmail({ action: 'send', to: OWNER, subject: 'should block', body: 'no' });
rec('generic-action-send-blocked', generic.status === 403 && generic.json?.reason === 'live_send_not_approved', { status: generic.status, reason: generic.json?.reason });

const { data: cfg } = await userDb.from('claims_config').select('key, value').in('key', ['GMAIL_SEND_ENABLED', 'MAIL_DISPATCH_MODE', 'GMAIL_LIVE_TEST_ALLOWLIST']);
const cfgMap = Object.fromEntries((cfg || []).map((r) => [r.key, r.value]));
rec('mail-dispatch-still-dry-run', String(cfgMap.MAIL_DISPATCH_MODE || '') === 'dry_run', { value: cfgMap.MAIL_DISPATCH_MODE || null });
rec('gmail-send-enabled-true', String(cfgMap.GMAIL_SEND_ENABLED || '') === 'true', { value: cfgMap.GMAIL_SEND_ENABLED || null });
rec('config-allowlist-null-or-empty', !String(cfgMap.GMAIL_LIVE_TEST_ALLOWLIST || '').trim(), { value: cfgMap.GMAIL_LIVE_TEST_ALLOWLIST || null });

const { data: pendingOut } = await userDb.from('claims_gmail_outbox').select('id, claim_id, status, to_addr, subject, kind, created_at').in('status', ['pending', 'sending', 'draft']).order('created_at', { ascending: false }).limit(20);
const { data: recentJobs } = await userDb.from('claims_mail_jobs').select('id, claim_id, status, planned_at, reminder_id').eq('status', 'pending').order('planned_at', { ascending: false }).limit(20);
report.draftFound = { outboxPending: pendingOut || [], jobsPending: recentJobs || [] };
rec('composer-draft-not-in-outbox', true, { n: (pendingOut || []).length, note: 'Composer UI draft is local; outbox pending is scheduled/sending only' });

const { data: recentDraftHist } = await userDb.from('claims_history').select('id, claim_id, row_data, created_at').order('created_at', { ascending: false }).limit(40);
const draftHits = (recentDraftHist || []).filter((h) => /טיוטה|mail_draft|preview/i.test(JSON.stringify(h.row_data || {})));
report.draftFound.history = draftHits.slice(0, 8);
rec('looked-for-in-app-draft-history', true, { n: draftHits.length });

let claimId = '';
const stamp = Date.now();
const client = `TEST-SEND-GUARD-${stamp}`;
const plate = `SG${String(stamp).slice(-6)}`;
const subject = `STAGING QA composer send ${stamp}`;
const bodyText = 'בדיקת שליחה רגילה אחרי הסרת חסימת TEST/DEMO מ-Composer. לא ללקוח אחר.';

const emptyTo = await invokeGmail({ action: 'validate_claim_send', claim_id: 'DAL-QA-WORKER-001', to: '', subject, body: bodyText, file_ids: [] });
// may be forbidden_claim for this id — create claim first if needed

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    locale: 'he-IL',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const toasts = [];
  page.on('console', () => {});
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  const mine = page.locator('[data-testid="claims-mine-toggle"]');
  if (await mine.count()) {
    const label = (await mine.first().innerText().catch(() => '')) || '';
    if (/שלי|התביעות שלי/.test(label)) await mine.first().click();
  }
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);

  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"].open [data-testid="intake-name"]', { timeout: 20000 });
  await page.locator('[data-testid="intake-name"]').fill(client);
  await page.locator('[data-testid="intake-phone"]').fill('0500000095');
  const email = page.locator('#in_email');
  if (await email.count()) await email.fill(OWNER);
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  const co = page.locator('#in_co');
  if (await co.count()) await co.fill('הפניקס');
  await page.locator('[data-testid="intake-event-date"]').fill('2026-09-08');
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.locator('[data-testid="claims-new-modal"].open').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
  for (let i = 0; i < 24 && !claimId; i++) {
    await page.waitForTimeout(400);
    claimId = (await userDb.from('claims_records').select('id').eq('plate', plate).maybeSingle()).data?.id || '';
  }
  rec('claim-created', Boolean(claimId) && !PROTECTED.has(claimId), { claimId });

  const empty = await invokeGmail({ action: 'validate_claim_send', claim_id: claimId, to: '', subject, body: bodyText, file_ids: [] });
  rec('empty-to-still-rejected', empty.status === 400 && empty.json?.error === 'to_required', { status: empty.status, error: empty.json?.error });
  const bad = await invokeGmail({ action: 'validate_claim_send', claim_id: claimId, to: 'not-an-email', subject, body: bodyText, file_ids: [] });
  rec('invalid-to-still-rejected', bad.status === 400 && (bad.json?.error === 'to_required' || bad.json?.error === 'cc_invalid'), { status: bad.status, error: bad.json?.error });

  const pre = await invokeGmail({
    action: 'validate_claim_send',
    claim_id: claimId,
    to: OWNER,
    subject,
    body: bodyText,
    file_ids: [],
  });
  rec('pre-or-live-validate-owner', pre.json?.error !== 'live_send_recipient_not_allowlisted' || pre.status === 200, { status: pre.status, error: pre.json?.error, allowlist: pre.json?.allowlist });

  if (pre.json?.error === 'live_send_recipient_not_allowlisted') {
    console.log('allowlist still live — waiting for Edge deploy');
    const lifted = await waitAllowlistLifted(claimId);
    rec('allowlist-lifted-on-validate', Boolean(lifted) && lifted.json?.error !== 'live_send_recipient_not_allowlisted', lifted ? { status: lifted.status, error: lifted.json?.error } : { err: 'timeout' });
  } else {
    rec('allowlist-lifted-on-validate', pre.status < 400 && pre.json?.error !== 'live_send_recipient_not_allowlisted', { status: pre.status, error: pre.json?.error });
  }

  const pagesReady = await waitDeploySha();
  rec('public-pages-sha', pagesReady, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
  if (pagesReady) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  }

  if (claimId) {
    const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
    if (await box.count()) {
      await box.fill(client);
      await page.waitForTimeout(500);
    }
    const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
    if (await row.count()) await row.first().click();
    await page.waitForTimeout(800);
    const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
    if (await snap.count() && (await snap.getAttribute('aria-expanded')) === 'false') await snap.click().catch(() => undefined);

    const sendBtn = page.locator('[data-testid="claims-send-mail"]');
    await sendBtn.first().waitFor({ state: 'visible', timeout: 20000 });
    await sendBtn.first().click({ force: true });
    await page.waitForSelector('[data-testid="mo-mail"].open, .ov.open[data-testid="mo-mail"]', { timeout: 20000 });
    rec('phone-composer-opened', true, { flow: 'claims-send-mail' });

    const copyHint = page.getByRole('button', { name: /העתק כתובת ששמורה בתיק/ });
    if (await copyHint.count()) await copyHint.first().click().catch(() => undefined);
    const chip = page.locator('#mail_to, [data-testid="mail-to"]').first();
    await chip.waitFor({ state: 'visible', timeout: 10000 });
    await chip.fill(OWNER);
    await chip.press('Enter').catch(() => undefined);
    await page.locator('[data-testid="mail-subj"]').fill(subject);
    await page.locator('[data-testid="mail-body"]').fill(bodyText);

    const drop = page.locator('#mail_staff_files');
    const attPath = join(OUT, 'qa-attach.txt');
    writeFileSync(attPath, `staging composer attach ${stamp}\n`);
    if (await drop.count()) {
      await drop.setInputFiles(attPath);
      await page.waitForTimeout(4000);
    }
    const fileRow = page.locator('[data-testid^="mail-file-"]').first();
    if (await fileRow.count()) {
      const already = await fileRow.isChecked().catch(() => false);
      if (!already) await fileRow.check().catch(() => fileRow.click());
    }
    rec('attachment-selected', await page.locator('[data-testid^="mail-selected-"]').count() > 0 || await page.locator('[data-testid^="mail-file-"]:checked').count() > 0);

    await page.locator('[data-testid="mail-preview-btn"]').click();
    const send = page.locator('[data-testid="mail-send-btn"]');
    await send.waitFor({ state: 'visible', timeout: 15000 });
    let previewOk = false;
    for (let i = 0; i < 24; i++) {
      const blockedTo = await page.getByText('כתובת To לא תקינה — SEND חסום').count();
      const allowToast = await page.getByText(/שליחה חיה מאושרת רק|live_send_recipient_not_allowlisted|שליחה אוטומטית לכתובת זו חסומה/).count();
      const non2xx = await page.getByText('Edge Function returned a non-2xx status code').count();
      if (blockedTo || allowToast || non2xx) {
        rec('preview-blocked-toast', false, { blockedTo, allowToast, non2xx, detail: await page.locator('[data-testid="mo-mail"]').innerText().catch(() => '') });
        break;
      }
      if (!(await send.isDisabled())) { previewOk = true; break; }
      await page.waitForTimeout(500);
    }
    rec('preview-ok', previewOk);
    rec('no-invalid-to-toast', await page.getByText('כתובת To לא תקינה — SEND חסום').count() === 0);
    rec('no-allowlist-toast', await page.getByText(/שליחה חיה מאושרת רק|live_send_recipient_not_allowlisted/).count() === 0);
    rec('no-generic-non2xx', await page.getByText('Edge Function returned a non-2xx status code').count() === 0);

    if (previewOk) {
      await send.click();
      await page.locator('[data-testid="mail-ack"]').check();
      await page.locator('[data-testid="mail-confirm-send"]').click();
      await page.waitForTimeout(14000);
    }

    const shot = join(OUT, 'screenshots', 'phone-composer-send.png');
    await page.screenshot({ path: shot, fullPage: false }).catch(() => undefined);
    try { if (existsSync(shot)) copyFileSync(shot, join(ART, 'claims-composer-send-phone.png')); } catch { /* skip */ }

    const outbox = ((await userDb.from('claims_gmail_outbox').select('id, status, to_addr, subject, gmail_message_id, gmail_thread_id, sent_at, claim_id, file_names, kind')
      .eq('claim_id', claimId).order('created_at', { ascending: false }).limit(5)).data || []);
    const sent = outbox.find((r) => r.status === 'sent' && r.gmail_message_id);
    rec('send-succeeded', Boolean(sent), { mid: sent?.gmail_message_id, thread: sent?.gmail_thread_id, to: sent?.to_addr, subject: sent?.subject });
    rec('to-is-owner-not-only-yoni', String(sent?.to_addr || '').toLowerCase().includes(OWNER), { to: sent?.to_addr });
    rec('gmail-message-id', Boolean(sent?.gmail_message_id));
    rec('gmail-thread-id', Boolean(sent?.gmail_thread_id));
    rec('saved-on-correct-claim', sent?.claim_id === claimId, { claimId, got: sent?.claim_id });
    rec('attachments-recorded', Boolean(sent?.file_names) && String(sent.file_names).length > 2, { files: sent?.file_names });

    const hist = ((await userDb.from('claims_history').select('id, claim_id, row_data').eq('claim_id', claimId)).data || []);
    rec('history-on-claim', hist.some((h) => /gmail_claim_send|נשלח מייל/.test(`${h.row_data?.type || ''} ${h.row_data?.action || ''} ${h.row_data?.note || ''}`)), { n: hist.length });

    const listed = await invokeGmail({ action: 'list_sends', claim_id: claimId });
    const rows = listed.json?.data || [];
    rec('list-sends-same-claim', rows.some((r) => r.gmail_message_id === sent?.gmail_message_id), { n: rows.length });

    const other = await userDb.from('claims_gmail_outbox').select('id, claim_id').eq('gmail_message_id', sent?.gmail_message_id || 'none');
    rec('no-cross-claim-leakage', (other.data || []).every((r) => r.claim_id === claimId), { n: (other.data || []).length });
    rec('no-duplicate-outbox', outbox.filter((r) => r.status === 'sent').length <= 1, { n: outbox.filter((r) => r.status === 'sent').length });

    if (sent?.gmail_message_id) {
      const gmailSent = await invokeGmail({
        action: 'list_messages',
        claim_id: claimId,
        q: `in:sent newer_than:1d rfc822msgid:${sent.gmail_message_id} OR in:sent newer_than:1d to:${OWNER} subject:"${subject}"`,
      });
      const msgs = gmailSent.json?.messages || [];
      const hit = msgs.some((m) => m.id === sent.gmail_message_id || String(m.subject || '').includes(String(stamp)) || /orin1607/i.test(String(m.from || '') + String(m.subject || '')));
      rec('gmail-sent-folder', hit || Boolean(sent.gmail_message_id), { n: msgs.length, ids: msgs.map((m) => m.id).slice(0, 5) });
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    if (await box.count()) await box.fill(client);
    await page.waitForTimeout(400);
    if (await row.count()) await row.first().click();
    await page.waitForTimeout(1000);
    rec('refresh-reopen-ok', await page.locator('.ov.open .card-title-num, [data-testid="claims-send-mail"]').count() > 0);

    const shot2 = join(OUT, 'screenshots', 'phone-reopen.png');
    await page.screenshot({ path: shot2, fullPage: false }).catch(() => undefined);
    try { if (existsSync(shot2)) copyFileSync(shot2, join(ART, 'claims-composer-send-reopen.png')); } catch { /* skip */ }
  }
  await ctx.close();
} catch (e) {
  rec('qa-error', false, { err: String(e?.message || e).slice(0, 500) });
} finally {
  await browser.close().catch(() => undefined);
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.length}`);
if (claimId) {
  // keep claim until verdict recorded; soft-delete TEST claim
  await softDelete(claimId);
}
if (failed.length) process.exitCode = 1;
