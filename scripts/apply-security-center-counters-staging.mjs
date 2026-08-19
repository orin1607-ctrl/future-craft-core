/**
 * Apply counter/action SQL to Oren Car Staging ONLY. No seed. No Production.
 * node scripts/apply-security-center-counters-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const SQL = join(process.cwd(), 'supabase/migrations/20260819180000_security_center_counters_actions_staging.sql');
const OUT = join(process.cwd(), 'docs/audit-reports/security-identity-mobile-oren-car');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-security-counters-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, apply: null };
try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${SQL}"`, {
    encoding: 'utf8', stdio: 'pipe', timeout: 120000,
  });
  report.apply = { ok: true, output: String(out).slice(0, 1500), linked };
} catch (e) {
  report.apply = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
}
writeFileSync(join(OUT, 'counters-apply.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok) process.exit(1);
