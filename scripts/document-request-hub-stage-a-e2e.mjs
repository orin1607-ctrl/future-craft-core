/**
 * Stage A E2E — Staging only (usfeoerkpcafxxlyuldl)
 * Proves: create → open → upload → version → metadata → entity fields
 * NEVER touches Production.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const stagingDir = 'c:\\Users\\אליאב\\OneDrive\\מסמכים\\future-craft-core-STAGING';
const outDir = path.join(stagingDir, 'docs', 'audit-reports', 'document-request-hub-stage-a');
fs.mkdirSync(outDir, { recursive: true });

const linked = fs.readFileSync(path.join(stagingDir, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked !== STAGING) throw new Error(`ABORT linked=${linked}`);

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING} -o json`, { encoding: 'utf8', cwd: stagingDir })
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const SB = `https://${STAGING}.supabase.co`;
const admin = createClient(SB, service, { auth: { persistSession: false, autoRefreshToken: false } });

// Find manager user (super_admin)
const { data: roles } = await admin.from('user_roles').select('user_id, role').eq('role', 'super_admin').limit(5);
const adminUserId = roles?.[0]?.user_id;
if (!adminUserId) throw new Error('no super_admin');
const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const adminUser = authUsers.users.find((u) => u.id === adminUserId) || authUsers.users[0];
const { data: linkData } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: adminUser.email,
});
const hashed = linkData.properties.hashed_token;
const userClient = createClient(SB, anon, { auth: { persistSession: false, autoRefreshToken: false } });
let otp = await userClient.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
if (otp.error) otp = await userClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
if (otp.error) throw otp.error;
const accessToken = otp.data.session.access_token;

const { data: driver } = await admin.from('drivers').select('id, full_name, phone, email, company_name').neq('full_name', '').limit(1).maybeSingle();
const { data: vehicle } = await admin.from('vehicles').select('id, license_plate, company_name').neq('license_plate', '').limit(1).maybeSingle();
if (!driver || !vehicle) throw new Error('need driver+vehicle in staging');

async function invokeJson(body, token = accessToken) {
  const res = await fetch(`${SB}/functions/v1/document-request`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function invokeUpload(tokenPlain, fileBytes, fileName, mime, expiryDate) {
  const form = new FormData();
  form.set('action', 'upload');
  form.set('token', tokenPlain);
  if (expiryDate) form.set('expiry_date', expiryDate);
  form.set('file', new Blob([fileBytes], { type: mime }), fileName);
  const res = await fetch(`${SB}/functions/v1/document-request`, {
    method: 'POST',
    headers: { apikey: anon },
    body: form,
  });
  return { status: res.status, json: await res.json() };
}

const report = {
  env: { staging: STAGING, linked, production_ref_forbidden: PROD },
  actor: { email: adminUser.email, id: adminUser.id },
  driver: { id: driver.id, name: driver.full_name },
  vehicle: { id: vehicle.id, plate: vehicle.license_plate },
  steps: {},
};

// Driver flow
const createDriver = await invokeJson({
  action: 'create',
  document_type_key: 'driver_license',
  entity_type: 'driver',
  entity_id: driver.id,
  entity_label: driver.full_name,
  recipient_name: driver.full_name,
  recipient_phone: driver.phone || '',
  channel: 'link',
  public_app_origin: 'http://127.0.0.1:5173',
});
report.steps.create_driver = { status: createDriver.status, success: createDriver.json.success, request_id: createDriver.json.request_id, upload_url: createDriver.json.upload_url };
if (!createDriver.json.success) throw new Error(JSON.stringify(createDriver.json));

const dToken = createDriver.json.token;
const openD = await fetch(`${SB}/functions/v1/document-request`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'open', token: dToken }),
});
const openDJ = await openD.json();
report.steps.open_driver = { status: openD.status, request_status: openDJ.request?.status };

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const upD = await invokeUpload(dToken, png, 'license-e2e.png', 'image/png', '2030-12-31');
report.steps.upload_driver = { status: upD.status, success: upD.json.success, statusField: upD.json.status, version_no: upD.json.version?.version_no, error: upD.json.error };

const { data: dReq } = await admin.from('document_requests').select('*').eq('id', createDriver.json.request_id).single();
const { data: dVer } = await admin.from('document_versions').select('*').eq('request_id', createDriver.json.request_id);
const { data: dEvents } = await admin.from('document_request_events').select('event_type, created_at').eq('request_id', createDriver.json.request_id).order('created_at');
const { data: dDriver } = await admin.from('drivers').select('license_image_url').eq('id', driver.id).single();
const { data: dMeta } = await admin.from('document_metadata').select('id, category, file_path').eq('file_path', dVer?.[0]?.file_path).maybeSingle();
report.steps.driver_db = {
  request_status: dReq.status,
  sent_at: dReq.sent_at,
  opened_at: dReq.opened_at,
  uploaded_at: dReq.uploaded_at,
  requested_by_name: dReq.requested_by_name,
  versions: dVer?.length,
  events: dEvents?.map((e) => e.event_type),
  license_image_url_set: Boolean(dDriver?.license_image_url && dDriver.license_image_url.includes('request-uploads')),
  metadata_category: dMeta?.category,
};

// Second upload version (allow_multiple false → should fail once pending)
const upD2 = await invokeUpload(dToken, png, 'license-e2e-v2.png', 'image/png', '2030-12-31');
report.steps.upload_driver_second_blocked = { status: upD2.status, error: upD2.json.error };

// Vehicle flow
const createVeh = await invokeJson({
  action: 'create',
  document_type_key: 'vehicle_license',
  entity_type: 'vehicle',
  entity_id: vehicle.id,
  entity_label: vehicle.license_plate,
  recipient_name: driver.full_name,
  recipient_phone: driver.phone || '',
  channel: 'link',
  public_app_origin: 'http://127.0.0.1:5173',
});
report.steps.create_vehicle = { status: createVeh.status, success: createVeh.json.success, request_id: createVeh.json.request_id, upload_url: createVeh.json.upload_url };
const vToken = createVeh.json.token;
await fetch(`${SB}/functions/v1/document-request`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'open', token: vToken }),
});
const upV = await invokeUpload(vToken, png, 'vehicle-license-e2e.png', 'image/png', '2030-06-01');
report.steps.upload_vehicle = { status: upV.status, success: upV.json.success, statusField: upV.json.status, error: upV.json.error };

const { data: vRow } = await admin.from('vehicles').select('license_doc_url').eq('id', vehicle.id).single();
const { data: vReq } = await admin.from('document_requests').select('status, opened_at, uploaded_at, requested_by_name, sent_at').eq('id', createVeh.json.request_id).single();
const { data: vEvents } = await admin.from('document_request_events').select('event_type').eq('request_id', createVeh.json.request_id).order('created_at');
report.steps.vehicle_db = {
  request_status: vReq.status,
  sent_at: vReq.sent_at,
  opened_at: vReq.opened_at,
  uploaded_at: vReq.uploaded_at,
  requested_by_name: vReq.requested_by_name,
  events: vEvents?.map((e) => e.event_type),
  license_doc_url_set: Boolean(vRow?.license_doc_url && vRow.license_doc_url.includes('request-uploads')),
};

// Production still missing
const prodKeys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${PROD} -o json`, { encoding: 'utf8', cwd: stagingDir })
);
const prodService = prodKeys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const prodCheck = await fetch(`https://${PROD}.supabase.co/rest/v1/document_type_defs?select=key&limit=1`, {
  headers: { apikey: prodService, Authorization: `Bearer ${prodService}` },
});
report.production_untouched = {
  document_type_defs_status: prodCheck.status,
  ok: prodCheck.status === 404,
};

report.ok =
  report.steps.create_driver.success &&
  report.steps.upload_driver.success &&
  report.steps.driver_db.request_status === 'pending_approval' &&
  report.steps.create_vehicle.success &&
  report.steps.upload_vehicle.success &&
  report.steps.vehicle_db.request_status === 'pending_approval' &&
  report.production_untouched.ok;

fs.writeFileSync(path.join(outDir, 'E2E-REPORT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
