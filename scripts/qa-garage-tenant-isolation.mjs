/**
 * Catalog + isolation probe for garage tenant SQL on PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl
 * Forbidden: qasomfndnjuixgjmjwcm / dalia-car.online
 *
 * Fetch-only (no @supabase/supabase-js). Does not DELETE rows.
 * Does not touch Claims Gmail. Does not open fleet_manager UI.
 * Isolation PASS requires two fleet_manager QA users of different companies.
 * Missing QA credentials = SKIP (not PASS). Missing column = FAIL CLOSED.
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

function jwtRef(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return String(JSON.parse(json).ref || '');
  } catch {
    return '';
  }
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

async function probeColumn(url, anon) {
  const res = await fetch(`${url}/rest/v1/garage_customers?select=shop_company_name&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 240) }; }
  const message = String(body?.message || body?.error || text || '');
  const missing = res.status === 400 && /shop_company_name/i.test(message) && /does not exist/i.test(message);
  return {
    http: res.status,
    missing,
    preview: message.slice(0, 240),
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
  return { token: body.access_token, userId: body.user.id, email };
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

function asRows(body) {
  return Array.isArray(body) ? body : [];
}

async function loginSnapshot(url, anon, email, password) {
  const auth = await signIn(url, anon, email, password);
  const profileRes = await restJson(url, anon, auth.token, `profiles?id=eq.${auth.userId}&select=id,role,company_name,full_name`);
  const profile = asRows(profileRes.body)[0] || null;
  const casesRes = await restJson(url, anon, auth.token, 'garage_cases?select=id,shop_company_name,case_number,customer_id,vehicle_id&limit=100');
  const customersRes = await restJson(url, anon, auth.token, 'garage_customers?select=id,shop_company_name&limit=100');
  const vehiclesRes = await restJson(url, anon, auth.token, 'garage_vehicles?select=id,shop_company_name,customer_id&limit=100');
  const mediaRes = await restJson(url, anon, auth.token, 'garage_media?select=id,case_id&limit=100');
  const cases = asRows(casesRes.body);
  const customers = asRows(customersRes.body);
  const vehicles = asRows(vehiclesRes.body);
  const media = asRows(mediaRes.body);
  const company = String(profile?.company_name || '').trim();
  return {
    token: auth.token,
    userId: auth.userId,
    email,
    role: profile?.role || null,
    company_name: company,
    cases,
    customers,
    vehicles,
    media,
    caseIds: cases.map((row) => row.id),
    customerIds: customers.map((row) => row.id),
    vehicleIds: vehicles.map((row) => row.id),
    mediaIds: media.map((row) => row.id),
    shops: [...new Set(cases.map((row) => String(row.shop_company_name || '').trim()))],
    emptyShopCustomers: customers.filter((row) => !String(row.shop_company_name || '').trim()).length,
    emptyShopVehicles: vehicles.filter((row) => !String(row.shop_company_name || '').trim()).length,
    emptyShopCases: cases.filter((row) => !String(row.shop_company_name || '').trim()).length,
    errors: {
      profile: profileRes.http >= 400 ? `profiles HTTP ${profileRes.http}` : null,
      cases: casesRes.http >= 400 ? `cases HTTP ${casesRes.http}` : null,
      customers: customersRes.http >= 400 ? `customers HTTP ${customersRes.http}` : null,
      vehicles: vehiclesRes.http >= 400 ? `vehicles HTTP ${vehiclesRes.http}` : null,
      media: mediaRes.http >= 400 ? `media HTTP ${mediaRes.http}` : null,
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
  if (!id) return { skipped: true, hidden: false };
  const res = await restJson(url, anon, token, `${table}?id=eq.${id}&select=id`);
  return { skipped: false, hidden: asRows(res.body).length === 0, http: res.http };
}

async function cannotPatchForeignCase(url, anon, token, foreignCase, foreignShop) {
  if (!foreignCase) return { skipped: true, blocked: false };
  const res = await restJson(
    url,
    anon,
    token,
    `garage_cases?id=eq.${foreignCase}`,
    { method: 'PATCH', body: { shop_company_name: foreignShop || '' } },
  );
  const changed = asRows(res.body).length > 0;
  return { skipped: false, blocked: !changed, http: res.http, changed };
}

async function run() {
  const url = String(process.env.VITE_SUPABASE_URL || STAGING_URL).replace(/[\r\n]/g, '').trim();
  const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || stagingAnonFallback()).replace(/[\r\n]/g, '').trim();
  guardUrl(url, 'VITE_SUPABASE_URL');
  const ref = jwtRef(anon);
  if (ref && ref !== STAGING_REF) abort(`Anon JWT ref ${ref} is not Staging`);

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_touched: false,
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
    report.verdict = 'FAIL_CLOSED';
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

  const shopA = await loginSnapshot(url, anon, shopAEmail, shopAPass);
  const shopB = await loginSnapshot(url, anon, shopBEmail, shopBPass);
  let superAdmin = null;
  if (superEmail && superPass) {
    superAdmin = await loginSnapshot(url, anon, superEmail, superPass);
  }

  const aHiddenBCase = await cannotReadId(url, anon, shopA.token, 'garage_cases', shopB.caseIds[0]);
  const bHiddenACase = await cannotReadId(url, anon, shopB.token, 'garage_cases', shopA.caseIds[0]);
  const aHiddenBCustomer = await cannotReadId(url, anon, shopA.token, 'garage_customers', shopB.customerIds[0]);
  const aHiddenBVehicle = await cannotReadId(url, anon, shopA.token, 'garage_vehicles', shopB.vehicleIds[0]);
  const aHiddenBMedia = await cannotReadId(url, anon, shopA.token, 'garage_media', shopB.mediaIds[0]);
  const aCannotPatchB = await cannotPatchForeignCase(url, anon, shopA.token, shopB.caseIds[0], shopB.company_name);

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
    shopB.emptyShopCases === 0;
  const byIdHidden =
    (aHiddenBCase.skipped || aHiddenBCase.hidden) &&
    (bHiddenACase.skipped || bHiddenACase.hidden) &&
    (aHiddenBCustomer.skipped || aHiddenBCustomer.hidden) &&
    (aHiddenBVehicle.skipped || aHiddenBVehicle.hidden) &&
    (aHiddenBMedia.skipped || aHiddenBMedia.hidden);
  const patchBlocked = aCannotPatchB.skipped || aCannotPatchB.blocked;
  const hasForeignRowToProbe = Boolean(shopA.caseIds[0] || shopB.caseIds[0] || shopA.customerIds[0] || shopB.customerIds[0]);
  const superSeesEmpty = superAdmin ? superAdmin.emptyShopCustomers >= 1 : null;
  const superSeesBothShops = superAdmin
    ? superAdmin.shops.includes(shopA.company_name) && superAdmin.shops.includes(shopB.company_name)
    : null;

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
    patchBlocked &&
    hasForeignRowToProbe &&
    (superAdmin ? superSeesEmpty === true : true);

  report.isolation = {
    shopA: {
      role: shopA.role,
      company_name: shopA.company_name,
      caseCount: shopA.caseIds.length,
      customerCount: shopA.customerIds.length,
      vehicleCount: shopA.vehicleIds.length,
      mediaCount: shopA.mediaIds.length,
      shops: shopA.shops,
      emptyShopCustomers: shopA.emptyShopCustomers,
      errors: shopA.errors,
    },
    shopB: {
      role: shopB.role,
      company_name: shopB.company_name,
      caseCount: shopB.caseIds.length,
      customerCount: shopB.customerIds.length,
      vehicleCount: shopB.vehicleIds.length,
      mediaCount: shopB.mediaIds.length,
      shops: shopB.shops,
      emptyShopCustomers: shopB.emptyShopCustomers,
      errors: shopB.errors,
    },
    superAdmin: superAdmin
      ? {
          role: superAdmin.role,
          caseCount: superAdmin.caseIds.length,
          emptyShopCustomers: superAdmin.emptyShopCustomers,
          shops: superAdmin.shops,
          seesEmptyShop: superSeesEmpty,
          seesBothShops: superSeesBothShops,
          errors: superAdmin.errors,
        }
      : null,
    overlap: {
      cases: overlapCases.length,
      customers: overlapCustomers.length,
      vehicles: overlapVehicles.length,
      media: overlapMedia.length,
    },
    probes: {
      aHiddenBCase,
      bHiddenACase,
      aHiddenBCustomer,
      aHiddenBVehicle,
      aHiddenBMedia,
      aCannotPatchB,
    },
    isolated,
  };

  if (!isolated) {
    report.verdict = 'FAIL_CLOSED';
    report.notes.push('Fleet managers can see overlapping or empty-shop rows, or by-id/update of the other shop was not blocked. Do not open /garage-management.');
    writeReport(report);
    console.log('FAIL_CLOSED isolation_overlap');
    process.exit(2);
  }

  report.verdict = 'PASS';
  report.notes.push('Isolation PASS on Staging (read + no-op foreign PATCH). Frontend still keeps /garage-management super_admin-only until a separate open commit.');
  if (!superAdmin) {
    report.notes.push('super_admin QA login was missing; empty-shop visibility for super_admin was not proven this run.');
  }
  writeReport(report);
  console.log('PASS isolation');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
