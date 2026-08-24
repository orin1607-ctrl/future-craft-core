/**
 * Backup + apply telemarketing schema to Oren Car Staging ONLY.
 * Never targets Production qasomfndnjuixgjmjwcm.
 * node scripts/apply-telemarketing-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const ENUM_SQL = join(ROOT, 'supabase/migrations/20260824180000_telemarketing_agent_role_staging.sql');
const TABLES_SQL = join(ROOT, 'supabase/migrations/20260824180100_telemarketing_tables_rls_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-staging-2026-08-24');

mkdirSync(OUT, { recursive: true });
if (!existsSync(ENUM_SQL) || !existsSync(TABLES_SQL)) throw new Error('migration sql missing');

const restorePoint = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionRef: PROD_REF,
  productionTouched: false,
  rollback: [
    'DROP TABLE IF EXISTS public.telemarketing_followups CASCADE;',
    'DROP TABLE IF EXISTS public.telemarketing_calls CASCADE;',
    'DROP TABLE IF EXISTS public.telemarketing_settings CASCADE;',
    'NOTE: app_role value telemarketing_agent cannot be dropped in PostgreSQL.',
  ],
  note: 'Rollback drops only new telemarketing_* objects. Does not touch customers, users, or Production.',
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(restorePoint, null, 2));

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}

function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  backup: null,
  applyEnum: null,
  applyTables: null,
  verify: null,
};

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

  const backupOut = dbQueryText(`
    SELECT json_build_object(
      'app_role_values', (SELECT coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
        FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role'),
      'telemarketing_tables', (SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)
        FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'telemarketing%'),
      'customers_count', (SELECT count(*) FROM public.customers),
      'profiles_count', (SELECT count(*) FROM public.profiles)
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, output: String(backupOut).slice(0, 2000), linked };

  report.applyEnum = { ok: true, output: String(dbQuery(ENUM_SQL)).slice(0, 1500) };
  report.applyTables = { ok: true, output: String(dbQuery(TABLES_SQL)).slice(0, 1500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'has_role', EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'telemarketing_agent'),
      'tables', (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'telemarketing%'),
      'rls_calls', (SELECT relrowsecurity FROM pg_class WHERE relname = 'telemarketing_calls'),
      'settings_keys', (SELECT json_agg(key ORDER BY key) FROM public.telemarketing_settings)
    );
  `);
  report.verify = { ok: true, output: String(verifyOut).slice(0, 2000) };
} catch (e) {
  const failed = {
    ok: false,
    error: String(e.message || e).slice(0, 2000),
    stderr: e.stderr?.toString?.()?.slice(0, 2000) || null,
  };
  if (!report.backup) report.backup = failed;
  else if (!report.applyEnum) report.applyEnum = failed;
  else if (!report.applyTables) report.applyTables = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.applyEnum?.ok || !report.applyTables?.ok) process.exit(1);
