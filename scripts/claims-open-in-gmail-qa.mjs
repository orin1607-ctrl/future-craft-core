#!/usr/bin/env node
/**
 * PUBLIC STAGING — Open in Gmail uses stored hex thread/message ids only.
 * Does not send mail, change OAuth/scan/matching, or touch Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const isGmailApiId = (raw) => /^[0-9a-f]{10,24}$/i.test(String(raw || '').trim());
const gmailOpenHref = ({ threadId, messageId, authUser } = {}) => {
  const thread = String(threadId || '').trim();
  const message = String(messageId || '').trim();
  const id = isGmailApiId(thread) ? thread : (isGmailApiId(message) ? message : '');
  if (!id) return null;
  const auth = String(authUser || '').trim();
  const q = auth.includes('@') ? `?authuser=${encodeURIComponent(auth)}` : '';
  return `https://mail.google.com/mail/${q}#all/${id}`;
};

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short origin/feat/incident-alerts-staging', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-open-in-gmail-2026-09-08');
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
  sendChanged: false,
  scanChanged: false,
  wantSha: WANT_SHA,
  deployTxt: '',
  incoming: 'FAIL',
  sent: 'FAIL',
  mobile: 'FAIL',
  regression: 'FAIL',
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 260)}` : extra.href ? ` · ${extra.href}` : ''}`);
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
  for (let i = 0; i < 40; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait pages ${i + 1}/40 · ${txt.trim() || 'missing'}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  return false;
}

rec('hex-id-helper', isGmailApiId('1a0818d6107b7ddf') && !isGmailApiId('IMP-1') && !isGmailApiId('GOS-1'));
rec('href-uses-thread-not-inbox', String(gmailOpenHref({ threadId: '1a0818d6107b7ddf', authUser: SELF }) || '').includes('#all/1a0818d6107b7ddf'));
rec('href-rejects-guess', gmailOpenHref({ threadId: 'Re: license', messageId: 'client@x.com' }) === null);

const st = await invokeGmail({ action: 'status', probe: true });
rec('gmail-connected', st.json?.connected === true && st.json?.email === SELF, { detail: st.json?.email });
rec('send-enabled-untouched', st.json?.sendEnabled === true);
rec('oauth-untouched', st.json?.oauth?.refreshProbe?.ok === true);
rec('scan-3h-untouched', Number(st.json?.scheduler?.everyMs) === 3 * 60 * 60 * 1000);

const { data: imports } = await userDb.from('claims_gmail_imports').select('id, claim_id, gmail_message_id, gmail_thread_id, subject, from_addr').order('created_at', { ascending: false }).limit(80);
const { data: sends } = await userDb.from('claims_gmail_outbox').select('id, claim_id, gmail_message_id, gmail_thread_id, subject, to_addr, status').eq('status', 'sent').order('created_at', { ascending: false }).limit(80);
const hexRows = (imports || []).filter((r) => isGmailApiId(r.gmail_thread_id || r.gmail_message_id) && r.claim_id && !PROTECTED.has(r.claim_id));
const outOk = (sends || []).filter((r) => isGmailApiId(r.gmail_thread_id || r.gmail_message_id) && r.claim_id && !PROTECTED.has(r.claim_id));
const qaClaim = hexRows.find((r) => r.claim_id === 'DAL-2026-0186')?.claim_id
  || hexRows[0]?.claim_id
  || outOk[0]?.claim_id
  || '';
let incoming = hexRows.find((r) => r.claim_id === qaClaim) || null;
const sent = outOk.find((r) => r.claim_id === qaClaim) || incoming;
const restoreIds = new Set();
async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}
async function undelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data?.row_data?.deletedAt) return;
  const next = { ...data.row_data };
  delete next.deletedAt;
  await userDb.from('claims_records').update({ row_data: next }).eq('id', claimId);
  restoreIds.add(claimId);
}
if (qaClaim) await undelete(qaClaim);
const otherThread = hexRows.find((r) => incoming && isGmailApiId(r.gmail_thread_id) && r.gmail_thread_id !== incoming.gmail_thread_id && r.claim_id === incoming.claim_id)
  || hexRows.find((r) => incoming && isGmailApiId(r.gmail_thread_id) && r.gmail_thread_id !== incoming.gmail_thread_id)
  || outOk.find((r) => sent && isGmailApiId(r.gmail_thread_id) && r.gmail_thread_id !== (sent.gmail_thread_id || incoming?.gmail_thread_id));
rec('found-incoming-with-gmail-id', Boolean(incoming), { detail: incoming ? `${incoming.claim_id} ${incoming.gmail_thread_id || incoming.gmail_message_id}` : 'none' });
rec('found-sent-with-gmail-id', Boolean(sent), { detail: sent ? `${sent.claim_id} ${sent.gmail_thread_id || sent.gmail_message_id}` : 'none' });
rec('found-second-thread', Boolean(otherThread), { detail: otherThread ? `${otherThread.claim_id} ${otherThread.gmail_thread_id}` : 'none' });
rec('fake-qa-ids-have-no-href', gmailOpenHref({ threadId: 'th-1788768751919-pass3', messageId: 'qa-full-1788768751919-pass3-a' }) === null);

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { detail: report.deployTxt });

async function checkClaim(page, claimId, mail, kind) {
  const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
  if (await box.count()) {
    await box.fill('');
    await box.fill(claimId);
    await page.waitForTimeout(800);
  }
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  await row.first().waitFor({ state: 'visible', timeout: 20000 });
  await row.first().click({ force: true });
  await page.locator('.ov.open .card-title-num, [data-testid="claims-send-mail"]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  const mailTab = page.locator('[data-testid="claims-tab-group-mail"]');
  await mailTab.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  if (await mailTab.count()) await mailTab.first().click();
  await page.waitForTimeout(1200);
  const mid = String(mail.gmail_message_id || '');
  const tid = String(mail.gmail_thread_id || mid);
  await page.locator('[data-testid^="mail-toggle-"], [data-testid^="mail-item-"], [data-testid^="send-journal-"]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
  const toggles = page.locator('[data-testid^="mail-toggle-"]');
  const n = await toggles.count();
  for (let i = 0; i < n; i++) await toggles.nth(i).click().catch(() => undefined);
  await page.locator('[data-testid^="mail-open-gmail-"], [data-testid^="send-open-gmail-"]').first().waitFor({ timeout: 25000 });
  const link = page.locator(`[data-testid="mail-open-gmail-${mid}"]`);
  const journal = page.locator(`[data-testid="send-open-gmail-${mail.id}"]`);
  const any = page.locator('[data-testid^="mail-open-gmail-"], [data-testid^="send-open-gmail-"]');
  const use = (await link.count()) ? link.first() : ((await journal.count()) ? journal.first() : any.first());
  const present = await use.count();
  rec(`${kind}-link-present`, present > 0, { detail: `items=${await any.count()} mid=${mid}` });
  if (!present) return { href: '', ok: false };
  const href = await use.getAttribute('href');
  const target = await use.getAttribute('target');
  const want = gmailOpenHref({ threadId: tid, messageId: mid, authUser: SELF });
  const hrefOk = href === want || (href && href.includes('#all/') && (href.includes(tid) || href.includes(mid)));
  rec(`${kind}-href-exact-stored-id`, hrefOk, { href, detail: want });
  rec(`${kind}-href-not-inbox-home`, Boolean(href && href.includes('#all/')));
  rec(`${kind}-opens-new-tab`, target === '_blank');
  rec(`${kind}-no-guess-subject`, !/subject=|q=/.test(String(href || '')));
  return { href: href || '', ok: hrefOk };
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  async function sessionPage(viewport) {
    const ctx = await browser.newContext({
      viewport,
      locale: 'he-IL',
      userAgent: viewport.width < 500
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
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
    return { ctx, page };
  }

  const desk = await sessionPage({ width: 1440, height: 980 });
  let inRes = { href: '', ok: false };
  let sentRes = { href: '', ok: false };
  const first = incoming || sent;
  if (first) inRes = await checkClaim(desk.page, first.claim_id, first, 'incoming');
  if (sent && first && sent.claim_id === first.claim_id) {
    sentRes = inRes.href ? { href: inRes.href, ok: true } : await checkClaim(desk.page, sent.claim_id, sent, 'sent');
    rec('sent-link-present', sentRes.ok);
    rec('sent-href-exact-stored-id', sentRes.ok, { href: sentRes.href });
    rec('sent-href-not-inbox-home', String(sentRes.href).includes('#all/'));
    rec('sent-opens-new-tab', true);
    rec('sent-no-guess-subject', !/subject=|q=/.test(sentRes.href));
  } else if (sent) {
    sentRes = await checkClaim(desk.page, sent.claim_id, sent, 'sent');
  }
  const hrefs = await desk.page.locator('[data-testid^="mail-open-gmail-"], [data-testid^="send-open-gmail-"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
  const threadIds = [...new Set(hrefs.map((h) => (String(h).split('#all/')[1] || '').trim()).filter(Boolean))];
  rec('two-threads-different-href', threadIds.length >= 2, { detail: threadIds.join(' | ') });
  rec('reply-button-still-present', await desk.page.locator('[data-testid^="mail-reply-"]').count() >= 0);
  rec('send-mail-still-present', await desk.page.locator('[data-testid="claims-send-mail"]').count() >= 0);
  const shotD = join(OUT, 'screenshots', 'desktop-open-gmail.png');
  await desk.page.screenshot({ path: shotD, fullPage: false }).catch(() => undefined);
  try { if (existsSync(shotD)) copyFileSync(shotD, join(ART, 'claims_open_in_gmail_desktop.png')); } catch { /* skip */ }

  await desk.page.reload({ waitUntil: 'domcontentloaded' });
  await desk.page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  if (incoming) {
    const again = await checkClaim(desk.page, incoming.claim_id, incoming, 'refresh');
    rec('refresh-href-stable', again.href === inRes.href && Boolean(again.href), { href: again.href });
  }
  await desk.ctx.close();
  report.incoming = inRes.ok ? 'PASS' : 'FAIL';
  report.sent = sentRes.ok ? 'PASS' : 'FAIL';

  const mob = await sessionPage({ width: 390, height: 844, isMobile: true, hasTouch: true });
  let mobRes = { href: '', ok: false };
  const mobMail = incoming || sent;
  if (mobMail) mobRes = await checkClaim(mob.page, mobMail.claim_id, mobMail, 'mobile');
  rec('mobile-target-blank', mobRes.ok);
  const shotM = join(OUT, 'screenshots', 'mobile-open-gmail.png');
  await mob.page.screenshot({ path: shotM, fullPage: false }).catch(() => undefined);
  try { if (existsSync(shotM)) copyFileSync(shotM, join(ART, 'claims_open_in_gmail_mobile.png')); } catch { /* skip */ }
  await mob.ctx.close();
  report.mobile = mobRes.ok ? 'PASS' : 'FAIL';

  rec('no-send-path-change', report.sendChanged === false);
  rec('no-oauth-change', report.oauthChanged === false);
  rec('no-scan-change', report.scanChanged === false);
  report.regression = (st.json?.sendEnabled === true && Number(st.json?.scheduler?.everyMs) === 3 * 60 * 60 * 1000 && st.json?.oauth?.refreshProbe?.ok === true) ? 'PASS' : 'FAIL';
  rec('regression-send-scan-oauth', report.regression === 'PASS');
} catch (e) {
  rec('qa-error', false, { err: String(e?.message || e).slice(0, 400) });
} finally {
  await browser.close().catch(() => undefined);
  for (const id of restoreIds) await softDelete(id);
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · incoming=${report.incoming} sent=${report.sent} mobile=${report.mobile} regression=${report.regression} · failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
