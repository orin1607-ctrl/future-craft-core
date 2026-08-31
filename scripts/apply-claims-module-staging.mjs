/**
 * Backup + apply claims module schema to Oren Car Staging ONLY.
 * Never targets Production qasomfndnjuixgjmjwcm.
 * node scripts/apply-claims-module-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260831140000_claims_module_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-module-staging-2026-08-31');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('claims migration sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-staging');
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
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  backup: null,
  apply: null,
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
      'claims_tables_before', (SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)
        FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'claims%'),
      'vehicles_count', (SELECT count(*) FROM public.vehicles),
      'profiles_count', (SELECT count(*) FROM public.profiles),
      'accidents_count', (SELECT count(*) FROM public.accidents),
      'telemarketing_tables', (SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)
        FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'telemarketing%')
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, output: String(backupOut).slice(0, 4000), linked };

  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 2000) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'tables', (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'claims%'),
      'rls_records', (SELECT relrowsecurity FROM pg_class WHERE relname = 'claims_records'),
      'rls_access', (SELECT relrowsecurity FROM pg_class WHERE relname = 'claims_access'),
      'fn_can_access', (SELECT count(*) FROM pg_proc WHERE proname = 'claims_can_access'),
      'fn_search_vehicles', (SELECT count(*) FROM pg_proc WHERE proname = 'claims_search_vehicles'),
      'vehicles_count_after', (SELECT count(*) FROM public.vehicles),
      'accidents_count_after', (SELECT count(*) FROM public.accidents)
    );
  `);
  writeFileSync(join(OUT, 'verify.json'), verifyOut, 'utf8');
  report.verify = { ok: true, output: String(verifyOut).slice(0, 3000) };
} catch (e) {
  const failed = {
    ok: false,
    error: String(e.message || e).slice(0, 2000),
    stderr: e.stderr?.toString?.()?.slice(0, 2000) || null,
  };
  if (!report.backup) report.backup = failed;
  else if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
