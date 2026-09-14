/**
 * READ-ONLY post-apply verification on PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl
 * Uses SUPABASE_STAGING_PRECHECK_TOKEN only. Never SUPABASE_ACCESS_TOKEN.
 * Never applies SQL. Never Production.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const SQL_FILE = 'src/modules/garage-management/garage-tenant-isolation.staging.verify.sql';

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
  writeFileSync(join('test-results', 'garage-tenant-staging-verify.json'), JSON.stringify(report, null, 2));
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
    abort('Verify SQL is not read-only. Refusing.');
  }
  if (!/^\s*SELECT\b/i.test(body)) abort('Verify SQL must be SELECT.');

  const precheckToken = String(process.env.SUPABASE_STAGING_PRECHECK_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    console.log('NOTE: SUPABASE_ACCESS_TOKEN is present and will be ignored.');
  }
  if (!precheckToken) abort('MISSING_SUPABASE_STAGING_PRECHECK_TOKEN');

  const identRes = await mgmt(precheckToken, `/projects/${STAGING_REF}`);
  const identText = await identRes.text();
  let ident = {};
  try { ident = identText ? JSON.parse(identText) : {}; } catch { ident = { raw: identText.slice(0, 240) }; }
  const identity = {
    http: identRes.status,
    id: ident.id || ident.ref || null,
    name: ident.name || null,
    status: ident.status || null,
  };
  console.log('IDENTITY', JSON.stringify(identity));
  if (identRes.status !== 200) abort(`Identity HTTP ${identRes.status}`);
  if (identity.id !== STAGING_REF || String(identity.name) !== 'dalia-staging') {
    abort('Identity is not dalia-staging / usfeoerkpcafxxlyuldl. Refusing.');
  }
  if (String(identity.id) === PROD_REF) abort('Identity looks like Production.');

  const queryRes = await mgmt(precheckToken, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: sql },
  });
  const text = await queryRes.text();
  if (queryRes.status < 200 || queryRes.status >= 300) {
    abort(`Verify query HTTP ${queryRes.status}: ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text);
  const verify = parsed?.[0]?.verify || parsed?.verify || parsed;
  console.log('VERIFY', JSON.stringify(verify, null, 2).slice(0, 4000));

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_touched: false,
    identity,
    verify,
    expected: {
      cases: { total: 7, assigned: 7, empty: 0 },
      customers: { total: 5, assigned: 4, empty: 1 },
      vehicles: { total: 5, assigned: 5, empty: 0 },
      media_orphan_without_case: 0,
      mismatches: 0,
      delete_policies: 0,
      garage_is_staff_mentions_fleet_manager: false,
    },
    verdict: 'FAIL',
    notes: [],
  };

  const ok =
    verify?.shop_column_present?.customers === true &&
    verify?.shop_column_present?.vehicles === true &&
    verify?.shop_column_present?.cases === true &&
    Number(verify?.cases?.total) === 7 &&
    Number(verify?.cases?.assigned) === 7 &&
    Number(verify?.cases?.empty) === 0 &&
    Number(verify?.customers?.total) === 5 &&
    Number(verify?.customers?.assigned) === 4 &&
    Number(verify?.customers?.empty) === 1 &&
    Number(verify?.vehicles?.total) === 5 &&
    Number(verify?.vehicles?.assigned) === 5 &&
    Number(verify?.vehicles?.empty) === 0 &&
    Number(verify?.media?.orphan_without_case) === 0 &&
    Number(verify?.mismatches?.vehicle_customer) === 0 &&
    Number(verify?.mismatches?.case_customer_or_vehicle) === 0 &&
    Number(verify?.policies?.delete_on_garage_tables) === 0 &&
    Number(verify?.policies?.storage_update) === 0 &&
    Number(verify?.policies?.storage_delete) === 0 &&
    verify?.functions?.garage_shop_visible === true &&
    verify?.functions?.garage_apply_shop_tenant === true &&
    verify?.functions?.garage_is_staff === true &&
    verify?.functions?.garage_is_staff_mentions_fleet_manager === false;

  report.verdict = ok ? 'SQL_CONSISTENCY_OK' : 'SQL_CONSISTENCY_FAIL';
  writeReport(report);
  if (!ok) {
    console.log('FAIL_CLOSED consistency');
    process.exit(2);
  }
  console.log('SQL_CONSISTENCY_OK');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
