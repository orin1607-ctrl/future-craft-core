/**
 * Catalog + isolation probe for garage tenant SQL on PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl
 * Forbidden: qasomfndnjuixgjmjwcm / dalia-car.online
 *
 * Fetch-only (no @supabase/supabase-js). Does not DELETE rows.
 * Does not touch Claims Gmail. Does not open fleet_manager UI.
 * Isolation PASS requires two fleet_manager QA users of different companies
 * AND a super_admin login that can see the empty-shop row.
 * Missing fleet QA credentials = SKIP (not PASS). Missing column = FAIL CLOSED.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

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

function jwtRef(jwt) {
  const payload = jwtPayload(jwt);
  return String(payload.ref || '');
}

function tokenIsStagingOnly(jwt) {
  const payload = jwtPayload(jwt);
  const blob = JSON.stringify(payload);
  if (blob.includes(PROD_REF) || /dalia-car\.online/i.test(blob)) return false;
  const ref = String(payload.ref || '');
  const iss = String(payload.iss || '');
  if (ref && ref !== STAGING_REF) return false;
  if (iss.includes(PROD_REF) || /dalia-car\.online/i.test(iss)) return false;
  // Anon/service keys use iss=supabase + ref=<project>. User access tokens use the project URL as iss.
  if (ref === STAGING_REF) return true;
  if (iss.includes(STAGING_REF)) return true;
  return false;
}

function stagingAnonFallback() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
}

function guardUrl(url, label) {
  const v = String(url || '');
  if (!v) abort(`Missing ${label}`);
  if (v.includes(PROD_REF) || /dalia-car\.online/i.test(v)) abort(`${label} looks like Production. Refusing.`);
  if (!v.includes(STAGING_REF)) abort(`${label} is not Staging ${STAGING_REF}. Refusing.`);
}

function writeReport(report) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'garage-tenant-isolation-qa.json'), JSON.stringify(report, null, 2));
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
  try { body = text ? JSON.parse(text) : []; } catch { body = { raw: text.slice(0, 240) }; }
  return { http: res.status, body };
}

async function probeColumn(url, anon) {
  const res = await restJson(url, anon, anon, 'garage_customers?select=shop_company_name&limit=1');
  const message = String(res.body?.message || res.body?.error || res.body?.raw || '');
  const missing = res.http === 400 && /shop_company_name/i.test(message) && /does not exist/i.test(message);
  return {
    http: res.http,
    missing,
    preview: message.slice(0, 240),
    unauthorized_blocked: res.http === 401 || res.http === 403 || (res.http === 200 && asRows(res.body).length === 0),
  };
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
    throw new Error('Access token is not Staging usfeoerkpcafxxlyuldl. Refusing.');
  }
  return { token: body.access_token, userId: body.user.id };
}

function errPreview(res) {
  if (!res || res.http < 400) return null;
  const body = res.body || {};
  return `${res.http} ${String(body.message || body.error || body.raw || '').slice(0, 180)}`;
}

async function loginSnapshot(url, anon, email, password) {
  const auth = await signIn(url, anon, email, password);
  const profileRes = await restJson(url, anon, auth.token, `profiles?id=eq.${auth.userId}&select=id,company_name,full_name`);
  const roleRes = await restJson(url, anon, auth.token, `user_roles?user_id=eq.${auth.userId}&select=role`);
  const profile = asRows(profileRes.body)[0] || null;
  const roleRow = asRows(roleRes.body)[0] || null;
  const casesRes = await restJson(url, anon, auth.token, 'garage_cases?select=id,shop_company_name,case_number,customer_id,vehicle_id&limit=100');
  const customersRes = await restJson(url, anon, auth.token, 'garage_customers?select=id,shop_company_name&limit=100');
  const vehiclesRes = await restJson(url, anon, auth.token, 'garage_vehicles?select=id,shop_company_name,customer_id&limit=100');
  const mediaRes = await restJson(url, anon, auth.token, 'garage_media?select=id,garage_case_id&limit=100');
  const cases = asRows(casesRes.body);
  const customers = asRows(customersRes.body);
  const vehicles = asRows(vehiclesRes.body);
  const media = asRows(mediaRes.body);
  const company = String(profile?.company_name || '').trim();
  return {
    token: auth.token,
    userId: auth.userId,
    login_ok: true,
    token_staging_only: true,
    role: roleRow?.role || null,
    company_name: company,
    cases,
    customers,
    vehicles,
    media,
    caseIds: cases.map((row) => row.id),
    customerIds: customers.map((row) => row.id),
    vehicleIds: vehicles.map((row) => row.id),
    mediaIds: media.map((row) => row.id),
    mediaCaseIds: media.map((row) => row.garage_case_id).filter(Boolean),
    shops: [...new Set([
      ...cases.map((row) => String(row.shop_company_name || '').trim()),
      ...customers.map((row) => String(row.shop_company_name || '').trim()),
      ...vehicles.map((row) => String(row.shop_company_name || '').trim()),
    ].filter(Boolean))],
    emptyShopCustomers: customers.filter((row) => !String(row.shop_company_name || '').trim()).length,
    emptyShopVehicles: vehicles.filter((row) => !String(row.shop_company_name || '').trim()).length,
    emptyShopCases: cases.filter((row) => !String(row.shop_company_name || '').trim()).length,
    errors: {
      profile: errPreview(profileRes),
      role: errPreview(roleRes),
      cases: errPreview(casesRes),
      customers: errPreview(customersRes),
      vehicles: errPreview(vehiclesRes),
      media: errPreview(mediaRes),
    },
  };
}

function shopsOnlyOwn(snapshot) {
  const own = snapshot.company_name;
  if (!own) return false;
  const rows = [...snapshot.cases, ...snapshot.customers, ...snapshot.vehicles];
  return rows.every((row) => String(row.shop_company_name || '').trim() === own);
}

async function cannotReadId(url, anon, token, table, id) {
  if (!id) return { skipped: true, hidden: true, http: null, count: 0 };
  const res = await restJson(url, anon, token, `${table}?id=eq.${encodeURIComponent(id)}&select=id`);
  const count = asRows(res.body).length;
  return { skipped: false, hidden: count === 0, http: res.http, count };
}

async function countByShop(url, anon, token, table, shop) {
  if (!shop) return { skipped: true, count: 0, http: null };
  const res = await restJson(
    url,
    anon,
    token,
    `${table}?shop_company_name=eq.${encodeURIComponent(shop)}&select=id`,
  );
  return { skipped: false, count: asRows(res.body).length, http: res.http };
}

async function countEmptyShop(url, anon, token, table) {
  const res = await restJson(url, anon, token, `${table}?shop_company_name=eq.&select=id`);
  return { count: asRows(res.body).length, http: res.http };
}

async function cannotPatchForeignCase(url, anon, token, foreignCase, foreignShop) {
  if (!foreignCase) return { skipped: true, blocked: true, http: null, changed: false };
  const res = await restJson(
    url,
    anon,
    token,
    `garage_cases?id=eq.${encodeURIComponent(foreignCase)}`,
    { method: 'PATCH', body: { shop_company_name: foreignShop || '' } },
  );
  const changed = asRows(res.body).length > 0;
  return { skipped: false, blocked: !changed, http: res.http, changed };
}

function publicSnapshot(row) {
  if (!row) return null;
  return {
    login_ok: row.login_ok === true,
    role: row.role,
    company_name: row.company_name,
    caseCount: row.caseIds.length,
    customerCount: row.customerIds.length,
    vehicleCount: row.vehicleIds.length,
    mediaCount: row.mediaIds.length,
    shops: row.shops,
    emptyShopCustomers: row.emptyShopCustomers,
    emptyShopVehicles: row.emptyShopVehicles,
    emptyShopCases: row.emptyShopCases,
    errors: row.errors,
    login_error: row.login_error || null,
  };
}

async function run() {
  const url = String(process.env.VITE_SUPABASE_URL || STAGING_URL).replace(/[\r\n]/g, '').trim();
  const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || stagingAnonFallback()).replace(/[\r\n]/g, '').trim();
  guardUrl(url, 'VITE_SUPABASE_URL');
  const ref = jwtRef(anon);
  if (ref && ref !== STAGING_REF) abort(`Anon JWT ref ${ref} is not Staging`);
  if (!tokenIsStagingOnly(anon)) abort('Anon JWT is not Staging-only. Refusing.');

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_touched: false,
    claims_gmail_touched: false,
    module_opened: false,
    verdict: 'FAIL_CLOSED',
    catalog: null,
    isolation: null,
    notes: [],
  };

  const catalog = await probeColumn(url, anon);
  report.catalog = catalog;
  console.log('CATALOG', JSON.stringify(catalog));

  if (catalog.missing) {
    report.notes.push('shop_company_name is not on Staging. Tenant SQL has not been applied. /garage-management stays super_admin-only.');
    writeReport(report);
    console.log('FAIL_CLOSED sql_not_applied');
    process.exit(2);
  }

  const superEmail = String(process.env.STAGING_QA_EMAIL || '').trim();
  const superPass = String(process.env.STAGING_QA_PASSWORD || '').trim();
  const shopAEmail = String(process.env.STAGING_QA_FLEET_A_EMAIL || '').trim();
  const shopAPass = String(process.env.STAGING_QA_FLEET_A_PASSWORD || '').trim();
  const shopBEmail = String(process.env.STAGING_QA_FLEET_B_EMAIL || '').trim();
  const shopBPass = String(process.env.STAGING_QA_FLEET_B_PASSWORD || '').trim();

  if (!shopAEmail || !shopAPass || !shopBEmail || !shopBPass) {
    report.verdict = 'SKIP';
    report.notes.push('Column present or reachable, but two fleet_manager QA users are missing. Isolation is not PASS. Do not open /garage-management.');
    writeReport(report);
    console.log('SKIP missing_fleet_qa_users');
    process.exit(3);
  }

  let shopA;
  let shopB;
  try {
    shopA = await loginSnapshot(url, anon, shopAEmail, shopAPass);
    console.log('LOGIN_A_OK', JSON.stringify({ role: shopA.role, company_name: shopA.company_name }));
  } catch (e) {
    report.notes.push(`Fleet A login failed: ${String(e.message || e).slice(0, 240)}`);
    report.isolation = { shopA: { login_ok: false, login_error: String(e.message || e).slice(0, 240) } };
    writeReport(report);
    console.log('FAIL_CLOSED login_a');
    process.exit(2);
  }
  try {
    shopB = await loginSnapshot(url, anon, shopBEmail, shopBPass);
    console.log('LOGIN_B_OK', JSON.stringify({ role: shopB.role, company_name: shopB.company_name }));
  } catch (e) {
    report.notes.push(`Fleet B login failed: ${String(e.message || e).slice(0, 240)}`);
    report.isolation = {
      shopA: publicSnapshot(shopA),
      shopB: { login_ok: false, login_error: String(e.message || e).slice(0, 240) },
    };
    writeReport(report);
    console.log('FAIL_CLOSED login_b');
    process.exit(2);
  }

  let superAdmin = null;
  let superLoginError = null;
  if (superEmail && superPass) {
    try {
      superAdmin = await loginSnapshot(url, anon, superEmail, superPass);
      console.log('LOGIN_SUPER_OK', JSON.stringify({ role: superAdmin.role, emptyShopCustomers: superAdmin.emptyShopCustomers, caseCount: superAdmin.caseIds.length }));
    } catch (e) {
      superLoginError = String(e.message || e).slice(0, 240);
      console.log('LOGIN_SUPER_FAIL', superLoginError);
    }
  }

  const aFilterBCustomers = await countByShop(url, anon, shopA.token, 'garage_customers', shopB.company_name);
  const aFilterBCases = await countByShop(url, anon, shopA.token, 'garage_cases', shopB.company_name);
  const aFilterBVehicles = await countByShop(url, anon, shopA.token, 'garage_vehicles', shopB.company_name);
  const bFilterACustomers = await countByShop(url, anon, shopB.token, 'garage_customers', shopA.company_name);
  const bFilterACases = await countByShop(url, anon, shopB.token, 'garage_cases', shopA.company_name);
  const bFilterAVehicles = await countByShop(url, anon, shopB.token, 'garage_vehicles', shopA.company_name);
  const aEmptyCustomers = await countEmptyShop(url, anon, shopA.token, 'garage_customers');
  const bEmptyCustomers = await countEmptyShop(url, anon, shopB.token, 'garage_customers');
  const superEmptyCustomers = superAdmin
    ? await countEmptyShop(url, anon, superAdmin.token, 'garage_customers')
    : { skipped: true, count: 0, http: null };

  const aHiddenBCase = await cannotReadId(url, anon, shopA.token, 'garage_cases', shopB.caseIds[0]);
  const bHiddenACase = await cannotReadId(url, anon, shopB.token, 'garage_cases', shopA.caseIds[0]);
  const aHiddenBCustomer = await cannotReadId(url, anon, shopA.token, 'garage_customers', shopB.customerIds[0]);
  const bHiddenACustomer = await cannotReadId(url, anon, shopB.token, 'garage_customers', shopA.customerIds[0]);
  const aHiddenBVehicle = await cannotReadId(url, anon, shopA.token, 'garage_vehicles', shopB.vehicleIds[0]);
  const bHiddenAVehicle = await cannotReadId(url, anon, shopB.token, 'garage_vehicles', shopA.vehicleIds[0]);
  const aHiddenBMedia = await cannotReadId(url, anon, shopA.token, 'garage_media', shopB.mediaIds[0]);
  const bHiddenAMedia = await cannotReadId(url, anon, shopB.token, 'garage_media', shopA.mediaIds[0]);
  const bMediaOfACase = shopA.caseIds[0]
    ? await restJson(url, anon, shopB.token, `garage_media?garage_case_id=eq.${encodeURIComponent(shopA.caseIds[0])}&select=id`)
    : { http: null, body: [] };
  const aMediaOfBCase = shopB.caseIds[0]
    ? await restJson(url, anon, shopA.token, `garage_media?garage_case_id=eq.${encodeURIComponent(shopB.caseIds[0])}&select=id`)
    : { http: null, body: [] };
  const bMediaOfACaseHidden = !shopA.caseIds[0] || asRows(bMediaOfACase.body).length === 0;
  const aMediaOfBCaseHidden = !shopB.caseIds[0] || asRows(aMediaOfBCase.body).length === 0;
  const aCannotPatchB = await cannotPatchForeignCase(url, anon, shopA.token, shopB.caseIds[0], shopB.company_name);
  const bCannotPatchA = await cannotPatchForeignCase(url, anon, shopB.token, shopA.caseIds[0], shopA.company_name);

  const overlapCases = shopA.caseIds.filter((id) => shopB.caseIds.includes(id));
  const overlapCustomers = shopA.customerIds.filter((id) => shopB.customerIds.includes(id));
  const overlapVehicles = shopA.vehicleIds.filter((id) => shopB.vehicleIds.includes(id));
  const overlapMedia = shopA.mediaIds.filter((id) => shopB.mediaIds.includes(id));
  const sameCompany = Boolean(shopA.company_name && shopA.company_name === shopB.company_name);
  const fleetRoles = shopA.role === 'fleet_manager' && shopB.role === 'fleet_manager';
  const distinctCompanies = Boolean(shopA.company_name && shopB.company_name && !sameCompany);
  const aOwnOnly = shopsOnlyOwn(shopA);
  const bOwnOnly = shopsOnlyOwn(shopB);
  const fleetCannotSeeEmpty =
    shopA.emptyShopCustomers === 0 &&
    shopA.emptyShopVehicles === 0 &&
    shopA.emptyShopCases === 0 &&
    shopB.emptyShopCustomers === 0 &&
    shopB.emptyShopVehicles === 0 &&
    shopB.emptyShopCases === 0 &&
    aEmptyCustomers.count === 0 &&
    bEmptyCustomers.count === 0;
  const byIdHidden =
    aHiddenBCase.hidden &&
    bHiddenACase.hidden &&
    aHiddenBCustomer.hidden &&
    bHiddenACustomer.hidden &&
    aHiddenBVehicle.hidden &&
    bHiddenAVehicle.hidden &&
    aHiddenBMedia.hidden &&
    bHiddenAMedia.hidden;
  const shopFilterHidden =
    aFilterBCustomers.count === 0 &&
    aFilterBCases.count === 0 &&
    aFilterBVehicles.count === 0 &&
    bFilterACustomers.count === 0 &&
    bFilterACases.count === 0 &&
    bFilterAVehicles.count === 0;
  const patchBlocked = aCannotPatchB.blocked && bCannotPatchA.blocked;
  const anonBlocked = catalog.unauthorized_blocked === true;
  const superRoleOk = superAdmin?.role === 'super_admin';
  const superSeesEmpty = superAdmin ? superEmptyCustomers.count >= 1 || superAdmin.emptyShopCustomers >= 1 : false;
  const superSeesMoreThanFleet = superAdmin
    ? superAdmin.customerIds.length >= Math.max(shopA.customerIds.length, shopB.customerIds.length)
      && superAdmin.caseIds.length >= Math.max(shopA.caseIds.length, shopB.caseIds.length)
      && superAdmin.customerIds.length >= 5
      && superAdmin.caseIds.length >= 7
    : false;
  const superSeesBothShops = superAdmin
    ? (shopA.company_name ? superAdmin.shops.includes(shopA.company_name) || shopA.customerIds.length === 0 : true)
      && (shopB.company_name ? superAdmin.shops.includes(shopB.company_name) || shopB.customerIds.length === 0 : true)
    : false;

  const isolated =
    fleetRoles &&
    distinctCompanies &&
    aOwnOnly &&
    bOwnOnly &&
    fleetCannotSeeEmpty &&
    overlapCases.length === 0 &&
    overlapCustomers.length === 0 &&
    overlapVehicles.length === 0 &&
    overlapMedia.length === 0 &&
    byIdHidden &&
    shopFilterHidden &&
    patchBlocked &&
    anonBlocked &&
    bMediaOfACaseHidden &&
    aMediaOfBCaseHidden &&
    superRoleOk &&
    superSeesEmpty &&
    superSeesMoreThanFleet;

  report.isolation = {
    shopA: publicSnapshot(shopA),
    shopB: publicSnapshot(shopB),
    superAdmin: superAdmin
      ? {
          ...publicSnapshot(superAdmin),
          seesEmptyShop: superSeesEmpty,
          seesBothShops: superSeesBothShops,
          seesMoreThanFleet: superSeesMoreThanFleet,
        }
      : { login_ok: false, login_error: superLoginError || 'STAGING_QA_EMAIL/PASSWORD missing' },
    overlap: {
      cases: overlapCases.length,
      customers: overlapCustomers.length,
      vehicles: overlapVehicles.length,
      media: overlapMedia.length,
    },
    probes: {
      anonBlocked,
      aFilterBCustomers,
      aFilterBCases,
      aFilterBVehicles,
      bFilterACustomers,
      bFilterACases,
      bFilterAVehicles,
      aEmptyCustomers,
      bEmptyCustomers,
      superEmptyCustomers,
      aHiddenBCase,
      bHiddenACase,
      aHiddenBCustomer,
      bHiddenACustomer,
      aHiddenBVehicle,
      bHiddenAVehicle,
      aHiddenBMedia,
      bHiddenAMedia,
      bMediaOfACase: { http: bMediaOfACase.http, count: asRows(bMediaOfACase.body).length, hidden: bMediaOfACaseHidden },
      aMediaOfBCase: { http: aMediaOfBCase.http, count: asRows(aMediaOfBCase.body).length, hidden: aMediaOfBCaseHidden },
      aCannotPatchB,
      bCannotPatchA,
    },
    checks: {
      fleetRoles,
      distinctCompanies,
      aOwnOnly,
      bOwnOnly,
      fleetCannotSeeEmpty,
      shopFilterHidden,
      byIdHidden,
      patchBlocked,
      anonBlocked,
      superRoleOk,
      superSeesEmpty,
      superSeesMoreThanFleet,
    },
    isolated,
  };

  if (!superEmail || !superPass || !superAdmin) {
    report.verdict = 'FAIL_CLOSED';
    report.notes.push('Fleet A/B ran, but super_admin QA login is missing or failed. Empty-shop visibility for super_admin was not proven. Not Isolation PASS. Do not open /garage-management.');
    writeReport(report);
    console.log('FAIL_CLOSED missing_or_failed_super_admin');
    process.exit(2);
  }

  if (!isolated) {
    report.verdict = 'FAIL_CLOSED';
    report.notes.push('Isolation checks failed (overlap, empty-shop leak, by-id/API cross access, or super_admin did not see all rows). Do not open /garage-management.');
    writeReport(report);
    console.log('FAIL_CLOSED isolation_overlap');
    process.exit(2);
  }

  report.verdict = 'PASS';
  report.notes.push('Isolation PASS on Staging (login A/B/super_admin, REST by-id, shop filter, empty shop, no-op foreign PATCH). Frontend still keeps /garage-management super_admin-only until a separate open commit.');
  writeReport(report);
  console.log('PASS isolation');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
