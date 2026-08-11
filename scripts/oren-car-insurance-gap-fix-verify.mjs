/**
 * Read-only verify insurance gap logic against Staging DB sample vehicles.
 * node scripts/oren-car-insurance-gap-fix-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-insurance-gap-fix');

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function coverageStatus(expiry) {
  const days = daysUntil(expiry);
  if (!expiry) return 'missing';
  if (days <= 0) return 'expired';
  if (days <= 14) return 'expiring';
  return 'valid';
}

function evaluate(v, requireInsuranceDocs = false) {
  const mandatory = coverageStatus(v.insurance_expiry);
  const hasComp = !!(v.comprehensive_insurance_expiry || v.comprehensive_insurance_doc_url);
  const mandatoryCoverageGap = mandatory !== 'valid';
  const hasCoverageGap = mandatoryCoverageGap;
  const missingMandatoryDoc = requireInsuranceDocs && !v.insurance_doc_url;
  const missingCompDoc = hasComp && !v.comprehensive_insurance_doc_url;
  const insuranceGapDisplay = hasCoverageGap
    ? mandatory === 'missing'
      ? 'לא הוגדר'
      : mandatory === 'expired'
        ? 'פג תוקף'
        : 'מתקרב לפקיעה'
    : 'אין';
  return {
    insuranceGapDisplay,
    hasCoverageGap,
    missingMandatoryDoc,
    missingCompDoc,
    contradictionOldLogic:
      mandatory === 'valid' &&
      (!v.insurance_doc_url || !v.comprehensive_insurance_doc_url) &&
      v.insurance_alerts_enabled !== false &&
      v.insurance_alerts_red_enabled !== false,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const key = JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
  ).find((k) => k.name === 'service_role')?.api_key;
  const admin = createClient(`https://${STAGING_REF}.supabase.co`, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ids = [
    '928214e8-34a8-49a7-9424-d46a99a93f27',
    '2a0cba63-330b-4061-b90f-9a91c323a514',
  ];

  const report = { at: new Date().toISOString(), staging: STAGING_REF, vehicles: [] };

  for (const id of ids) {
    const { data: v } = await admin.from('vehicles').select('*').eq('id', id).single();
    const { data: cs } = await admin
      .from('company_settings')
      .select('require_insurance_docs, show_insurance_attention_red, show_gaps_attention_red')
      .eq('company_name', v.company_name)
      .maybeSingle();
    const ev = evaluate(v, cs?.require_insurance_docs ?? false);
    report.vehicles.push({
      id,
      plate: v.license_plate,
      company: v.company_name,
      insurance_expiry: v.insurance_expiry,
      insurance_doc: !!v.insurance_doc_url,
      comprehensive_doc: !!v.comprehensive_insurance_doc_url,
      companySettings: cs,
      newLogic: ev,
    });
  }

  const { count: oldContradictions } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .not('insurance_expiry', 'is', null);
  report.note =
    'New logic: beeri vehicles with valid date and no required docs should show insurance_gap=אין';

  writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
