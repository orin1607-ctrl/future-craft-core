/**
 * Restore point + find Direct Insurance mail with 2 Gmail files vs 1 in Claims.
 * Read-only except writing the restore JSON. No send. Staging only.
 * node scripts/claims-direct-mail-diagnose.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-direct-mail-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonDb = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitShort = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
const veh = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const acc = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
const claims = (await admin.from('claims_records').select('id', { count: 'exact', head: true })).count;
const docs = (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count;
const imports = (await admin.from('claims_gmail_imports').select('id', { count: 'exact', head: true })).count;
const pending = (await admin.from('claims_gmail_pending').select('id', { count: 'exact', head: true })).count;
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const restore = {
  at: new Date().toISOString(),
  purpose: 'restore-before-claims-direct-mail-pack',
  stagingRef: STAGING_REF,
  productionTouched: false,
  gitHead,
  gitShort,
  vehicles: veh,
  accidents: acc,
  claims,
  docs,
  imports,
  pending,
  bucketPublic: bucket?.public === true,
  deployed_ref: `${gitShort} feat/incident-alerts-staging`,
};
writeFileSync(join(OUT, 'RESTORE-POINT-BEFORE.json'), JSON.stringify(restore, null, 2), 'utf8');
console.log('RESTORE', JSON.stringify(restore));

const { data: hits } = await admin.from('claims_gmail_imports')
  .select('id, claim_id, gmail_message_id, gmail_thread_id, from_addr, subject, attachment_count, found_count, imported_count, failed_count, failures, sent_at, created_at')
  .or('from_addr.ilike.%ישיר%,from_addr.ilike.%5555555%,subject.ilike.%השלמת מסמכים%,subject.ilike.%ביטוח ישיר%')
  .order('created_at', { ascending: false })
  .limit(40);

const mismatch = [];
for (const im of hits || []) {
  const { data: files } = await admin.from('claims_documents')
    .select('id, original_name, mime_type, byte_size, source, gmail_message_id, gmail_attachment_id, content_sha256, storage_path, doc_kind')
    .eq('claim_id', im.claim_id)
    .eq('gmail_message_id', im.gmail_message_id);
  mismatch.push({
    ...im,
    docsOnMessage: files?.length || 0,
    files: (files || []).map((f) => ({
      id: f.id,
      name: f.original_name,
      mime: f.mime_type,
      bytes: f.byte_size,
      sha: f.content_sha256,
      att: f.gmail_attachment_id,
      kind: f.doc_kind,
      path: f.storage_path,
    })),
  });
}

writeFileSync(join(OUT, 'imports-direct.json'), JSON.stringify(mismatch, null, 2), 'utf8');
console.log('IMPORTS', mismatch.map((x) => ({
  claim: x.claim_id,
  subject: x.subject,
  found: x.found_count,
  imported: x.imported_count,
  docsOnMessage: x.docsOnMessage,
  failed: x.failed_count,
  names: x.files.map((f) => f.name),
})));

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let email = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { email = u.data.user.email; break; }
  if (!email) email = u?.data?.user?.email || '';
}
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const { data: auth } = await anonDb.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
const token = auth.session.access_token;

async function invoke(body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const candidates = mismatch.filter((x) =>
  String(x.subject || '').includes('השלמת מסמכים')
  || Number(x.found_count || 0) !== Number(x.docsOnMessage || 0)
  || Number(x.attachment_count || 0) !== Number(x.docsOnMessage || 0)
  || (x.files.length === 1 && Number(x.found_count || x.attachment_count || 0) >= 1)
);

const gmailReads = [];
for (const im of (candidates.length ? candidates : mismatch).slice(0, 8)) {
  const r = await invoke({ action: 'read_message', claim_id: im.claim_id, message_id: im.gmail_message_id });
  const msg = r.json?.message || {};
  gmailReads.push({
    claim_id: im.claim_id,
    subject: im.subject || msg.subject,
    import: {
      found: im.found_count,
      imported: im.imported_count,
      failed: im.failed_count,
      failures: im.failures,
      docsOnMessage: im.docsOnMessage,
    },
    gmail: {
      from: msg.from,
      to: msg.to,
      id: msg.id,
      threadId: msg.threadId,
      date: msg.date,
      attachments: msg.attachments,
      partsMeta: (msg.partsMeta || []).filter((p) => p.filename || String(p.mime || '').startsWith('image/') || String(p.mime || '').includes('pdf') || String(p.mime || '').includes('octet')),
      bodyPreview: String(msg.bodyText || '').slice(0, 1500),
    },
    error: r.json?.error || null,
  });
}

writeFileSync(join(OUT, 'gmail-read.json'), JSON.stringify(gmailReads, null, 2), 'utf8');
console.log(JSON.stringify({ restore, reads: gmailReads.map((g) => ({
  claim: g.claim_id,
  subject: g.subject,
  gmailAtt: (g.gmail.attachments || []).map((a) => a.filename),
  dbDocs: g.import.docsOnMessage,
  found: g.import.found,
  err: g.error,
})), productionTouched: false }, null, 2));
