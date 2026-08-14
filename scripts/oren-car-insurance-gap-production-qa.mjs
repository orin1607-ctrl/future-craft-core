/**
 * Production read-only QA for insurance gap fix
 * node scripts/oren-car-insurance-gap-production-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROD = 'qasomfndnjuixgjmjwcm';
const LIVE = 'https://dalia-car.online';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-insurance-gap-fix', 'production-qa');
mkdirSync(OUT, { recursive: true });

const key = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD} -o json`, { encoding: 'utf8' }))
  .find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${PROD}.supabase.co`, key, { auth: { autoRefreshToken: false, persistSession: false } });

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
function newLogic(v) {
  const mandatory = coverageStatus(v.insurance_expiry);
  const hasComp = !!(v.comprehensive_insurance_expiry || v.comprehensive_insurance_doc_url);
  const hasCoverageGap = mandatory !== 'valid';
  const oldGap =
    v.insurance_alerts_enabled !== false &&
    v.insurance_alerts_red_enabled !== false &&
    (!v.insurance_doc_url || !v.comprehensive_insurance_doc_url || (daysUntil(v.insurance_expiry) ?? 99) <= 14);
  return { mandatory, hasCoverageGap, oldGapWouldFire: oldGap && mandatory === 'valid', hasComp };
}

const report = { at: new Date().toISOString(), live: LIVE, items: {}, overall: 'pending' };

const html = await (await fetch(LIVE)).text();
report.bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1];
const js = await (await fetch(`${LIVE}/assets/${report.bundle}`)).text();
report.hasProdRef = js.includes(PROD);
report.hasStagingRef = js.includes('usfeoerkpcafxxlyuldl');
report.hasInsuranceCoverageCode = js.includes('missingMandatoryDocLabel') || js.includes('evaluateInsuranceCoverage');

const { error: colErr } = await admin.from('company_settings').select('show_insurance_attention_red, show_gaps_attention_red').limit(1);
report.attentionColumns = !colErr;

const ids = ['928214e8-34a8-49a7-9424-d46a99a93f27', '2a0cba63-330b-4061-b90f-9a91c323a514'];
report.vehicles = [];
for (const id of ids) {
  const { data: v } = await admin.from('vehicles').select('*').eq('id', id).single();
  report.vehicles.push({ id, plate: v.license_plate, company: v.company_name, logic: newLogic(v) });
}

const { count: totalV } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const { count: totalD } = await admin.from('drivers').select('id', { count: 'exact', head: true });
report.dataIntegrity = { totalVehicles: totalV, totalDrivers: totalD, expectedVehicles: 445, expectedDrivers: 268 };

const { data: acc } = await admin.from('accidents').select('id, date').limit(1);
report.accidentsSample = acc?.[0] || null;
report.accidentsHasDate = !!acc?.[0]?.date;

report.items = {
  siteLoads: !!report.bundle,
  correctBundle: report.bundle === 'index-XzenxcjZ.js',
  prodRefInBundle: report.hasProdRef,
  noStagingRef: !report.hasStagingRef,
  insuranceFixInBundle: report.hasInsuranceCoverageCode,
  dbColumns: report.attentionColumns,
  dataCountsOk: totalV === 445 && totalD === 268,
  beeriFixed: report.vehicles.every((v) => !v.logic.oldGapWouldFire || v.logic.hasCoverageGap),
  accidentsOk: report.accidentsHasDate,
};

report.overall = Object.values(report.items).every(Boolean) ? 'PASS' : 'FAIL';
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === 'PASS' ? 0 : 1);
