/**
 * Enrich To/CC on existing DAL-2026-0004 Gmail import rows only.
 * Gmail metadata GET + UPDATE. No INSERT. No documents. No mailbox mutation.
 * node scripts/claims-tomer-enrich-headers-0004.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ALLOWED_MAILBOX = 'yoni122222@gmail.com';
const CLAIM_ID = 'DAL-2026-0004';
const GCP = 'oren-car-claims';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-tomer-display-2026-08-31');
mkdirSync(OUT, { recursive: true });

const creds = JSON.parse(readFileSync(join(ROOT, 'integrations/google/credentials.claims-oauth.json'), 'utf8'));
const web = creds.web || creds.installed || {};
if (web.project_id !== GCP) throw new Error(`refused gcp ${web.project_id}`);

const keysJson = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keysJson.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { count: beforeImports } = await admin.from('claims_gmail_imports').select('*', { count: 'exact', head: true }).eq('claim_id', CLAIM_ID);
const { count: beforeDocs } = await admin.from('claims_documents').select('*', { count: 'exact', head: true }).eq('claim_id', CLAIM_ID);
const { count: otherImps } = await admin.from('claims_gmail_imports').select('*', { count: 'exact', head: true }).neq('claim_id', CLAIM_ID);
const { count: otherDocs } = await admin.from('claims_documents').select('*', { count: 'exact', head: true }).neq('claim_id', CLAIM_ID);
if (beforeImports !== 30) throw new Error(`expected 30 imports, got ${beforeImports}`);
if (beforeDocs !== 182) throw new Error(`expected 182 docs, got ${beforeDocs}`);
if (otherImps) throw new Error(`other claim imports ${otherImps}`);
if (otherDocs) throw new Error(`other claim docs ${otherDocs}`);

const { data: conn } = await admin.from('claims_gmail_connection')
  .select('connected_email, refresh_token, revoked_at')
  .eq('id', 'staging').maybeSingle();
if (!conn || conn.revoked_at) throw new Error('gmail_not_connected');
if (String(conn.connected_email || '').toLowerCase() !== ALLOWED_MAILBOX) {
  throw new Error(`wrong_account ${conn.connected_email}`);
}

const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: web.client_id,
    client_secret: web.client_secret,
    refresh_token: conn.refresh_token,
    grant_type: 'refresh_token',
  }),
});
const tok = await tokRes.json();
if (!tokRes.ok || !tok.access_token) throw new Error(tok.error || 'token_refresh_failed');
const access = String(tok.access_token);
const info = await (await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(access)}`)).json();
if (!/gmail\.readonly/.test(String(info.scope || ''))) throw new Error('missing gmail.readonly');

const { data: rows } = await admin.from('claims_gmail_imports')
  .select('id, gmail_message_id, to_addr, cc_addr')
  .eq('claim_id', CLAIM_ID);
if ((rows || []).length !== 30) throw new Error(`row count ${(rows || []).length}`);

function header(headers, name) {
  return (headers || []).find((h) => String(h.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

const results = [];
for (const row of rows) {
  const messageId = String(row.gmail_message_id || '');
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  const json = await res.json();
  if (!res.ok) {
    results.push({ id: row.id, messageId, ok: false, error: json.error?.message || res.status });
    continue;
  }
  const headers = json.payload?.headers || [];
  const toAddr = header(headers, 'To') || null;
  const ccAddr = header(headers, 'Cc') || null;
  const fromAddr = header(headers, 'From') || null;
  const { data: touched, error } = await admin.from('claims_gmail_imports')
    .update({ to_addr: toAddr, cc_addr: ccAddr, ...(fromAddr ? { from_addr: fromAddr } : {}) })
    .eq('id', row.id)
    .eq('claim_id', CLAIM_ID)
    .eq('gmail_message_id', messageId)
    .select('id');
  results.push({
    id: row.id,
    messageId,
    ok: !error && (touched || []).length === 1,
    to: Boolean(toAddr),
    cc: Boolean(ccAddr),
    error: error?.message || null,
  });
}

const { count: afterImports } = await admin.from('claims_gmail_imports').select('*', { count: 'exact', head: true }).eq('claim_id', CLAIM_ID);
const { count: afterDocs } = await admin.from('claims_documents').select('*', { count: 'exact', head: true }).eq('claim_id', CLAIM_ID);
const { data: filled } = await admin.from('claims_gmail_imports').select('id, to_addr, cc_addr').eq('claim_id', CLAIM_ID);
const withTo = (filled || []).filter((r) => r.to_addr).length;
const withCc = (filled || []).filter((r) => r.cc_addr).length;
const report = {
  at: new Date().toISOString(),
  claim: CLAIM_ID,
  inserted: 0,
  documentsTouched: 0,
  mailboxMutated: false,
  beforeImports,
  afterImports,
  beforeDocs,
  afterDocs,
  updated: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  withTo,
  withCc,
  otherClaimImports: otherImps,
  otherClaimDocs: otherDocs,
  results,
};
if (afterImports !== 30 || afterDocs !== 182) throw new Error('count changed after enrich');
writeFileSync(join(OUT, 'enrich-headers.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  updated: report.updated,
  failed: report.failed,
  withTo,
  withCc,
  afterImports,
  afterDocs,
  inserted: 0,
}, null, 2));
