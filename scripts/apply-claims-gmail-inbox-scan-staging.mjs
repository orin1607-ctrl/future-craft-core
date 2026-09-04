/**
 * Apply 3-day Gmail inbox scan tick to Oren Car Staging ONLY.
 * Extends existing claims_mail_dispatch_now. Never Production. Never live send.
 * node scripts/apply-claims-gmail-inbox-scan-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-eli-gmail-scan-2026-09-04');
mkdirSync(OUT, { recursive: true });

const SQL = join(ROOT, 'supabase/migrations/20260904180000_claims_gmail_inbox_scan_tick.sql');
if (!existsSync(SQL)) throw new Error('missing scan tick migration');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-gmail-scan-tick');
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

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  oauthStarted: false,
  realEmailSend: false,
  newSecretCreated: false,
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

  const sqlText = readFileSync(SQL, 'utf8');
  if (sqlText.includes(PROD_REF) && sqlText.includes('functions/v1')) {
    throw new Error('refused: production function url in sql');
  }
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };
  dbQueryText(`NOTIFY pgrst, 'reload schema';`);

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'),
      'fn_tick', (SELECT count(*) FROM pg_proc WHERE proname='claims_gmail_inbox_scan_tick'),
      'fn_dispatch', (SELECT count(*) FROM pg_proc WHERE proname='claims_mail_dispatch_now'),
      'cron', (SELECT json_agg(json_build_object('jobname', jobname, 'schedule', schedule, 'command', left(command, 120)))
        FROM cron.job WHERE jobname = 'claims-mail-dispatch-staging'),
      'pg_net', (SELECT count(*) FROM pg_extension WHERE extname='pg_net')
    );
  `);
  writeFileSync(join(OUT, 'apply-verify.json'), verifyOut, 'utf8');
  report.verify = { ok: true, output: String(verifyOut).slice(0, 2500) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
