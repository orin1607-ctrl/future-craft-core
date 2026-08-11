/**
 * Apply driver card Option B migration on Staging only.
 * node scripts/apply-driver-card-migration-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const ROOT = process.cwd();
const MIGRATION = join(ROOT, 'supabase/migrations/20260811180000_driver_card_option_b_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/oren-car-driver-card-expansion');

mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), staging: STAGING_REF, apply: null, verify: null };

writeFileSync(join(OUT, 'migration-sql-exact.sql'), readFileSync(MIGRATION, 'utf8'), 'utf8');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-driver-card-mig');
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
writeFileSync(join(tmpWork, 'supabase', 'migrations', '20260811180000_driver_card_option_b_staging.sql'), readFileSync(MIGRATION, 'utf8'), 'utf8');

try {
  execSync(`supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
  const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${MIGRATION}"`, { encoding: 'utf8', stdio: 'pipe' });
  report.apply = { ok: true, output: out.slice(0, 800) };
} catch (e) {
  report.apply = { ok: false, error: String(e.message || e), stderr: e.stderr?.toString?.()?.slice(0, 800) };
}

const { data: verify, error: verErr } = await db
  .from('document_type_defs')
  .select('key, validity_years, label_he')
  .in('key', ['traffic_info', 'traffic_ticket', 'health_declaration']);

report.verify = { rows: verify, error: verErr?.message || null };
writeFileSync(join(OUT, 'migration-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok) process.exit(1);
