/**
 * Apply Oren Car 7-tasks migration directly on Staging (idempotent).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'oren-car-seven-tasks-qa');
mkdirSync(OUT, { recursive: true });

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260804120000_oren_car_seven_tasks_staging.sql'),
  'utf8',
);

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return keys.find((k) => k.name === 'service_role')?.api_key;
}

async function main() {
  const service = getServiceKey();
  const url = `https://${STAGING_REF}.supabase.co`;
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));

  const report = { at: new Date().toISOString(), statements: [], ok: true };

  for (const stmt of statements) {
    if (!stmt.toUpperCase().startsWith('ALTER') && !stmt.toUpperCase().startsWith('COMMENT')) continue;
    const { error } = await admin.rpc('exec_sql', { query: stmt }).maybeSingle?.() ?? { error: { message: 'no rpc' } };
    // Fallback: verify via select after manual apply using REST isn't possible for DDL.
    report.statements.push({ preview: stmt.slice(0, 80), error: error?.message || null });
  }

  // Verify columns exist
  const verify = {};
  const { error: e1 } = await admin.from('drivers').select('department').limit(1);
  verify.drivers_department = !e1;
  const { error: e2 } = await admin.from('company_settings').select('custom_treatment_items, custom_inspection_checklist').limit(1);
  verify.company_lists = !e2;
  const { error: e3 } = await admin.from('document_metadata').select('display_name, document_date').limit(1);
  verify.document_metadata_fields = !e3;

  report.verify = verify;
  report.applied = Object.values(verify).every(Boolean);

  writeFileSync(join(OUT, 'migration-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.applied) {
    console.error('Migration verify failed — apply SQL manually in Supabase SQL editor');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
