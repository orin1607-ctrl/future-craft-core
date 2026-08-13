/**
 * Apply additive SELECT policies on Staging ONLY.
 * node scripts/apply-oren-car-alerts-visibility-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/oren-car-tasks-1-10-staging');
const SQL = join(ROOT, 'supabase/migrations/20260813210000_oren_car_alerts_visibility_staging.sql');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('sql missing');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  apply: null,
};

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-oren-alerts-visibility');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

try {
  execSync(`supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${SQL}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  report.apply = { ok: true, output: String(out).slice(0, 800) };
} catch (e) {
  report.apply = {
    ok: false,
    error: String(e.message || e),
    stderr: e.stderr?.toString?.()?.slice(0, 1500) || null,
  };
}

writeFileSync(join(OUT, 'alerts-visibility-policy-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok) process.exit(1);
