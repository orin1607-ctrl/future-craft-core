/**
 * Apply garage book migration to Oren Car PUBLIC STAGING only.
 * Refuses Production. Does not print secrets.
 *
 * Target: usfeoerkpcafxxlyuldl (dalia-staging)
 * Forbidden: qasomfndnjuixgjmjwcm (Production)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const MIGRATION = 'supabase/migrations/20260911120000_garage_book_staging.sql';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
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
  mkdirSync('test-results', { recursive: true });
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) abort('MISSING SUPABASE_ACCESS_TOKEN');

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_ref: PROD_REF,
    production_touched: false,
    identity: null,
    apply: null,
    qa: {},
  };

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
    writeFileSync(join('test-results', 'garage-book-staging-qa.json'), JSON.stringify(report, null, 2));
    abort(`Staging Management API ${identRes.status}. Refusing to guess another project. Production not touched.`);
  }
  if (String(ident.id || ident.ref || '') === PROD_REF || String(ident.name || '').toLowerCase().includes('production')) {
    abort('Identity looks like Production. Refusing to run SQL.');
  }
  if (ident.id && ident.id !== STAGING_REF && ident.ref && ident.ref !== STAGING_REF) {
    abort(`Unexpected project identity ${ident.id || ident.ref}`);
  }

  const sql = readFileSync(MIGRATION, 'utf8');
  if (sql.includes(PROD_REF)) abort('Migration file mentions Production ref');

  const applyRes = await mgmt(token, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: sql },
  });
  const applyText = await applyRes.text();
  report.apply = { http: applyRes.status, preview: applyText.slice(0, 400) };
  console.log('APPLY HTTP', applyRes.status);

  if (applyRes.status < 200 || applyRes.status >= 300) {
    try {
      const cliOut = execSync(
        `npx --yes supabase db query --project-ref ${STAGING_REF} --linked -f ${MIGRATION}`,
        { encoding: 'utf8', timeout: 120000, env: { ...process.env, SUPABASE_ACCESS_TOKEN: token } },
      );
      report.apply = { http: applyRes.status, cli: true, preview: cliOut.slice(0, 400) };
    } catch (e) {
      report.apply = {
        http: applyRes.status,
        error: String(e.stderr || e.message || e).slice(0, 500),
        preview: applyText.slice(0, 400),
      };
      writeFileSync(join('test-results', 'garage-book-staging-qa.json'), JSON.stringify(report, null, 2));
      abort('Migration apply failed. Production not touched.');
    }
  }

  const qaSql = `
    select json_build_object(
      'db', current_database(),
      'user', current_user,
      'customers_table', to_regclass('public.garage_customers') is not null,
      'vehicles_table', to_regclass('public.garage_vehicles') is not null,
      'cases_table', to_regclass('public.garage_cases') is not null,
      'seq_customer_start', (select min_value from pg_sequences where schemaname='public' and sequencename='garage_customers_number_seq'),
      'no_claim_fk', not exists (
        select 1 from information_schema.table_constraints tc
        join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
        where tc.table_name in ('garage_customers','garage_vehicles','garage_cases')
          and ccu.table_name in ('claims_records','vehicles','customers','drivers')
      ),
      'delete_policies', (
        select count(*) from pg_policies
        where tablename in ('garage_customers','garage_vehicles','garage_cases')
          and cmd = 'DELETE'
      ),
      'anon_table_privs', (
        select count(*) from information_schema.role_table_grants
        where grantee = 'anon'
          and table_name in ('garage_customers','garage_vehicles','garage_cases')
      )
    ) as qa;
  `;
  const qaRes = await mgmt(token, `/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    body: { query: qaSql },
  });
  report.qa.http = qaRes.status;
  report.qa.body = (await qaRes.text()).slice(0, 2000);
  writeFileSync(join('test-results', 'garage-book-staging-qa.json'), JSON.stringify(report, null, 2));
  console.log('QA preview', report.qa.body.slice(0, 500));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
