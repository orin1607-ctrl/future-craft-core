#!/usr/bin/env node
/** Phone Composer SEND with a real selected attachment. Staging only. */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { Blob } from 'buffer';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-composer-send-guard-2026-09-08');
const ART = '/opt/cursor/artifacts';
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const OWNER = 'orin1607@gmail.com';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);

const env = {};
for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i)] = line.slice(i + 1);
}
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: sess, error: loginErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (loginErr || !sess.session) throw loginErr || new Error('login failed');
const session = sess.session;
const hdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}` };

const stamp = Date.now();
const client = `TEST-SEND-ATT-${stamp}`;
const plate = `SA${String(stamp).slice(-6)}`;
const subject = `STAGING QA attach send ${stamp}`;
const bodyText = 'בדיקת צירוף קובץ שנבחר ב-Composer מהטלפון.';
const report = { at: new Date().toISOString(), checks: [], verdict: 'FAIL', claimId: '', fileId: '', mid: '' };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err || extra.detail || extra.mid || extra.files ? ` · ${extra.err || extra.detail || extra.mid || extra.files}` : ''}`);
};

async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let claimId = '';
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
  await page.locator('[data-testid="intake-phone"]').fill('0500000096');
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
  report.claimId = claimId;
  rec('claim-created', Boolean(claimId) && !PROTECTED.has(claimId), { detail: claimId });

  const attName = `qa-attach-${stamp}.png`;
  const attPath = join(OUT, attName);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(attPath, png);
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  form.set('file', new Blob([png], { type: 'image/png' }), attName);
  const up = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, { method: 'POST', headers: hdr, body: form });
  const upJson = await up.json().catch(() => ({}));
  rec('staff-upload', up.ok && upJson.success !== false && Boolean(upJson.file_id), { detail: JSON.stringify(upJson).slice(0, 240) });
  const fileId = String(upJson.file_id || '');
  report.fileId = fileId;

  const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
  if (await box.count()) { await box.fill(client); await page.waitForTimeout(400); }
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) await row.first().click({ force: true });
  await page.waitForTimeout(800);
  const snap = page.locator('[data-testid="claims-card-snap-toggle"]');
  if (await snap.count() && (await snap.getAttribute('aria-expanded')) === 'false') await snap.click().catch(() => undefined);
  await page.locator('[data-testid="claims-send-mail"]').first().click({ force: true });
  await page.waitForSelector('[data-testid="mo-mail"].open, .ov.open[data-testid="mo-mail"]', { timeout: 20000 });
  const chip = page.locator('#mail_to, [data-testid="mail-to"]').first();
  await chip.fill(OWNER);
  await chip.press('Enter');
  await page.locator('[data-testid="mail-subj"]').fill(subject);
  await page.locator('[data-testid="mail-body"]').fill(bodyText);
  const fileCb = page.locator(`[data-testid="mail-file-${fileId}"]`);
  await fileCb.waitFor({ state: 'visible', timeout: 20000 });
  if (!(await fileCb.isChecked())) await fileCb.check();
  rec('file-checked', await fileCb.isChecked(), { detail: fileId });
  await page.locator('[data-testid="mail-preview-btn"]').click();
  const send = page.locator('[data-testid="mail-send-btn"]');
  for (let i = 0; i < 24 && await send.isDisabled(); i++) await page.waitForTimeout(500);
  rec('preview-ok', !(await send.isDisabled()));
  const prevShot = join(OUT, 'screenshots', 'phone-preview-attach.png');
  await page.screenshot({ path: prevShot, fullPage: false });
  try { copyFileSync(prevShot, join(ART, 'claims_composer_preview_attach.png')); } catch { /* skip */ }

  await send.click();
  await page.locator('[data-testid="mail-ack"]').check();
  await page.locator('[data-testid="mail-confirm-send"]').click();
  await page.waitForTimeout(14000);
  const sentShot = join(OUT, 'screenshots', 'phone-sent-attach.png');
  await page.screenshot({ path: sentShot, fullPage: false });
  try { copyFileSync(sentShot, join(ART, 'claims_composer_sent_attach.png')); } catch { /* skip */ }

  const outbox = ((await userDb.from('claims_gmail_outbox').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(3)).data || []);
  const sent = outbox.find((r) => r.status === 'sent' && r.gmail_message_id);
  report.mid = sent?.gmail_message_id || '';
  rec('send-succeeded', Boolean(sent), { mid: sent?.gmail_message_id, to: sent?.to_addr });
  rec('file-ids-on-outbox', Array.isArray(sent?.file_ids) ? sent.file_ids.includes(fileId) : String(sent?.file_ids || '').includes(fileId), { files: JSON.stringify(sent?.file_ids || sent?.file_names) });
  rec('file-names-on-outbox', Array.isArray(sent?.file_names) ? sent.file_names.some((n) => String(n).includes('qa-attach')) : String(sent?.file_names || '').includes('qa-attach'), { files: JSON.stringify(sent?.file_names) });

  const rm = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: { ...hdr, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'read_message', claim_id: claimId, message_id: sent?.gmail_message_id }),
  });
  const mail = await rm.json();
  const atts = mail.message?.attachments || [];
  rec('gmail-has-attachment', atts.some((a) => /qa-attach/i.test(String(a.filename || '')) || Number(a.size || 0) > 0), { files: JSON.stringify(atts) });
  rec('gmail-sent-label', Array.isArray(mail.message?.labelIds) && mail.message.labelIds.includes('SENT'), { detail: JSON.stringify(mail.message?.labelIds || []) });
  rec('gmail-to-owner', /orin1607@gmail.com/i.test(String(mail.message?.to || '')), { detail: mail.message?.to });

  await ctx.close();
} catch (e) {
  rec('qa-error', false, { err: String(e?.message || e).slice(0, 400) });
} finally {
  await browser.close().catch(() => undefined);
  if (claimId) await softDelete(claimId);
}
const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
writeFileSync(join(OUT, 'attach-report.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
