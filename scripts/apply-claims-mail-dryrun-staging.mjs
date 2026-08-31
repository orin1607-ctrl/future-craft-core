/**
 * Apply claims mail follow-up Dry Run to Oren Car Staging ONLY.
 * Never Production. Never OAuth. Never real Gmail send.
 * node scripts/apply-claims-mail-dryrun-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-mail-dryrun-staging-2026-08-31');
mkdirSync(OUT, { recursive: true });

const SQL_FILES = [
  'supabase/migrations/20260831170000_claims_mail_followup_dryrun.sql',
  'supabase/migrations/20260831170001_claims_mail_followup_rpcs.sql',
  'supabase/migrations/20260831170002_claims_mail_dispatch_dryrun.sql',
].map((p) => join(ROOT, p));

for (const f of SQL_FILES) {
  if (!existsSync(f)) throw new Error(`missing ${f}`);
}

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-mail-dryrun');
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

function extract(raw) {
  const parsed = JSON.parse(String(raw));
  return parsed.rows?.[0]?.json_build_object || parsed.rows?.[0] || parsed;
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  documentRequestsTouched: false,
  oauthStarted: false,
  realEmailSend: false,
  gmailMailboxTouched: false,
  backup: null,
  apply: [],
  cron: null,
  edge: null,
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
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'profiles', (SELECT count(*) FROM public.profiles),
      'claims_records', (SELECT count(*) FROM public.claims_records),
      'document_requests', (SELECT count(*) FROM public.document_requests),
      'mail_jobs_exists', (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='claims_mail_jobs'),
      'dispatch_mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'),
      'app_role', (SELECT coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
        FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role')
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, linked };

  for (const f of SQL_FILES) {
    report.apply.push({ file: f.split(/[/\\]/).pop(), ok: true, output: String(dbQuery(f)).slice(0, 1500) });
  }

  dbQueryText(`NOTIFY pgrst, 'reload schema';`);

  try {
    const ext = dbQueryText(`SELECT json_build_object('pg_cron', (SELECT count(*) FROM pg_extension WHERE extname='pg_cron'));`);
    const extObj = extract(ext);
    const hasCron = Number(extObj.pg_cron) >= 1;
    if (!hasCron) {
      report.cron = { ok: false, skipped: true, reason: 'pg_cron extension not present — Edge/SQL dispatch still available' };
    } else {
      dbQueryText(`
DO $$
BEGIN
  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'claims-mail-dispatch-staging';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
      `);
      const scheduled = dbQueryText(`
        SELECT cron.schedule(
          'claims-mail-dispatch-staging',
          '*/5 * * * *',
          $$SELECT public.claims_mail_dispatch_now()$$
        );
      `);
      const jobs = dbQueryText(`
        SELECT json_agg(json_build_object('jobname', jobname, 'schedule', schedule, 'command', command))
        FROM cron.job WHERE jobname = 'claims-mail-dispatch-staging';
      `);
      const cmd = String(jobs);
      if (cmd.includes(PROD_REF) || cmd.toLowerCase().includes('gmail') || cmd.includes('Bearer')) {
        throw new Error('cron command looks unsafe');
      }
      report.cron = { ok: true, scheduled: String(scheduled).slice(0, 400), jobs: String(jobs).slice(0, 1200) };
    }
  } catch (e) {
    report.cron = { ok: false, error: String(e.message || e).slice(0, 1500), stderr: e.stderr?.toString?.()?.slice(0, 800) || null };
  }

  try {
    const deployOut = execSync(
      `npx --yes supabase functions deploy claims-mail-dispatch --project-ref ${STAGING_REF} --use-api`,
      { encoding: 'utf8', stdio: 'pipe', timeout: 180000, cwd: ROOT },
    );
    if (String(deployOut).includes(PROD_REF)) throw new Error('deploy mentioned production');
    report.edge = { ok: true, output: String(deployOut).slice(0, 1500), projectRef: STAGING_REF };
  } catch (e) {
    report.edge = { ok: false, error: String(e.message || e).slice(0, 1500), stderr: e.stderr?.toString?.()?.slice(0, 1200) || null };
  }

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'),
      'mail_jobs', (SELECT to_regclass('public.claims_mail_jobs') IS NOT NULL),
      'fn_upsert', (SELECT count(*) FROM pg_proc WHERE proname='claims_upsert_mail_followup'),
      'fn_cancel', (SELECT count(*) FROM pg_proc WHERE proname='claims_cancel_mail_followup'),
      'fn_dispatch', (SELECT count(*) FROM pg_proc WHERE proname='claims_mail_dispatch_now'),
      'reminder_cols', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='claims_reminders' AND column_name IN ('action','mail_to','mail_kind','next_run_at')),
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'document_requests', (SELECT count(*) FROM public.document_requests)
    );
  `);
  writeFileSync(join(OUT, 'verify.json'), verifyOut, 'utf8');
  report.verify = { ok: true, output: String(verifyOut).slice(0, 3000) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.backup) report.backup = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
const applyOk = report.apply.length === SQL_FILES.length && report.apply.every((x) => x.ok);
if (!report.backup?.ok || !applyOk || !report.verify?.ok) process.exit(1);
