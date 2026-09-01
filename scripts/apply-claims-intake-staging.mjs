/**
 * Apply customer intake tables + edge to Oren Car Staging ONLY.
 * node scripts/apply-claims-intake-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260901093000_claims_customer_intake.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-intake-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('intake sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-intake-apply');
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

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, apply: null, edge: null, verify: null };

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 1500) };
  dbQuery(writeTmp(`NOTIFY pgrst, 'reload schema';`));
  const deployOut = execSync(
    `npx --yes supabase functions deploy claims-intake --project-ref ${STAGING_REF} --use-api`,
    { encoding: 'utf8', stdio: 'pipe', timeout: 240000, cwd: ROOT },
  );
  if (String(deployOut).includes(PROD_REF)) throw new Error('deploy mentioned production');
  report.edge = { ok: true, output: String(deployOut).slice(0, 800) };
  const verify = dbQuery(writeTmp(`
    SELECT json_build_object(
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'claims', (SELECT count(*) FROM public.claims_records),
      'existing16', (SELECT count(*) FROM public.claims_records WHERE id LIKE 'DAL-2026-00%'),
      'intake_table', (SELECT to_regclass('public.claims_intake_links') IS NOT NULL),
      'anon_grant', (SELECT has_table_privilege('anon', 'public.claims_intake_links', 'SELECT')),
      'auth_grant', (SELECT has_table_privilege('authenticated', 'public.claims_intake_links', 'SELECT'))
    );
  `));
  writeFileSync(join(OUT, 'apply-verify.json'), verify, 'utf8');
  report.verify = { ok: true, output: String(verify).slice(0, 2500) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 1500) || null };
  if (!report.apply) report.apply = failed;
  else if (!report.edge) report.edge = failed;
  else report.verify = failed;
}
writeFileSync(join(OUT, 'apply-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.edge?.ok) process.exit(1);
