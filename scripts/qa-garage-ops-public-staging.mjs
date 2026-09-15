/**
 * PUBLIC STAGING QA for garage-ops foundation.
 * Target Pages: https://orin1607-ctrl.github.io/future-craft-core/
 * Target DB: usfeoerkpcafxxlyuldl
 * Forbidden: production / dalia-car.online / Gmail / DELETE
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PAGES_URL = 'https://orin1607-ctrl.github.io/future-craft-core/';
const PROD_URL = 'https://dalia-car.online/';
const EXPECTED_SHA = process.env.EXPECTED_PAGES_SHA || 'ad2d6e7d7c96f0376198594b14e1d68b65c54620';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function jwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function tokenIsStagingOnly(jwt) {
  const payload = jwtPayload(jwt);
  const blob = JSON.stringify(payload);
  if (blob.includes(PROD_REF) || /dalia-car\.online/i.test(blob)) return false;
  const ref = String(payload.ref || '');
  const iss = String(payload.iss || '');
  if (ref && ref !== STAGING_REF) return false;
  if (iss.includes(PROD_REF) || /dalia-car\.online/i.test(iss)) return false;
  if (ref === STAGING_REF) return true;
  if (iss.includes(STAGING_REF)) return true;
  return false;
}

function stagingAnonFallback() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
}

function asRows(body) {
  return Array.isArray(body) ? body : [];
}

async function restJson(url, anon, token, path, opts = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : []; } catch { body = { raw: text.slice(0, 400) }; }
  return { http: res.status, body };
}

async function signIn(url, anon, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 240) }; }
  if (!res.ok || !body?.access_token || !body?.user?.id) {
    throw new Error(body?.error_description || body?.msg || body?.error || `login HTTP ${res.status}`);
  }
  if (!tokenIsStagingOnly(body.access_token)) {
    throw new Error('Access token is not Staging. Refusing.');
  }
  return { token: body.access_token, userId: body.user.id, email };
}

async function invokeCreateUser(url, anon, token, payload) {
  const res = await fetch(`${url}/functions/v1/create-admin-user`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 400) }; }
  return { http: res.status, body };
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  return { http: res.status, text, headers: Object.fromEntries(res.headers.entries()) };
}

function writeReport(report) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'garage-ops-public-staging-qa.json'), JSON.stringify(report, null, 2));
}

const report = {
  at: new Date().toISOString(),
  pages_url: PAGES_URL,
  target: STAGING_REF,
  expected_sha: EXPECTED_SHA,
  production_touched: false,
  claims_gmail_touched: false,
  garage_gmail_touched: false,
  sql_schema_rls: false,
  verdict: 'FAIL_CLOSED',
  pages: {},
  production: {},
  users: {},
  isolation: {},
  notes: [],
};

const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY || stagingAnonFallback()).replace(/[\r\n]/g, '').trim();
if (!tokenIsStagingOnly(anon)) abort('Anon JWT is not Staging-only. Refusing.');

const pagesSha = await fetchText(`${PAGES_URL}staging-sha.txt?t=${Date.now()}`);
const pagesIndex = await fetchText(`${PAGES_URL}?t=${Date.now()}`);
const bundleMatch = pagesIndex.text.match(/assets\/index-[^"]+\.js/);
const bundleName = bundleMatch ? bundleMatch[0] : '';
const bundle = bundleName ? await fetchText(`${PAGES_URL}${bundleName}`) : { http: 0, text: '' };
const prodHead = await fetch(PROD_URL, { method: 'HEAD' });
const prodLastMod = prodHead.headers.get('last-modified') || '';

report.pages = {
  sha_file: pagesSha.text.trim(),
  sha_ok: pagesSha.text.trim() === EXPECTED_SHA,
  bundle: bundleName,
  has_garage_ops: bundle.text.includes('garage_ops'),
  has_garage_dashboard_title: bundle.text.includes('מרכז תפעול למוסך'),
  has_foundation_testid: bundle.text.includes('fleet-foundation-garage-ops'),
  has_edit_foundation_testid: bundle.text.includes('edit-fleet-foundation-garage-ops'),
  has_garage_ops_home: bundle.text.includes('garage-ops-home'),
  staging_ref_count: (bundle.text.match(/usfeoerkpcafxxlyuldl/g) || []).length,
  production_ref_count: (bundle.text.match(/qasomfndnjuixgjmjwcm/g) || []).length,
};
report.production = {
  last_modified: prodLastMod,
  unchanged_from_sep14: /14 Sep 2026 00:15:31/i.test(prodLastMod),
};

if (!report.pages.sha_ok || !report.pages.has_garage_ops || !report.pages.has_edit_foundation_testid || report.pages.production_ref_count > 0) {
  report.notes.push('Live Pages is not the garage-ops edit-choice SHA/bundle. STOP.');
  writeReport(report);
  console.log('FAIL_CLOSED pages', JSON.stringify(report.pages));
  process.exit(2);
}

const superEmail = String(process.env.STAGING_QA_EMAIL || '').trim();
const superPass = String(process.env.STAGING_QA_PASSWORD || '').trim();
const shopAEmail = String(process.env.STAGING_QA_FLEET_A_EMAIL || '').trim();
const shopAPass = String(process.env.STAGING_QA_FLEET_A_PASSWORD || '').trim();
const shopBEmail = String(process.env.STAGING_QA_FLEET_B_EMAIL || '').trim();
const shopBPass = String(process.env.STAGING_QA_FLEET_B_PASSWORD || '').trim();

async function profileOf(token, userId) {
  const profileRes = await restJson(STAGING_URL, anon, token, `profiles?id=eq.${userId}&select=id,company_name,full_name,job_title,is_active`);
  const roleRes = await restJson(STAGING_URL, anon, token, `user_roles?user_id=eq.${userId}&select=role`);
  const claimsRpc = await fetch(`${STAGING_URL}/rest/v1/rpc/claims_can_access`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const claimsText = await claimsRpc.text();
  let claimsBody;
  try { claimsBody = claimsText ? JSON.parse(claimsText) : null; } catch { claimsBody = claimsText.slice(0, 120); }
  const accessRes = await restJson(STAGING_URL, anon, token, `claims_access?user_id=eq.${userId}&select=user_id,worker_only`);
  const casesRes = await restJson(STAGING_URL, anon, token, 'garage_cases?select=id,shop_company_name&limit=100');
  const settingsRes = await restJson(
    STAGING_URL,
    anon,
    token,
    `company_settings?company_name=eq.${encodeURIComponent(asRows(profileRes.body)[0]?.company_name || '')}&select=company_name,hidden_buttons`,
  );
  const profile = asRows(profileRes.body)[0] || {};
  return {
    company_name: profile.company_name || '',
    full_name: profile.full_name || '',
    job_title: profile.job_title || '',
    is_active: profile.is_active,
    role: asRows(roleRes.body)[0]?.role || null,
    claims_can_access: claimsBody,
    claims_access_rows: asRows(accessRes.body),
    garage_case_count: asRows(casesRes.body).length,
    garage_shops: [...new Set(asRows(casesRes.body).map((r) => String(r.shop_company_name || '').trim()).filter(Boolean))],
    hidden_buttons: asRows(settingsRes.body)[0]?.hidden_buttons || [],
  };
}

if (shopAEmail && shopAPass && shopBEmail && shopBPass) {
  const a = await signIn(STAGING_URL, anon, shopAEmail, shopAPass);
  const b = await signIn(STAGING_URL, anon, shopBEmail, shopBPass);
  const aProf = await profileOf(a.token, a.userId);
  const bProf = await profileOf(b.token, b.userId);
  const aCasesOfB = await restJson(
    STAGING_URL,
    anon,
    a.token,
    `garage_cases?shop_company_name=eq.${encodeURIComponent(bProf.company_name)}&select=id`,
  );
  const bCasesOfA = await restJson(
    STAGING_URL,
    anon,
    b.token,
    `garage_cases?shop_company_name=eq.${encodeURIComponent(aProf.company_name)}&select=id`,
  );
  report.isolation = {
    a: { role: aProf.role, job_title: aProf.job_title, company: aProf.company_name, cases: aProf.garage_case_count, shops: aProf.garage_shops },
    b: { role: bProf.role, job_title: bProf.job_title, company: bProf.company_name, cases: bProf.garage_case_count, shops: bProf.garage_shops },
    a_sees_b_cases: asRows(aCasesOfB.body).length,
    b_sees_a_cases: asRows(bCasesOfA.body).length,
    regular_fleet_not_garage_ops: aProf.job_title !== 'garage_ops' && bProf.job_title !== 'garage_ops',
    roles_still_fleet_manager: aProf.role === 'fleet_manager' && bProf.role === 'fleet_manager',
    leak_blocked: asRows(aCasesOfB.body).length === 0 && asRows(bCasesOfA.body).length === 0,
  };
} else {
  report.notes.push('Fleet A/B secrets missing in this runner. Isolation login skipped here.');
}

if (!superEmail || !superPass) {
  report.notes.push('STAGING_QA_EMAIL/PASSWORD missing. User-create wizard path not executed against live Staging.');
  report.verdict = report.isolation.leak_blocked ? 'PARTIAL' : 'SKIP';
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PARTIAL' ? 0 : 3);
}

const superAuth = await signIn(STAGING_URL, anon, superEmail, superPass);
const superProf = await profileOf(superAuth.token, superAuth.userId);
if (superProf.role !== 'super_admin') {
  report.notes.push(`STAGING_QA_EMAIL is ${superProf.role}, not super_admin.`);
  writeReport(report);
  console.log('FAIL_CLOSED super_role', superProf.role);
  process.exit(2);
}

const stamp = Date.now();
const regularEmail = `qa.fleet.regular.${stamp}@placeholder.local`;
const garageEmail = `qa.garage.ops.${stamp}@placeholder.local`;
const regularPass = `QaReg-${stamp}x`;
const garagePass = `QaGar-${stamp}x`;
const regularCompany = `QA צי רגיל ${stamp}`;
const garageCompany = `QA מוסך יסוד ${stamp}`;

const regularCreate = await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  email: regularEmail,
  password: regularPass,
  full_name: 'QA מנהל צי רגיל',
  phone: '0500000001',
  role: 'fleet_manager',
  company_name: regularCompany,
  job_title: '',
  is_active: false,
  approval_status: 'pending',
});
const garageCreate = await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  email: garageEmail,
  password: garagePass,
  full_name: 'QA מנהל מוסך',
  phone: '0500000002',
  role: 'fleet_manager',
  company_name: garageCompany,
  job_title: 'garage_ops',
  is_active: false,
  approval_status: 'pending',
});

report.users.create_regular = { http: regularCreate.http, ok: regularCreate.body?.success === true, user_id: regularCreate.body?.user_id || null };
report.users.create_garage = {
  http: garageCreate.http,
  ok: garageCreate.body?.success === true,
  user_id: garageCreate.body?.user_id || null,
  garage_ops: garageCreate.body?.garage_ops === true,
};

if (!report.users.create_regular.ok || !report.users.create_garage.ok) {
  report.notes.push('create-admin-user failed for one of the QA users.');
  writeReport(report);
  console.log('FAIL_CLOSED create', JSON.stringify(report.users));
  process.exit(2);
}

const editEmail = `qa.fleet.edit.${stamp}@placeholder.local`;
const editPass = `QaEdit-${stamp}x`;
const editCreate = await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  email: editEmail,
  password: editPass,
  full_name: 'QA עריכת מנהל מוסך',
  phone: '0500000003',
  role: 'fleet_manager',
  company_name: regularCompany,
  job_title: 'מנהל צי',
  is_active: false,
  approval_status: 'pending',
});
report.users.create_edit_target = { http: editCreate.http, ok: editCreate.body?.success === true, user_id: editCreate.body?.user_id || null };
if (!report.users.create_edit_target.ok) {
  report.notes.push('create-admin-user failed for the edit-target QA user.');
  writeReport(report);
  console.log('FAIL_CLOSED create_edit', JSON.stringify(report.users.create_edit_target));
  process.exit(2);
}

await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  action: 'toggle-active',
  user_id: report.users.create_edit_target.user_id,
  is_active: true,
});
const editOn = await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  action: 'update-profile',
  user_id: report.users.create_edit_target.user_id,
  full_name: 'QA עריכת מנהל מוסך',
  phone: '0500000003',
  company_name: regularCompany,
  role: 'fleet_manager',
  is_active: true,
  job_title: 'garage_ops',
});
const editOnLogin = await signIn(STAGING_URL, anon, editEmail, editPass);
const editOnProf = await profileOf(editOnLogin.token, editOnLogin.userId);
const editOff = await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  action: 'update-profile',
  user_id: report.users.create_edit_target.user_id,
  full_name: 'QA עריכת מנהל מוסך',
  phone: '0500000003',
  company_name: regularCompany,
  role: 'fleet_manager',
  is_active: true,
  job_title: '',
});
const editOffLogin = await signIn(STAGING_URL, anon, editEmail, editPass);
const editOffProf = await profileOf(editOffLogin.token, editOffLogin.userId);
report.users.edit = {
  update_on_ok: editOn.body?.success === true || editOn.http === 200,
  after_on: { role: editOnProf.role, job_title: editOnProf.job_title, full_name: editOnProf.full_name },
  update_off_ok: editOff.body?.success === true || editOff.http === 200,
  after_off: { role: editOffProf.role, job_title: editOffProf.job_title },
};

await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  action: 'toggle-active',
  user_id: report.users.create_regular.user_id,
  is_active: true,
});
await invokeCreateUser(STAGING_URL, anon, superAuth.token, {
  action: 'toggle-active',
  user_id: report.users.create_garage.user_id,
  is_active: true,
});

const claimsInsert = await restJson(STAGING_URL, anon, superAuth.token, 'claims_access', {
  method: 'POST',
  body: { user_id: report.users.create_garage.user_id, worker_only: false },
});
report.users.claims_insert_http = claimsInsert.http;

const seedCheck = await restJson(
  STAGING_URL,
  anon,
  superAuth.token,
  `company_settings?company_name=eq.${encodeURIComponent(garageCompany)}&select=hidden_buttons`,
);
const garageHidden = asRows(seedCheck.body)[0]?.hidden_buttons || [];
if (!garageHidden.length) {
  await restJson(STAGING_URL, anon, superAuth.token, 'company_settings', {
    method: 'POST',
    body: {
      company_name: garageCompany,
      hidden_buttons: [
        '/vehicles', '/drivers', '/vehicle-tracking', '/fleetos-ai', '/transport', '/faults', '/garage',
        '/fleet-managers', '/customers', '/telemarketing/admin', '/alerts', '/expiry-approvals',
        '/emergency', '/internal-chat', '/admin-home', '/security-center', '/ai-marketing',
        '/dalia-settings', '/user-management', '/expenses', 'driver-hub-dashboard',
      ],
      require_driver_assignment: true,
      require_insurance_docs: true,
      require_no_claims: true,
      max_vehicles_without_assignment: 0,
      module_transport_enabled: false,
    },
  });
}

const regularLogin = await signIn(STAGING_URL, anon, regularEmail, regularPass);
const garageLogin = await signIn(STAGING_URL, anon, garageEmail, garagePass);
const regularAfter = await profileOf(regularLogin.token, regularLogin.userId);
const garageAfter = await profileOf(garageLogin.token, garageLogin.userId);

const garageSeesA = await restJson(
  STAGING_URL,
  anon,
  garageLogin.token,
  `garage_cases?shop_company_name=eq.${encodeURIComponent(report.isolation.a?.company || 'אכבים')}&select=id`,
);

report.users.regular = {
  role: regularAfter.role,
  job_title: regularAfter.job_title,
  company: regularAfter.company_name,
  claims_can_access: regularAfter.claims_can_access,
  hidden_buttons: regularAfter.hidden_buttons,
};
report.users.garage = {
  role: garageAfter.role,
  job_title: garageAfter.job_title,
  company: garageAfter.company_name,
  claims_can_access: garageAfter.claims_can_access,
  claims_access_rows: garageAfter.claims_access_rows,
  hidden_buttons: garageAfter.hidden_buttons,
  garage_case_count: garageAfter.garage_case_count,
  sees_foreign_shop_cases: asRows(garageSeesA.body).length,
};

const coreVisible = ['/garage-management', '/claims', '/reports'].every((p) => !garageAfter.hidden_buttons.includes(p));
const vehiclesHidden = garageAfter.hidden_buttons.includes('/vehicles');

const ok =
  regularAfter.role === 'fleet_manager'
  && regularAfter.job_title !== 'garage_ops'
  && garageAfter.role === 'fleet_manager'
  && garageAfter.job_title === 'garage_ops'
  && garageAfter.claims_can_access === true
  && coreVisible
  && vehiclesHidden
  && asRows(garageSeesA.body).length === 0
  && report.pages.sha_ok
  && report.pages.has_edit_foundation_testid
  && report.pages.production_ref_count === 0
  && report.production.unchanged_from_sep14
  && (report.isolation.leak_blocked !== false)
  && editOnProf.role === 'fleet_manager'
  && editOnProf.job_title === 'garage_ops'
  && editOffProf.role === 'fleet_manager'
  && editOffProf.job_title !== 'garage_ops'
  && editOnProf.full_name === 'QA עריכת מנהל מוסך'
  && editOffProf.full_name === 'QA עריכת מנהל מוסך';

report.checks = {
  regular_still_fleet_manager: regularAfter.role === 'fleet_manager',
  regular_not_garage_ops: regularAfter.job_title !== 'garage_ops',
  garage_still_fleet_manager: garageAfter.role === 'fleet_manager',
  garage_job_title: garageAfter.job_title === 'garage_ops',
  garage_claims_access: garageAfter.claims_can_access === true,
  garage_core_modules_visible: coreVisible,
  garage_vehicles_hidden_by_default: vehiclesHidden,
  garage_cannot_see_foreign_shop: asRows(garageSeesA.body).length === 0,
  pages_sha_live: report.pages.sha_ok,
  production_unchanged: report.production.unchanged_from_sep14,
  isolation_ok: report.isolation.leak_blocked !== false,
  edit_sets_garage_ops: editOnProf.role === 'fleet_manager' && editOnProf.job_title === 'garage_ops',
  edit_clears_garage_ops: editOffProf.role === 'fleet_manager' && editOffProf.job_title !== 'garage_ops',
  bundle_has_edit_choice: report.pages.has_edit_foundation_testid === true,
  bundle_staging_only: report.pages.production_ref_count === 0,
};

report.verdict = ok ? 'PASS' : 'FAIL_CLOSED';
writeReport(report);
console.log(JSON.stringify({ verdict: report.verdict, checks: report.checks, pages: report.pages, isolation: report.isolation, users: {
  regular: report.users.regular,
  garage: report.users.garage,
} }, null, 2));
process.exit(ok ? 0 : 2);
