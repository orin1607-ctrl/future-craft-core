/**
 * Staging Garage Gmail E2E + Claims regression (read-only).
 * Never Production. Never claims writes.
 * node scripts/garage-gmail-e2e-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/garage-gmail`;
const CLAIMS_FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`;
const CASE_ID = '1f80633e-1a45-4257-9626-52a7a2ff195f';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'garage-gmail-2026-09-13');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_EMAIL || fileEnv.TEST_EMAIL;
const password = process.env.TEST_PASSWORD || fileEnv.TEST_PASSWORD;
if (!url || !anon || !email || !password) throw new Error('missing staging login env');
if (!url.includes(STAGING_REF)) throw new Error('refused: supabase url is not staging');

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  publicPages: PUBLIC,
  productionTouched: false,
  productionDeployApproved: false,
  claimsMutated: false,
  mailbox: 'yoni191177@gmail.com',
  function: 'garage-gmail',
  caseId: CASE_ID,
  verdicts: {
    send: 'FAIL',
    receive: 'FAIL',
    match: 'FAIL',
    files: 'FAIL',
    history: 'FAIL',
    refreshNoGoogle: 'FAIL',
    idempotency: 'FAIL',
    claimsRegression: 'FAIL',
  },
  checks: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

const sb = createClient(url, anon);
const { data: sess, error: loginErr } = await sb.auth.signInWithPassword({ email, password });
if (loginErr || !sess.session) throw new Error(loginErr?.message || 'login failed');
const token = sess.session.access_token;

async function invoke(fnUrl, action, body = {}) {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({ error: `http_${res.status}` }));
  return { status: res.status, json };
}

const stamp = `E2E-GARAGE-${Date.now()}`;
const status1 = await invoke(FN, 'status');
rec('status-connected', status1.json.connected === true && status1.json.email === 'yoni191177@gmail.com', { detail: status1.json.email, err: status1.json.error });
rec('reconnect-not-required', status1.json.reconnectRequired !== true);

const filesR = await invoke(FN, 'list_case_files', { case_id: CASE_ID });
const fileId = (filesR.json.files || [])[0]?.id;
rec('case-has-files', Boolean(fileId), { detail: `files=${(filesR.json.files || []).length}` });

const preview = await invoke(FN, 'validate_send', {
  case_id: CASE_ID,
  to: 'yoni191177@gmail.com',
  cc: '',
  subject: `תיק מוסך GM-2026-0006 · ${stamp}`,
  body: `בדיקת שליחה מתוך ניהול המוסך.\nמספר תיק: GM-2026-0006\n${stamp}\nאין mailto.`,
  file_ids: fileId ? [fileId] : [],
});
rec('preview-ok', preview.json.success === true && preview.json.realEmailSend === false && preview.json.overLimit !== true, { err: preview.json.error });

const idemp = `idemp-${stamp}`;
const send1 = await invoke(FN, 'send_garage', {
  confirm: true,
  case_id: CASE_ID,
  to: 'yoni191177@gmail.com',
  subject: `תיק מוסך GM-2026-0006 · ${stamp}`,
  body: `בדיקת שליחה מתוך ניהול המוסך.\nמספר תיק: GM-2026-0006\n${stamp}`,
  file_ids: fileId ? [fileId] : [],
  idempotency_key: idemp,
});
rec('send-real', send1.json.success === true && send1.json.realEmailSend === true && send1.json.from === 'yoni191177@gmail.com', {
  err: send1.json.error,
  detail: send1.json.gmail_message_id,
});
if (send1.json.success && send1.json.realEmailSend) report.verdicts.send = 'PASS';

const sendDup = await invoke(FN, 'send_garage', {
  confirm: true,
  case_id: CASE_ID,
  to: 'yoni191177@gmail.com',
  subject: `תיק מוסך GM-2026-0006 · ${stamp}`,
  body: `retry ${stamp}`,
  file_ids: fileId ? [fileId] : [],
  idempotency_key: idemp,
});
rec('idempotency-blocks-duplicate', sendDup.json.error === 'already_sent' && sendDup.json.realEmailSend !== true, { err: sendDup.json.error });
if (sendDup.json.error === 'already_sent') report.verdicts.idempotency = 'PASS';

await new Promise((r) => setTimeout(r, 8000));
const scan = await invoke(FN, 'scan_inbox');
rec('scan-ok', scan.json.success === true, { err: scan.json.error, detail: `auto=${scan.json.auto} review=${scan.json.needsReview}` });

const replyIdemp = `idemp-reply-${stamp}`;
const reply = await invoke(FN, 'send_garage', {
  confirm: true,
  case_id: CASE_ID,
  to: 'yoni191177@gmail.com',
  subject: `Re: תיק מוסך GM-2026-0006 · ${stamp}`,
  body: `תשובה לתיק GM-2026-0006\n${stamp}-REPLY\nמחיר מועמד 9999 ₪ — לא לאישור אוטומטי.`,
  file_ids: [],
  idempotency_key: replyIdemp,
  thread_id: send1.json.gmail_thread_id,
});
rec('thread-reply-send', reply.json.success === true && reply.json.realEmailSend === true, { err: reply.json.error });

await new Promise((r) => setTimeout(r, 8000));
const scan2 = await invoke(FN, 'scan_inbox');
rec('scan-after-reply', scan2.json.success === true, { err: scan2.json.error, detail: `auto=${scan2.json.auto} review=${scan2.json.needsReview}` });

const hist = await invoke(FN, 'list_history', { case_id: CASE_ID });
const history = hist.json.history || [];
const imports = hist.json.imports || [];
const outbox = hist.json.outbox || [];
const sentRows = outbox.filter((r) => r.status === 'sent' && String(r.subject || '').includes(stamp));
const received = history.filter((h) => h.event_type === 'received' || String(h.summary || '').includes(stamp));
const fileHist = history.filter((h) => h.event_type === 'attachment');
rec('history-has-sent', sentRows.length >= 1, { detail: `outboxSent=${sentRows.length} hist=${history.length}` });
rec('history-persisted', history.length >= 1);
if (history.length >= 1 && sentRows.length >= 1) report.verdicts.history = 'PASS';
if (fileId && sentRows.some((r) => JSON.stringify(r.file_names || r.media_ids || []).length > 2)) report.verdicts.files = 'PASS';
else if (fileHist.length) report.verdicts.files = 'PASS';

if (imports.length >= 1 || (scan.json.auto || 0) > 0 || (scan2.json.auto || 0) > 0) {
  report.verdicts.receive = 'PASS';
  report.verdicts.match = 'PASS';
}
if (sentRows.length && send1.json.gmail_thread_id) report.verdicts.match = 'PASS';

const status2 = await invoke(FN, 'status');
rec('status-after-send-no-reconnect', status2.json.connected === true && status2.json.reconnectRequired !== true);
if (status2.json.connected && status2.json.reconnectRequired !== true) report.verdicts.refreshNoGoogle = 'PASS';

const claimsStatus = await invoke(CLAIMS_FN, 'status');
rec('claims-still-connected', claimsStatus.json.connected === true && claimsStatus.json.email === 'yoni122222@gmail.com', { detail: claimsStatus.json.email, err: claimsStatus.json.error });
const claimsList = await invoke(CLAIMS_FN, 'list_messages', { q: 'newer_than:30d' });
rec('claims-list-messages', claimsList.json.success === true && Array.isArray(claimsList.json.messages), { err: claimsList.json.error, detail: `n=${(claimsList.json.messages || []).length}` });
if (claimsStatus.json.email === 'yoni122222@gmail.com' && claimsList.json.success) report.verdicts.claimsRegression = 'PASS';

let pagesSha = null;
try {
  const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text());
  pagesSha = txt.trim();
  rec('pages-deploy-txt', /deployed_ref=/.test(txt), { detail: txt.trim().slice(0, 120) });
} catch (e) {
  rec('pages-deploy-txt', false, { err: String(e) });
}

report.pagesSha = pagesSha;
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdicts: report.verdicts, pagesSha, productionTouched: false, productionDeployApproved: false }, null, 2));
if (report.verdicts.send !== 'PASS') process.exitCode = 1;
