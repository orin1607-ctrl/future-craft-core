/**
 * Staging-only QA telematics preview seed.
 * Writes gps_* for דרכי חיים only. Never vehicles.status / faults / accidents / expenses.
 * Never Production. Never ERM device.
 *
 * node scripts/fleetos-erm-qa-preview-seed.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const COMPANY = 'דרכי חיים';
const PREFIX = 'QA-PREV-';
const P177 =
  '#EDT#,#EID#,#PDT#,#LAT#,#LONG#,#SPD#,#HEAD#,#ODO#,#LAC#,#CID#,#VIN#,#VBAT#,#IGN#,#ENG#,#RPM#,#DUR#,#CFL#,#DID#,#FIX#,#SAT#,#HDOP#,#ALT#,#CV1#,#CV2#';
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-erm-software-ui-2026-09-02');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(
  execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service =
  keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key;
if (!service) throw new Error('missing staging service role');
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const bizBefore = {};
for (const t of ['faults', 'accidents', 'expenses']) {
  const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true });
  if (error) throw error;
  bizBefore[t] = count;
}

const { data: vehicles, error: vErr } = await admin
  .from('vehicles')
  .select('id, license_plate, company_name, odometer, status')
  .eq('company_name', COMPANY)
  .neq('license_plate', 'בארי')
  .order('license_plate')
  .limit(20);
if (vErr) throw vErr;
const usable = (vehicles || []).filter((v) => v.license_plate && !String(v.license_plate).includes('בארי'));
if (usable.length < 5) throw new Error(`need 5 QA vehicles in ${COMPANY}, got ${usable.length}`);

const roles = {
  online: usable[0],
  stopped: usable[1],
  stale: usable[2],
  offline: usable[3],
  nogps: usable[4],
};

const { data: oldDev } = await admin.from('gps_devices').select('id, unit_id').like('unit_id', `${PREFIX}%`);
const oldIds = (oldDev || []).map((d) => d.id);
if (oldIds.length) {
  await admin.from('gps_events').delete().in('device_id', oldIds);
  await admin.from('gps_positions').delete().in('device_id', oldIds);
  await admin.from('gps_live').delete().in('device_id', oldIds);
  await admin.from('gps_raw').delete().in('device_id', oldIds);
  await admin.from('gps_device_assignments').delete().in('device_id', oldIds);
  await admin.from('gps_devices').delete().in('id', oldIds);
}
await admin.from('gps_raw').delete().like('raw', '%QAUNK01%');
await admin.from('gps_can_maps').delete().eq('company_name', COMPANY).like('label_he', '%QA');

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

async function upsertDevice(unitId, vehicle, extra = {}) {
  const ins = await admin
    .from('gps_devices')
    .insert({
      unit_id: unitId,
      imei: extra.imei || null,
      vehicle_id: vehicle.id,
      company_name: COMPANY,
      enabled: true,
      p177: P177,
    })
    .select('id')
    .single();
  if (ins.error) throw ins.error;
  const hist = await admin.from('gps_device_assignments').insert({
    device_id: ins.data.id,
    vehicle_id: vehicle.id,
    company_name: COMPANY,
    action: 'assign',
  });
  if (hist.error) throw hist.error;
  return ins.data.id;
}

async function writeLive(deviceId, vehicle, unitId, patch) {
  const row = {
    device_id: deviceId,
    vehicle_id: vehicle.id,
    company_name: COMPANY,
    unit_id: unitId,
    imei: patch.imei ?? `35611${unitId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}`.slice(0, 15),
    last_seen: patch.last_seen,
    last_seq: '01',
    last_cmd: '06',
    gps_at: patch.gps_at ?? patch.last_seen,
    gps_age_sec: patch.gps_age_sec ?? 8,
    freshness: patch.freshness,
    lat: patch.lat ?? null,
    lng: patch.lng ?? null,
    speed_knots: patch.speed_knots ?? null,
    speed_kmh: patch.speed_kmh ?? null,
    heading: patch.heading ?? null,
    ignition: patch.ignition ?? null,
    engine: patch.engine ?? null,
    motion: patch.motion ?? null,
    odometer: patch.odometer ?? null,
    odometer_decision: patch.odometer != null ? 'apply' : 'skip',
    vehicle_voltage: patch.vehicle_voltage ?? null,
    backup_voltage: patch.backup_voltage ?? null,
    rpm: patch.rpm ?? null,
    engine_hours: patch.engine_hours ?? null,
    fuel: patch.fuel ?? null,
    driver_id_erm: patch.driver_id_erm ?? null,
    can_raw: patch.can_raw ?? {},
    tags: patch.tags ?? {},
    updated_at: patch.last_seen,
  };
  const { error } = await admin.from('gps_live').upsert(row, { onConflict: 'device_id' });
  if (error) throw error;
}

const onlineId = await upsertDevice(`${PREFIX}ONLINE`, roles.online, { imei: '356119990000001' });
await writeLive(onlineId, roles.online, `${PREFIX}ONLINE`, {
  last_seen: iso(now),
  freshness: 'live',
  lat: 32.0853,
  lng: 34.7818,
  speed_kmh: 62.4,
  speed_knots: 33.7,
  heading: 92,
  ignition: true,
  engine: true,
  motion: 'driving',
  odometer: 88421,
  vehicle_voltage: 13.8,
  backup_voltage: 3.9,
  rpm: 2140,
  engine_hours: 412.5,
  fuel: 54,
  driver_id_erm: 'QA-DRV-17',
  can_raw: { CV1: '91', CV2: '2.4' },
  tags: {
    IGN: '1', ENG: '1', RPM: '2140', CFL: '54', ALT: '48', SAT: '11', HDOP: '0.9', FIX: '3D', DID: 'QA-DRV-17',
  },
  imei: '356119990000001',
});
await admin.from('gps_positions').insert([
  { device_id: onlineId, vehicle_id: roles.online.id, company_name: COMPANY, lat: 32.0801, lng: 34.7702, speed_kmh: 48, heading: 80, at: iso(now - 6 * 60 * 1000) },
  { device_id: onlineId, vehicle_id: roles.online.id, company_name: COMPANY, lat: 32.0828, lng: 34.7755, speed_kmh: 55, heading: 86, at: iso(now - 3 * 60 * 1000) },
  { device_id: onlineId, vehicle_id: roles.online.id, company_name: COMPANY, lat: 32.0853, lng: 34.7818, speed_kmh: 62.4, heading: 92, at: iso(now - 20 * 1000) },
]);
await admin.from('gps_events').insert([
  { device_id: onlineId, vehicle_id: roles.online.id, company_name: COMPANY, eid: '04', event_key: 'ign_on', label_he: 'הצתה נדלקה', severity: 'info', at: iso(now - 12 * 60 * 1000), tags: { EID: '04' } },
  { device_id: onlineId, vehicle_id: roles.online.id, company_name: COMPANY, eid: '58', event_key: 'drive_start', label_he: 'תחילת נסיעה', severity: 'info', at: iso(now - 10 * 60 * 1000), tags: { EID: '58' } },
  { device_id: onlineId, vehicle_id: roles.online.id, company_name: COMPANY, eid: '06', event_key: 'overspeed', label_he: 'חריגת מהירות', severity: 'warning', at: iso(now - 90 * 1000), tags: { EID: '06', SPD: '62.4' } },
]);
await admin.from('gps_can_maps').insert([
  { vehicle_id: roles.online.id, company_name: COMPANY, cv_tag: 'CV1', label_he: 'טמפ׳ שמן QA' },
  { vehicle_id: roles.online.id, company_name: COMPANY, cv_tag: 'CV2', label_he: 'לחץ שמן QA' },
]);

const stoppedId = await upsertDevice(`${PREFIX}STOPPED`, roles.stopped);
await writeLive(stoppedId, roles.stopped, `${PREFIX}STOPPED`, {
  last_seen: iso(now - 40 * 1000),
  freshness: 'live',
  lat: 32.079,
  lng: 34.768,
  speed_kmh: 0,
  heading: 12,
  ignition: false,
  engine: false,
  motion: 'stopped',
  odometer: 55210,
  vehicle_voltage: 12.4,
  backup_voltage: 3.7,
  rpm: null,
  engine_hours: 208,
  fuel: null,
  tags: { IGN: '0', ENG: '0' },
});
await admin.from('gps_events').insert({
  device_id: stoppedId,
  vehicle_id: roles.stopped.id,
  company_name: COMPANY,
  eid: '05',
  event_key: 'ign_off',
  label_he: 'הצתה כבתה',
  severity: 'info',
  at: iso(now - 8 * 60 * 1000),
  tags: { EID: '05' },
});

const staleId = await upsertDevice(`${PREFIX}STALE`, roles.stale);
await writeLive(staleId, roles.stale, `${PREFIX}STALE`, {
  last_seen: iso(now - 8 * 60 * 1000),
  gps_age_sec: 40,
  freshness: 'stale',
  lat: 32.091,
  lng: 34.802,
  speed_kmh: 18,
  heading: 200,
  ignition: true,
  engine: true,
  motion: 'driving',
  odometer: 33102,
  vehicle_voltage: 13.1,
  tags: { IGN: '1' },
});

const offlineId = await upsertDevice(`${PREFIX}OFFLINE`, roles.offline);
await writeLive(offlineId, roles.offline, `${PREFIX}OFFLINE`, {
  last_seen: iso(now - 42 * 60 * 1000),
  gps_age_sec: 80,
  freshness: 'stale',
  lat: 32.05,
  lng: 34.75,
  speed_kmh: 0,
  heading: 0,
  ignition: false,
  engine: false,
  motion: 'stopped',
  odometer: 12004,
  tags: {},
});

const nogpsId = await upsertDevice(`${PREFIX}NOGPS`, roles.nogps);
await writeLive(nogpsId, roles.nogps, `${PREFIX}NOGPS`, {
  last_seen: iso(now - 20 * 1000),
  gps_at: null,
  gps_age_sec: null,
  freshness: 'none',
  lat: null,
  lng: null,
  ignition: true,
  engine: null,
  motion: null,
  odometer: null,
  vehicle_voltage: 12.9,
  tags: { IGN: '1', LAT: '', LONG: '' },
});

await admin.from('gps_raw').insert({
  device_id: null,
  company_name: null,
  raw: '$SLUQAUNK01,06,99,260902100000,01,260902100000,+3200.0000,+03400.0000,00.0,000,0,0,0,12.0,3.6*00',
  reason: 'unknown_device',
  at: iso(now - 15 * 1000),
});

const bizAfter = {};
for (const t of ['faults', 'accidents', 'expenses']) {
  const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true });
  if (error) throw error;
  bizAfter[t] = count;
}

const seed = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  ermDeviceTouched: false,
  company: COMPANY,
  emails: { companyA: 'darkay.hayim@gmail.com', companyB: 'yoni191177@gmail.com' },
  p177: P177,
  vehicles: {
    online: { ...roles.online, unit: `${PREFIX}ONLINE` },
    stopped: { ...roles.stopped, unit: `${PREFIX}STOPPED` },
    stale: { ...roles.stale, unit: `${PREFIX}STALE` },
    offline: { ...roles.offline, unit: `${PREFIX}OFFLINE` },
    nogps: { ...roles.nogps, unit: `${PREFIX}NOGPS` },
  },
  unknownUnit: 'QAUNK01',
  businessBefore: bizBefore,
  businessAfter: bizAfter,
  businessUnchanged:
    bizBefore.faults === bizAfter.faults &&
    bizBefore.accidents === bizAfter.accidents &&
    bizBefore.expenses === bizAfter.expenses,
};
writeFileSync(join(OUT, 'seed.json'), JSON.stringify(seed, null, 2));
console.log(JSON.stringify({ ok: seed.businessUnchanged, plates: Object.fromEntries(Object.entries(seed.vehicles).map(([k, v]) => [k, v.license_plate])) }, null, 2));
if (!seed.businessUnchanged) process.exit(1);
