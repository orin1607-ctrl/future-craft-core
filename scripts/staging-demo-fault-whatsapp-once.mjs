/**
 * Staging ONLY — Demo fault (יוני אטיאס / פנצ׳ר) + ONE real WhatsApp send.
 * Pure fetch — no @supabase/supabase-js dependency.
 *
 * Safety:
 *  - Hard-coded Staging project usfeoerkpcafxxlyuldl
 *  - Aborts if Production ref detected
 *  - Exactly one WhatsApp delivery unless --dry-run-whatsapp
 *
 * Env (one of):
 *  - SUPABASE_ACCESS_TOKEN  → fetches service_role via supabase CLI
 *  - SUPABASE_SERVICE_ROLE_KEY (must be Staging usfeoerkpcafxxlyuldl)
 *
 * Usage:
 *   node scripts/staging-demo-fault-whatsapp-once.mjs
 *   node scripts/staging-demo-fault-whatsapp-once.mjs --dry-run-whatsapp
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const SB = `https://${STAGING}.supabase.co`;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const WA_DEST = '0534338601';
const DRIVER_NAME = 'יוני אטיאס';
const FAULT_TYPE = 'פנצ׳ר';
const OPEN_FAULT_STATUSES = ['opened', 'open', 'new', 'pending', 'in_progress', 'assigned'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'audit-reports', 'claims-incident-process');
const dryRunWhatsApp = process.argv.includes('--dry-run-whatsapp');

function abort(msg) {
  console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
  process.exit(1);
}

if (SB.includes(PROD) || process.env.VITE_SUPABASE_URL?.includes(PROD)) {
  abort('ABORT: Production project detected');
}

function decodeJwtPayload(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function resolveServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const payload = decodeJwtPayload(k);
    if (payload?.ref && payload.ref !== STAGING) {
      abort(`ABORT: SERVICE_ROLE ref=${payload.ref} ≠ Staging ${STAGING}`);
    }
    if (payload?.role && payload.role !== 'service_role') {
      abort(`ABORT: key role=${payload.role} (need service_role)`);
    }
    return k;
  }
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    abort(
      'Missing SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY for Staging usfeoerkpcafxxlyuldl',
    );
  }
  const keys = JSON.parse(
    execSync(`npx supabase projects api-keys --project-ref ${STAGING} -o json`, {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN },
    }),
  );
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key;
  if (!service) abort('Could not resolve Staging service_role key');
  return service;
}

function israelNowLabel(iso) {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso || Date.now()));
  } catch {
    return iso || new Date().toISOString();
  }
}

function buildWhatsAppPreview(record, link) {
  const plateLine = record.vehicle_internal_number
    ? `${record.vehicle_plate || '—'} (פנימי: ${record.vehicle_internal_number})`
    : record.vehicle_plate || '—';
  return [
    'דיווח תקלה חדש',
    `מספר אירוע: ${record.event_number || '—'}`,
    `חברה: ${record.company_name || '—'}`,
    `נהג: ${record.driver_name || '—'}`,
    `רכב: ${plateLine}`,
    `סוג תקלה: ${record.fault_type || FAULT_TYPE}`,
    `תאריך ושעה: ${israelNowLabel(record.created_at || record.date)}`,
    `תיאור: ${(record.description || '—').slice(0, 200)}`,
    'נציג דליה יחזור לנהג בהקדם.',
    'קישור לצפייה באירוע:',
    link,
  ].join('\n');
}

function restHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  };
}

async function restGet(table, query, key) {
  const res = await fetch(`${SB}/rest/v1/${table}?${query}`, { headers: restHeaders(key) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${table} GET ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function restPost(table, body, key) {
  const res = await fetch(`${SB}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders(key),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${table} POST ${res.status}: ${text.slice(0, 400)}`);
  return Array.isArray(json) ? json[0] : json;
}

async function rpc(fn, args, key) {
  const res = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: restHeaders(key),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${String(text).slice(0, 400)}`);
  return json;
}

const service = resolveServiceKey();

const report = {
  at: new Date().toISOString(),
  env: { staging: STAGING, url: SB, production_forbidden: PROD, dryRunWhatsApp },
  demo: { driverName: DRIVER_NAME, faultType: FAULT_TYPE, waDest: WA_DEST },
  checks: {},
  send: null,
  errors: [],
  warnings: [],
};

let drivers = await restGet(
  'drivers',
  'select=id,full_name,phone,email,company_name,user_id&full_name=ilike.*אטיאס*&limit=5',
  service,
);
let driver =
  (drivers || []).find((d) => (d.full_name || '').includes('יוני')) || (drivers || [])[0] || null;

if (!driver) {
  const byPhone = await restGet(
    'drivers',
    `select=id,full_name,phone,email,company_name,user_id&or=(phone.eq.${WA_DEST},phone.eq.972534338601,phone.ilike.*534338601*)&limit=1`,
    service,
  );
  driver = byPhone?.[0] || null;
}

if (!driver) {
  const any = await restGet(
    'drivers',
    'select=id,full_name,phone,email,company_name,user_id&full_name=neq.&limit=1',
    service,
  );
  driver = any?.[0] || null;
  if (!driver) abort('No drivers in Staging');
  report.warnings.push(
    `Driver "${DRIVER_NAME}" not found — using Staging driver "${driver.full_name}" id=${driver.id}; fault.driver_name will still be ${DRIVER_NAME}`,
  );
}

const company = driver.company_name || 'מוסך יוני';

let vehicles = await restGet(
  'vehicles',
  `select=id,license_plate,internal_number,company_name,assigned_driver_id,status&company_name=eq.${encodeURIComponent(company)}&license_plate=neq.&limit=1`,
  service,
);
let vehicle = vehicles?.[0] || null;
if (!vehicle) {
  vehicles = await restGet(
    'vehicles',
    'select=id,license_plate,internal_number,company_name,assigned_driver_id,status&license_plate=neq.&limit=1',
    service,
  );
  vehicle = vehicles?.[0] || null;
}
if (!vehicle) abort('No vehicles in Staging');

report.demo.driver = driver;
report.demo.vehicle = vehicle;
report.demo.company = company;

const roles = await restGet('user_roles', 'select=user_id,role&role=eq.super_admin&limit=20', service);
const saIds = new Set((roles || []).map((r) => r.user_id));

const usersRes = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, {
  headers: restHeaders(service),
});
const usersJson = await usersRes.json();
if (!usersRes.ok) abort(`listUsers: ${JSON.stringify(usersJson).slice(0, 300)}`);
const users = usersJson.users || [];
const adminUser =
  users.find((u) => saIds.has(u.id)) ||
  users.find((u) => (u.email || '').toLowerCase() === 'orin1607@gmail.com');
if (!adminUser) abort('No super_admin user in Staging Auth');

const linkRes = await fetch(`${SB}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: restHeaders(service),
  body: JSON.stringify({ type: 'magiclink', email: adminUser.email }),
});
const linkJson = await linkRes.json();
if (!linkRes.ok) abort(`generate_link: ${JSON.stringify(linkJson).slice(0, 300)}`);
const hashed = linkJson.hashed_token || linkJson.properties?.hashed_token;
if (!hashed) abort('generate_link missing hashed_token');

async function verifyOtp(type) {
  const res = await fetch(`${SB}/auth/v1/verify`, {
    method: 'POST',
    headers: restHeaders(ANON),
    body: JSON.stringify({ type, token_hash: hashed }),
  });
  const json = await res.json();
  return { ok: res.ok, json };
}

let otp = await verifyOtp('magiclink');
if (!otp.ok) otp = await verifyOtp('email');
if (!otp.ok || !otp.json?.access_token) {
  abort(`OTP verify failed: ${JSON.stringify(otp.json).slice(0, 300)}`);
}
const accessToken = otp.json.access_token;
report.actor = { email: adminUser.email, id: adminUser.id };

const eventNumber = await rpc(
  'allocate_incident_event_number',
  { p_company: company, p_prefix: 'FLT' },
  accessToken,
);
if (!eventNumber || typeof eventNumber !== 'string') {
  abort(`allocate_incident_event_number unexpected: ${JSON.stringify(eventNumber)}`);
}

const nowIso = new Date().toISOString();
const description = `בדיקת Demo Staging — תקלת פנצ׳ר (שליחת WhatsApp אחת) · ${nowIso}`;

const insertPayload = {
  vehicle_plate: vehicle.license_plate,
  driver_name: DRIVER_NAME,
  fault_type: FAULT_TYPE,
  fault_type_other: '',
  description,
  urgency: 'medium',
  notes: 'DEMO WhatsApp once — Staging only',
  images: '',
  status: 'opened',
  company_name: company,
  created_by: adminUser.id,
  opened_by_role: 'super_admin',
  event_number: eventNumber,
  serial_id: eventNumber,
  vehicle_id: vehicle.id,
  driver_id: driver.id,
  reporter_phone: WA_DEST,
  date: nowIso,
};

const fault = await restPost('faults', insertPayload, service);
report.fault = {
  id: fault.id,
  event_number: fault.event_number,
  status: fault.status,
  vehicle_id: fault.vehicle_id,
  driver_id: fault.driver_id,
  company_name: fault.company_name,
  fault_type: fault.fault_type,
  driver_name: fault.driver_name,
  vehicle_plate: fault.vehicle_plate,
};

const saved = (
  await restGet(
    'faults',
    `select=id,event_number,status,vehicle_id,driver_id,vehicle_plate,driver_name,fault_type,company_name&id=eq.${fault.id}&limit=1`,
    service,
  )
)?.[0];
report.checks.saved_in_db = Boolean(saved?.id);
report.checks.has_event_number = Boolean(saved?.event_number && String(saved.event_number).startsWith('FLT-'));

const statusIn = OPEN_FAULT_STATUSES.map((s) => `"${s}"`).join(',');
const trackingRow = (
  await restGet(
    'faults',
    `select=id,event_number,status,vehicle_plate&id=eq.${fault.id}&status=in.(${statusIn})&limit=1`,
    service,
  )
)?.[0];
report.checks.in_vehicle_tracking_open_faults = Boolean(trackingRow?.id);

const hubFaults = (
  await restGet(
    'faults',
    `select=id,event_number,status&vehicle_id=eq.${vehicle.id}&id=eq.${fault.id}&limit=1`,
    service,
  )
)?.[0];
report.checks.on_vehicle_card_hub = Boolean(hubFaults?.id);

const driverCardFaults = (
  await restGet(
    'faults',
    `select=id,event_number&driver_id=eq.${driver.id}&id=eq.${fault.id}&limit=1`,
    service,
  )
)?.[0];
report.checks.on_driver_card = Boolean(driverCardFaults?.id);

const driverDash = await restGet(
  'faults',
  `select=id,event_number,created_at&or=(driver_id.eq.${driver.id},driver_name.eq.${encodeURIComponent(DRIVER_NAME)})&order=created_at.desc&limit=10`,
  service,
);
report.checks.on_driver_dashboard = (driverDash || []).some((r) => r.id === fault.id);

const fleetDash = (
  await restGet(
    'faults',
    `select=id,event_number,company_name,status&company_name=eq.${encodeURIComponent(company)}&id=eq.${fault.id}&limit=1`,
    service,
  )
)?.[0];
report.checks.on_fleet_manager_dashboard = Boolean(fleetDash?.id);

const allChecksPass = Object.values(report.checks).every(Boolean);
report.checks_all_passed = allChecksPass;

const appOrigin = 'https://orin1607-ctrl.github.io/future-craft-core';
const link = `${appOrigin}/faults?id=${encodeURIComponent(fault.id)}`;
const message = buildWhatsAppPreview(
  {
    ...fault,
    vehicle_internal_number: vehicle.internal_number || null,
  },
  link,
);
report.message_text = message;

async function writeReport() {
  fs.mkdirSync(outDir, { recursive: true });
  const outJson = path.join(outDir, 'WHATSAPP-DEMO-SEND-REPORT.json');
  const outMd = path.join(outDir, 'WHATSAPP-DEMO-SEND-REPORT-HE.md');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  const md = `# דוח שליחת WhatsApp Demo — Staging בלבד

**זמן:** ${report.at}  
**פרויקט:** \`${STAGING}\`  
**Production:** לא נגע

## 1. האם ההודעה נשלחה בהצלחה
${report.send?.success ? 'כן' : 'לא'}${report.send?.dry_run ? ' (dry-run — לא נשלח באמת)' : ''}

## 2. זמן השליחה
${report.send?.sent_at || '—'}

## 3. מזהה השליחה
${report.send?.message_id || '—'}

## 4. לוג השליחה
\`\`\`json
${JSON.stringify(report.send?.log || report.send, null, 2)}
\`\`\`

## 5. שגיאות / אזהרות
- errors: ${report.errors.length ? report.errors.join(' | ') : 'אין'}
- warnings: ${report.warnings.length ? report.warnings.join(' | ') : 'אין'}

## אירוע Demo
- מספר אירוע: \`${fault.event_number}\`
- id: \`${fault.id}\`
- נהג (בטופס): ${DRIVER_NAME}
- סוג תקלה: ${FAULT_TYPE}
- רכב: ${vehicle.license_plate}${vehicle.internal_number ? ` (פנימי: ${vehicle.internal_number})` : ''}
- חברה: ${company}

## בדיקות לפני שליחה
${Object.entries(report.checks)
  .map(([k, v]) => `- ${k}: ${v ? 'PASS' : 'FAIL'}`)
  .join('\n')}

## טקסט ההודעה
\`\`\`
${message}
\`\`\`
`;
  fs.writeFileSync(outMd, md);
  return { outJson, outMd };
}

if (!allChecksPass) {
  report.errors.push('Pre-send verification failed — WhatsApp NOT sent');
  const paths = await writeReport();
  console.log(JSON.stringify({ ok: false, ...paths, report }, null, 2));
  process.exit(2);
}

if (dryRunWhatsApp) {
  report.send = {
    success: true,
    dry_run: true,
    destination: '972534338601',
    note: 'No real WhatsApp delivery (--dry-run-whatsapp)',
    sent_at: new Date().toISOString(),
  };
} else {
  const sentAt = new Date().toISOString();
  const res = await fetch(`${SB}/functions/v1/send-whatsapp-message`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'send_test',
      destination: WA_DEST,
      message,
    }),
  });
  const json = await res.json().catch(() => ({}));
  report.send = {
    http_status: res.status,
    success: json.success === true,
    sent_at: sentAt,
    destination: json.destination || null,
    message_id: json.message_id || null,
    gupshup_status: json.gupshup_status ?? null,
    gupshup_response: json.gupshup_response ?? null,
    edge_message: json.message || null,
    error: json.error || null,
    log: json,
  };
  if (!json.success) report.errors.push(json.error || `Edge HTTP ${res.status}`);
}

const paths = await writeReport();
console.log(
  JSON.stringify(
    { ok: report.send?.success === true, ...paths, send: report.send, checks: report.checks, fault: report.fault },
    null,
    2,
  ),
);
process.exit(report.send?.success ? 0 : 3);
