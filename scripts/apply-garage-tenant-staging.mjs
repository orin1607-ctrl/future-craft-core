/**
 * Apply garage tenant isolation SQL to Oren Car PUBLIC STAGING only.
 * Refuses Production. Does not print secrets. Does not open fleet_manager.
 *
 * Target: usfeoerkpcafxxlyuldl (dalia-staging)
 * Forbidden: qasomfndnjuixgjmjwcm (Production) / dalia-car.online
 *
 * Required:
 *   APPLY_GARAGE_TENANT_STAGING=1
 *   STAGING_DATABASE_URL — must contain staging ref, must not contain prod ref
 *
 * Uses psql + ON_ERROR_STOP so the proposal BEGIN/COMMIT rolls back on mismatch.
 * Ignores SUPABASE_ACCESS_TOKEN. The read-only PRECHECK token cannot apply DDL.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_POOLER = 'aws-0-ap-south-1.pooler.supabase.com';
const SQL_FILE = 'src/modules/garage-management/garage-tenant-isolation.staging.proposal.sql';

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

function writeReport(report) {
  mkdirSync('test-results', { recursive: true });
  writeReportFile(report);
}

function writeReportFile(report) {
  writeFileSync(join('test-results', 'garage-tenant-staging-apply.json'), JSON.stringify(report, null, 2));
}

function connectionForPsql(url) {
  guardDbUrl(url);
  const at = url.lastIndexOf('@');
  if (at < 0) abort('STAGING_DATABASE_URL has no host. STOP.');
  const userinfo = url.slice(0, at);
  const rest = url.slice(at + 1);
  const hostPort = rest.split('/')[0];
  const host = hostPort.split(':')[0];
  const pathAndQuery = rest.includes('/') ? rest.slice(rest.indexOf('/')) : '/postgres';
  if (host.includes(PROD_REF) || /dalia-car\.online/i.test(host)) {
    abort('Host is Production. STOP. SQL not applied.');
  }
  if (host === `db.${STAGING_REF}.supabase.co`) {
    const schemeEnd = userinfo.indexOf('://');
    const scheme = userinfo.slice(0, schemeEnd + 3);
    const up = userinfo.slice(schemeEnd + 3);
    const user = up.split(':')[0];
    const pass = up.slice(user.length + 1);
    const poolUser = user.includes(STAGING_REF) ? user : `${user}.${STAGING_REF}`;
    console.log('PSQL_VIA staging_pooler_session');
    console.log('PSQL_HOST', STAGING_POOLER);
    return `${scheme}${poolUser}:${pass}@${STAGING_POOLER}:5432${pathAndQuery}`;
  }
  if (host.endsWith('pooler.supabase.com') && url.includes(STAGING_REF)) {
    console.log('PSQL_VIA staging_pooler_as_provided');
    console.log('PSQL_HOST', host);
    return url;
  }
  abort(`Unexpected DB host ${host}. STOP. SQL not applied.`);
}

function applyWithPsql(url, sqlFile) {
  const conn = connectionForPsql(url);
  const env = { ...process.env, PGSSLMODE: process.env.PGSSLMODE || 'require' };
  const ident = spawnSync(
    'psql',
    [conn, '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '-tA', '-c', 'SELECT current_database();'],
    { encoding: 'utf8', timeout: 30000, env },
  );
  if (ident.status !== 0) {
    throw new Error((ident.stderr || ident.stdout || 'psql identity failed').slice(0, 400));
  }
  console.log('PSQL_CURRENT_DATABASE', String(ident.stdout || '').trim());
  const res = spawnSync('psql', [conn, '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '-f', sqlFile], {
    encoding: 'utf8',
    timeout: 180000,
    env,
  });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || 'psql failed').slice(0, 800));
  }
}

async function run() {
  mkdirSync('test-results', { recursive: true });
  const dbUrl = String(process.env.STAGING_DATABASE_URL || '').replace(/[\r\n]/g, '').trim();
  const applyFlag = String(process.env.APPLY_GARAGE_TENANT_STAGING || '').trim() === '1';
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    console.log('NOTE: SUPABASE_ACCESS_TOKEN is present and will be ignored. Apply uses STAGING_DATABASE_URL only.');
  }

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_ref: PROD_REF,
    production_touched: false,
    apply_flag: applyFlag,
    identity: null,
    apply: null,
  };

  console.log('DB TARGET LOG', JSON.stringify({
    staging_ref: STAGING_REF,
    production_ref_forbidden: PROD_REF,
    apply_flag: applyFlag,
    has_staging_database_url: Boolean(dbUrl),
    ignored_old_access_token: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
  }));

  const sql = readFileSync(SQL_FILE, 'utf8');
  const uncommented = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  if (uncommented.includes(PROD_REF) || /dalia-car\.online/i.test(uncommented)) {
    abort('Executable SQL mentions Production. Refusing.');
  }
  if (!/\bBEGIN\s*;/.test(uncommented) || !/\bCOMMIT\s*;/.test(uncommented)) {
    abort('Proposal SQL must run inside BEGIN/COMMIT. Refusing.');
  }

  if (!applyFlag) {
    report.apply = { ok: false, error: 'APPLY_GARAGE_TENANT_STAGING not set to 1' };
    writeReportFile(report);
    abort('Refusing to apply tenant SQL without APPLY_GARAGE_TENANT_STAGING=1. Production not touched.');
  }

  if (!dbUrl) {
    report.apply = { ok: false, error: 'MISSING_STAGING_DATABASE_URL' };
    writeReportFile(report);
    abort('STAGING_DATABASE_URL is required to apply Isolation SQL (write). The PRECHECK token is read-only. SUPABASE_ACCESS_TOKEN was not used. Production not touched.');
  }

  try {
    applyWithPsql(dbUrl, SQL_FILE);
    report.apply = { ok: true, via: 'STAGING_DATABASE_URL_psql' };
    report.identity = { via: 'STAGING_DATABASE_URL', ref: STAGING_REF };
    writeReportFile(report);
    console.log('APPLY OK via STAGING_DATABASE_URL psql');
  } catch (e) {
    report.apply = { ok: false, via: 'STAGING_DATABASE_URL_psql', error: String(e.message || e).slice(0, 800) };
    writeReportFile(report);
    abort(`STAGING_DATABASE_URL apply failed. ${String(e.message || e).slice(0, 400)} Production not touched.`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
