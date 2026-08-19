/**
 * Apply identity enrichment to Oren Car Staging ONLY.
 * Never targets Production qasomfndnjuixgjmjwcm.
 * node scripts/apply-security-identity-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260819153000_security_identity_enrichment_staging.sql');
const SEED = join(ROOT, 'scripts/security-identity-seed-staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/security-identity-mobile-oren-car');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-security-identity-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  apply: null,
  seed: null,
};

function query(file) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${file}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
  const out = query(SQL);
  report.apply = { ok: true, output: String(out).slice(0, 1500), linked };
  if (existsSync(SEED)) {
    const seedOut = query(SEED);
    report.seed = { ok: true, output: String(seedOut).slice(0, 1500) };
  }
} catch (e) {
  const slot = report.apply?.ok ? 'seed' : 'apply';
  report[slot] = {
    ok: false,
    error: String(e.message || e).slice(0, 2000),
    stderr: e.stderr?.toString?.()?.slice(0, 2000) || null,
  };
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || (report.seed && report.seed.ok === false)) process.exit(1);
