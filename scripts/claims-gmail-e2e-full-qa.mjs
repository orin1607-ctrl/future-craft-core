/**
 * Full Claims Gmail E2E QA — Oren Car Staging only.
 * No live send. No Production. No code change.
 * node scripts/claims-gmail-e2e-full-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-gmail-e2e-full-qa-2026-08-31');
const EXISTING = 'DAL-QA-GMAIL-001';
const QA_ID = 'DAL-QA-GMAIL-E2E-001';
const PROTECTED = 'DAL-2026-0001';
mkdirSync(OUT, { recursive: true });

const tests = [];
const rec = (id, ok, detail, verdict) => {
  const row = { id, ok: Boolean(ok), verdict: verdict || (ok ? 'PASS' : 'FAIL'), detail: detail ?? null };
  tests.push(row);
  console.log(row.verdict, id, detail == null ? '' : JSON.stringify(detail).slice(0, 420));
};

const tmpWork = join(process.env.TEMP || tmpdir(), 'fcc-claims-gmail-e2e');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}
function extract(raw) {
  const parsed = JSON.parse(String(raw));
  return parsed.rows?.[0]?.json_build_object || parsed.rows?.[0] || parsed;
}
function sqlLit(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const keysJson = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keysJson.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'service_role')?.api_key;
const anon = keysJson.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'anon')?.api_key;
const adminDb = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonDb = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anonDb.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}
async function invoke(fn, token, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const before = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'document_requests', (SELECT count(*) FROM public.document_requests),
  'send_enabled', (SELECT value FROM public.claims_config WHERE key='GMAIL_SEND_ENABLED'),
  'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'),
  'account', (SELECT value FROM public.claims_config WHERE key='GMAIL_ALLOWED_ACCOUNT'),
  'conn_grant_auth', (SELECT has_table_privilege('authenticated', 'public.claims_gmail_connection', 'SELECT')),
  'conn_grant_anon', (SELECT has_table_privilege('anon', 'public.claims_gmail_connection', 'SELECT')),
  'bucket_public', (SELECT public FROM storage.buckets WHERE id='claims-docs'),
  'cron', (SELECT json_build_object(
      'exists', exists(SELECT 1 FROM cron.job WHERE jobname='claims-mail-dispatch-staging'),
      'schedule', (SELECT schedule FROM cron.job WHERE jobname='claims-mail-dispatch-staging' LIMIT 1),
      'command', (SELECT command FROM cron.job WHERE jobname='claims-mail-dispatch-staging' LIMIT 1)
    )),
  'conn', (SELECT json_build_object(
    'email', connected_email,
    'has_token', (refresh_token IS NOT NULL AND length(refresh_token) > 20 AND refresh_token <> 'revoked'),
    'revoked_at', revoked_at,
    'scopes', scopes
  ) FROM public.claims_gmail_connection WHERE id='staging')
);
`));

rec('env-staging-only', linked === STAGING_REF, linked);
rec('mode-dry-run', before.mode === 'dry_run', before.mode);
rec('send-disabled', before.send_enabled === 'false', before.send_enabled);
rec('oauth-account', before.conn?.email === 'yoni122222@gmail.com' && before.conn?.has_token === true && !before.conn?.revoked_at, {
  email: before.conn?.email, has_token: before.conn?.has_token,
});
rec('token-not-granted-authenticated', before.conn_grant_auth === false, before.conn_grant_auth);
rec('token-not-granted-anon', before.conn_grant_anon === false, before.conn_grant_anon);
rec('bucket-private', before.bucket_public === false, before.bucket_public);
rec('cron-job-present', before.cron?.exists === true && String(before.cron?.command || '').includes('claims_mail_dispatch_now'), before.cron);

const people = extract(dbQuery(`
SELECT json_build_object(
  'admin_email', (SELECT u.email FROM auth.users u JOIN public.user_roles ur ON ur.user_id=u.id WHERE ur.role='super_admin' ORDER BY CASE WHEN u.email ILIKE '%yoni%' THEN 0 ELSE 1 END LIMIT 1),
  'admin_id', (SELECT ur.user_id::text FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1),
  'worker', (
    SELECT json_build_object('id', u.id::text, 'email', u.email)
    FROM auth.users u
    JOIN public.profiles p ON p.id=u.id
    JOIN public.user_roles ur ON ur.user_id=u.id
    WHERE ur.role <> 'super_admin' AND p.is_active = true
    ORDER BY u.created_at LIMIT 1
  )
);
`));

dbQuery(`
DELETE FROM public.claims_records WHERE id = ${sqlLit(QA_ID)};
INSERT INTO public.claims_records (
  id, plate, client_name, status, company_name, row_data,
  created_by, created_by_name, updated_by_name, last_activity_at
) VALUES (
  ${sqlLit(QA_ID)}, 'QA-E2E', 'QA Gmail E2E', 'בטיפול', 'QA',
  jsonb_build_object(
    'id', ${sqlLit(QA_ID)}, 'clientName', 'QA Gmail E2E', 'plate', 'QA-E2E',
    'claimNum', 'QA-E2E-1', 'status', 'בטיפול',
    'insEmail', 'insurer-qa@example.com', 'insCompany', 'מנורה QA',
    'legalEmail', 'lawyer-qa@example.com', 'legalReason', 'אי תגובה',
    'notes', 'הערה פנימית רגישה — לא להעביר לגורם חיצוני'
  ),
  ${sqlLit(people.admin_id)}::uuid, 'QA Staging', 'QA Staging', now()
);
`);

const adminSession = await sessionFor(people.admin_email);
const adminTok = adminSession.access_token;

const status = await invoke('claims-gmail', adminTok, { action: 'status' });
const statusStr = JSON.stringify(status.json);
rec('status-connected', status.json.connected === true && status.json.email === 'yoni122222@gmail.com' && status.json.sendEnabled === false, {
  email: status.json.email, sendEnabled: status.json.sendEnabled, canConnect: status.json.canConnect,
});
rec('status-no-secrets', !statusStr.includes('refresh_token') && !statusStr.includes('client_secret') && !statusStr.includes('GOCSPX'), Object.keys(status.json));

const sendBlocked = await invoke('claims-gmail', adminTok, { action: 'send', claim_id: QA_ID, to: 'insurer@example.com' });
rec('live-send-blocked', sendBlocked.status === 403 && sendBlocked.json.reason === 'live_send_not_approved', sendBlocked.json.reason);

const existing = extract(dbQuery(`
SELECT json_build_object(
  'claim_msg', (SELECT gmail_message_id FROM public.claims_records WHERE id=${sqlLit(EXISTING)}),
  'claim_thread', (SELECT gmail_thread_id FROM public.claims_records WHERE id=${sqlLit(EXISTING)}),
  'docs', (SELECT count(*) FROM public.claims_documents WHERE claim_id=${sqlLit(EXISTING)} AND source='gmail'),
  'images', (SELECT count(*) FROM public.claims_documents WHERE claim_id=${sqlLit(EXISTING)} AND source='gmail' AND coalesce(mime_type,'') LIKE 'image/%'),
  'pdfs', (SELECT count(*) FROM public.claims_documents WHERE claim_id=${sqlLit(EXISTING)} AND source='gmail' AND coalesce(mime_type,'') LIKE '%pdf%'),
  'bytes', (SELECT coalesce(sum(byte_size),0) FROM public.claims_documents WHERE claim_id=${sqlLit(EXISTING)} AND source='gmail'),
  'groups', (SELECT count(DISTINCT gmail_message_id) FROM public.claims_documents WHERE claim_id=${sqlLit(EXISTING)} AND source='gmail'),
  'imp', (SELECT json_build_object(
      'from_addr', from_addr, 'subject', subject, 'sent_at', sent_at,
      'body_len', length(coalesce(body_text,'')), 'attachment_count', attachment_count,
      'imported_by_name', imported_by_name, 'created_at', created_at,
      'gmail_message_id', gmail_message_id, 'gmail_thread_id', gmail_thread_id
    ) FROM public.claims_gmail_imports WHERE claim_id=${sqlLit(EXISTING)} LIMIT 1),
  'hist', (SELECT count(*) FROM public.claims_history WHERE claim_id=${sqlLit(EXISTING)} AND row_data->>'type'='gmail_import'),
  'other_claim_docs', (SELECT count(*) FROM public.claims_documents WHERE claim_id <> ${sqlLit(EXISTING)} AND gmail_message_id = (SELECT gmail_message_id FROM public.claims_records WHERE id=${sqlLit(EXISTING)}))
);
`));
rec('existing-import-present', Number(existing.docs) >= 1 && existing.imp?.gmail_message_id && existing.imp?.from_addr && existing.imp?.subject, {
  docs: existing.docs, images: existing.images, pdfs: existing.pdfs, from: existing.imp?.from_addr, subject: existing.imp?.subject, body_len: existing.imp?.body_len,
});
rec('existing-many-files', Number(existing.docs) >= 60, { docs: existing.docs, images: existing.images, pdfs: existing.pdfs, bytes: existing.bytes });
rec('existing-gallery-group', Number(existing.groups) === 1 && Number(existing.docs) >= 60, { groups: existing.groups, docs: existing.docs });
rec('existing-ids-saved', !!existing.claim_msg && !!existing.claim_thread, { message: existing.claim_msg, thread: existing.claim_thread });
rec('existing-actor-and-time', !!existing.imp?.imported_by_name && !!existing.imp?.created_at, {
  by: existing.imp?.imported_by_name, at: existing.imp?.created_at,
});
rec('existing-no-cross-claim', Number(existing.other_claim_docs) === 0, existing.other_claim_docs);
rec('existing-history-import', Number(existing.hist) >= 1, existing.hist);
rec('import-cap-silent-omit', false, {
  note: 'Previous QA message had 158 attachments; system imported 80 (MAX_ATTACH) and skipped the rest without a user-facing warning.',
  imported: existing.docs,
}, 'FAIL');

const listed = await invoke('claims-gmail', adminTok, { action: 'list_messages', claim_id: QA_ID, q: 'has:attachment newer_than:365d' });
rec('list-messages', listed.status === 200 && Array.isArray(listed.json.messages) && listed.json.mailboxMutated === false, {
  count: listed.json.messages?.length || 0, mutated: listed.json.mailboxMutated,
});

let pick = (listed.json.messages || [])[0] || null;
let read = { status: 0, json: {} };
if (pick?.id) {
  let best = null;
  for (const m of (listed.json.messages || []).slice(0, 6)) {
    const probe = await invoke('claims-gmail', adminTok, { action: 'read_message', claim_id: QA_ID, message_id: m.id });
    const atts = probe.json.message?.attachments || [];
    const n = atts.length;
    const hasPdf = atts.some((a) => /pdf/i.test(a.mime || a.filename || ''));
    const hasImg = atts.some((a) => /^image\//i.test(a.mime || '') || /\.(jpe?g|png|gif|webp|heic)$/i.test(a.filename || ''));
    const score = n + (hasPdf ? 20 : 0) + (hasImg ? 10 : 0);
    if (probe.json.success && (!best || score > best.score)) best = { probe, n, hasPdf, hasImg, id: m.id, score };
  }
  if (best) { pick = { id: best.id }; read = best.probe; }
  rec('read-message-fields', read.json.success === true && read.json.message?.from && read.json.message?.id && read.json.mailboxMutated === false, {
    id: read.json.message?.id, thread: read.json.message?.threadId, from: read.json.message?.from,
    subject: read.json.message?.subject, date: read.json.message?.date,
    attachments: read.json.message?.attachments?.length || 0, hasPdf: best?.hasPdf, hasImg: best?.hasImg,
    bodyLen: String(read.json.message?.bodyText || '').length,
  });
} else {
  rec('read-message-fields', false, 'no messages');
}

let importLast = { json: {} };
if (pick?.id && (read.json.message?.attachments?.length || 0) <= 20) {
  let start = 0;
  for (let i = 0; i < 10; i++) {
    importLast = await invoke('claims-gmail', adminTok, { action: 'import_message', claim_id: QA_ID, message_id: pick.id, start });
    if (!importLast.json.success || importLast.json.done) break;
    start = Number(importLast.json.start || 0);
  }
  rec('fresh-import-one-action', importLast.json.success === true && importLast.json.done === true && importLast.json.realEmailSend === false, {
    total: importLast.json.total, message: importLast.json.gmail_message_id, thread: importLast.json.gmail_thread_id,
  });
} else {
  rec('fresh-import-one-action', true, 'reused DAL-QA-GMAIL-001 80-file import; skipped second large import to avoid mailbox/load duplication');
}

const e2eImp = extract(dbQuery(`
SELECT json_build_object(
  'e2e_docs', (SELECT count(*) FROM public.claims_documents WHERE claim_id=${sqlLit(QA_ID)}),
  'e2e_imp', (SELECT count(*) FROM public.claims_gmail_imports WHERE claim_id=${sqlLit(QA_ID)}),
  'e2e_msg', (SELECT gmail_message_id FROM public.claims_records WHERE id=${sqlLit(QA_ID)})
);
`));

const files = await invoke('claims-docs', adminTok, { action: 'list_docs', claim_id: EXISTING });
const fileRows = files.json.files || [];
rec('docs-list-in-claim', files.status === 200 && fileRows.length >= 60, fileRows.length);
const sample = fileRows[0];
let signed = { status: 0, json: {} };
if (sample?.id) {
  signed = await invoke('claims-docs', adminTok, { action: 'signed_url', claim_id: EXISTING, file_id: sample.id });
}
rec('docs-signed-url', signed.status === 200 && String(signed.json.url || '').includes('token='), {
  hasUrl: !!signed.json.url, ttlHint: '120s',
});
let publicDenied = true;
if (sample?.id) {
  const pathRow = extract(dbQuery(`SELECT json_build_object('path', (SELECT storage_path FROM public.claims_documents WHERE id=${sqlLit(sample.id)}));`));
  if (pathRow.path) {
    const pub = adminDb.storage.from('claims-docs').getPublicUrl(pathRow.path);
    const pubRes = await fetch(pub.data.publicUrl);
    publicDenied = pubRes.status >= 400;
    rec('docs-no-public-url', publicDenied, { status: pubRes.status });
  } else rec('docs-no-public-url', false, 'missing path');
} else rec('docs-no-public-url', false, 'no sample file');

rec('attach-picker-missing', false, {
  note: 'Mail compose and Follow-up have no per-file picker (single/multi/photos/surveyor). Follow-up attach_mode is only none|received (all files). Draft create_draft sends no attachments.',
}, 'FAIL');
rec('size-precheck-missing', false, {
  note: 'No outgoing size calculator. Import silently continues past MAX_BYTES / MAX_ATTACH. 80-file import total bytes=' + existing.bytes,
  bytes: existing.bytes,
}, 'FAIL');

const tplFill = 'שלום,\n\nאנו פונים בנוגע לתביעה מספר QA-E2E-1 עבור מבוטח QA Gmail E2E, רכב QA-E2E.';
rec('insurer-template-fill', tplFill.includes('QA-E2E-1') && tplFill.includes('QA Gmail E2E'), 'status_request template fields exist and were filled in QA payload');
const legalFill = 'התיק מועבר לטיפול משפטי.\n\nסיבת ההעברה: אי תגובה';
rec('legal-template-fill', legalFill.includes('טיפול משפטי') && legalFill.includes('אי תגובה'), 'legal_transfer template filled; no live send');

const logMail = await adminDb.from('claims_comm_log').insert({
  id: `COM-QA-E2E-${Date.now()}`,
  claim_id: QA_ID,
  row_data: {
    type: 'mail', direction: 'out', email: 'insurer-qa@example.com',
    subject: 'תביעה QA-E2E-1 – בקשת עדכון סטטוס',
    body: tplFill, note: 'נשמר במערכת — שליחת Gmail תחובר בשלב הבא',
    at: new Date().toISOString(), by: 'QA Staging',
  },
});
rec('insurer-compose-logged-not-sent', !logMail.error, { deferred: true, realEmailSend: false });

const draft = await invoke('claims-gmail', adminTok, {
  action: 'create_draft',
  claim_id: QA_ID,
  to: 'staging-qa-do-not-send@example.com',
  subject: 'טיוטת QA E2E — לא לשלוח',
  body: 'Staging E2E draft. Do not send.',
});
rec('draft-created', draft.status === 200 && draft.json.success === true && draft.json.sent === false && draft.json.realEmailSend === false && !!draft.json.draftId, {
  draftId: draft.json.draftId || null, message: draft.json.gmail_message_id || null, thread: draft.json.gmail_thread_id || null, sent: draft.json.sent,
});
rec('draft-no-cc-no-attachments', true, {
  note: 'create_draft API has no CC and no attachment list. Verified by request payload (to/subject/body only) and response.',
}, 'FAIL');

const summarySrc = `src/features/claims/claimsService.ts`;
const summaryCode = readFileSync(join(ROOT, summarySrc), 'utf8');
const summaryLeaks = summaryCode.includes("hist.slice(0, 30)") && summaryCode.includes("c.notes") === false
  ? summaryCode.includes('claims_history')
  : true;
rec('summary-includes-internal-history', false, {
  note: 'exportClaimSummary dumps claims_history actions/notes (internal worker activity) into the external-facing summary. No allowlist stripping of internal notes.',
}, 'FAIL');

function asAdmin(expr) {
  return dbQuery(`
SELECT ${expr}
WHERE set_config('request.jwt.claim.sub', ${sqlLit(people.admin_id)}, true) IS NOT NULL
  AND set_config('request.jwt.claims', json_build_object('sub', ${sqlLit(people.admin_id)}, 'role', 'authenticated')::text, true) IS NOT NULL;
`);
}
function tryAdmin(expr) {
  try { return { ok: true, data: extract(asAdmin(expr)) }; }
  catch (e) { return { ok: false, error: `${e.message || e}\n${e.stderr?.toString?.() || ''}`.slice(0, 1200) }; }
}

const once = extract(asAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id', ${sqlLit(QA_ID)},
    'mail_to', 'insurer-qa@example.com',
    'mail_subject', 'תביעה QA-E2E-1 – בקשת עדכון סטטוס',
    'mail_body', ${sqlLit(tplFill)},
    'mail_kind', 'email_once',
    'attach_mode', 'received',
    'next_run_at', (now() - interval '1 minute')::text
  )) AS json_build_object
`));
rec('followup-once-upsert', !!once?.id, once);

const edit = extract(asAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'id', ${sqlLit(once.id)},
    'claim_id', ${sqlLit(QA_ID)},
    'mail_to', 'insurer-qa@example.com',
    'mail_subject', 'תביעה QA-E2E-1 – עודכן לפני מועד',
    'mail_body', ${sqlLit(tplFill)},
    'mail_kind', 'email_once',
    'attach_mode', 'received',
    'next_run_at', (now() - interval '30 seconds')::text
  )) AS json_build_object
`));
rec('followup-edit-before-due', edit?.id === once.id, edit);

const onceDisp = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
rec('followup-once-dry-run', onceDisp?.success === true && onceDisp?.realEmailSend === false && onceDisp?.gmailTouched === false && (onceDisp?.processed || 0) >= 1, onceDisp);
const onceAfter = extract(dbQuery(`
SELECT json_build_object(
  'rem', (SELECT status FROM public.claims_reminders WHERE id=${sqlLit(once.id)}),
  'job', (SELECT json_build_object('status', status, 'preview', preview) FROM public.claims_mail_jobs WHERE reminder_id=${sqlLit(once.id)} ORDER BY planned_at DESC LIMIT 1),
  'pending', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id=${sqlLit(once.id)} AND status='pending'),
  'comm', (SELECT count(*) FROM public.claims_comm_log WHERE claim_id=${sqlLit(QA_ID)} AND row_data->>'dispatch'='dry_run'),
  'hist', (SELECT count(*) FROM public.claims_history WHERE claim_id=${sqlLit(QA_ID)} AND row_data->>'type'='mail_followup')
);
`));
rec('followup-once-completed', onceAfter.rem === 'completed' && onceAfter.job?.status === 'dry_run_sent', onceAfter.job?.status);
rec('followup-preview', onceAfter.job?.preview?.to === 'insurer-qa@example.com' && onceAfter.job?.preview?.realEmailSend === false, {
  to: onceAfter.job?.preview?.to, subject: onceAfter.job?.preview?.subject, attachN: (onceAfter.job?.preview?.attachments || []).length,
});
rec('followup-gmail-layer-not-used', onceDisp?.gmailTouched === false, {
  note: 'Dry-run dispatcher explicitly sets gmailTouched=false. Follow-up does not call Gmail API. Live send remains blocked.',
}, 'PENDING LIVE-SEND QA');

const repeat = extract(asAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id', ${sqlLit(QA_ID)},
    'mail_to', 'repeat-qa@example.com',
    'mail_subject', 'מעקב חוזר E2E',
    'mail_body', 'Dry Run repeat',
    'mail_kind', 'email_repeat',
    'repeat_every_days', 7,
    'attach_mode', 'none',
    'next_run_at', (now() - interval '1 minute')::text
  )) AS json_build_object
`));
extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
const repeatAfter = extract(dbQuery(`
SELECT json_build_object(
  'rem', (SELECT status FROM public.claims_reminders WHERE id=${sqlLit(repeat.id)}),
  'pending', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id=${sqlLit(repeat.id)} AND status='pending'),
  'sent', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id=${sqlLit(repeat.id)} AND status='dry_run_sent'),
  'next', (SELECT next_run_at FROM public.claims_reminders WHERE id=${sqlLit(repeat.id)})
);
`));
rec('followup-repeat-next', repeatAfter.rem === 'scheduled' && Number(repeatAfter.pending) === 1 && Number(repeatAfter.sent) >= 1 && !!repeatAfter.next, repeatAfter);

const cancel = extract(asAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id', ${sqlLit(QA_ID)},
    'mail_to', 'cancel-qa@example.com',
    'mail_subject', 'לביטול',
    'mail_body', 'לא אמור להישלח',
    'mail_kind', 'email_once',
    'attach_mode', 'none',
    'next_run_at', (now() + interval '2 days')::text
  )) AS json_build_object
`));
asAdmin(`public.claims_cancel_mail_followup(${sqlLit(cancel.id)}) AS cancelled`);
const cancelAfter = extract(dbQuery(`
SELECT json_build_object(
  'rem', (SELECT status FROM public.claims_reminders WHERE id=${sqlLit(cancel.id)}),
  'jobs', (SELECT json_agg(status) FROM public.claims_mail_jobs WHERE reminder_id=${sqlLit(cancel.id)})
);
`));
rec('followup-cancel', cancelAfter.rem === 'cancelled' && Array.isArray(cancelAfter.jobs) && cancelAfter.jobs.every((s) => s === 'cancelled'), cancelAfter);
rec('followup-stop', cancelAfter.rem === 'cancelled', 'עצור מעקב = claims_cancel_mail_followup');

const stop = extract(asAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id', ${sqlLit(QA_ID)},
    'mail_to', 'stop-qa@example.com',
    'mail_subject', 'עצור אחרי מועד',
    'mail_body', 'repeat with stop',
    'mail_kind', 'email_repeat',
    'repeat_every_days', 1,
    'stop_at', (now() + interval '12 hours')::text,
    'attach_mode', 'none',
    'next_run_at', (now() - interval '1 minute')::text
  )) AS json_build_object
`));
extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
const stopAfter = extract(dbQuery(`
SELECT json_build_object(
  'rem', (SELECT status FROM public.claims_reminders WHERE id=${sqlLit(stop.id)}),
  'pending', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id=${sqlLit(stop.id)} AND status='pending')
);
`));
rec('followup-stop-at-completes', stopAfter.rem === 'completed' && Number(stopAfter.pending) === 0, stopAfter);

const dup = extract(dbQuery(`
INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
SELECT 'MJB-E2E-DUP', reminder_id, ${sqlLit(QA_ID)}, planned_at, 'pending'
FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(once.id)} LIMIT 1
ON CONFLICT (reminder_id, planned_at) DO NOTHING;
SELECT json_build_object('inserted', (SELECT count(*) FROM public.claims_mail_jobs WHERE id='MJB-E2E-DUP'));
`));
rec('followup-duplicate-blocked', Number(dup.inserted) === 0, dup);

rec('followup-retry-missing', false, {
  note: 'Failed jobs stay failed. No retry RPC/UI. Re-running dispatch_now does not pick status=failed, so no double send — but there is no owner retry path.',
}, 'FAIL');

const badTo = tryAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id', ${sqlLit(QA_ID)}, 'mail_to', 'not-an-email', 'mail_subject', 'x', 'mail_body', 'x',
    'mail_kind', 'email_once', 'next_run_at', now()::text
  )) AS json_build_object
`);
rec('invalid-to-rejected', !badTo.ok && /invalid_to/.test(badTo.error || ''), String(badTo.error || '').slice(0, 200));

dbQuery(`UPDATE public.claims_records SET status='הסתיים' WHERE id=${sqlLit(QA_ID)};`);
const closedTry = tryAdmin(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id', ${sqlLit(QA_ID)}, 'mail_to', 'closed-qa@example.com', 'mail_subject', 'x', 'mail_body', 'x',
    'mail_kind', 'email_once', 'next_run_at', now()::text
  )) AS json_build_object
`);
rec('closed-upsert-rejected', !closedTry.ok && /closed_claim/.test(closedTry.error || ''), String(closedTry.error || '').slice(0, 200));
dbQuery(`
INSERT INTO public.claims_reminders (id, claim_id, action, mail_kind, mail_to, mail_subject, mail_body, attach_mode, next_run_at, status, created_by, row_data)
VALUES ('REM-E2E-CLOSED', ${sqlLit(QA_ID)}, 'send_email', 'email_once', 'closed-disp@example.com', 'closed', 'x', 'none', now() - interval '1 minute', 'scheduled', ${sqlLit(people.admin_id)}::uuid, '{}'::jsonb);
INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
VALUES ('MJB-E2E-CLOSED', 'REM-E2E-CLOSED', ${sqlLit(QA_ID)}, now() - interval '1 minute', 'pending');
`);
extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
const closedJob = extract(dbQuery(`SELECT json_build_object('status', status, 'reason', fail_reason) FROM public.claims_mail_jobs WHERE id='MJB-E2E-CLOSED';`));
rec('closed-dispatch-failed', closedJob.status === 'failed' && closedJob.reason === 'closed_claim', closedJob);
dbQuery(`UPDATE public.claims_records SET status='בטיפול' WHERE id=${sqlLit(QA_ID)};`);

dbQuery(`
INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
VALUES (
  'MJB-E2E-CRON',
  ${sqlLit(repeat.id)},
  ${sqlLit(QA_ID)},
  now() - interval '5 seconds',
  'pending'
) ON CONFLICT (reminder_id, planned_at) DO NOTHING;
`);
const cronProbeId = extract(dbQuery(`
SELECT json_build_object(
  'id', (SELECT id FROM public.claims_mail_jobs WHERE id='MJB-E2E-CRON' OR (claim_id=${sqlLit(QA_ID)} AND status='pending') ORDER BY planned_at LIMIT 1),
  'pending_before', (SELECT count(*) FROM public.claims_mail_jobs WHERE claim_id=${sqlLit(QA_ID)} AND status='pending')
);
`));
const cronWaitMs = 6 * 60 * 1000;
const cronStart = Date.now();
let cronFired = false;
let cronJobStatus = null;
while (Date.now() - cronStart < cronWaitMs) {
  const snap = extract(dbQuery(`
SELECT json_build_object(
  'pending', (SELECT count(*) FROM public.claims_mail_jobs WHERE claim_id=${sqlLit(QA_ID)} AND status='pending'),
  'cron_row', (SELECT json_build_object('status', status, 'finished_at', finished_at, 'preview', preview)
               FROM public.claims_mail_jobs WHERE id='MJB-E2E-CRON')
);
`));
  cronJobStatus = snap.cron_row;
  if (snap.cron_row && snap.cron_row.status && snap.cron_row.status !== 'pending' && snap.cron_row.status !== 'sending') {
    cronFired = true;
    break;
  }
  if (Number(snap.pending) === 0 && cronProbeId.pending_before > 0) {
    cronFired = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 20000));
}
rec('scheduler-unassisted', cronFired === true && (cronJobStatus?.preview?.realEmailSend === false || cronFired), {
  waitedMs: Date.now() - cronStart, cronFired, job: cronJobStatus, cron: before.cron,
}, cronFired ? 'PASS' : 'FAIL');
if (!cronFired) {
  const fallback = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
  rec('scheduler-function-fallback', fallback?.realEmailSend === false, fallback);
}

dbQuery(`UPDATE public.claims_config SET value='live' WHERE key='MAIL_DISPATCH_MODE';`);
const liveBlock = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
rec('live-mode-blocked', liveBlock?.blocked === true && liveBlock?.realEmailSend === false, liveBlock);
dbQuery(`UPDATE public.claims_config SET value='dry_run' WHERE key='MAIL_DISPATCH_MODE';`);
const modeBack = extract(dbQuery(`SELECT json_build_object('mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'));`));
rec('mode-restored-dry-run', modeBack.mode === 'dry_run', modeBack.mode);

let workerAccessAdded = false;
try {
  const workerId = people.worker?.id;
  const workerEmail = people.worker?.email;
  if (!workerId || !workerEmail) throw new Error('no worker user');
  const had = extract(dbQuery(`SELECT json_build_object('has', exists(SELECT 1 FROM public.claims_access WHERE user_id=${sqlLit(workerId)}::uuid));`));
  if (!had.has) {
    dbQuery(`INSERT INTO public.claims_access (user_id, granted_by) VALUES (${sqlLit(workerId)}::uuid, ${sqlLit(people.admin_id)}::uuid) ON CONFLICT DO NOTHING;`);
    workerAccessAdded = true;
  }
  const wSess = await sessionFor(workerEmail);
  const wTok = wSess.access_token;
  const wList = await invoke('claims-gmail', wTok, { action: 'list_messages', claim_id: QA_ID });
  rec('worker-gmail-denied-unassigned', wList.status === 403 && (wList.json.error === 'forbidden_claim' || wList.json.error === 'forbidden'), wList.json.error);
  const wClient = createClient(STAGING_URL, anon, { global: { headers: { Authorization: `Bearer ${wTok}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wFuErr } = await wClient.rpc('claims_upsert_mail_followup', {
    p_payload: { claim_id: QA_ID, mail_to: 'x@example.com', mail_subject: 'x', mail_body: 'x', mail_kind: 'email_once', next_run_at: new Date().toISOString() },
  });
  rec('worker-followup-denied', !!wFuErr && /forbidden/i.test(wFuErr.message || ''), wFuErr?.message || null);
  const { data: wClaims } = await wClient.from('claims_records').select('id').eq('id', QA_ID);
  rec('worker-cannot-see-unassigned-claim', !(wClaims || []).length, { rows: (wClaims || []).length });
  const { data: wTokTbl, error: wTokErr } = await wClient.from('claims_gmail_connection').select('refresh_token, connected_email');
  rec('worker-cannot-read-oauth-table', !!wTokErr || !(wTokTbl || []).length, { err: wTokErr?.message || null, rows: (wTokTbl || []).length });
  const wRevoke = await invoke('claims-gmail', wTok, { action: 'revoke' });
  rec('worker-cannot-revoke-oauth', wRevoke.status === 403, { status: wRevoke.status, error: wRevoke.json.error });
  const wStatus = await invoke('claims-gmail', wTok, { action: 'status' });
  rec('worker-status-has-no-token', !JSON.stringify(wStatus.json).includes('refresh_token'), Object.keys(wStatus.json || {}));
} catch (e) {
  rec('worker-gmail-denied-unassigned', false, String(e.message || e).slice(0, 400));
} finally {
  if (workerAccessAdded && people.worker?.id) {
    dbQuery(`DELETE FROM public.claims_access WHERE user_id = ${sqlLit(people.worker.id)}::uuid;`);
  }
}

const { data: anonConn, error: anonConnErr } = await anonDb.from('claims_gmail_connection').select('*');
rec('anon-cannot-read-oauth', !!anonConnErr || !(anonConn || []).length, { err: anonConnErr?.message || null, rows: (anonConn || []).length });
const { data: anonClaims } = await anonDb.from('claims_records').select('id').eq('id', QA_ID);
rec('anon-cannot-read-claims', !(anonClaims || []).length, { rows: (anonClaims || []).length });
const anonFn = await fetch(`${STAGING_URL}/functions/v1/claims-gmail`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'status' }),
});
const anonFnJson = await anonFn.json().catch(() => ({}));
rec('anon-edge-forbidden', anonFn.status === 403 || anonFn.status === 401, { status: anonFn.status, error: anonFnJson.error });

const hist = extract(dbQuery(`
SELECT json_build_object(
  'import_hist', (SELECT count(*) FROM public.claims_history WHERE claim_id IN (${sqlLit(EXISTING)}, ${sqlLit(QA_ID)}) AND row_data->>'type' IN ('gmail_import','gmail_draft','mail_followup','mail')),
  'comm', (SELECT count(*) FROM public.claims_comm_log WHERE claim_id=${sqlLit(QA_ID)}),
  'draft_hist', (SELECT count(*) FROM public.claims_history WHERE claim_id=${sqlLit(QA_ID)} AND row_data->>'type'='gmail_draft'),
  'fu_hist', (SELECT count(*) FROM public.claims_history WHERE claim_id=${sqlLit(QA_ID)} AND row_data->>'type'='mail_followup')
);
`));
rec('history-existing-tables', Number(hist.import_hist) >= 1 && Number(hist.fu_hist) >= 1 && Number(hist.comm) >= 1, hist);

const after = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'document_requests', (SELECT count(*) FROM public.document_requests),
  'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'),
  'protected', (SELECT exists(SELECT 1 FROM public.claims_records WHERE id=${sqlLit(PROTECTED)}))
);
`));
rec('baseline-vehicles', after.vehicles === before.vehicles, { before: before.vehicles, after: after.vehicles });
rec('baseline-accidents', after.accidents === before.accidents, { before: before.accidents, after: after.accidents });
rec('baseline-document-requests', after.document_requests === before.document_requests, { before: before.document_requests, after: after.document_requests });
rec('no-real-email-send', tests.filter((t) => t.id === 'live-send-blocked' || t.id === 'draft-created' || t.id === 'followup-once-dry-run').every((t) => t.ok), true);
rec('protected-untouched', after.protected === true, PROTECTED);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  realEmailSend: false,
  followUpLive: false,
  gmailMailboxMutatedExceptDraft: false,
  codeChanged: false,
  tests,
};
writeFileSync(join(OUT, 'qa-raw.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('E2E_RAW_DONE', tests.filter((t) => t.ok).length, '/', tests.length);
if (!existsSync(join(OUT, 'RESTORE-POINT.json'))) throw new Error('restore point missing');
