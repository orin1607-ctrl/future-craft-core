/**
 * Idempotent complete of Direct Insurance mail 1a05cb16e0a328f5 on DAL-2026-0014 only.
 * Creates mail task, draft suggested reply. Does NOT send.
 * node scripts/claims-direct-mail-complete.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const CLAIM = 'DAL-2026-0014';
const MSG = '1a05cb16e0a328f5';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-direct-mail-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
if (linkErr) throw linkErr;
const { data: auth, error: authErr } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
if (authErr || !auth.session) throw authErr || new Error('verifyOtp');

async function invoke(action, body = {}) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${auth.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function pdfStrings(buf) {
  const text = buf.toString('latin1');
  const chunks = [];
  const re = /\((?:\\.|[^\\)]){4,}\)|\((?:\\.|[^\\)])*[\xD7\xE0-\xFA]/g;
  let m;
  while ((m = re.exec(text))) chunks.push(m[0].replace(/^\(|\)$/g, '').replace(/\\n/g, '\n'));
  const utf = buf.toString('utf8').replace(/\0/g, '');
  const heb = utf.match(/[\u0590-\u05FF][\u0590-\u05FF\s,.\-–—:]{8,}/g) || [];
  return { latinSnips: chunks.slice(0, 20), hebrew: [...new Set(heb)].slice(0, 30) };
}

const beforeDocs = (await admin.from('claims_documents').select('id, original_name, source, mime_type, byte_size, gmail_message_id, gmail_attachment_id, content_sha256, storage_path').eq('claim_id', CLAIM).eq('gmail_message_id', MSG)).data || [];
const beforeImp = (await admin.from('claims_gmail_imports').select('*').eq('claim_id', CLAIM).eq('gmail_message_id', MSG).maybeSingle()).data;

let last = null;
for (let i = 0; i < 20; i += 1) {
  last = await invoke('import_message', { claim_id: CLAIM, message_id: MSG, start: i === 0 ? 0 : Number(last?.json?.start || 0) });
  if (!last.json?.success) break;
  if (last.json?.done) break;
}
if (last?.json?.realEmailSend === true) throw new Error('blocked: unexpected send during import');

const { data: imp } = await admin.from('claims_gmail_imports').select('id, subject, body_text, from_addr, found_count, imported_count, failed_count, failures, gmail_message_id, gmail_thread_id').eq('claim_id', CLAIM).eq('gmail_message_id', MSG).maybeSingle();
const t1 = await invoke('ensure_mail_tasks', { claim_id: CLAIM, import_id: imp.id });
const t2 = await invoke('ensure_mail_tasks', { claim_id: CLAIM, import_id: imp.id });
const sug = await invoke('suggest_reply', { claim_id: CLAIM, import_id: imp.id });
if (sug.json?.autoSend === true || sug.json?.realEmailSend === true) throw new Error('blocked: suggested reply tried to send');

const afterDocs = (await admin.from('claims_documents').select('id, original_name, source, mime_type, byte_size, gmail_message_id, gmail_attachment_id, content_sha256, storage_path, doc_meta, created_at').eq('claim_id', CLAIM).eq('gmail_message_id', MSG)).data || [];
const tasks = (await admin.from('claims_tasks').select('id, row_data').eq('claim_id', CLAIM)).data || [];
const mailTasks = tasks.filter((t) => {
  const rd = t.row_data && typeof t.row_data === 'object' ? t.row_data : {};
  return rd.gmailMessageId === MSG;
});
const allClaimDocs = (await admin.from('claims_documents').select('id, original_name, source, mime_type, doc_kind, doc_meta').eq('claim_id', CLAIM)).data || [];
const leak = (await admin.from('claims_documents').select('id, claim_id').eq('gmail_message_id', MSG).neq('claim_id', CLAIM)).data || [];
const veh = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const acc = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
const { data: bucket } = await admin.storage.getBucket('claims-docs');

const pdfTexts = {};
for (const d of afterDocs) {
  if (!String(d.original_name || '').toLowerCase().endsWith('.pdf') || !d.storage_path) continue;
  const { data: blob, error } = await admin.storage.from('claims-docs').download(d.storage_path);
  if (error || !blob) {
    pdfTexts[d.original_name] = { error: error?.message || 'download_failed' };
    continue;
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  pdfTexts[d.original_name] = { bytes: buf.length, magic: buf.slice(0, 5).toString('latin1'), ...pdfStrings(buf) };
}

const out = {
  at: new Date().toISOString(),
  productionTouched: false,
  realEmailSend: false,
  mailboxMutated: false,
  claim: CLAIM,
  messageId: MSG,
  actor: saEmail,
  beforeDocs: beforeDocs.map((d) => ({ id: d.id, name: d.original_name, mime: d.mime_type, bytes: d.byte_size })),
  beforeImport: beforeImp ? { found: beforeImp.found_count, imported: beforeImp.imported_count, failed: beforeImp.failed_count, failures: beforeImp.failures } : null,
  import: last?.json,
  importRow: imp,
  tasksFirst: { created: t1.json?.created, existing: t1.json?.existing, requests: t1.json?.requests, review: t1.json?.review },
  tasksSecond: { created: t2.json?.created, existing: t2.json?.existing },
  idempotent: Number(t2.json?.created || 0) === 0,
  suggestion: sug.json,
  afterDocs: afterDocs.map((d) => ({
    id: d.id, name: d.original_name, source: d.source, mime: d.mime_type, bytes: d.byte_size,
    attId: d.gmail_attachment_id, sha: d.content_sha256, path: d.storage_path,
  })),
  bothNow: afterDocs.length >= 2,
  mailTasks: mailTasks.map((t) => t.row_data),
  claimDocCount: allClaimDocs.length,
  leakToOtherClaims: leak.length,
  vehicles: veh,
  accidents: acc,
  bucketPublic: bucket?.public === true,
  pdfTexts,
};
writeFileSync(join(OUT, 'complete.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  imported: last?.json?.imported,
  found: last?.json?.found,
  failed: last?.json?.failed,
  bothNow: out.bothNow,
  files: out.afterDocs.map((d) => d.name),
  taskCreated: t1.json?.created,
  taskIdempotent: out.idempotent,
  autoSend: sug.json?.autoSend,
  realEmailSend: sug.json?.realEmailSend,
  vehicles: veh,
  accidents: acc,
  bucketPublic: bucket?.public === true,
}, null, 2));
if (!out.bothNow) process.exit(1);
