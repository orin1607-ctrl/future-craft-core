/**
 * Backup + apply lead assignment extension to Oren Car Staging ONLY.
 * node scripts/apply-telemarketing-lead-assign-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260826140000_telemarketing_lead_assign_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-lead-assign-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-lead-assign-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}
function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, backup: null, apply: null, verify: null };

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

  const backupOut = dbQueryText(`
    SELECT json_build_object(
      'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
      'lead_numbers', (SELECT json_agg(lead_number ORDER BY CASE WHEN lead_number ~ '^[0-9]+$' THEN lead_number::int END, created_at) FROM public.telemarketing_lead_directory),
      'import_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_commit_lead_import'),
      'assign_rpc_before', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_assign_leads'),
      'no_delete_directory', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_lead_directory' AND cmd='DELETE')
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, linked };

  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 2500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
      'assigned_col', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemarketing_lead_directory' AND column_name='assigned_to'),
      'claimed_col', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemarketing_lead_directory' AND column_name='claimed_by'),
      'events', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='telemarketing_lead_assignment_events'),
      'assign_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_assign_leads'),
      'claim_next_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_claim_next_lead'),
      'claim_lead_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_claim_lead'),
      'import_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_commit_lead_import'),
      'no_delete_directory', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_lead_directory' AND cmd='DELETE'),
      'no_delete_events', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_lead_assignment_events' AND cmd='DELETE'),
      'no_update_policy_directory', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_lead_directory' AND cmd='UPDATE'),
      'agents', (
        SELECT json_agg(json_build_object('id', p.id, 'name', p.full_name, 'email', u.email, 'active', p.is_active) ORDER BY p.full_name)
        FROM public.user_roles r
        JOIN public.profiles p ON p.id = r.user_id
        JOIN auth.users u ON u.id = p.id
        WHERE r.role = 'telemarketing_agent'
      )
    );
  `);
  writeFileSync(join(OUT, 'verify.json'), verifyOut, 'utf8');
  report.verify = { ok: true, output: String(verifyOut).slice(0, 4000) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.backup) report.backup = failed;
  else if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
