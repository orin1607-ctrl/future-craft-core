/**
 * Apply Security Control Center schema to Oren Car Staging ONLY.
 * Never targets Production qasomfndnjuixgjmjwcm.
 * node scripts/apply-security-control-center-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260819140000_security_control_center_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/security-control-center-oren-car');

mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('sql missing');

const restorePoint = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionRef: PROD_REF,
  productionTouched: false,
  rollback: [
    'DROP TRIGGER IF EXISTS trg_auth_audit_to_security ON public.auth_audit_log;',
    'DROP FUNCTION IF EXISTS public.trg_auth_audit_to_security();',
    'DROP TABLE IF EXISTS public.security_alert_inbox;',
    'DROP TABLE IF EXISTS public.security_activity_sessions;',
    'DROP TABLE IF EXISTS public.security_audit_events;',
  ],
  note: 'Rollback drops only new security_* objects. Does not touch customer documents or Production.',
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(restorePoint, null, 2));

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-security-center-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  apply: null,
};

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${SQL}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
  report.apply = { ok: true, output: String(out).slice(0, 1500), linked };
} catch (e) {
  report.apply = {
    ok: false,
    error: String(e.message || e).slice(0, 2000),
    stderr: e.stderr?.toString?.()?.slice(0, 2000) || null,
  };
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok) process.exit(1);
