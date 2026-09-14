/**
 * READ-ONLY precheck for garage tenant isolation on PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl
 * Forbidden: qasomfndnjuixgjmjwcm / dalia-car.online
 *
 * 1. REST catalog probes (GET only) — always
 * 2. Optional SQL counts if STAGING_DATABASE_URL or a working Management token exists
 * Never ALTER/INSERT/DELETE/CREATE/DROP. Never apply tenant SQL.
 */
import { spawnSync } from 'node:child_process';
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

  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const dbUrl = String(process.env.STAGING_DATABASE_URL || '').replace(/[\r\n]/g, '').trim();

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_touched: false,
    read_only: true,
    verdict: 'CATALOG_ONLY',
    catalog: await catalog(url, anon),
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
  report.notes.push('Row counts require authenticated Staging DB read. Anon is GRANT-denied on garage_* (42501).');

  console.log('PRECHECK TARGET', JSON.stringify({
    staging_ref: STAGING_REF,
    has_staging_database_url: Boolean(dbUrl),
    has_access_token: Boolean(token),
  }));
  console.log('CATALOG', JSON.stringify(report.catalog, null, 2));

  if (dbUrl) {
    if (dbUrl.includes(PROD_REF) || /dalia-car\.online/i.test(dbUrl)) abort('STAGING_DATABASE_URL looks like Production. Refusing.');
    if (!dbUrl.includes(STAGING_REF)) abort('STAGING_DATABASE_URL is not Staging usfeoerkpcafxxlyuldl. Refusing.');
    const res = spawnSync(
      'npx',
      ['--yes', 'supabase', 'db', 'query', '--db-url', dbUrl, '-f', SQL_FILE],
      { encoding: 'utf8', timeout: 120000, env: { ...process.env } },
    );
    if (res.status !== 0) {
      report.counts = { state: 'error', error: String(res.stderr || res.stdout || 'query failed').slice(0, 600) };
      writeReport(report);
      abort('Read-only count query failed. Production not touched.');
    }
    report.verdict = 'READ';
    report.counts = { state: 'ok', via: 'STAGING_DATABASE_URL', stdout: String(res.stdout || '').slice(0, 4000) };
    writeReport(report);
    console.log(res.stdout);
    return;
  }

  if (token) {
    const identRes = await mgmt(token, `/projects/${STAGING_REF}`);
    if (identRes.status === 401 || identRes.status === 403) {
      report.counts.reason = 'STAGING_MANAGEMENT_API_UNAUTHORIZED';
      report.notes.push('SUPABASE_ACCESS_TOKEN rejected (HTTP 401). Counts not available. Catalog probes completed. Production not touched.');
      writeReport(report);
      console.log('CATALOG_ONLY counts_blocked');
      process.exit(3);
    }
    const queryRes = await mgmt(token, `/projects/${STAGING_REF}/database/query`, {
      method: 'POST',
      body: { query: sql },
    });
    const text = await queryRes.text();
    if (queryRes.status < 200 || queryRes.status >= 300) {
      report.counts = { state: 'error', http: queryRes.status, body: text.slice(0, 400) };
      writeReport(report);
      abort('Read-only count query failed. Production not touched.');
    }
    report.verdict = 'READ';
    report.counts = { state: 'ok', via: 'management_api', body: text.slice(0, 4000) };
    writeReport(report);
    console.log(text);
    return;
  }

  report.counts.reason = 'MISSING_STAGING_READ_CREDENTIALS';
  writeReport(report);
  console.log('CATALOG_ONLY missing_db_url');
  process.exit(3);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
