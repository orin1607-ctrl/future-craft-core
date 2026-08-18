/**
 * Re-drop C4 anon USING(true) policies that regressed on Staging.
 * RPCs already exist. No Production. No data deletes.
 * node scripts/reclose-c4-anon-policies-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';

function abortIfProduction(haystack, label) {
  const text = String(haystack || '');
  if (text.includes(PROD_REF) || text.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
  }
}

function dbQuery(sql) {
  abortIfProduction(sql, 'sql');
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-reclose-c4');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const sql = `
DROP POLICY IF EXISTS "Anonymous can view by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anonymous can update by token" ON public.driver_declarations;
SELECT tablename, policyname, roles::text, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('driver_declarations', 'driving_exams')
ORDER BY tablename, policyname;
`;
abortIfProduction(sql, 'migration');
const out = dbQuery(sql);
abortIfProduction(out, 'output');
console.log(out);
