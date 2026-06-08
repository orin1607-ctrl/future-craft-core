/**
 * Read-only schema audit for dalia-staging (usfeoerkpcafxxlyuldl).
 * Does NOT modify any database.
 */
const STAGING_URL = 'https://usfeoerkpcafxxlyuldl.supabase.co';
const STAGING_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';

const REQUIRED_TABLES = [
  'vehicles',
  'drivers',
  'vehicle_tasks',
  'faults',
  'service_orders',
  'accidents',
  'vehicle_inspections',
  'vehicle_handovers',
  'document_metadata',
  'vehicle_exchanges',
  'expenses',
  'vehicle_insurance_history',
  'suppliers',
  'company_settings',
  'profiles',
  'user_roles',
  'driver_notifications',
];

const VEHICLE_COLUMNS = [
  'id',
  'license_plate',
  'internal_number',
  'manufacturer',
  'model',
  'year',
  'status',
  'company_name',
  'notes',
  'license_doc_url',
  'insurance_doc_url',
  'comprehensive_insurance_doc_url',
  'test_expiry',
  'insurance_expiry',
  'comprehensive_insurance_expiry',
  'vin',
  'fuel_type',
  'vehicle_color',
  'created_at',
];

async function probeTable(table) {
  const res = await fetch(`${STAGING_URL}/rest/v1/${table}?select=*&limit=0`, {
    headers: {
      apikey: STAGING_ANON,
      Authorization: `Bearer ${STAGING_ANON}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
  });
  if (res.status === 404 || res.status === 406) {
    return { table, ok: false, status: res.status, error: await res.text() };
  }
  if (!res.ok) {
    const body = await res.text();
    if (body.includes('does not exist') || body.includes('Could not find')) {
      return { table, ok: false, status: res.status, error: body.slice(0, 200) };
    }
    // RLS / auth may block but table exists
    if (res.status === 401 || res.status === 403) {
      return { table, ok: true, status: res.status, note: 'exists (RLS blocked)' };
    }
    return { table, ok: false, status: res.status, error: body.slice(0, 200) };
  }
  return { table, ok: true, status: res.status };
}

async function probeVehicleColumns() {
  const res = await fetch(`${STAGING_URL}/rest/v1/vehicles?select=${VEHICLE_COLUMNS.join(',')}&limit=0`, {
    headers: {
      apikey: STAGING_ANON,
      Authorization: `Bearer ${STAGING_ANON}`,
      Accept: 'application/json',
    },
  });
  if (res.ok) return { ok: true, columns: VEHICLE_COLUMNS };
  const body = await res.text();
  const missing = [];
  for (const col of VEHICLE_COLUMNS) {
    const r = await fetch(`${STAGING_URL}/rest/v1/vehicles?select=${col}&limit=0`, {
      headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}` },
    });
    if (!r.ok) missing.push(col);
  }
  return { ok: missing.length === 0, missing, error: body.slice(0, 300) };
}

async function probeVehicleLookup() {
  const res = await fetch(`${STAGING_URL}/functions/v1/vehicle-lookup`, {
    method: 'POST',
    headers: {
      apikey: STAGING_ANON,
      Authorization: `Bearer ${STAGING_ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plate: '1234567' }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 200);
  }
  return {
    status: res.status,
    deployed: res.status !== 404,
    response: parsed,
  };
}

async function probeStorageBucket() {
  const res = await fetch(`${STAGING_URL}/storage/v1/bucket/documents`, {
    headers: { apikey: STAGING_ANON, Authorization: `Bearer ${STAGING_ANON}` },
  });
  return { status: res.status, ok: res.ok, body: (await res.text()).slice(0, 200) };
}

const tables = [];
for (const t of REQUIRED_TABLES) {
  tables.push(await probeTable(t));
}

const vehicleCols = await probeVehicleColumns();
const vehicleLookup = await probeVehicleLookup();
const storage = await probeStorageBucket();

console.log(JSON.stringify({ project: 'usfeoerkpcafxxlyuldl', tables, vehicleCols, vehicleLookup, storage }, null, 2));
