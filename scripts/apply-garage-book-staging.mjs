/**
 * Apply garage book migration to Oren Car PUBLIC STAGING only.
 * Refuses Production. Does not print secrets.
 *
 * Target: usfeoerkpcafxxlyuldl (dalia-staging)
 * Forbidden: qasomfndnjuixgjmjwcm (Production)
 *
 * Auth paths (first match):
 * 1. STAGING_DATABASE_URL — must contain staging ref, must not contain prod ref
 * 2. SUPABASE_ACCESS_TOKEN — Management API for staging ref only
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const MIGRATION = 'supabase/migrations/20260911120000_garage_book_staging.sql';
const OWNER_TOKEN_HELP =
  'SUPABASE_ACCESS_TOKEN is rejected (HTTP 401). Rotate it at https://supabase.com/dashboard/account/tokens and update the GitHub secret, or set STAGING_DATABASE_URL for project usfeoerkpcafxxlyuldl only. Production was not touched.';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function guardDbUrl(url) {
  if (!url) abort('Empty STAGING_DATABASE_URL');
  if (url.includes(PROD_REF)) abort('Refusing STAGING_DATABASE_URL because it contains Production ref');
  if (!url.includes(STAGING_REF)) abort('Refusing STAGING_DATABASE_URL because it does not contain Staging ref usfeoerkpcafxxlyuldl');
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

function writeReport(report) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'garage-book-staging-qa.json'), JSON.stringify(report, null, 2));
}

function applyWithDbUrl(url) {
  guardDbUrl(url);
  const res = spawnSync(
    'npx',
    ['--yes', 'supabase', 'db', 'query', '--db-url', url, '-f', MIGRATION],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env } },
  );
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || 'db query failed').slice(0, 400));
  }
}

async function run() {
  mkdirSync('test-results', { recursive: true });
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const dbUrl = String(process.env.STAGING_DATABASE_URL || '').replace(/[\r\n]/g, '').trim();

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_ref: PROD_REF,
    production_touched: false,
    identity: null,
    apply: null,
    qa: {},
  };

  console.log('DB TARGET LOG', JSON.stringify({
    staging_ref: STAGING_REF,
    production_ref_forbidden: PROD_REF,
    has_staging_database_url: Boolean(dbUrl),
    has_access_token: Boolean(token),
  }));

  const sql = readFileSync(MIGRATION, 'utf8');
  if (sql.includes(PROD_REF)) abort('Migration file mentions Production ref');

  if (dbUrl) {
    try {
      applyWithDbUrl(dbUrl);
      report.apply = { ok: true, via: 'STAGING_DATABASE_URL' };
      report.identity = { via: 'STAGING_DATABASE_URL', ref: STAGING_REF };
      writeReport(report);
      console.log('APPLY OK via STAGING_DATABASE_URL');
      return;
    } catch (e) {
      report.apply = { ok: false, via: 'STAGING_DATABASE_URL', error: String(e.message || e).slice(0, 400) };
      writeReport(report);
      abort('STAGING_DATABASE_URL apply failed. Production not touched.');
    }
  }

  if (!token) abort('MISSING SUPABASE_ACCESS_TOKEN and STAGING_DATABASE_URL. ' + OWNER_TOKEN_HELP);

  const identRes = await mgmt(token, `/projects/${STAGING_REF}`);
  const identText = await identRes.text();
  let ident = {};
  try { ident = identText ? JSON.parse(identText) : {}; } catch { ident = { raw: identText.slice(0, 200) }; }
  report.identity = {
    http: identRes.status,
    id: ident.id || ident.ref || null,
    name: ident.name || null,
    region: ident.region || null,
    status: ident.status || null,
  };
  console.log('DB TARGET LOG', JSON.stringify(report.identity));

  if (identRes.status === 401 || identRes.status === 403) {
    report.apply = { ok: false, error: 'STAGING_MANAGEMENT_API_UNAUTHORIZED' };
    writeReport(report);
    abort(OWNER_TOKEN_HELP);
  }
  if (String(ident.id || ident.ref || '') === PROD_REF || String(ident.name || '').toLowerCase().includes('production')) {
    abort('Identity looks like Production. Refusing to run SQL.');
  }
  if (ident.id && ident.id !== STAGING_REF && ident.ref && ident.ref !== STAGING_REF) {
    abort(`Unexpected project identity ${ident.id || ident.ref}`);
  }

  const applyRes = await mgmt(token, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: sql },
  });
  const applyText = await applyRes.text();
  report.apply = { http: applyRes.status, preview: applyText.slice(0, 400) };
  console.log('APPLY HTTP', applyRes.status);

  if (applyRes.status < 200 || applyRes.status >= 300) {
    report.apply = {
      http: applyRes.status,
      error: applyText.slice(0, 400),
    };
    writeReport(report);
    abort('Migration apply failed. Production not touched.');
  }

  const qaSql = `
    select json_build_object(
      'db', current_database(),
      'user', current_user,
      'customers_table', to_regclass('public.garage_customers') is not null,
      'vehicles_table', to_regclass('public.garage_vehicles') is not null,
      'cases_table', to_regclass('public.garage_cases') is not null,
      'seq_customer_start', (select min_value from pg_sequences where schemaname='public' and sequencename='garage_customers_number_seq'),
      'delete_policies', (
        select count(*) from pg_policies
        where tablename in ('garage_customers','garage_vehicles','garage_cases')
          and cmd = 'DELETE'
      )
    ) as qa;
  `;
  const qaRes = await mgmt(token, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: qaSql },
  });
  report.qa.http = qaRes.status;
  report.qa.body = (await qaRes.text()).slice(0, 2000);
  writeReport(report);
  console.log('QA preview', report.qa.body.slice(0, 500));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
