/**
 * Backup + apply telemarketing recordings storage to Oren Car Staging ONLY.
 * Never targets Production qasomfndnjuixgjmjwcm.
 * node scripts/apply-telemarketing-recordings-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260824190000_telemarketing_recordings_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-recordings-staging-2026-08-24');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');

writeFileSync(
  join(OUT, 'RESTORE-POINT.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      environment: 'oren-car-staging',
      stagingRef: STAGING_REF,
      productionRef: PROD_REF,
      productionTouched: false,
      rollback: [
        'DROP POLICY IF EXISTS telemarketing_recordings_select ON storage.objects;',
        'DROP POLICY IF EXISTS telemarketing_recordings_insert ON storage.objects;',
        "DELETE FROM storage.objects WHERE bucket_id = 'telemarketing-recordings';",
        "DELETE FROM storage.buckets WHERE id = 'telemarketing-recordings';",
        'ALTER TABLE public.telemarketing_calls DROP COLUMN IF EXISTS recording_path, DROP COLUMN IF EXISTS recording_status, DROP COLUMN IF EXISTS recording_mime;',
      ],
      note: 'Does not drop telemarketing_calls / followups / settings. Does not touch Production.',
    },
    null,
    2,
  ),
);

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-recordings-staging');
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
      'linked', '${STAGING_REF}',
      'buckets', (
        SELECT coalesce(json_agg(json_build_object('id', id, 'public', public) ORDER BY id), '[]'::json)
        FROM storage.buckets
      ),
      'telemarketing_calls_cols', (
        SELECT coalesce(json_agg(column_name ORDER BY ordinal_position), '[]'::json)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'telemarketing_calls'
      ),
      'storage_object_policies', (
        SELECT coalesce(json_agg(policyname ORDER BY policyname), '[]'::json)
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
      ),
      'calls_count', (SELECT count(*) FROM public.telemarketing_calls)
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, output: String(backupOut).slice(0, 2500), linked };

  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'bucket_id', (SELECT id FROM storage.buckets WHERE id = 'telemarketing-recordings'),
      'bucket_public', (SELECT public FROM storage.buckets WHERE id = 'telemarketing-recordings'),
      'recording_cols', (
        SELECT json_agg(column_name ORDER BY column_name)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'telemarketing_calls' AND column_name LIKE 'recording%'
      ),
      'policies', (
        SELECT json_agg(json_build_object('name', policyname, 'cmd', cmd, 'roles', roles) ORDER BY policyname)
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'telemarketing_recordings%'
      ),
      'anon_tm_policies', (
        SELECT coalesce(json_agg(policyname), '[]'::json)
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname LIKE 'telemarketing_recordings%'
          AND 'anon' = ANY (roles)
      )
    );
  `);
  report.verify = { ok: true, output: String(verifyOut).slice(0, 2500) };
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
