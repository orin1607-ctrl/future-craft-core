/**
 * Backup + apply follow-up link columns to Oren Car Staging ONLY.
 * node scripts/apply-telemarketing-followup-links-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260824220000_telemarketing_followup_links_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-followup-staging-2026-08-24');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');

writeFileSync(
  join(OUT, 'RESTORE-POINT.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      environment: 'oren-car-staging',
      stagingRef: STAGING_REF,
      productionTouched: false,
      rollback: [
        'DROP POLICY IF EXISTS telemarketing_followups_update_agent ON public.telemarketing_followups;',
        'ALTER TABLE public.telemarketing_calls DROP COLUMN IF EXISTS source_followup_id;',
        'ALTER TABLE public.telemarketing_followups DROP COLUMN IF EXISTS closed_by_call_id;',
      ],
    },
    null,
    2,
  ),
);

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-followup-staging');
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

  const backupOut = dbQueryText(`
    SELECT json_build_object(
      'calls_cols', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='telemarketing_calls'),
      'fu_cols', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='telemarketing_followups'),
      'fu_policies', (SELECT json_agg(policyname ORDER BY policyname) FROM pg_policies WHERE tablename='telemarketing_followups'),
      'followups_count', (SELECT count(*) FROM public.telemarketing_followups),
      'calls_count', (SELECT count(*) FROM public.telemarketing_calls)
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, output: String(backupOut).slice(0, 2500), linked };
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'source_followup_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemarketing_calls' AND column_name='source_followup_id'),
      'closed_by_call_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemarketing_followups' AND column_name='closed_by_call_id'),
      'agent_update_policy', EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_followups' AND policyname='telemarketing_followups_update_agent'),
      'no_delete_policy', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_followups' AND cmd='DELETE')
    );
  `);
  report.verify = { ok: true, output: String(verifyOut).slice(0, 2000) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.backup) report.backup = failed;
  else if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
