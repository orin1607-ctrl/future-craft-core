/**
 * Apply garage tenant isolation SQL to Oren Car PUBLIC STAGING only.
 * Refuses Production. Does not print secrets. Does not open fleet_manager.
 *
 * Target: usfeoerkpcafxxlyuldl (dalia-staging)
 * Forbidden: qasomfndnjuixgjmjwcm (Production) / dalia-car.online
 *
 * Required:
 *   APPLY_GARAGE_TENANT_STAGING=1
 * Auth (first match):
 *   1. STAGING_DATABASE_URL — must contain staging ref, must not contain prod ref
 *   2. SUPABASE_ACCESS_TOKEN — Management API for staging ref only
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const SQL_FILE = 'src/modules/garage-management/garage-tenant-isolation.staging.proposal.sql';
const OWNER_TOKEN_HELP =
  'SUPABASE_ACCESS_TOKEN is rejected (HTTP 401). Rotate it at https://supabase.com/dashboard/account/tokens and update the GitHub secret, or set STAGING_DATABASE_URL for project usfeoerkpcafxxlyuldl only. Production was not touched.';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function guardDbUrl(url) {
  if (!url) abort('Empty STAGING_DATABASE_URL');
  if (url.includes(PROD_REF) || /dalia-car\.online/i.test(url)) {
    abort('Refusing STAGING_DATABASE_URL because it contains Production');
  }
  if (!url.includes(STAGING_REF)) {
    abort('Refusing STAGING_DATABASE_URL because it does not contain Staging ref usfeoerkpcafxxlyuldl');
  }
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
  writeFileSync(join('test-results', 'garage-tenant-staging-apply.json'), JSON.stringify(report, null, 2));
}

function applyWithDbUrl(url, sqlFile) {
  guardDbUrl(url);
  const res = spawnSync(
    'npx',
    ['--yes', 'supabase', 'db', 'query', '--db-url', url, '-f', sqlFile],
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
  const applyFlag = String(process.env.APPLY_GARAGE_TENANT_STAGING || '').trim() === '1';

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_ref: PROD_REF,
    production_touched: false,
    apply_flag: applyFlag,
    identity: null,
    apply: null,
    qa: {},
  };

  console.log('DB TARGET LOG', JSON.stringify({
    staging_ref: STAGING_REF,
    production_ref_forbidden: PROD_REF,
    apply_flag: applyFlag,
    has_staging_database_url: Boolean(dbUrl),
    has_access_token: Boolean(token),
  }));

  const sql = readFileSync(SQL_FILE, 'utf8');
  const uncommented = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  if (uncommented.includes(PROD_REF) || /dalia-car\.online/i.test(uncommented)) {
    abort('Executable SQL mentions Production. Refusing.');
  }

  if (!applyFlag) {
    report.apply = { ok: false, error: 'APPLY_GARAGE_TENANT_STAGING not set to 1' };
    writeReport(report);
    abort('Refusing to apply tenant SQL without APPLY_GARAGE_TENANT_STAGING=1. Production not touched.');
  }

  if (dbUrl) {
    try {
      applyWithDbUrl(dbUrl, SQL_FILE);
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

  const applyRes = await mgmt(token, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: sql },
  });
  const applyText = await applyRes.text();
  report.apply = { http: applyRes.status, preview: applyText.slice(0, 400) };
  console.log('APPLY HTTP', applyRes.status);

  if (applyRes.status < 200 || applyRes.status >= 300) {
    report.apply = { http: applyRes.status, error: applyText.slice(0, 400) };
    writeReport(report);
    abort('Migration apply failed. Production not touched.');
  }

  const qaSql = `
    select json_build_object(
      'customers_shop', exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='garage_customers' and column_name='shop_company_name'
      ),
      'vehicles_shop', exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='garage_vehicles' and column_name='shop_company_name'
      ),
      'cases_shop', exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='garage_cases' and column_name='shop_company_name'
      ),
      'shop_visible_fn', to_regprocedure('public.garage_shop_visible(text)') is not null,
      'garage_is_staff_unchanged', to_regprocedure('public.garage_is_staff(uuid)') is not null,
      'delete_policies', (
        select count(*) from pg_policies
        where tablename in ('garage_customers','garage_vehicles','garage_cases','garage_media')
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
