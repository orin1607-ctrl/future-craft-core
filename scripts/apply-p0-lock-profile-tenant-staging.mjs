/**
 * Apply P0-B/C profile tenant lock. Staging only.
 * node scripts/apply-p0-lock-profile-tenant-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260818222000_p0_lock_profile_tenant_fields.sql');

function abortIfProduction(haystack, label) {
  const text = String(haystack || '');
  if (text.includes(PROD_REF) || text.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
  }
}

function dbQuery(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-p0-profile-lock');
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

function main() {
  if (!existsSync(MIGRATION)) throw new Error('migration missing');
  const sql = readFileSync(MIGRATION, 'utf8');
  abortIfProduction(sql, 'migration');
  const out = dbQuery(sql);
  const trg = dbQuery(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_lock_profile_tenant_fields';
  `);
  console.log(JSON.stringify({ ok: true, apply: String(out).slice(0, 300), trigger: String(trg).slice(0, 800) }, null, 2));
}

main();
