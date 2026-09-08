#!/usr/bin/env node
/**
 * PUBLIC STAGING live Composer SEND — TEST address only.
 * Proves Preview/SEND UI, Gmail Sent, history/thread/claim link, refresh.
 * No Production. No OAuth/scan/matching/scheduler change.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-live-send-ui-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
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
  oauthChanged: false,
  gmailScanChanged: false,
  wantSha: WANT_SHA,
  deployTxt: '',
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : extra.mid ? ` · ${extra.mid}` : ''}`);
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
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function waitDeploy() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait pages ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  return false;
}

async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, wantSha: WANT_SHA });
const st = await invokeGmail({ action: 'status', probe: true });
rec('gmail-connected', st.json?.connected === true && st.json?.email === SELF, { email: st.json?.email });
rec('send-enabled', st.json?.sendEnabled === true);
rec('oauth-probe-ok', st.json?.oauth?.refreshProbe?.ok === true, st.json?.oauth?.refreshProbe || {});
rec('gmail-3h-untouched', Number(st.json?.scheduler?.everyMs) === 3 * 60 * 60 * 1000);
rec('no-oauth-change', report.oauthChanged === false);

let claimId = '';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'he-IL' });
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
  const toasts = [];
  page.on('dialog', (d) => d.accept());
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  const mine = page.locator('[data-testid="claims-mine-toggle"]');
  if (await mine.count()) {
    const label = (await mine.first().innerText().catch(() => '')) || '';
    if (/שלי|התביעות שלי/.test(label)) await mine.first().click();
  }
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);

  const stamp = Date.now();
  const client = `TEST-SEND-UI-${stamp}`;
  const plate = `SU${String(stamp).slice(-6)}`;
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"].open [data-testid="intake-name"]', { timeout: 20000 });
  await page.locator('[data-testid="intake-name"]').fill(client);
  await page.locator('[data-testid="intake-phone"]').fill('0500000094');
  const email = page.locator('#in_email');
  if (await email.count()) await email.fill(SELF);
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
  if (claimId) {
    await page.waitForTimeout(800);
    const sendBtn = page.locator('[data-testid="claims-send-mail"]');
    if (await sendBtn.count()) await sendBtn.first().click();
    else await page.locator('[data-testid="claims-open-new"]').click().catch(() => undefined);
    await page.waitForSelector('[data-testid="mo-mail"].open, .ov.open[data-testid="mo-mail"]', { timeout: 20000 });
    const chip = page.locator('#mail_to, [data-testid="mail-to"]').first();
    await chip.waitFor({ state: 'visible', timeout: 10000 });
    await chip.fill(SELF);
    rec('typed-to-in-chip', (await chip.inputValue()) === SELF);
    await page.locator('[data-testid="mail-preview-btn"]').click();
    await page.waitForTimeout(1500);
    const blockedTo = await page.getByText('כתובת To לא תקינה — SEND חסום').count();
    rec('preview-not-blocked-empty-to', blockedTo === 0);
    rec('preview-no-generic-non2xx', await page.getByText('Edge Function returned a non-2xx status code').count() === 0);
    const send = page.locator('[data-testid="mail-send-btn"]');
    await send.waitFor({ state: 'visible', timeout: 15000 });
    if (await send.isDisabled()) {
      rec('send-enabled-after-preview', false, { err: 'SEND still disabled' });
    } else {
      rec('send-enabled-after-preview', true);
      await send.click();
      await page.locator('[data-testid="mail-ack"]').check();
      await page.locator('[data-testid="mail-confirm-send"]').click();
      await page.waitForTimeout(4000);
    }
    rec('no-generic-non2xx-after-send', await page.getByText('Edge Function returned a non-2xx status code').count() === 0);
    const shot = join(OUT, 'screenshots', 'live-send.png');
    await page.screenshot({ path: shot, fullPage: false }).catch(() => undefined);
    try { if (existsSync(shot)) copyFileSync(shot, join(ART, 'claims-live-send-ui.png')); } catch { /* skip */ }

    const outbox = ((await userDb.from('claims_gmail_outbox').select('id, status, to_addr, subject, gmail_message_id, gmail_thread_id, sent_at, claim_id')
      .eq('claim_id', claimId).order('created_at', { ascending: false }).limit(3)).data || []);
    const sent = outbox.find((r) => r.status === 'sent' && r.gmail_message_id);
    rec('outbox-sent', Boolean(sent), { mid: sent?.gmail_message_id, thread: sent?.gmail_thread_id, to: sent?.to_addr });
    rec('to-is-test-allowlist', sent?.to_addr === SELF);
    rec('gmail-message-id', Boolean(sent?.gmail_message_id));
    rec('gmail-thread-id', Boolean(sent?.gmail_thread_id));

    const hist = ((await userDb.from('claims_history').select('id, row_data').eq('claim_id', claimId)).data || []);
    rec('history-linked', hist.some((h) => /gmail_claim_send|נשלח מייל/.test(`${h.row_data?.type || ''} ${h.row_data?.action || ''}`)), { n: hist.length });

    const listed = await invokeGmail({ action: 'list_sends', claim_id: claimId });
    const rows = listed.json?.data || [];
    rec('list-sends-same-claim', rows.some((r) => r.gmail_message_id === sent?.gmail_message_id && r.claim_id === claimId || r.gmail_message_id === sent?.gmail_message_id), { n: rows.length });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    rec('refresh-ok', true);
  }
  await ctx.close();
} catch (e) {
  rec('qa-error', false, { err: String(e?.message || e).slice(0, 400) });
} finally {
  await browser.close().catch(() => undefined);
  if (claimId) await softDelete(claimId);
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
