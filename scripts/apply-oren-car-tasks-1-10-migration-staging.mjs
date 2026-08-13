/**
 * Apply Oren Car tasks 1–10 additive schema on Staging ONLY.
 * node scripts/apply-oren-car-tasks-1-10-migration-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/oren-car-tasks-1-10-staging');
const MIGRATION = join(ROOT, 'supabase/migrations/20260813190000_oren_car_tasks_1_10_staging.sql');

mkdirSync(OUT, { recursive: true });

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  return JSON.parse(raw).find((k) => k.name === 'service_role')?.api_key;
}

async function main() {
  if (!existsSync(MIGRATION)) throw new Error('migration file missing');
  const sql = readFileSync(MIGRATION, 'utf8');
  writeFileSync(join(OUT, 'migration-sql-exact.sql'), sql, 'utf8');

  const report = {
    at: new Date().toISOString(),
    staging: STAGING_REF,
    productionTouched: false,
    apply: null,
    verify: null,
  };

  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-oren-tasks-1-10-migration');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

  try {
    execSync(`supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${MIGRATION}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    report.apply = { ok: true, output: String(out).slice(0, 800) };
  } catch (e) {
    report.apply = {
      ok: false,
      error: String(e.message || e),
      stderr: e.stderr?.toString?.()?.slice(0, 1200) || null,
    };
  }

  const service = getServiceKey();
  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const insp = await admin.from('vehicle_inspections').select('id, next_due_date').limit(1);
  const veh = await admin.from('vehicles').select('id, show_notes_on_list').limit(1);
  const drv = await admin.from('drivers').select('id, show_notes_on_list').limit(1);

  report.verify = {
    inspectionNextDueReadable: !insp.error,
    inspectionError: insp.error?.message || null,
    vehicleFlagReadable: !veh.error,
    vehicleError: veh.error?.message || null,
    driverFlagReadable: !drv.error,
    driverError: drv.error?.message || null,
  };

  writeFileSync(join(OUT, 'migration-result.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ apply: report.apply, verify: report.verify }, null, 2));
  if (!report.apply?.ok || !report.verify.inspectionNextDueReadable || !report.verify.vehicleFlagReadable || !report.verify.driverFlagReadable) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
