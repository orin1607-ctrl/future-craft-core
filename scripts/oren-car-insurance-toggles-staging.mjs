/**
 * Oren Car — insurance toggles + accidents fix (Staging only: usfeoerkpcafxxlyuldl)
 * Usage:
 *   node scripts/oren-car-insurance-toggles-staging.mjs           # verify counts (read-only)
 *   node scripts/oren-car-insurance-toggles-staging.mjs --apply   # apply migration SQL
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BEERI = 'קיבוץ בארי';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'oren-car-insurance-toggles-staging');
const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260809140000_vehicle_insurance_red_toggle_beeri_staging.sql',
);

mkdirSync(OUT, { recursive: true });

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  return JSON.parse(raw).find((k) => k.name === 'service_role')?.api_key;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const service = getServiceKey();
  const url = `https://${STAGING_REF}.supabase.co`;
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report = {
    at: new Date().toISOString(),
    project: STAGING_REF,
    stagingOnly: true,
    migration: {
      file: '20260809140000_vehicle_insurance_red_toggle_beeri_staging.sql',
      applied: false,
    },
    beeri: {},
    accidents_schema: {},
    other_customers_sample: {},
  };

  if (apply) {
    const sql = readFileSync(MIGRATION, 'utf8');
    const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-insurance-toggles-migration');
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
      report.migration.stdout = out.slice(0, 500);
      report.migration.applied = true;
    } catch (e) {
      report.migration.stderr = String(e.message || e).slice(0, 800);
      report.migration.exitCode = 1;
      report.migration.applied = false;
    }
  }

  const { count: beeriTotal } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', BEERI);

  const { count: insOn } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', BEERI)
    .eq('insurance_alerts_enabled', true);

  const { count: insOff } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', BEERI)
    .eq('insurance_alerts_enabled', false);

  const { count: redOff } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', BEERI)
    .eq('insurance_alerts_red_enabled', false);

  const { count: redOn } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', BEERI)
    .eq('insurance_alerts_red_enabled', true);

  report.beeri = {
    total: beeriTotal,
    insurance_alerts_enabled_true: insOn,
    insurance_alerts_enabled_false: insOff,
    insurance_alerts_red_enabled_false: redOff,
    insurance_alerts_red_enabled_true: redOn,
    pass_task1: insOn === beeriTotal && insOff === 0,
    pass_task2: redOff === beeriTotal && redOn === 0,
  };

  const { data: accidentProbe, error: accidentErr } = await admin
    .from('accidents')
    .select('id, vehicle_plate, status, description, date')
    .limit(1);
  report.accidents_schema = {
    query_ok: !accidentErr,
    error: accidentErr?.message ?? null,
    sample: accidentProbe?.[0] ?? null,
    bad_column_probe: null,
  };
  const { error: badColErr } = await admin
    .from('accidents')
    .select('accident_date')
    .limit(1);
  report.accidents_schema.bad_column_probe = badColErr?.message ?? 'ok (unexpected)';

  const { data: otherSample } = await admin
    .from('vehicles')
    .select('company_name, insurance_alerts_enabled, insurance_alerts_red_enabled')
    .neq('company_name', BEERI)
    .limit(20);

  const otherCompanies = [...new Set((otherSample || []).map((r) => r.company_name))];
  report.other_customers_sample = {
    companies_checked: otherCompanies.length,
    rows: otherSample,
    note: 'Migration only UPDATEs קיבוץ בארי; others keep column defaults (red=true).',
  };

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
