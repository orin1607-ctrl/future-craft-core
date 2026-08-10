/**
 * Production data integrity snapshot (Supabase only — no local/staging data)
 * node scripts/oren-car-production-data-snapshot.mjs [--label before|after]
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const BEERI = 'קיבוץ בארי';
const BEERI_TYPO = "ק'יבוץ בארי";
const label = process.argv.includes('--label') ? process.argv[process.argv.indexOf('--label') + 1] : 'snapshot';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-production-deploy', `data-${label}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(PROD_URL, keys.find((k) => k.name === 'service_role').api_key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normPlate(p) {
  return (p || '').replace(/[-\s]/g, '').trim();
}

async function fetchAll(select) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin.from('vehicles').select(select).range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  const { count: totalVehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
  const { count: totalDrivers } = await admin.from('drivers').select('id', { count: 'exact', head: true });
  const { count: beeriExact } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);
  const { count: beeriTypo } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI_TYPO);
  const { count: docMeta } = await admin.from('document_metadata').select('id', { count: 'exact', head: true });

  const vehicles = await fetchAll('id, license_plate, internal_number, company_name');
  const plateMap = {};
  for (const v of vehicles) {
    const p = normPlate(v.license_plate);
    if (!p) continue;
    if (!plateMap[p]) plateMap[p] = 0;
    plateMap[p]++;
  }
  const dupPlateGroups = Object.values(plateMap).filter((c) => c > 1).length;

  const internalMap = {};
  for (const v of vehicles) {
    const n = (v.internal_number || '').trim();
    if (!n) continue;
    const key = `${v.company_name}::${n}`;
    if (!internalMap[key]) internalMap[key] = 0;
    internalMap[key]++;
  }
  const dupInternalGroups = Object.values(internalMap).filter((c) => c > 1).length;

  let liveBundle = null;
  try {
    const html = await (await fetch('https://dalia-car.online/')).text();
    liveBundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  } catch {
    liveBundle = 'unavailable';
  }

  const report = {
    label,
    at: new Date().toISOString(),
    source: 'Production Supabase only',
    totalVehicles,
    totalDrivers,
    beeriExact,
    beeriTypo,
    documentMetadata: docMeta,
    dupPlateGroups,
    dupInternalGroups,
    liveBundle,
    vehicleRowsFetched: vehicles.length,
  };

  writeFileSync(join(OUT, 'snapshot.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
