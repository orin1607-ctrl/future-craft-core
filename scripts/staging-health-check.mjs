/**
 * Full staging health check — read-only.
 * GitHub Pages + dalia-staging (usfeoerkpcafxxlyuldl) only.
 */
const STAGING_URL = 'https://usfeoerkpcafxxlyuldl.supabase.co';
const STAGING_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const PAGES = 'https://orin1607-ctrl.github.io/future-craft-core';

const REQUIRED_TABLES = [
  'vehicles', 'drivers', 'vehicle_tasks', 'faults', 'service_orders', 'accidents',
  'vehicle_inspections', 'vehicle_handovers', 'document_metadata', 'vehicle_exchanges',
  'expenses', 'vehicle_insurance_history', 'suppliers', 'company_settings',
  'profiles', 'user_roles', 'driver_notifications',
];

const VEHICLE_READ_COLUMNS = [
  'id', 'license_plate', 'internal_number', 'manufacturer', 'model', 'year', 'status',
  'company_name', 'notes', 'license_doc_url', 'insurance_doc_url', 'comprehensive_insurance_doc_url',
  'test_expiry', 'insurance_expiry', 'comprehensive_insurance_expiry', 'vin', 'fuel_type',
  'assigned_driver_id', 'odometer', 'management_type', 'approval_status', 'needs_transport',
  'created_at', 'updated_at',
];

const RELATED_TABLE_COLUMNS = {
  vehicle_tasks: ['id', 'vehicle_plate', 'title', 'status', 'created_at'],
  faults: ['id', 'vehicle_plate', 'fault_type', 'description', 'status', 'created_at'],
  service_orders: ['id', 'vehicle_plate', 'service_category', 'description', 'treatment_status', 'created_at'],
  accidents: ['id', 'vehicle_plate', 'description', 'status', 'created_at'],
  vehicle_inspections: ['id', 'vehicle_plate', 'inspection_type', 'inspection_date', 'overall_status'],
  vehicle_handovers: ['id', 'vehicle_plate', 'action_type', 'date_time'],
  document_metadata: ['id', 'vehicle_plate', 'file_path', 'original_name', 'created_at'],
  vehicle_exchanges: ['id', 'vehicle_plate', 'created_at'],
  vehicle_insurance_history: ['id', 'vehicle_id', 'year', 'insurer_name'],
};

const issues = [];
const passes = [];

function pass(msg) { passes.push(msg); }
function fail(msg) { issues.push(msg); }

async function probeTable(table) {
  const res = await fetch(`${STAGING_URL}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}`, Prefer: 'count=exact' },
  });
  if (res.ok || res.status === 401 || res.status === 403) return { ok: true, status: res.status };
  const body = await res.text();
  if (body.includes('does not exist') || body.includes('Could not find')) return { ok: false, body };
  return { ok: false, status: res.status, body: body.slice(0, 200) };
}

async function probeColumns(table, cols) {
  const res = await fetch(`${STAGING_URL}/rest/v1/${table}?select=${cols.join(',')}&limit=0`, {
    headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}` },
  });
  if (res.ok) return { ok: true, missing: [] };
  const body = await res.text();
  const missing = [];
  for (const col of cols) {
    const r = await fetch(`${STAGING_URL}/rest/v1/${table}?select=${col}&limit=0`, {
      headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}` },
    });
    if (!r.ok) missing.push(col);
  }
  return { ok: missing.length === 0, missing, error: body.slice(0, 150) };
}

// 8. Tables
for (const t of REQUIRED_TABLES) {
  const r = await probeTable(t);
  if (r.ok) pass(`table:${t}`);
  else fail(`table missing or error: ${t} — ${r.body || r.status}`);
}

// 9. Columns
const vehCols = await probeColumns('vehicles', VEHICLE_READ_COLUMNS);
if (vehCols.ok) pass('vehicles:all hub-read columns');
else fail(`vehicles missing columns: ${vehCols.missing.join(', ')}`);

for (const [table, cols] of Object.entries(RELATED_TABLE_COLUMNS)) {
  const r = await probeColumns(table, cols);
  if (r.ok) pass(`columns:${table}`);
  else fail(`${table} missing columns: ${r.missing.join(', ')}`);
}

// 6. Bundle uses staging only
const html = await (await fetch(`${PAGES}/`)).text();
const jsMatch = html.match(/src="([^"]+assets\/index-[^"]+\.js)"/);
if (!jsMatch) fail('Pages: no JS bundle in index.html');
else {
  const js = await (await fetch(new URL(jsMatch[1], `${PAGES}/`))).text();
  if (js.includes('usfeoerkpcafxxlyuldl')) pass('bundle:staging project id');
  else fail('bundle: staging project id NOT found');
  if (js.includes('qasomfndnjuixgjmjwcm')) fail('bundle: PRODUCTION project id found in bundle!');
  else pass('bundle:no production project id');

  const hubMarkers = ['VehicleHub', 'דשבורד רכב', 'vehicle-new-dalia', 'VehicleNewFormDalia'];
  for (const m of hubMarkers) {
    if (js.includes(m)) pass(`bundle:${m}`);
    else fail(`bundle missing: ${m}`);
  }
}

// vehicle-lookup edge function
const lookup = await fetch(`${STAGING_URL}/functions/v1/vehicle-lookup?plate=12345678`, {
  headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}` },
});
if (lookup.status === 404) fail('edge function vehicle-lookup not deployed');
else pass(`vehicle-lookup: status ${lookup.status}`);

// storage bucket
const bucket = await fetch(`${STAGING_URL}/storage/v1/bucket/documents`, {
  headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}` },
});
// anon may get 400/403 but bucket exists if not "Bucket not found"
const bucketBody = await bucket.text();
if (bucketBody.includes('Bucket not found')) fail('storage: documents bucket missing');
else pass('storage:documents bucket reachable');

// Pages routes return SPA shell
for (const path of ['/vehicles', '/dev/vehicle-card', '/dev/vehicle-new-dalia', '/dashboard', '/vehicle-import']) {
  const r = await fetch(`${PAGES}${path}`);
  const t = await r.text();
  const hasSpa = t.includes('/assets/index-') && t.includes('דליה');
  if (hasSpa) pass(`route SPA shell: ${path} (${r.status})`);
  else fail(`route broken: ${path} status=${r.status}`);
}

console.log(JSON.stringify({ ok: issues.length === 0, passCount: passes.length, issueCount: issues.length, issues, passes }, null, 2));
process.exit(issues.length === 0 ? 0 : 1);
