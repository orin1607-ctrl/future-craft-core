/**
 * Apply report/treatment timestamps to Oren Car Staging ONLY.
 * node scripts/apply-telemarketing-treatment-timing-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260826210000_telemarketing_treatment_timing_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-treatment-timing-2026-08-26');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-treatment-timing');
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

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, backup: null, apply: null, verify: null };

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

  report.backup = {
    ok: true,
    linked,
    columnsBefore: String(dbQueryText(`
      SELECT json_agg(column_name ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='telemarketing_calls'
        AND column_name IN ('report_started_at','report_ended_at','report_duration_seconds','treated_ended_at','treatment_duration_seconds');
    `)).slice(0, 1500),
  };
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };
  report.verify = {
    ok: true,
    output: String(dbQueryText(`
      SELECT json_build_object(
        'call_cols', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='telemarketing_calls'
            AND column_name IN ('report_started_at','report_ended_at','report_duration_seconds','treated_ended_at','treatment_duration_seconds')),
        'work_cols', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='telemarketing_work_sessions'
            AND column_name IN ('report_started_at','report_ended_at','report_duration_seconds','treated_ended_at','treatment_duration_seconds')),
        'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
        'rls_calls', (SELECT relrowsecurity FROM pg_class WHERE relname='telemarketing_calls')
      );
    `)).slice(0, 2500),
  };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.backup) report.backup = failed;
  else if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-timing.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
