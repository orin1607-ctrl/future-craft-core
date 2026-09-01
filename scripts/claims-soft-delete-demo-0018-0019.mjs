/**
 * Staging only. Soft-delete DAL-2026-0018 and DAL-2026-0019 via existing row_data.deletedAt.
 * node scripts/claims-soft-delete-demo-0018-0019.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ALLOWED = {
  'DAL-2026-0018': 'TEST-INTAKE לקוח',
  'DAL-2026-0019': 'TEST-INTAKE כפילות',
};
const PROTECTED = 'DAL-2026-0014';
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const count = async (table) => (await admin.from(table).select('id', { count: 'exact', head: true })).count;
const before = {
  claims: await count('claims_records'),
  docs: await count('claims_documents'),
  history: await count('claims_history'),
  vehicles: await count('vehicles'),
  accidents: await count('accidents'),
};

const { data: c14before } = await admin.from('claims_records').select('id, status, client_name, row_data').eq('id', PROTECTED).maybeSingle();
if (!c14before || String(c14before.client_name || '').includes('TEST-INTAKE')) {
  throw new Error('refused: 0014 missing or looks like TEST');
}

const nowIso = new Date().toISOString();
const nowHe = new Date().toLocaleString('he-IL');
const deleted = [];

for (const [id, expectedClient] of Object.entries(ALLOWED)) {
  const { data: row, error } = await admin.from('claims_records').select('id, status, client_name, row_data').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`missing ${id}`);
  const client = String(row.client_name || row.row_data?.clientName || '');
  if (client !== expectedClient) throw new Error(`refused ${id}: client "${client}" != "${expectedClient}"`);
  if (id === PROTECTED) throw new Error('refused: protected claim');
  const rd = { ...(row.row_data || {}), deletedAt: nowIso, treatmentPending: '', treatmentPendingAction: '' };
  const { error: upErr } = await admin.from('claims_records').update({ row_data: rd }).eq('id', id);
  if (upErr) throw upErr;
  await admin.from('claims_reminders').update({
    status: 'cancelled',
    next_run_at: null,
  }).eq('id', `NT-${id}`);
  const hid = `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await admin.from('claims_history').insert({
    id: hid,
    claim_id: id,
    row_data: {
      id: hid,
      claimId: id,
      action: 'תיק נמחק (soft delete)',
      note: 'לא נמחקו מסמכים/מיילים/היסטוריה · DEMO/TEST approved by owner',
      type: 'delete',
      at: nowHe,
      by: 'owner-approved-script',
    },
  });
  deleted.push({ id, client, status: row.status, deletedAt: nowIso });
}

const { data: allRows } = await admin.from('claims_records').select('id, client_name, status, row_data');
const visible = (allRows || []).filter((r) => !r.row_data?.deletedAt);
const hidden = (allRows || []).filter((r) => r.row_data?.deletedAt);
const { data: c14 } = await admin.from('claims_records').select('id, status, client_name, row_data').eq('id', PROTECTED).maybeSingle();
const after = {
  claims: await count('claims_records'),
  docs: await count('claims_documents'),
  history: await count('claims_history'),
  vehicles: await count('vehicles'),
  accidents: await count('accidents'),
};

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  productionSupabaseTouched: false,
  hardDelete: false,
  deleted,
  protected0014: {
    id: c14?.id,
    client: c14?.client_name,
    status: c14?.status,
    deletedAt: c14?.row_data?.deletedAt || '',
    intact: Boolean(c14) && !c14.row_data?.deletedAt && c14.client_name === c14before.client_name,
  },
  visibleCount: visible.length,
  hiddenIds: hidden.map((r) => r.id),
  visibleIds: visible.map((r) => r.id).sort(),
  demoStillVisible: visible.filter((r) => ['DAL-2026-0018', 'DAL-2026-0019'].includes(r.id)).map((r) => r.id),
  before,
  after,
};
const OUT = join(process.cwd(), 'docs/audit-reports/claims-demo-delete-2026-09-01');
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'delete-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.demoStillVisible.length) process.exit(1);
if (!report.protected0014.intact) process.exit(1);
if (after.vehicles !== 437 || after.accidents !== 11) process.exit(1);
if (after.claims !== before.claims) process.exit(1);
if (after.docs !== before.docs) process.exit(1);
