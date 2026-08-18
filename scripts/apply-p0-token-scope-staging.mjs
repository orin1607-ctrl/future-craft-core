/**
 * Apply P0-F token-scoped declaration/exam RPCs. Staging only.
 * node scripts/apply-p0-token-scope-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const MIGRATION = join(ROOT, 'supabase/migrations/20260818221000_p0_token_scope_declarations_exams.sql');

function abortIfProduction(haystack, label) {
  const text = String(haystack || '');
  if (text.includes(PROD_REF) || text.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production. No Production changes.`);
  }
}

function dbQuery(sql) {
  abortIfProduction(sql, 'sql');
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-p0-token-staging');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  abortIfProduction(out, 'db query output');
  return out;
}

function main() {
  if (!existsSync(MIGRATION)) throw new Error('migration missing');
  const sql = readFileSync(MIGRATION, 'utf8');
  abortIfProduction(sql, 'migration');
  const out = dbQuery(sql);
  const policies = dbQuery(`
    SELECT tablename, policyname, roles::text, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('driver_declarations', 'driving_exams')
    ORDER BY tablename, policyname;
  `);
  console.log(JSON.stringify({
    ok: true,
    applyOutput: String(out).slice(0, 400),
    policies: String(policies).slice(0, 4000),
  }, null, 2));
}

main();
