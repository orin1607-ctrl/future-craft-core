/**
 * Apply archive/manual-lead RPCs to Staging ONLY.
 * node scripts/apply-telemarketing-lead-archive-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const SQL = join(process.cwd(), 'supabase/migrations/20260826180000_telemarketing_lead_archive_manual_staging.sql');
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-qa-cleanup-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration missing');
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-archive-apply');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
const out = dbQuery(SQL);
writeFileSync(join(OUT, 'archive-apply.json'), out, 'utf8');
console.log('archive-apply-ok', String(out).slice(0, 400));
