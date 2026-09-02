/**
 * Mark historical import claims as docsOrderStatus=needs_sort.
 * Staging only. Does NOT touch documents, history, Gmail, or TEST files.
 * Identification: empty source + original 2026-08-31 import batch (DAL-2026-0002..0017).
 * node scripts/claims-mark-legacy-docs-order.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-work-center-2026-09-02');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: rows } = await admin.from('claims_records').select('id, row_data, created_by_name, created_at');
const marked = [];
const skipped = [];
for (const r of rows || []) {
  const rd = r.row_data && typeof r.row_data === 'object' ? { ...r.row_data } : {};
  const source = String(rd.source || '');
  const already = String(rd.docsOrderStatus || '');
  const isImportBatch = /^DAL-2026-00(0[2-9]|1[0-7])$/.test(r.id) && !source;
  const isTest = source === 'Customer Accident Intake' || source === 'create-user-claims-worker' || String(rd.deletedAt || '') || rd.clientName?.startsWith?.('TEST');
  if (already) {
    skipped.push({ id: r.id, reason: 'already_set', status: already });
    continue;
  }
  if (isTest || !isImportBatch) {
    skipped.push({ id: r.id, reason: isTest ? 'test_or_new' : 'not_import_batch', source });
    continue;
  }
  rd.docsOrderStatus = 'needs_sort';
  const { error } = await admin.from('claims_records').update({ row_data: rd }).eq('id', r.id);
  if (error) skipped.push({ id: r.id, reason: error.message });
  else marked.push(r.id);
}

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  documentsMutated: false,
  historyMutated: false,
  gmailMutated: false,
  marked,
  skipped,
};
writeFileSync(join(OUT, 'LEGACY-DOCS-ORDER-MARK.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
