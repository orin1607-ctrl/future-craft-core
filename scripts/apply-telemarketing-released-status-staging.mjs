/**
 * Apply released-status + stuck-reset RPCs to Oren Car Staging ONLY.
 * node scripts/apply-telemarketing-released-status-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260830220000_telemarketing_released_status_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-stuck-reset-report-cap-2026-08-30');
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-released-status');
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
    snapshot: String(dbQueryText(`
      SELECT json_build_object(
        'call_status_check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid='public.telemarketing_calls'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%in_progress%' LIMIT 1),
        'work_status_check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid='public.telemarketing_work_sessions'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%in_progress%' LIMIT 1),
        'tair_open_calls', (SELECT coalesce(json_agg(row_to_json(c)), '[]'::json) FROM (
          SELECT id, employee_id, company_name, status, started_at, ended_at, duration_seconds, report_started_at, result
          FROM public.telemarketing_calls
          WHERE employee_id = '${TAIR}' AND status = 'in_progress'
        ) c),
        'completed_count', (SELECT count(*) FROM public.telemarketing_calls WHERE status='completed'),
        'in_progress_count', (SELECT count(*) FROM public.telemarketing_calls WHERE status='in_progress')
      );
    `)).slice(0, 8000),
  };
  writeFileSync(join(OUT, 'db-snapshot-before.json'), JSON.stringify(report.backup, null, 2), 'utf8');
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 2500) };
  report.verify = {
    ok: true,
    output: String(dbQueryText(`
      SELECT json_build_object(
        'call_check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid='public.telemarketing_calls'::regclass AND conname='telemarketing_calls_status_check'),
        'work_check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid='public.telemarketing_work_sessions'::regclass AND conname='telemarketing_work_sessions_status_check'),
        'preview_fn', (SELECT count(*) FROM pg_proc WHERE proname='telemarketing_preview_stuck_action'),
        'release_fn', (SELECT count(*) FROM pg_proc WHERE proname='telemarketing_release_stuck_action'),
        'void_fn', (SELECT count(*) FROM pg_proc WHERE proname='telemarketing_void_unstarted_call'),
        'guard_fn', (SELECT count(*) FROM pg_proc WHERE proname='telemarketing_status_release_guard'),
        'linked', '${linked}'
      );
    `)).slice(0, 4000),
  };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.backup) report.backup = failed;
  else if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-released-status.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
