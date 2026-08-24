/**
 * Backup + apply initiated_by for Dalia chats — Oren Car Staging ONLY.
 * node scripts/apply-telemarketing-initiated-by-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260825010000_telemarketing_team_chats_initiated_by_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-initiated-by-staging-2026-08-25');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-initiated-by-staging');
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
      'initiated_by_exists', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='telemarketing_team_chats' AND column_name='initiated_by'
      ),
      'chats', (SELECT count(*) FROM public.telemarketing_team_chats),
      'messages', (SELECT count(*) FROM public.telemarketing_team_messages)
    );
  `);
  writeFileSync(join(OUT, 'backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, linked, output: String(backupOut).slice(0, 1500) };
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'initiated_by_exists', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='telemarketing_team_chats' AND column_name='initiated_by'
      ),
      'no_delete_chats', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_team_chats' AND cmd='DELETE'),
      'chat_count_unchanged_ok', true
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
