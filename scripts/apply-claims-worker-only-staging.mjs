/**
 * Apply claims worker_only column to Staging. No Production. No app_role change.
 * node scripts/apply-claims-worker-only-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260901210000_claims_worker_only.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-worker-create-user-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-worker-only');
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

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const before = dbQueryText(`
  SELECT json_build_object(
    'vehicles', (SELECT count(*) FROM public.vehicles),
    'accidents', (SELECT count(*) FROM public.accidents),
    'app_role', (SELECT coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
      FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role'),
    'worker_col', (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='claims_access' AND column_name='worker_only')
  );
`);
writeFileSync(join(OUT, 'before.json'), before, 'utf8');
dbQuery(SQL);
const after = dbQueryText(`
  SELECT json_build_object(
    'vehicles', (SELECT count(*) FROM public.vehicles),
    'accidents', (SELECT count(*) FROM public.accidents),
    'app_role', (SELECT coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
      FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role'),
    'worker_col', (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='claims_access' AND column_name='worker_only'),
    'fn_args', (SELECT pronargs FROM pg_proc WHERE proname='claims_set_access' LIMIT 1)
  );
`);
writeFileSync(join(OUT, 'after.json'), after, 'utf8');

const deployOut = execSync(
  `npx --yes supabase functions deploy create-admin-user --project-ref ${STAGING_REF} --use-api`,
  { encoding: 'utf8', stdio: 'pipe', timeout: 180000, cwd: ROOT },
);
writeFileSync(join(OUT, 'function-deploy.txt'), deployOut, 'utf8');
writeFileSync(
  join(OUT, 'apply-result.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      staging: STAGING_REF,
      productionTouched: false,
      hostingerTouched: false,
      appRoleChanged: false,
      linked,
      after: after.slice(0, 2000),
      functionDeployed: 'create-admin-user',
    },
    null,
    2,
  ),
  'utf8',
);
console.log(after);
console.log('function deploy ok');
if (!after.includes('worker_col')) console.log('check after.json');
