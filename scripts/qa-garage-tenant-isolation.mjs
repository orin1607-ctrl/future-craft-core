/**
 * Catalog + isolation probe for garage tenant SQL on PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl
 * Forbidden: qasomfndnjuixgjmjwcm / dalia-car.online
 *
 * Does not DELETE. Does not touch Claims Gmail. Does not open fleet_manager.
 * Isolation PASS requires two fleet_manager QA users of different companies.
 * Missing QA credentials = SKIP (not PASS). Missing column = FAIL CLOSED.
 */
import { createClient } from '@supabase/supabase-js';
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

async function loginCases(url, anon, email, password) {
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    throw new Error(error?.message || 'login failed');
  }
  const authed = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await authed.from('profiles').select('id, role, company_name, full_name').eq('id', data.user.id).maybeSingle();
  const { data: cases, error: caseErr } = await authed.from('garage_cases').select('id, shop_company_name, case_number').limit(50);
  return {
    userId: data.user.id,
    email,
    role: profile?.role || null,
    company_name: profile?.company_name || '',
    caseIds: (cases || []).map((row) => row.id),
    shops: [...new Set((cases || []).map((row) => String(row.shop_company_name || '')))],
    error: caseErr ? String(caseErr.message || caseErr) : null,
  };
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

  const shopA = await loginCases(url, anon, shopAEmail, shopAPass);
  const shopB = await loginCases(url, anon, shopBEmail, shopBPass);
  let superAdmin = null;
  if (superEmail && superPass) {
    superAdmin = await loginCases(url, anon, superEmail, superPass);
  }

  const overlap = shopA.caseIds.filter((id) => shopB.caseIds.includes(id));
  const sameCompany = shopA.company_name && shopA.company_name === shopB.company_name;
  const isolated = overlap.length === 0 && !sameCompany && shopA.role === 'fleet_manager' && shopB.role === 'fleet_manager';

  report.isolation = {
    shopA: { role: shopA.role, company_name: shopA.company_name, caseCount: shopA.caseIds.length, shops: shopA.shops, error: shopA.error },
    shopB: { role: shopB.role, company_name: shopB.company_name, caseCount: shopB.caseIds.length, shops: shopB.shops, error: shopB.error },
    superAdmin: superAdmin ? { role: superAdmin.role, caseCount: superAdmin.caseIds.length, error: superAdmin.error } : null,
    overlapCount: overlap.length,
    isolated,
  };

  if (!isolated) {
    report.verdict = 'FAIL_CLOSED';
    report.notes.push('Fleet managers can see overlapping cases or are not distinct companies. Do not open /garage-management.');
    writeReport(report);
    console.log('FAIL_CLOSED isolation_overlap');
    process.exit(2);
  }

  report.verdict = 'PASS';
  report.notes.push('Isolation PASS on Staging. Frontend still keeps /garage-management super_admin-only until a separate open commit.');
  writeReport(report);
  console.log('PASS isolation');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
