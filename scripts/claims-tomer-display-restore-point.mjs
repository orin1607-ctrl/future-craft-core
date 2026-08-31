/**
 * Read-only restore snapshot for DAL-2026-0004 display work.
 * No mutations. Staging only.
 * node scripts/claims-tomer-display-restore-point.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const CLAIM_ID = 'DAL-2026-0004';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-tomer-display-2026-08-31');
mkdirSync(OUT, { recursive: true });

const keysJson = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keysJson.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { count: vehicles } = await db.from('vehicles').select('*', { count: 'exact', head: true });
const { count: accidents } = await db.from('accidents').select('*', { count: 'exact', head: true });
const { data: claim } = await db.from('claims_records').select('id, client_name, plate, status, row_data').eq('id', CLAIM_ID).maybeSingle();
const { data: imports } = await db.from('claims_gmail_imports').select('id, gmail_message_id, gmail_thread_id, from_addr, subject, sent_at').eq('claim_id', CLAIM_ID);
const { data: docs } = await db.from('claims_documents').select('id, original_name, doc_kind, source, gmail_message_id, content_sha256, storage_path').eq('claim_id', CLAIM_ID);
const { data: otherDocs } = await db.from('claims_documents').select('claim_id').neq('claim_id', CLAIM_ID);
const { data: otherImps } = await db.from('claims_gmail_imports').select('claim_id').neq('claim_id', CLAIM_ID);
const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const byKind = {};
for (const d of docs || []) byKind[d.doc_kind || 'unset'] = (byKind[d.doc_kind || 'unset'] || 0) + 1;
const row = claim?.row_data && typeof claim.row_data === 'object' ? claim.row_data : {};
const out = {
  at: new Date().toISOString(),
  purpose: 'restore-point-before-tomer-display',
  stagingRef: STAGING_REF,
  productionRefUntouched: PROD_REF,
  gitHead,
  vehicles,
  accidents,
  claim: {
    id: claim?.id,
    client_name: claim?.client_name,
    plate: claim?.plate,
    status: claim?.status,
    claimNum: row.claimNum || null,
    eventDate: row.eventDate || null,
  },
  imports: (imports || []).length,
  importIds: (imports || []).map((r) => r.id).sort(),
  documents: (docs || []).length,
  documentIds: (docs || []).map((d) => d.id).sort(),
  byKind,
  otherClaimDocuments: (otherDocs || []).length,
  otherClaimImports: (otherImps || []).length,
  mutated: false,
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  gitHead,
  imports: out.imports,
  documents: out.documents,
  byKind,
  vehicles,
  accidents,
  otherClaimDocuments: out.otherClaimDocuments,
  otherClaimImports: out.otherClaimImports,
  claimNum: out.claim.claimNum,
  eventDate: out.claim.eventDate,
}, null, 2));
