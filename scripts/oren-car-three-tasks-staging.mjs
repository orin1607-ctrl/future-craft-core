/**
 * Oren Car — 3 tasks (Staging only: usfeoerkpcafxxlyuldl)
 * Usage:
 *   node scripts/oren-car-three-tasks-staging.mjs           # baseline + diagnose (read-only)
 *   node scripts/oren-car-three-tasks-staging.mjs --apply   # apply migration SQL via supabase db query
 */
import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BEERI = 'קיבוץ בארי';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'oren-car-three-tasks-staging');
const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260808120000_vehicle_insurance_alerts_toggle_staging.sql',
);

mkdirSync(OUT, { recursive: true });

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  return JSON.parse(raw).find((k) => k.name === 'service_role')?.api_key;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
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
    migration: { file: '20260808120000_vehicle_insurance_alerts_toggle_staging.sql', applied: false },
    baseline: {},
    task1_vehicle917: {},
    task2_beeri_timing: {},
    task3_insurance_toggle: {},
  };

  if (apply) {
    const sql = readFileSync(MIGRATION, 'utf8');
    const r = spawnSync('supabase', ['db', 'query', '--project-ref', STAGING_REF], {
      input: sql,
      encoding: 'utf8',
      shell: true,
    });
    report.migration.stdout = (r.stdout || '').slice(0, 500);
    report.migration.stderr = (r.stderr || '').slice(0, 500);
    report.migration.exitCode = r.status;
    report.migration.applied = r.status === 0;
  }

  const { data: beeriSettings } = await admin
    .from('company_settings')
    .select(
      'company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, custom_gap_alerts_config',
    )
    .eq('company_name', BEERI)
    .maybeSingle();

  const { data: v917, error: v917Err } = await admin
    .from('vehicles')
    .select(
      'id, license_plate, internal_number, test_expiry, insurance_expiry, insurance_alerts_enabled, license_doc_url, company_name',
    )
    .eq('company_name', BEERI)
    .eq('internal_number', '917');

  let columnExists = !v917Err?.message?.includes('insurance_alerts_enabled');
  if (!columnExists) {
    const { data: fallback } = await admin
      .from('vehicles')
      .select('id, license_plate, internal_number, test_expiry, insurance_expiry, license_doc_url, company_name')
      .eq('company_name', BEERI)
      .eq('internal_number', '917');
    report.baseline.vehicles_917 = fallback;
  } else {
    report.baseline.vehicles_917 = v917;
  }

  report.baseline.beeri_company_settings = beeriSettings;
  report.baseline.insurance_alerts_column_exists = columnExists;

  const { count: beeriTotal } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', BEERI);

  let beeriInsOff = null;
  if (columnExists) {
    const { count: offCount } = await admin
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_name', BEERI)
      .eq('insurance_alerts_enabled', false);
    beeriInsOff = offCount;
  }

  report.task1_vehicle917 = {
    count: report.baseline.vehicles_917?.length ?? 0,
    vehicles: (report.baseline.vehicles_917 || []).map((v) => ({
      id: v.id,
      plate: v.license_plate,
      test_expiry: v.test_expiry,
      test_days_left: daysUntil(v.test_expiry),
      insurance_expiry: v.insurance_expiry,
      insurance_days_left: daysUntil(v.insurance_expiry),
      insurance_alerts_enabled: v.insurance_alerts_enabled ?? null,
      test_alert_with_30_7_1_code:
        daysUntil(v.test_expiry) !== null && daysUntil(v.test_expiry) <= 30
          ? `tier at ${daysUntil(v.test_expiry)}d`
          : 'none (>30d — no test alert)',
    })),
    root_cause_note:
      'Old deployed code used hardcoded 60-day test threshold; plate 15094302 (~57d) triggered alert. New expiryReminderTier: >30d = no alert.',
    duplicate_internal_number: {
      business_note:
        'Two distinct vehicles (different plates) share internal_number 917 — both קיבוץ בארי. No DB unique constraint on internal_number per company.',
      navigation_rule: 'All links use vehicle UUID (id), never internal_number alone.',
    },
  };

  const { data: beeriDupes } = await admin
    .from('vehicles')
    .select('internal_number')
    .eq('company_name', BEERI)
    .not('internal_number', 'is', null)
    .neq('internal_number', '');

  const dupeCounts = {};
  for (const row of beeriDupes || []) {
    const n = row.internal_number;
    dupeCounts[n] = (dupeCounts[n] || 0) + 1;
  }
  const duplicateInternals = Object.entries(dupeCounts)
    .filter(([, c]) => c > 1)
    .map(([n, c]) => ({ internal_number: n, count: c }))
    .sort((a, b) => b.count - a.count);

  report.task1_vehicle917.duplicate_internal_numbers_beeri = {
    total_with_internal: beeriDupes?.length ?? 0,
    duplicate_groups: duplicateInternals.length,
    top_examples: duplicateInternals.slice(0, 10),
    unique_constraint_in_db: false,
    recommendation:
      'Data quality issue — not a duplicate alert bug. Navigation must use UUID. Consider business rule: unique internal_number per company (future, not this task).',
  };

  report.task2_beeri_timing = {
    current_alert_days_before: beeriSettings?.alert_days_before ?? null,
    reminder_30_days: beeriSettings?.reminder_30_days,
    reminder_7_days: beeriSettings?.reminder_7_days,
    reminder_1_day: beeriSettings?.reminder_1_day,
    semantics:
      'Tiered 30/7/1 via expiryReminderTier: >30d no alert; 30-8d shows 30-tier; 7-2d shows 7-tier; 1-0d shows 1-tier. NOT 60 or 90.',
    migration_changes_alert_days_before: false,
    vehicle_917_15094302_test_days: daysUntil(
      report.baseline.vehicles_917?.find((v) => v.license_plate === '15094302')?.test_expiry,
    ),
    expected_test_alert_for_917_57d: false,
  };

  report.task3_insurance_toggle = {
    column_exists: columnExists,
    beeri_vehicle_count: beeriTotal,
    beeri_insurance_alerts_off_count: beeriInsOff,
    expected_beeri_default: 'insurance_alerts_enabled=false for all Beeri vehicles after migration',
  };

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
