/**
 * Apply claims Gmail OAuth/import schema to Oren Car Staging ONLY.
 * node scripts/apply-claims-gmail-oauth-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260831180000_claims_gmail_oauth_import.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-gmail-oauth-staging-2026-08-31');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('gmail oauth sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-gmail-oauth');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function writeTmp(sql) {
  const p = join(tmpWork, 'q.sql');
  writeFileSync(p, sql, 'utf8');
  return p;
}
function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  realEmailSend: false,
  backup: null,
  apply: null,
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
  report.backup = { ok: true, linked };
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };
  dbQuery(writeTmp(`NOTIFY pgrst, 'reload schema';`));

  try {
    const deployParts = [];
    for (const fn of ['claims-gmail', 'claims-docs']) {
      const deployOut = execSync(
        `npx --yes supabase functions deploy ${fn} --project-ref ${STAGING_REF} --use-api`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 240000, cwd: ROOT },
      );
      if (String(deployOut).includes(PROD_REF)) throw new Error('deploy mentioned production');
      deployParts.push(String(deployOut).slice(0, 600));
    }
    report.edge = { ok: true, output: deployParts.join('\n---\n'), projectRef: STAGING_REF };
  } catch (e) {
    report.edge = { ok: false, error: String(e.message || e).slice(0, 1500), stderr: e.stderr?.toString?.()?.slice(0, 800) || null };
  }

  const verify = dbQuery(writeTmp(`
    SELECT json_build_object(
      'send_enabled', (SELECT value FROM public.claims_config WHERE key='GMAIL_SEND_ENABLED'),
      'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE'),
      'account', (SELECT value FROM public.claims_config WHERE key='GMAIL_ALLOWED_ACCOUNT'),
      'conn_table', (SELECT to_regclass('public.claims_gmail_connection') IS NOT NULL),
      'imports', (SELECT to_regclass('public.claims_gmail_imports') IS NOT NULL),
      'conn_grant_auth', (SELECT has_table_privilege('authenticated', 'public.claims_gmail_connection', 'SELECT')),
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'document_requests', (SELECT count(*) FROM public.document_requests)
    );
  `));
  writeFileSync(join(OUT, 'verify.json'), verify, 'utf8');
  report.verify = { ok: true, output: String(verify).slice(0, 2500) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 1500) || null };
  if (!report.backup) report.backup = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.backup?.ok || !report.apply?.ok || !report.verify?.ok) process.exit(1);
