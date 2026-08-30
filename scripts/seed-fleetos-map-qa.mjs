/**
 * Seed / clean Staging-only Test GPS for FleetOS map browser QA.
 * Never targets Production. Avoids Beeri vehicles.
 *
 * node scripts/seed-fleetos-map-qa.mjs
 * FLEETOS_MAP_QA_CLEANUP=1 node scripts/seed-fleetos-map-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-map-leaflet-2026-08-30');
const PREFIX = 'QA-MAP-';
const CLEANUP = process.env.FLEETOS_MAP_QA_CLEANUP === '1';

mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keysRaw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
  encoding: 'utf8',
});
const keys = JSON.parse(keysRaw);
const service =
  keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function wipeQaMapRows() {
  const { data: devices } = await admin.from('gps_devices').select('id').like('unit_id', `${PREFIX}%`);
  const ids = (devices || []).map((d) => d.id);
  if (ids.length) {
    await admin.from('gps_raw').delete().in('device_id', ids);
    await admin.from('gps_events').delete().in('device_id', ids);
    await admin.from('gps_positions').delete().in('device_id', ids);
    await admin.from('gps_live').delete().in('device_id', ids);
    await admin.from('gps_device_assignments').delete().in('device_id', ids);
    await admin.from('gps_devices').delete().in('id', ids);
  }
  await admin.from('gps_devices').delete().like('unit_id', `${PREFIX}%`);
}

if (CLEANUP) {
  await wipeQaMapRows();
  const report = { at: new Date().toISOString(), cleaned: true, productionTouched: false };
  writeFileSync(join(OUT, 'seed.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

await wipeQaMapRows();

const { data: vehicles, error: vehErr } = await admin
  .from('vehicles')
  .select('id, license_plate, company_name')
  .in('company_name', ['טטטט', 'דרכי חיים']);
if (vehErr) throw vehErr;

const byCompany = new Map();
for (const v of vehicles || []) {
  if (!v.company_name || !v.id) continue;
  const list = byCompany.get(v.company_name) || [];
  list.push(v);
  byCompany.set(v.company_name, list);
}

const preferred = ['דרכי חיים', 'טטטט'].filter((c) => (byCompany.get(c) || []).length);
const ranked = preferred.sort((a, b) => (byCompany.get(b) || []).length - (byCompany.get(a) || []).length);
const coA = ranked.find((c) => (byCompany.get(c) || []).length >= 3) || ranked[0];
const coB = ranked.find((c) => c !== coA);
if (!coA || !coB) throw new Error('need two Test companies (טטטט / דרכי חיים)');
const listA = byCompany.get(coA) || [];
const listB = byCompany.get(coB) || [];
if (listA.length < 3) throw new Error(`${coA} needs at least 3 vehicles, got ${listA.length}`);
if (listB.length < 1) throw new Error(`${coB} needs at least 1 vehicle, got ${listB.length}`);

const liveA = listA[0];
const staleA = listA[1];
const noneA = listA[2];
const liveB = listB[0];
const stamp = Date.now();

async function insertDevice(vehicle, unitId, imei) {
  const ins = await admin
    .from('gps_devices')
    .insert({
      unit_id: unitId,
      imei,
      vehicle_id: vehicle.id,
      company_name: vehicle.company_name,
      enabled: true,
    })
    .select('id')
    .single();
  if (ins.error) throw new Error(ins.error.message);
  await admin.from('gps_device_assignments').insert({
    device_id: ins.data.id,
    vehicle_id: vehicle.id,
    company_name: vehicle.company_name,
    action: 'assign',
  });
  return ins.data.id;
}

const unitLiveA = `${PREFIX}LIVE-${stamp}`;
const unitStaleA = `${PREFIX}STALE-${stamp}`;
const unitLiveB = `${PREFIX}B-${stamp}`;
const imeiLiveA = `35611000000${String(stamp).slice(-4)}`.slice(0, 15);
const imeiStaleA = `35611000001${String(stamp).slice(-4)}`.slice(0, 15);
const imeiLiveB = `35611000002${String(stamp).slice(-4)}`.slice(0, 15);

const devLiveA = await insertDevice(liveA, unitLiveA, imeiLiveA);
const devStaleA = await insertDevice(staleA, unitStaleA, imeiStaleA);
const devLiveB = await insertDevice(liveB, unitLiveB, imeiLiveB);

const now = Date.now();
const liveIns = await admin.from('gps_live').insert({
  device_id: devLiveA,
  vehicle_id: liveA.id,
  company_name: liveA.company_name,
  unit_id: unitLiveA,
  imei: imeiLiveA,
  last_seen: new Date(now).toISOString(),
  gps_at: new Date(now).toISOString(),
  gps_age_sec: 8,
  last_seq: '01',
  last_cmd: '06',
  freshness: 'live',
  lat: 32.0853,
  lng: 34.7818,
  speed_kmh: 42,
  heading: 90,
  ignition: true,
  engine: true,
  motion: 'driving',
  odometer: 50100,
  can_raw: {},
  tags: {},
});
const staleIns = await admin.from('gps_live').insert({
  device_id: devStaleA,
  vehicle_id: staleA.id,
  company_name: staleA.company_name,
  unit_id: unitStaleA,
  imei: imeiStaleA,
  last_seen: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  gps_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  gps_age_sec: 7200,
  freshness: 'stale',
  lat: 32.085,
  lng: 34.79,
  speed_kmh: 0,
  ignition: false,
  motion: 'stopped',
  can_raw: {},
  tags: {},
});
const liveBIns = await admin.from('gps_live').insert({
  device_id: devLiveB,
  vehicle_id: liveB.id,
  company_name: liveB.company_name,
  unit_id: unitLiveB,
  imei: imeiLiveB,
  last_seen: new Date(now).toISOString(),
  gps_at: new Date(now).toISOString(),
  gps_age_sec: 12,
  freshness: 'live',
  lat: 31.7683,
  lng: 35.2137,
  speed_kmh: 18,
  heading: 200,
  ignition: true,
  engine: true,
  motion: 'driving',
  can_raw: {},
  tags: {},
});
if (liveIns.error || staleIns.error || liveBIns.error) {
  throw new Error(liveIns.error?.message || staleIns.error?.message || liveBIns.error?.message);
}

const trail = await admin.from('gps_positions').insert([
  {
    device_id: devLiveA,
    vehicle_id: liveA.id,
    company_name: liveA.company_name,
    lat: 32.075,
    lng: 34.78,
    speed_kmh: 28,
    heading: 70,
    at: new Date(now - 180000).toISOString(),
  },
  {
    device_id: devLiveA,
    vehicle_id: liveA.id,
    company_name: liveA.company_name,
    lat: 32.08,
    lng: 34.781,
    speed_kmh: 35,
    heading: 80,
    at: new Date(now - 90000).toISOString(),
  },
  {
    device_id: devLiveA,
    vehicle_id: liveA.id,
    company_name: liveA.company_name,
    lat: 32.0853,
    lng: 34.7818,
    speed_kmh: 42,
    heading: 90,
    at: new Date(now).toISOString(),
  },
]);
if (trail.error) throw new Error(trail.error.message);

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  companies: { a: coA, b: coB },
  liveA: { plate: liveA.license_plate, id: liveA.id, unitId: unitLiveA, imei: imeiLiveA },
  staleA: { plate: staleA.license_plate, id: staleA.id, unitId: unitStaleA },
  noneA: { plate: noneA.license_plate, id: noneA.id, note: 'no GPS device — for UI assign' },
  liveB: { plate: liveB.license_plate, id: liveB.id, unitId: unitLiveB, company: coB },
  emails: {
    superAdmin: 'orin1607@gmail.com',
    companyA: coA === 'טטטט' ? 'yoni191177@gmail.com' : 'darkay.hayim@gmail.com',
    companyB: coB === 'טטטט' ? 'yoni191177@gmail.com' : 'darkay.hayim@gmail.com',
  },
};
writeFileSync(join(OUT, 'seed.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
