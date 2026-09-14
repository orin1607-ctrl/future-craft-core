/**
 * READ-ONLY precheck for garage tenant isolation on PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl
 * Forbidden: qasomfndnjuixgjmjwcm / dalia-car.online
 *
 * 1. REST catalog probes (GET only) — always
 * 2. SQL counts via SUPABASE_STAGING_PRECHECK_TOKEN only (Database READ on dalia-staging)
 * Never uses SUPABASE_ACCESS_TOKEN. Never uses Production. Never apply tenant SQL.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const SQL_FILE = 'src/modules/garage-management/garage-tenant-isolation.staging.precheck.sql';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function uncommented(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function writeReport(report) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'garage-tenant-precheck.json'), JSON.stringify(report, null, 2));
}

function stagingAnonFallback() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
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

async function restJson(url, anon, path) {
  const res = await fetch(`${url}${path}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 240) }; }
  return { http: res.status, body, preview: String(body?.message || body?.error || text).slice(0, 240) };
}

function columnState(probe) {
  const msg = String(probe.preview || '');
  if (probe.http === 400 && /does not exist/i.test(msg) && /column/i.test(msg)) return 'missing';
  if (probe.http === 401 || probe.http === 42501 || /permission denied/i.test(msg)) return 'present_grant_denied_to_anon';
  if (probe.http === 200) return 'present';
  if (probe.http === 404 || /could not find the table/i.test(msg) || probe.body?.code === 'PGRST205') return 'table_missing';
  return `http_${probe.http}`;
}

function tableState(probe) {
  const msg = String(probe.preview || '');
  if (probe.http === 200) return 'present_readable_as_anon';
  if (probe.http === 401 || /permission denied/i.test(msg) || probe.body?.code === '42501') return 'present_grant_denied_to_anon';
  if (probe.body?.code === 'PGRST205' || /could not find the table/i.test(msg)) return 'missing';
  return `http_${probe.http}`;
}

async function catalog(url, anon) {
  const shopCustomers = await restJson(url, anon, '/rest/v1/garage_customers?select=shop_company_name&limit=0');
  const shopVehicles = await restJson(url, anon, '/rest/v1/garage_vehicles?select=shop_company_name&limit=0');
  const shopCases = await restJson(url, anon, '/rest/v1/garage_cases?select=shop_company_name&limit=0');
  const tables = {};
  for (const name of ['garage_customers', 'garage_vehicles', 'garage_cases', 'garage_media', 'garage_gmail_connection', 'claims_records']) {
    const probe = await restJson(url, anon, `/rest/v1/${name}?select=id&limit=0`);
    tables[name] = { state: tableState(probe), http: probe.http, preview: probe.preview };
  }
  const buckets = await restJson(url, anon, '/storage/v1/bucket');
  const bucketIds = Array.isArray(buckets.body) ? buckets.body.map((row) => row.id || row.name) : [];
  const mediaBucket = await restJson(url, anon, '/storage/v1/bucket/garage-media');
  return {
    shop_company_name: {
      garage_customers: columnState(shopCustomers),
      garage_vehicles: columnState(shopVehicles),
      garage_cases: columnState(shopCases),
      customers_preview: shopCustomers.preview,
    },
    tables,
    storage: {
      buckets_visible_to_anon: bucketIds,
      garage_media_bucket: mediaBucket.http === 200 ? 'visible_to_anon' : `http_${mediaBucket.http}`,
      garage_media_preview: mediaBucket.preview,
    },
  };
}

function mgmt(token, path, opts = {}) {
  return fetch(`https://api.supabase.com/v1${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function run() {
  const sql = readFileSync(SQL_FILE, 'utf8');
  const body = uncommented(sql);
  if (/\b(ALTER|INSERT|DELETE|CREATE|DROP|TRUNCATE|GRANT|REVOKE|VACUUM|MERGE|COPY|CALL)\b/i.test(body)) {
    abort('Precheck SQL is not read-only. Refusing.');
  }
  if (/(^|[\s;])UPDATE\s+[a-z_"]/i.test(body)) {
    abort('Precheck SQL contains UPDATE DML. Refusing.');
  }
  if (!/^\s*WITH\b/i.test(body) && !/^\s*SELECT\b/i.test(body)) {
    abort('Precheck SQL must be a WITH/SELECT statement.');
  }

  const url = String(process.env.VITE_SUPABASE_URL || STAGING_URL).replace(/[\r\n]/g, '').trim();
  const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || stagingAnonFallback()).replace(/[\r\n]/g, '').trim();
  if (url.includes(PROD_REF) || /dalia-car\.online/i.test(url)) abort('VITE_SUPABASE_URL looks like Production. Refusing.');
  if (!url.includes(STAGING_REF)) abort('VITE_SUPABASE_URL is not Staging usfeoerkpcafxxlyuldl. Refusing.');
  const ref = jwtRef(anon);
  if (ref && ref !== STAGING_REF) abort(`Anon JWT ref ${ref} is not Staging`);

  const precheckToken = String(process.env.SUPABASE_STAGING_PRECHECK_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    console.log('NOTE: SUPABASE_ACCESS_TOKEN is present in the environment and will be ignored. PRECHECK uses SUPABASE_STAGING_PRECHECK_TOKEN only.');
  }

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_touched: false,
    read_only: true,
    token_name: 'SUPABASE_STAGING_PRECHECK_TOKEN',
    verdict: 'CATALOG_ONLY',
    catalog: await catalog(url, anon),
    identity: null,
    counts: {
      state: 'blocked',
      reason: null,
    },
    notes: [],
  };

  const shop = report.catalog.shop_company_name;
  if (shop.garage_customers === 'missing' && shop.garage_vehicles === 'missing' && shop.garage_cases === 'missing') {
    report.notes.push('shop_company_name is not on Staging yet. Tenant SQL has not been applied.');
  }

  console.log('PRECHECK TARGET', JSON.stringify({
    staging_ref: STAGING_REF,
    production_ref_forbidden: PROD_REF,
    has_precheck_token: Boolean(precheckToken),
    ignored_old_access_token: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
  }));
  console.log('CATALOG', JSON.stringify(report.catalog, null, 2));

  if (!precheckToken) {
    report.counts.reason = 'MISSING_SUPABASE_STAGING_PRECHECK_TOKEN';
    report.notes.push('SUPABASE_STAGING_PRECHECK_TOKEN is not in this environment. Did not use SUPABASE_ACCESS_TOKEN. Production not touched.');
    writeReport(report);
    console.log('CATALOG_ONLY missing_precheck_token');
    process.exit(3);
  }

  const identRes = await mgmt(precheckToken, `/projects/${STAGING_REF}`);
  const identText = await identRes.text();
  let ident = {};
  try { ident = identText ? JSON.parse(identText) : {}; } catch { ident = { raw: identText.slice(0, 240) }; }
  report.identity = {
    http: identRes.status,
    id: ident.id || ident.ref || null,
    name: ident.name || null,
    region: ident.region || null,
    status: ident.status || null,
  };
  console.log('IDENTITY', JSON.stringify(report.identity));

  if (identRes.status === 401 || identRes.status === 403) {
    report.counts.reason = 'STAGING_PRECHECK_TOKEN_UNAUTHORIZED';
    report.counts.http = identRes.status;
    report.counts.preview = identText.slice(0, 400);
    report.notes.push(`GET /v1/projects/${STAGING_REF} returned HTTP ${identRes.status}. Need a valid Management token with access to dalia-staging / ${STAGING_REF}. Did not expand permissions. Production not touched.`);
    writeReport(report);
    console.log('FAIL_CLOSED precheck_token_unauthorized');
    process.exit(3);
  }
  if (String(ident.id || ident.ref || '') === PROD_REF || /production/i.test(String(ident.name || ''))) {
    abort('Identity looks like Production. Refusing.');
  }
  if (ident.id && ident.id !== STAGING_REF && ident.ref && ident.ref !== STAGING_REF) {
    abort(`Unexpected project identity ${ident.id || ident.ref}`);
  }

  const queryRes = await mgmt(precheckToken, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: sql },
  });
  const text = await queryRes.text();
  if (queryRes.status < 200 || queryRes.status >= 300) {
    report.counts = {
      state: 'error',
      http: queryRes.status,
      preview: text.slice(0, 800),
      missing_permission: queryRes.status === 401 || queryRes.status === 403
        ? 'Management API POST /v1/projects/{ref}/database/query (SELECT). Token has Database=READ but this endpoint rejected the call. Do not widen to Read-write; report this gap.'
        : null,
    };
    report.notes.push(`Read-only count query HTTP ${queryRes.status}. Migration was not started.`);
    writeReport(report);
    console.log('FAIL_CLOSED query_http', queryRes.status, text.slice(0, 400));
    process.exit(3);
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  report.verdict = 'READ';
  report.counts = { state: 'ok', via: 'SUPABASE_STAGING_PRECHECK_TOKEN', http: queryRes.status, data: parsed };
  writeReport(report);
  console.log('PRECHECK COUNTS');
  console.log(typeof parsed === 'string' ? parsed.slice(0, 4000) : JSON.stringify(parsed, null, 2).slice(0, 4000));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
