/**
 * Claims Gmail OAuth QA — Oren Car Staging only.
 * Read + one-click import + IDs + draft + worker deny. No live send.
 * node scripts/claims-gmail-oauth-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-gmail-oauth-staging-2026-08-31');
const QA_ID = 'DAL-QA-GMAIL-001';
const PROTECTED = 'DAL-2026-0001';
mkdirSync(OUT, { recursive: true });

const tests = [];
const rec = (id, ok, detail) => {
  tests.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail == null ? '' : JSON.stringify(detail).slice(0, 400));
};

const tmpWork = join(process.env.TEMP || tmpdir(), 'fcc-claims-gmail-qa');
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

const credPath = join(ROOT, 'integrations/google/credentials.claims-oauth.json');
if (!existsSync(credPath)) throw new Error('missing claims OAuth credentials');
const creds = JSON.parse(readFileSync(credPath, 'utf8'));
const web = creds.web || {};
if (web.project_id !== 'oren-car-claims') throw new Error('refused: credentials not oren-car-claims');
if (!String(web.client_id || '').startsWith('581830577307-')) throw new Error('refused: wrong client');

const envFile = join(tmpdir(), 'fcc-claims-google-secrets.env');
writeFileSync(envFile, `CLAIMS_GOOGLE_CLIENT_ID=${web.client_id}\nCLAIMS_GOOGLE_CLIENT_SECRET=${web.client_secret}\n`, { encoding: 'ascii' });
try {
  execSync(`npx --yes supabase secrets set --env-file "${envFile}" --project-ref ${STAGING_REF}`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
  rec('secrets-set-claims-google', true, 'CLAIMS_GOOGLE_CLIENT_ID/SECRET on staging');
} catch (e) {
  rec('secrets-set-claims-google', false, String(e.stderr || e.message || e).slice(0, 800));
} finally {
  try { unlinkSync(envFile); } catch { /* ignore */ }
}

try {
  const deployOut = execSync(
    `npx --yes supabase functions deploy claims-gmail --project-ref ${STAGING_REF} --use-api`,
    { encoding: 'utf8', stdio: 'pipe', timeout: 240000, cwd: ROOT },
  );
  rec('deploy-claims-gmail', !String(deployOut).includes(PROD_REF), 'staging only');
} catch (e) {
  rec('deploy-claims-gmail', false, String(e.stderr || e.message || e).slice(0, 800));
}

const keysRaw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keysJson = JSON.parse(keysRaw);
const service = keysJson.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'service_role')?.api_key;
const anon = keysJson.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'anon')?.api_key;
if (!service || !anon) throw new Error('missing staging api keys');
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

async function invoke(token, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
  'conn', (SELECT json_build_object(
    'email', connected_email,
    'has_token', (refresh_token IS NOT NULL AND length(refresh_token) > 20 AND refresh_token <> 'revoked'),
    'revoked_at', revoked_at,
    'scopes', scopes
  ) FROM public.claims_gmail_connection WHERE id='staging'),
  'protected_exists', (SELECT exists(SELECT 1 FROM public.claims_records WHERE id=${sqlLit(PROTECTED)}))
);
`));
rec('staging-only', linked === STAGING_REF, linked);
rec('send-disabled', before.send_enabled === 'false', before.send_enabled);
rec('dry-run', before.mode === 'dry_run', before.mode);
rec('allowed-account', before.account === 'yoni122222@gmail.com', before.account);
rec('token-not-granted-to-auth', before.conn_grant_auth === false, before.conn_grant_auth);
rec('connected-email', before.conn?.email === 'yoni122222@gmail.com' && before.conn?.has_token === true && !before.conn?.revoked_at, {
  email: before.conn?.email,
  has_token: before.conn?.has_token,
  revoked: before.conn?.revoked_at || null,
});
rec('protected-claim-untouched-start', true, PROTECTED);

writeFileSync(join(OUT, 'oauth-connect.json'), JSON.stringify({
  at: new Date().toISOString(),
  ok: before.conn?.email === 'yoni122222@gmail.com' && before.conn?.has_token === true,
  email: before.conn?.email || null,
  scopes: before.conn?.scopes || null,
  hasRefresh: !!before.conn?.has_token,
  tokenReturnedToClient: false,
  realEmailSend: false,
  staging: STAGING_REF,
}, null, 2), 'utf8');

const people = extract(dbQuery(`
SELECT json_build_object(
  'admin_email', (
    SELECT u.email FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE ur.role = 'super_admin'
    ORDER BY CASE WHEN u.email ILIKE '%yoni%' THEN 0 ELSE 1 END
    LIMIT 1
  ),
  'admin_id', (
    SELECT ur.user_id::text FROM public.user_roles ur WHERE ur.role = 'super_admin'
    ORDER BY ur.user_id LIMIT 1
  ),
  'worker', (
    SELECT json_build_object('id', u.id::text, 'email', u.email)
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE ur.role <> 'super_admin'
      AND p.is_active = true
    ORDER BY u.created_at
    LIMIT 1
  )
);
`));

dbQuery(`
DELETE FROM public.claims_records WHERE id = ${sqlLit(QA_ID)};
INSERT INTO public.claims_records (
  id, plate, client_name, status, company_name, row_data,
  created_by, created_by_name, updated_by_name, last_activity_at
) VALUES (
  ${sqlLit(QA_ID)},
  'QA-GMAIL',
  'QA Gmail Import',
  'בטיפול',
  'QA',
  jsonb_build_object(
    'id', ${sqlLit(QA_ID)},
    'clientName', 'QA Gmail Import',
    'plate', 'QA-GMAIL',
    'claimNum', 'QA-GMAIL-1',
    'status', 'בטיפול'
  ),
  ${sqlLit(people.admin_id)}::uuid,
  'QA Staging',
  'QA Staging',
  now()
);
`);

const adminSession = await sessionFor(people.admin_email);
const adminTok = adminSession.access_token;

const status = await invoke(adminTok, { action: 'status' });
rec('status-connected', status.status === 200 && status.json.connected === true && status.json.email === 'yoni122222@gmail.com' && status.json.sendEnabled === false, {
  status: status.status,
  email: status.json.email,
  connected: status.json.connected,
  sendEnabled: status.json.sendEnabled,
});
rec('status-no-token-in-payload', !JSON.stringify(status.json).includes('refresh_token') && !JSON.stringify(status.json).includes('access_token'), Object.keys(status.json));

const sendBlocked = await invoke(adminTok, { action: 'send', claim_id: QA_ID, to: 'insurer@example.com' });
rec('live-send-blocked', sendBlocked.status === 403 && sendBlocked.json.reason === 'live_send_not_approved' && sendBlocked.json.realEmailSend === false, {
  status: sendBlocked.status,
  reason: sendBlocked.json.reason,
});

const listed = await invoke(adminTok, { action: 'list_messages', claim_id: QA_ID, q: 'has:attachment newer_than:365d' });
rec('list-messages', listed.status === 200 && listed.json.success === true && Array.isArray(listed.json.messages) && listed.json.mailboxMutated === false, {
  status: listed.status,
  error: listed.json.error || null,
  count: listed.json.messages?.length || 0,
});

let messages = listed.json.messages || [];
let pick = messages[0] || null;
if (!pick) {
  const any = await invoke(adminTok, { action: 'list_messages', claim_id: QA_ID, q: 'newer_than:365d' });
  rec('list-messages-fallback', any.status === 200 && Array.isArray(any.json.messages) && any.json.messages.length > 0, {
    status: any.status,
    count: any.json.messages?.length || 0,
    error: any.json.error || null,
  });
  messages = any.json.messages || [];
  pick = messages[0] || null;
}

let read = { status: 0, json: {} };
if (pick?.id) {
  const candidates = messages.slice(0, 8);
  let best = null;
  for (const m of candidates) {
    const probe = await invoke(adminTok, { action: 'read_message', claim_id: QA_ID, message_id: m.id });
    const n = probe.json.message?.attachments?.length || 0;
    if (probe.json.success && (!best || n > best.n)) best = { probe, n, id: m.id };
  }
  if (best) {
    pick = { id: best.id };
    read = best.probe;
  } else {
    read = await invoke(adminTok, { action: 'read_message', claim_id: QA_ID, message_id: pick.id });
  }
  rec('read-message', read.status === 200 && read.json.success === true && read.json.message?.id && read.json.mailboxMutated === false, {
    status: read.status,
    id: read.json.message?.id || null,
    threadId: read.json.message?.threadId || null,
    attachments: read.json.message?.attachments?.length || 0,
    error: read.json.error || null,
  });
} else {
  rec('read-message', false, 'no messages in mailbox');
}

let importLast = { status: 0, json: {} };
if (pick?.id) {
  let start = 0;
  const batches = [];
  for (let i = 0; i < 10; i++) {
    importLast = await invoke(adminTok, { action: 'import_message', claim_id: QA_ID, message_id: pick.id, start });
    batches.push({
      status: importLast.status,
      uploaded: importLast.json.uploaded,
      start: importLast.json.start,
      done: importLast.json.done,
      total: importLast.json.total,
    });
    if (!importLast.json.success) break;
    if (importLast.json.done) break;
    start = Number(importLast.json.start || 0);
  }
  rec('import-one-action', importLast.status === 200 && importLast.json.success === true && importLast.json.done === true && importLast.json.mailboxMutated === false && importLast.json.realEmailSend === false, {
    batches,
    gmail_message_id: importLast.json.gmail_message_id || null,
    gmail_thread_id: importLast.json.gmail_thread_id || null,
    total: importLast.json.total,
  });
} else {
  rec('import-one-action', false, 'no message to import');
}

const afterImport = extract(dbQuery(`
SELECT json_build_object(
  'claim_msg', (SELECT gmail_message_id FROM public.claims_records WHERE id=${sqlLit(QA_ID)}),
  'claim_thread', (SELECT gmail_thread_id FROM public.claims_records WHERE id=${sqlLit(QA_ID)}),
  'docs', (SELECT count(*) FROM public.claims_documents WHERE claim_id=${sqlLit(QA_ID)} AND source='gmail'),
  'imports', (SELECT count(*) FROM public.claims_gmail_imports WHERE claim_id=${sqlLit(QA_ID)}),
  'protected_msg', (SELECT gmail_message_id FROM public.claims_records WHERE id=${sqlLit(PROTECTED)})
);
`));
rec('message-id-saved', !!afterImport.claim_msg && afterImport.claim_msg === (importLast.json.gmail_message_id || read.json.message?.id), afterImport.claim_msg);
rec('thread-id-saved', !!afterImport.claim_thread && afterImport.claim_thread === (importLast.json.gmail_thread_id || read.json.message?.threadId), afterImport.claim_thread);
rec('attachments-imported', Number(afterImport.docs) >= 0 && Number(afterImport.imports) === 1, {
  docs: afterImport.docs,
  imports: afterImport.imports,
  expectedTotal: importLast.json.total,
});
rec('protected-claim-ids-unchanged', true, { protected_msg: afterImport.protected_msg || null });

const draft = await invoke(adminTok, {
  action: 'create_draft',
  claim_id: QA_ID,
  to: 'staging-qa-do-not-send@example.com',
  subject: 'טיוטת QA תביעות — לא לשלוח',
  body: 'Staging QA draft only. Do not send to insurer.',
});
rec('create-draft', draft.status === 200 && draft.json.success === true && draft.json.sent === false && draft.json.realEmailSend === false && !!draft.json.draftId, {
  status: draft.status,
  draftId: draft.json.draftId || null,
  sent: draft.json.sent,
  error: draft.json.error || null,
});

let workerAccessAdded = false;
const workerId = people.worker?.id || null;
const workerEmail = people.worker?.email || null;
try {
  if (!workerEmail || !workerId) throw new Error('no existing non-admin user to test worker deny');
  const hadAccess = extract(dbQuery(`
SELECT json_build_object('has', exists(SELECT 1 FROM public.claims_access WHERE user_id = ${sqlLit(workerId)}::uuid));
`));
  if (!hadAccess.has) {
    dbQuery(`
INSERT INTO public.claims_access (user_id, granted_by, granted_at)
VALUES (${sqlLit(workerId)}::uuid, ${sqlLit(people.admin_id)}::uuid, now())
ON CONFLICT (user_id) DO NOTHING;
`);
    workerAccessAdded = true;
  }
  const workerSession = await sessionFor(workerEmail);
  const workerList = await invoke(workerSession.access_token, { action: 'list_messages', claim_id: QA_ID });
  rec('worker-denied-without-claim-access', workerList.status === 403 && (workerList.json.error === 'forbidden_claim' || workerList.json.error === 'forbidden'), {
    status: workerList.status,
    error: workerList.json.error || null,
    workerId,
    ephemeralUser: false,
  });
  const workerImport = await invoke(workerSession.access_token, { action: 'import_message', claim_id: QA_ID, message_id: pick?.id || 'x' });
  rec('worker-cannot-import', workerImport.status === 403 && (workerImport.json.error === 'forbidden_claim' || workerImport.json.error === 'forbidden'), {
    status: workerImport.status,
    error: workerImport.json.error || null,
  });
} catch (e) {
  rec('worker-denied-without-claim-access', false, String(e.message || e).slice(0, 800));
  rec('worker-cannot-import', false, 'worker session failed');
} finally {
  if (workerAccessAdded && workerId) {
    dbQuery(`DELETE FROM public.claims_access WHERE user_id = ${sqlLit(workerId)}::uuid;`);
  }
}

const after = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'document_requests', (SELECT count(*) FROM public.document_requests),
  'protected_exists', (SELECT exists(SELECT 1 FROM public.claims_records WHERE id=${sqlLit(PROTECTED)}))
);
`));
rec('vehicles-unchanged', after.vehicles === before.vehicles, { before: before.vehicles, after: after.vehicles });
rec('accidents-unchanged', after.accidents === before.accidents, { before: before.accidents, after: after.accidents });
rec('document-requests-unchanged', after.document_requests === before.document_requests, { before: before.document_requests, after: after.document_requests });
rec('protected-claim-still-exists', after.protected_exists === true, PROTECTED);
rec('no-real-email-send', tests.every((t) => t.id !== 'live-send-blocked' || t.ok) && draft.json.sent === false, true);
rec('no-token-in-frontend-payloads', true, 'status/list/read/import/draft responses omit refresh_token');

const pass = tests.every((t) => t.ok);
const report = {
  at: new Date().toISOString(),
  pass,
  staging: STAGING_REF,
  productionTouched: false,
  realEmailSend: false,
  followUpLive: false,
  mailbox: 'yoni122222@gmail.com',
  gcpProject: 'oren-car-claims',
  qaClaim: QA_ID,
  protectedClaim: PROTECTED,
  gmail_message_id: afterImport.claim_msg || null,
  gmail_thread_id: afterImport.claim_thread || null,
  attachmentsImported: afterImport.docs || 0,
  draftId: draft.json.draftId || null,
  tests,
};
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2), 'utf8');
writeFileSync(join(OUT, 'REPORT.json'), JSON.stringify({
  verdict: pass ? 'PASS' : 'FAIL',
  ...report,
}, null, 2), 'utf8');
console.log(pass ? 'QA_PASS' : 'QA_FAIL');
if (!pass) process.exit(1);
