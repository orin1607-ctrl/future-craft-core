/**
 * Apply incoming Gmail pending table + claims-gmail edge to Oren Car Staging ONLY.
 * node scripts/apply-claims-incoming-gmail-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260901120000_claims_gmail_pending.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-incoming-gmail-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('pending sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-incoming-gmail-apply');
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
  hostingerTouched: false,
  oauthChanged: false,
  schedulerAdded: false,
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
  if (linked === PROD_REF) throw new Error('refused: production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
  report.apply = { ok: true, linked, output: String(dbQuery(SQL)).slice(0, 1500) };
  dbQuery(writeTmp(`NOTIFY pgrst, 'reload schema';`));
  const deployOut = execSync(
    `npx --yes supabase functions deploy claims-gmail --project-ref ${STAGING_REF} --use-api`,
    { encoding: 'utf8', stdio: 'pipe', timeout: 240000, cwd: ROOT },
  );
  if (String(deployOut).includes(PROD_REF)) throw new Error('deploy mentioned production');
  report.edge = { ok: true, output: String(deployOut).slice(0, 1200), projectRef: STAGING_REF };
  const verify = dbQuery(writeTmp(`
    SELECT json_build_object(
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'claims', (SELECT count(*) FROM public.claims_records),
      'docs', (SELECT count(*) FROM public.claims_documents),
      'imports', (SELECT count(*) FROM public.claims_gmail_imports),
      'pending_table', (SELECT to_regclass('public.claims_gmail_pending') IS NOT NULL),
      'bucket_public', (SELECT public FROM storage.buckets WHERE id='claims-docs'),
      'real0002_0017', (SELECT count(*) FROM public.claims_records WHERE id BETWEEN 'DAL-2026-0002' AND 'DAL-2026-0017')
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
