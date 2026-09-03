/**
 * STAGING ONLY — diagnose why ERM assign UI doesn't show 043284 → 36806603.
 * Read-only. No writes. Production ref refused.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const UNIT = '043284';
const PLATE = '36806603';
const VEHICLE_ID = '295b935a-16f9-4e7a-a920-7bae92a4dc9a';
const EMAIL = 'darkay.hayim@gmail.com';
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-erm-assign-ui-2026-09-04');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service =
  keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key;
const anon =
  keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'anon')?.api_key;
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), stagingRef: STAGING_REF, productionTouched: false };

const { data: device, error: deviceErr } = await admin
  .from('gps_devices')
  .select('id, unit_id, imei, vehicle_id, company_name, enabled')
  .eq('unit_id', UNIT);
report.devicesByUnit = { data: device, error: deviceErr?.message || null };

const { data: vehicle } = await admin
  .from('vehicles')
  .select('id, license_plate, manufacturer, model, year, status, company_name, assigned_driver_id')
  .eq('id', VEHICLE_ID)
  .maybeSingle();
report.vehicle = vehicle;

const { data: byPlate } = await admin
  .from('vehicles')
  .select('id, license_plate, company_name, status')
  .eq('license_plate', PLATE);
report.vehiclesByPlate = byPlate;

const { data: activeDup } = await admin
  .from('gps_devices')
  .select('id, unit_id, vehicle_id, enabled')
  .eq('enabled', true)
  .or(`unit_id.eq.${UNIT},vehicle_id.eq.${VEHICLE_ID}`);
report.activeMappings = activeDup;

const { data: live } = await admin
  .from('gps_live')
  .select('device_id, vehicle_id, unit_id, company_name, last_seen, lat, lng, freshness')
  .eq('unit_id', UNIT);
report.gpsLive = live;

const { data: unknownRaw } = await admin
  .from('gps_raw')
  .select('id, at, reason, company_name, raw')
  .eq('reason', 'unknown_device')
  .order('at', { ascending: false })
  .limit(8);
report.unknownRaw = (unknownRaw || []).map((r) => ({
  id: r.id,
  at: r.at,
  company_name: r.company_name,
  unitHint: /\$SLU([^,*]+)/i.exec(r.raw || '')?.[1] || null,
}));

const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const authUser = (users?.users || []).find((u) => u.email === EMAIL);
report.authUser = authUser
  ? { id: authUser.id, email: authUser.email }
  : null;

const { data: profile } = authUser
  ? await admin.from('profiles').select('id, full_name, company_name, role').eq('id', authUser.id).maybeSingle()
  : { data: null };
report.profile = profile;

const { count: akavimCount } = await admin
  .from('vehicles')
  .select('id', { count: 'exact', head: true })
  .eq('company_name', 'אכבים')
  .neq('status', 'archived');
report.akavimActiveVehicles = akavimCount;

const { count: allActive } = await admin
  .from('vehicles')
  .select('id', { count: 'exact', head: true })
  .neq('status', 'archived');
report.allActiveVehicles = allActive;

if (authUser) {
  const userClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (linkErr) {
    report.userScope = { error: linkErr.message };
  } else {
    const { data: auth, error: verifyErr } = await userClient.auth.verifyOtp({
      email: EMAIL,
      token: linkData.properties.email_otp,
      type: 'email',
    });
    if (verifyErr || !auth.session) {
      report.userScope = { error: verifyErr?.message || 'verify failed' };
    } else {
      await userClient.auth.setSession(auth.session);
      const vRes = await userClient
        .from('vehicles')
        .select('id, license_plate, company_name, status, manufacturer, model, year')
        .eq('id', VEHICLE_ID)
        .maybeSingle();
      const dRes = await userClient
        .from('gps_devices')
        .select('id, unit_id, vehicle_id, company_name, enabled')
        .eq('unit_id', UNIT);
      const liveRes = await userClient
        .from('gps_live')
        .select('vehicle_id, unit_id, company_name, lat, lng')
        .eq('unit_id', UNIT);
      const listRes = await userClient
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'archived');
      const akavimRes = await userClient
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('company_name', 'אכבים')
        .neq('status', 'archived');
      const unknownRes = await userClient
        .from('gps_raw')
        .select('id, at, raw, reason, company_name')
        .eq('reason', 'unknown_device')
        .order('at', { ascending: false })
        .limit(8);
      report.userScope = {
        role: profile?.role || null,
        company: profile?.company_name || null,
        canReadVehicle36806603: Boolean(vRes.data),
        vehicleError: vRes.error?.message || null,
        vehicle: vRes.data,
        devices043284: dRes.data,
        devicesError: dRes.error?.message || null,
        gpsLive: liveRes.data,
        visibleActiveVehicles: listRes.count,
        visibleAkavimVehicles: akavimRes.count,
        unknownHints: (unknownRes.data || []).map((r) => /\$SLU([^,*]+)/i.exec(r.raw || '')?.[1] || null),
      };
    }
  }
}

writeFileSync(join(OUT, 'diagnose.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  mapping: report.devicesByUnit?.data,
  vehicle: report.vehicle,
  profile: report.profile,
  userScope: report.userScope,
  unknownHints: report.unknownRaw?.map((r) => r.unitHint),
  activeMappings: report.activeMappings,
  akavimActiveVehicles: report.akavimActiveVehicles,
  allActiveVehicles: report.allActiveVehicles,
}, null, 2));
