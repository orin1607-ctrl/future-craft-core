/**
 * DEMO/TEST inventory only. Does NOT delete.
 * node scripts/claims-treatment-ops-demo-inventory.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-treatment-ops-2026-09-01');
mkdirSync(OUT, { recursive: true });
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const TEST_RE = /test|demo|בדיקה|dummy|fake|qa[\s_-]|intake/i;
const { data: rows } = await admin.from('claims_records')
  .select('id, plate, client_name, status, company_name, created_at, row_data, gmail_message_id');

const items = [];
for (const r of rows || []) {
  const rd = r.row_data && typeof r.row_data === 'object' ? r.row_data : {};
  const client = String(r.client_name || rd.clientName || '');
  const source = String(rd.source || '');
  const blob = `${r.id} ${client} ${source} ${r.plate || ''} ${rd.claimNum || ''}`;
  const reasons = [];
  if (TEST_RE.test(client)) reasons.push(`client_name matches TEST/DEMO pattern: ${client}`);
  if (TEST_RE.test(source) && TEST_RE.test(client)) reasons.push(`source=${source}`);
  if (String(r.id).includes('TEST')) reasons.push('id contains TEST');
  const certain = reasons.length > 0 && !/מנחם|ביטוח ישיר/i.test(client);
  const docs = (await admin.from('claims_documents').select('id', { count: 'exact', head: true }).eq('claim_id', r.id)).count;
  const hist = (await admin.from('claims_history').select('id', { count: 'exact', head: true }).eq('claim_id', r.id)).count;
  items.push({
    id: r.id,
    client,
    plate: r.plate || rd.plate || '',
    status: r.status,
    source,
    created_at: r.created_at,
    docs,
    history: hist,
    proposedDelete: certain,
    reasons: certain ? reasons : ['not proposed — real or uncertain'],
  });
}

const proposed = items.filter((x) => x.proposedDelete);
const keep = items.filter((x) => !x.proposedDelete);
const report = {
  at: new Date().toISOString(),
  deleted: false,
  note: 'Inventory only. No rows deleted. Owner must approve before any DEMO/TEST removal.',
  proposedDeleteCount: proposed.length,
  keepCount: keep.length,
  proposed,
  keep,
};
writeFileSync(join(OUT, 'demo-test-inventory.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ proposedDeleteCount: proposed.length, proposed: proposed.map((p) => ({ id: p.id, client: p.client, reasons: p.reasons })), keep: keep.map((k) => ({ id: k.id, client: k.client })) }, null, 2));
