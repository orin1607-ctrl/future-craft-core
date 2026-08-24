/**
 * Backup + apply Dalia team chats to Oren Car Staging ONLY.
 * node scripts/apply-telemarketing-team-chats-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260824224500_telemarketing_team_chats_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-team-chats-staging-2026-08-24');

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
        'DROP TRIGGER IF EXISTS trg_telemarketing_team_chats_guard ON public.telemarketing_team_chats;',
        'DROP TRIGGER IF EXISTS trg_telemarketing_team_messages_guard ON public.telemarketing_team_messages;',
        'DROP FUNCTION IF EXISTS public.telemarketing_team_chat_guard();',
        'DROP FUNCTION IF EXISTS public.telemarketing_team_message_guard();',
        'DROP TABLE IF EXISTS public.telemarketing_team_chat_reads;',
        'DROP TABLE IF EXISTS public.telemarketing_team_messages;',
        'DROP TABLE IF EXISTS public.telemarketing_team_chats;',
      ],
    },
    null,
    2,
  ),
);

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-team-chats-staging');
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
      'tables', (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'telemarketing%'),
      'open_calls', (SELECT count(*) FROM public.telemarketing_calls WHERE status='in_progress'),
      'followups', (SELECT count(*) FROM public.telemarketing_followups)
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, linked };
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'chats', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='telemarketing_team_chats'),
      'messages', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='telemarketing_team_messages'),
      'reads', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='telemarketing_team_chat_reads'),
      'no_delete_chats', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_team_chats' AND cmd='DELETE'),
      'no_delete_messages', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_team_messages' AND cmd='DELETE'),
      'agent_cannot_update', EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename='telemarketing_team_chats' AND cmd='UPDATE'
          AND qual ILIKE '%super_admin%'
      )
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
