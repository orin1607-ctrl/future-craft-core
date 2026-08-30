/**
 * Apply gps_* telematics tables to Oren Car Staging ONLY.
 * Never targets Production qasomfndnjuixgjmjwcm.
 * node scripts/apply-fleetos-gps-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const SQL = join(process.cwd(), 'supabase/migrations/20260830180000_fleetos_gps_telematics_staging.sql');
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-gps-staging-2026-08-30');
const GPS_TABLES = [
  'gps_devices',
  'gps_device_assignments',
  'gps_live',
  'gps_positions',
  'gps_events',
  'gps_raw',
  'gps_can_maps',
];

mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  productionRef: PROD_REF,
  checks: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.detail ? ` — ${extra.detail}` : ''}`);
}

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-fleetos-gps-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}

function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

function extractJson(raw) {
  const parsed = JSON.parse(String(raw));
  if (parsed?.rows?.[0]?.json_build_object) return parsed.rows[0].json_build_object;
  if (parsed && typeof parsed === 'object' && !parsed.rows) return parsed;
  const s = String(raw);
  const start = s.indexOf('{');
  if (start < 0) return s.trim();
  return JSON.parse(s.slice(start));
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
rec('linked Staging only', linked === STAGING_REF, { linked });

const pre = extractJson(dbQueryText(`
  SELECT json_build_object(
    'gps_tables_before', (SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)
      FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'gps_%'),
    'vehicles_has_imei', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'imei'
    ),
    'faults', (SELECT count(*) FROM public.faults),
    'accidents', (SELECT count(*) FROM public.accidents),
    'expenses', (SELECT count(*) FROM public.expenses)
  );
`));
writeFileSync(join(OUT, 'pre-migration.json'), JSON.stringify(pre, null, 2));
rec('vehicles has no imei column', pre.vehicles_has_imei === false);
const businessBefore = { faults: Number(pre.faults), accidents: Number(pre.accidents), expenses: Number(pre.expenses) };

dbQuery(SQL);
rec('migration applied', true);

const verify = extractJson(dbQueryText(`
  SELECT json_build_object(
    'tables', (SELECT json_agg(tablename ORDER BY tablename)
      FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY (ARRAY[
        'gps_devices','gps_device_assignments','gps_live','gps_positions','gps_events','gps_raw','gps_can_maps'
      ])),
    'rls', (SELECT json_object_agg(c.relname, c.relrowsecurity)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'gps_%'),
    'policies', (SELECT json_agg(polname ORDER BY polname)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'gps_%'),
    'vehicles_has_imei', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'imei'
    )
  );
`));
writeFileSync(join(OUT, 'verify-schema.json'), JSON.stringify(verify, null, 2));
const tables = verify.tables || [];
rec('all seven gps tables exist', GPS_TABLES.every((t) => tables.includes(t)), { tables });
rec('RLS enabled on gps_*', GPS_TABLES.every((t) => verify.rls?.[t] === true), { rls: Object.fromEntries(GPS_TABLES.map((t) => [t, verify.rls?.[t]])) });
rec('vehicles still has no imei', verify.vehicles_has_imei === false);
rec('policies created', Array.isArray(verify.policies) && verify.policies.length >= 14, { count: (verify.policies || []).length });

const rollbackAfter = extractJson(dbQueryText(`
  BEGIN;
  DROP TABLE IF EXISTS public.gps_raw CASCADE;
  DROP TABLE IF EXISTS public.gps_events CASCADE;
  DROP TABLE IF EXISTS public.gps_positions CASCADE;
  DROP TABLE IF EXISTS public.gps_live CASCADE;
  DROP TABLE IF EXISTS public.gps_can_maps CASCADE;
  DROP TABLE IF EXISTS public.gps_device_assignments CASCADE;
  DROP TABLE IF EXISTS public.gps_devices CASCADE;
  ROLLBACK;
  SELECT json_build_object(
    'after', (SELECT json_agg(tablename ORDER BY tablename)
      FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY (ARRAY[
        'gps_devices','gps_device_assignments','gps_live','gps_positions','gps_events','gps_raw','gps_can_maps'
      ]))
  );
`));
writeFileSync(join(OUT, 'rollback-probe.json'), JSON.stringify(rollbackAfter, null, 2));
rec(
  'rollback SQL valid (DROP in transaction rolled back; tables remain)',
  GPS_TABLES.every((t) => (rollbackAfter.after || []).includes(t)),
  { after: rollbackAfter.after },
);

const keysRaw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(keysRaw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: vehicles, error: vehErr } = await admin
  .from('vehicles')
  .select('id, license_plate, company_name')
  .not('company_name', 'is', null)
  .limit(80);
if (vehErr) throw vehErr;
const byCompany = new Map();
for (const v of vehicles || []) {
  if (!v.company_name || !v.id) continue;
  if (!byCompany.has(v.company_name)) byCompany.set(v.company_name, v);
}
const companies = [...byCompany.keys()];
rec('two companies available for isolation QA', companies.length >= 2, { companies: companies.slice(0, 6) });
if (companies.length < 2) {
  writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
  throw new Error('need two companies in vehicles for isolation QA');
}

const preferred = companies.filter((c) => !/בארי|beeri/i.test(c));
const pick = preferred.length >= 2 ? preferred : companies;
const va = byCompany.get(pick[0]);
const vb = byCompany.get(pick[1]);
rec('QA companies chosen (not Beeri if avoidable)', true, { a: va.company_name, b: vb.company_name });
const stamp = Date.now();
const unitA = `QAERM-A-${stamp}`;
const unitB = `QAERM-B-${stamp}`;
const imeiA = `35600000000${String(stamp).slice(-4)}`.slice(0, 15);
const imeiB = `35600000001${String(stamp).slice(-4)}`.slice(0, 15);

const insA = await admin.from('gps_devices').insert({
  unit_id: unitA, imei: imeiA, vehicle_id: va.id, company_name: va.company_name, enabled: true,
}).select('id').single();
const insB = await admin.from('gps_devices').insert({
  unit_id: unitB, imei: imeiB, vehicle_id: vb.id, company_name: vb.company_name, enabled: true,
}).select('id').single();
rec('IMEI assign write (company A+B)', !insA.error && !insB.error, { a: insA.error?.message, b: insB.error?.message });
const devA = insA.data?.id;
const devB = insB.data?.id;

await admin.from('gps_device_assignments').insert([
  { device_id: devA, vehicle_id: va.id, company_name: va.company_name, action: 'assign' },
  { device_id: devB, vehicle_id: vb.id, company_name: vb.company_name, action: 'assign' },
]);

const liveA = await admin.from('gps_live').insert({
  device_id: devA, vehicle_id: va.id, company_name: va.company_name, unit_id: unitA, imei: imeiA,
  last_seen: new Date().toISOString(), last_seq: '01', last_cmd: '06',
  freshness: 'live', lat: 32.0853, lng: 34.7818, speed_kmh: 42, heading: 90,
  ignition: true, engine: true, motion: 'driving', odometer: 50100,
  can_raw: { CV1: '88' }, tags: { EID: '01' },
});
const liveB = await admin.from('gps_live').insert({
  device_id: devB, vehicle_id: vb.id, company_name: vb.company_name, unit_id: unitB, imei: imeiB,
  last_seen: new Date().toISOString(), last_seq: '01', last_cmd: '06',
  freshness: 'stale', lat: 32.79, lng: 35.0, speed_kmh: 0, gps_age_sec: 400,
  ignition: false, motion: 'stopped', can_raw: {}, tags: {},
});
rec('Live write', !liveA.error && !liveB.error, { a: liveA.error?.message, b: liveB.error?.message });

const { data: liveRead } = await admin.from('gps_live').select('vehicle_id, freshness, unit_id').in('device_id', [devA, devB]);
rec('Live read', (liveRead || []).length === 2, { count: (liveRead || []).length });

const hist = await admin.from('gps_positions').insert([
  { device_id: devA, vehicle_id: va.id, company_name: va.company_name, lat: 32.08, lng: 34.78, speed_kmh: 30, heading: 80, at: new Date(Date.now() - 60000).toISOString() },
  { device_id: devA, vehicle_id: va.id, company_name: va.company_name, lat: 32.0853, lng: 34.7818, speed_kmh: 42, heading: 90, at: new Date().toISOString() },
]);
rec('History write', !hist.error, { err: hist.error?.message });
const { data: histRead } = await admin.from('gps_positions').select('id').eq('device_id', devA);
rec('History read', (histRead || []).length >= 2, { count: (histRead || []).length });

const ev = await admin.from('gps_events').insert([
  { device_id: devA, vehicle_id: va.id, company_name: va.company_name, eid: '70', event_key: 'dtc', label_he: 'DTC', severity: 'warning', at: new Date().toISOString(), tags: {} },
  { device_id: devB, vehicle_id: vb.id, company_name: vb.company_name, eid: '41', event_key: 'impact', label_he: 'Impact', severity: 'critical', at: new Date().toISOString(), tags: {} },
]);
rec('Events write', !ev.error, { err: ev.error?.message });
const { data: evRead } = await admin.from('gps_events').select('event_key, company_name').in('device_id', [devA, devB]);
rec('Events read', (evRead || []).length === 2, { keys: (evRead || []).map((e) => e.event_key) });

const raw = await admin.from('gps_raw').insert({
  device_id: devA, company_name: va.company_name, raw: '$SLUQA*00', reason: 'ok',
});
rec('Raw write', !raw.error, { err: raw.error?.message });
const { data: rawRead } = await admin.from('gps_raw').select('id').eq('device_id', devA);
rec('Raw read', (rawRead || []).length >= 1);

const can = await admin.from('gps_can_maps').insert({
  vehicle_id: va.id, company_name: va.company_name, cv_tag: 'CV1', label_he: 'QA oil temp',
});
rec('CAN mapping write', !can.error, { err: can.error?.message });
const { data: canRead } = await admin.from('gps_can_maps').select('cv_tag, label_he').eq('vehicle_id', va.id);
rec('CAN mapping read', (canRead || []).some((r) => r.cv_tag === 'CV1'), { rows: canRead });

const afterBiz = extractJson(dbQueryText(`
  SELECT json_build_object(
    'faults', (SELECT count(*) FROM public.faults),
    'accidents', (SELECT count(*) FROM public.accidents),
    'expenses', (SELECT count(*) FROM public.expenses)
  );
`));
rec('no write to faults/accidents/expenses',
  Number(afterBiz.faults) === businessBefore.faults
  && Number(afterBiz.accidents) === businessBefore.accidents
  && Number(afterBiz.expenses) === businessBefore.expenses,
  { before: businessBefore, after: afterBiz });

async function clientForEmail(email) {
  const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email, token: linkData.properties.email_otp, type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verify ${email}`);
  return client;
}

const { data: roleRows } = await admin.from('user_roles').select('user_id, role');
const { data: profiles } = await admin.from('profiles').select('id, company_name');
const profileById = new Map((profiles || []).map((p) => [p.id, p]));

async function emailForCompany(companyName) {
  const ids = (profiles || []).filter((p) => p.company_name === companyName).map((p) => p.id);
  const role = (roleRows || []).find(
    (r) => ids.includes(r.user_id) && r.role !== 'super_admin' && r.role !== 'driver',
  ) || (roleRows || []).find((r) => ids.includes(r.user_id) && r.role !== 'super_admin');
  const uid = role?.user_id || ids[0];
  if (!uid) return null;
  const { data, error } = await admin.auth.admin.getUserById(uid);
  if (error || !data?.user?.email) return null;
  if (role?.role === 'super_admin') return null;
  return { email: data.user.email, role: role?.role || 'unknown', userId: uid };
}

const userA = await emailForCompany(va.company_name);
const userB = await emailForCompany(vb.company_name);

if (userA && userB && userA.email !== userB.email) {
  const clientA = await clientForEmail(userA.email);
  const clientB = await clientForEmail(userB.email);
  const { data: seenA } = await clientA.from('gps_live').select('company_name, vehicle_id');
  const { data: seenB } = await clientB.from('gps_live').select('company_name, vehicle_id');
  const leakA = (seenA || []).some((r) => r.company_name === vb.company_name);
  const leakB = (seenB || []).some((r) => r.company_name === va.company_name);
  rec('RLS company isolation', !leakA && !leakB, {
    a: { email: userA.email, role: userA.role, count: (seenA || []).length },
    b: { email: userB.email, role: userB.role, count: (seenB || []).length },
    leakA,
    leakB,
  });
  rec('two companies separated', !leakA && !leakB);
} else {
  rec('RLS company isolation', false, { detail: 'no non-admin users on both companies', userA, userB });
  rec('two companies separated', false, { detail: 'could not log in two company-scoped users' });
}

await admin.from('gps_raw').delete().in('device_id', [devA, devB]);
await admin.from('gps_events').delete().in('device_id', [devA, devB]);
await admin.from('gps_positions').delete().in('device_id', [devA, devB]);
await admin.from('gps_live').delete().in('device_id', [devA, devB]);
await admin.from('gps_can_maps').delete().eq('vehicle_id', va.id).eq('cv_tag', 'CV1');
await admin.from('gps_device_assignments').delete().in('device_id', [devA, devB]);
await admin.from('gps_devices').delete().in('id', [devA, devB]);
rec('QA rows cleaned', true);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
