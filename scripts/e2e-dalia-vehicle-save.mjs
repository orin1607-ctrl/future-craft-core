/**
 * E2E: Dalia form payload → vehicles (dalia-staging only).
 * Usage: TEST_EMAIL=... TEST_PASSWORD=... node scripts/e2e-dalia-vehicle-save.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function loadEnvFile() {
  for (const name of ['.env', '.env.local']) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    const env = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
    return env;
  }
  return {};
}

const fileEnv = loadEnvFile();
const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

const report = { ok: false, project: 'dalia-staging', steps: [], at: new Date().toISOString() };
mkdirSync('test-results', { recursive: true });

function step(name, detail) {
  report.steps.push({ name, ...detail });
  const mark = detail.ok === false ? 'FAIL' : detail.ok === 'skip' ? 'SKIP' : 'OK';
  console.log(`[${mark}] ${name}`, detail.message || '');
}

if (!url?.includes(STAGING_HOST)) {
  step('guard', { ok: false, message: `Refusing: URL must be ${STAGING_HOST}, got ${url || 'missing'}` });
  finish(1);
}
if (!key) {
  step('config', { ok: false, message: 'Missing VITE_SUPABASE_PUBLISHABLE_KEY' });
  finish(1);
}
if (!email || !password) {
  step('auth', { ok: 'skip', message: 'Set TEST_EMAIL + TEST_PASSWORD for live insert/read E2E' });
  finish(2);
}

const supabase = createClient(url, key);
const testPlate = `E2E${Date.now().toString().slice(-7)}`;

const sampleValues = {
  vehicle_plate: testPlate,
  internal_number: `INT-${testPlate}`,
  manufacturer: 'טויוטה',
  model: 'קורolla',
  year: '2022',
  vehicle_type: 'פרטי',
  vehicle_color: 'לבן',
  fuel_type: 'בenzin',
  vin: 'JTDBT923000000001',
  engine_number: 'ENG-E2E-001',
  ownership_type_text: 'חברה',
  vehicle_segment: 'B',
  road_date: '2022-03-01',
  last_test: '2025-01-15',
  next_test: '2026-01-15',
  vehicle_nickname: 'רכב בדיקה',
  current_km: '45000',
  department: 'לוגיסטיקה',
  work_site: 'מרכז',
  usage_type: 'עבודה',
  current_location: 'חניון A',
  vehicle_supervisor: 'מנהל בדיקה',
  vehicle_status: 'פעיל',
  assigned_driver: 'נהג בדיקה',
  company: '',
  last_service: '2025-06-01',
  next_service: '2025-12-01',
  next_service_km: '50000',
  maintenance_method: 'מוסך חברה',
  service_type: 'תקופתי',
  service_notes: 'הערות שירות E2E',
  inspection_date: '2025-05-01',
  purchase_date: '2022-02-01',
  end_or_scrap_date: '2032-02-01',
  horse_power: '120',
  engine_volume: '1600',
  weight: '1.4',
  coverage_glass: 'true',
  coverage_replacement: 'false',
  mandatory_insurance_company: 'הראל',
  mandatory_insurance_cost: '3500',
  ownership_route: 'ליסינג תפעולי',
  op_monthly_cost: '2800',
  maint_notes: 'תחזוקה E2E',
  test_status: 'תקין',
};

async function run() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) {
    step('sign-in', { ok: false, message: authErr.message });
    return finish(1);
  }
  step('sign-in', { ok: true, message: auth.user?.email });

  const profile = await supabase.from('profiles').select('company_name,full_name').eq('id', auth.user.id).single();
  const companyName = profile.data?.company_name || 'E2E Company';

  const insurancesJson = JSON.stringify({
    coverage: { glass: true, replacement: false },
    mandatory: { company: sampleValues.mandatory_insurance_company, cost: sampleValues.mandatory_insurance_cost },
  });
  const importBuffer = JSON.stringify({
    dalia_form: { vehicle_color: sampleValues.vehicle_color, end_or_scrap_date: sampleValues.end_or_scrap_date, assigned_driver: sampleValues.assigned_driver },
    saved_at: new Date().toISOString(),
  });

  const payload = {
    license_plate: testPlate,
    internal_number: sampleValues.internal_number,
    manufacturer: sampleValues.manufacturer,
    model: sampleValues.model,
    year: 2022,
    vehicle_type: sampleValues.vehicle_type,
    fuel_type: sampleValues.fuel_type,
    vin: sampleValues.vin,
    engine_number: sampleValues.engine_number,
    ownership_type: sampleValues.ownership_type_text,
    segment: sampleValues.vehicle_segment,
    road_entry_date: sampleValues.road_date,
    last_test_date: sampleValues.last_test,
    test_expiry: sampleValues.next_test,
    nickname: sampleValues.vehicle_nickname,
    odometer: 45000,
    department: sampleValues.department,
    work_site: sampleValues.work_site,
    usage_type: sampleValues.usage_type,
    current_location: sampleValues.current_location,
    vehicle_manager: sampleValues.vehicle_supervisor,
    status: 'active',
    company_name: companyName,
    last_service_date: sampleValues.last_service,
    next_service_date: sampleValues.next_service,
    next_service_km: 50000,
    maintenance_method: sampleValues.maintenance_method,
    service_type: sampleValues.service_type,
    service_notes: sampleValues.service_notes,
    last_inspection_date: sampleValues.inspection_date,
    sale_date: sampleValues.purchase_date,
    vehicle_color: sampleValues.vehicle_color,
    end_or_scrap_date: sampleValues.end_or_scrap_date,
    horsepower: 120,
    engine_volume: 1600,
    weight_tons: 1.4,
    test_status: sampleValues.test_status,
    finance_track: sampleValues.ownership_route,
    management_type: 'operational_leasing',
    is_leasing: true,
    monthly_leasing_cost: 2800,
    maintenance_details: JSON.stringify({ notes: sampleValues.maint_notes }),
    finance_details: JSON.stringify({ route: sampleValues.ownership_route }),
    insurances: insurancesJson,
    import_buffer: importBuffer,
    import_source: 'dalia_form',
    import_status: 'saved',
    approval_status: 'approved',
    created_by: auth.user.id,
  };

  const { data: inserted, error: insErr } = await supabase.from('vehicles').insert(payload).select('id').single();
  if (insErr) {
    step('insert', { ok: false, message: insErr.message });
    return finish(1);
  }
  const vehicleId = inserted.id;
  step('insert', { ok: true, message: `id=${vehicleId} plate=${testPlate}` });

  const { data: row, error: readErr } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();
  if (readErr) {
    step('read-back', { ok: false, message: readErr.message });
    return finish(1);
  }

  const checks = [
    ['license_plate', testPlate],
    ['manufacturer', sampleValues.manufacturer],
    ['model', sampleValues.model],
    ['odometer', 45000],
    ['import_source', 'dalia_form'],
  ];
  let failed = 0;
  for (const [col, expected] of checks) {
    if (row[col] !== expected) {
      step(`verify:${col}`, { ok: false, message: `expected ${expected}, got ${row[col]}` });
      failed++;
    }
  }
  if (failed === 0) step('verify-core', { ok: true, message: `${checks.length} fields match` });

  let buf = {};
  try {
    buf = JSON.parse(row.import_buffer || '{}');
  } catch {
    step('verify:import_buffer', { ok: false, message: 'invalid JSON' });
    failed++;
  }
  if (row.vehicle_color === sampleValues.vehicle_color) {
    step('verify:vehicle_color', { ok: true, message: `direct column = ${row.vehicle_color}` });
  } else {
    step('verify:vehicle_color', { ok: false, message: `expected ${sampleValues.vehicle_color}, got ${row.vehicle_color}` });
    failed++;
  }
  if (row.end_or_scrap_date === sampleValues.end_or_scrap_date) {
    step('verify:end_or_scrap_date', { ok: true, message: `direct column = ${row.end_or_scrap_date}` });
  } else {
    step('verify:end_or_scrap_date', { ok: false, message: `expected ${sampleValues.end_or_scrap_date}, got ${row.end_or_scrap_date}` });
    failed++;
  }

  const hubCols = [
    'license_plate',
    'manufacturer',
    'model',
    'status',
    'odometer',
    'test_expiry',
    'insurance_expiry',
    'vehicle_manager',
    'department',
  ];
  const { error: hubErr } = await supabase.from('vehicles').select(hubCols.join(',')).eq('id', vehicleId).single();
  step('hub-read', hubErr ? { ok: false, message: hubErr.message } : { ok: true, message: 'Hub columns readable' });

  await supabase.from('vehicles').delete().eq('id', vehicleId);
  step('cleanup', { ok: true, message: 'test row deleted' });

  report.ok = failed === 0 && !hubErr;
  report.testPlate = testPlate;
  report.vehicleId = vehicleId;
}

function finish(code) {
  writeFileSync('test-results/e2e-dalia-save.json', JSON.stringify(report, null, 2));
  console.log('\nReport → test-results/e2e-dalia-save.json');
  process.exit(code);
}

run().then(() => finish(report.ok ? 0 : 1)).catch((e) => {
  step('fatal', { ok: false, message: String(e) });
  finish(1);
});
