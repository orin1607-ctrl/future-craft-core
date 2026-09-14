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
    console.log('PSQL_VIA staging_pooler_attempts');
    return {
      attempts: [
        buildPoolerConn(url, 6543, true),
        buildPoolerConn(url, 5432, true),
        buildPoolerConn(url, 6543, false),
        buildPoolerConn(url, 5432, false),
      ],
    };
  }
  if (host.endsWith('pooler.supabase.com') && url.includes(STAGING_REF)) {
    console.log('PSQL_VIA staging_pooler_as_provided');
    const port = Number((hostPort.split(':')[1] || '6543'));
    return {
      attempts: [{ conn: url, host, port, userHasStagingRef: url.includes(STAGING_REF) }],
    };
  }
  abort(`Unexpected DB host ${host}. STOP. SQL not applied.`);
}

function buildPoolerConn(url, port, withProjectUser) {
  const at = url.lastIndexOf('@');
  const userinfo = url.slice(0, at);
  const rest = url.slice(at + 1);
  const pathAndQuery = rest.includes('/') ? rest.slice(rest.indexOf('/')) : '/postgres';
  const schemeEnd = userinfo.indexOf('://');
  const scheme = userinfo.slice(0, schemeEnd + 3);
  const up = userinfo.slice(schemeEnd + 3);
  const user = up.split(':')[0];
  const pass = up.slice(user.length + 1);
  const poolUser = withProjectUser && !user.includes(STAGING_REF) ? `${user}.${STAGING_REF}` : user;
  return {
    conn: `${scheme}${poolUser}:${pass}@${STAGING_POOLER}:${port}${pathAndQuery}`,
    host: STAGING_POOLER,
    port,
    userHasStagingRef: poolUser.includes(STAGING_REF),
  };
}

function psqlConnect(conn, extraArgs, timeout) {
  return spawnSync('psql', [conn, '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', ...extraArgs], {
    encoding: 'utf8',
    timeout,
    env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || 'require' },
  });
}

function applyWithPsql(url, sqlFile) {
  const connSpec = connectionForPsql(url);
  const attempts = connSpec.attempts || [{ conn: connSpec.conn, host: connSpec.host, port: connSpec.port, userHasStagingRef: true }];
  let lastErr = 'psql failed';
  for (const attempt of attempts) {
    console.log('PSQL_TRY', JSON.stringify({
      host: attempt.host,
      port: attempt.port,
      user_has_staging_ref: attempt.userHasStagingRef,
    }));
    const ident = psqlConnect(attempt.conn, ['-tA', '-F', '|', '-c', 'SELECT current_user, session_user, current_database();'], 30000);
    if (ident.status !== 0) {
      lastErr = (ident.stderr || ident.stdout || 'psql identity failed').slice(0, 400);
      console.log('PSQL_TRY_FAIL', lastErr.slice(0, 200));
      continue;
    }
    const identLine = String(ident.stdout || '').trim().split('\n').filter(Boolean).at(-1) || '';
    const [currentUser, sessionUser, currentDb] = identLine.split('|');
    const identBlob = `${currentUser || ''}|${sessionUser || ''}|${currentDb || ''}`;
    if (identBlob.includes(PROD_REF) || /dalia-car\.online/i.test(identBlob)) {
      abort('Live psql session looks like Production. STOP. SQL not applied.');
    }
    const liveHasStaging = Boolean(currentUser?.includes(STAGING_REF) || sessionUser?.includes(STAGING_REF));
    console.log('PSQL_LIVE_IDENTITY', JSON.stringify({
      current_user: currentUser || null,
      session_user: sessionUser || null,
      current_database: currentDb || null,
      live_role_has_staging_ref: liveHasStaging,
      user_has_staging_ref: attempt.userHasStagingRef,
      production_ref_present: false,
    }));
    if (!liveHasStaging && !attempt.userHasStagingRef) {
      abort('Live identity is not Staging usfeoerkpcafxxlyuldl. STOP. SQL not applied.');
    }
    console.log('CONNECTION_IDENTITY_OK', STAGING_REF);
    console.log('PSQL_CURRENT_DATABASE', currentDb || '');
    const present = psqlConnect(attempt.conn, ['-tA', '-c', "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='garage_customers' AND column_name='shop_company_name');"], 30000);
    if (present.status === 0 && String(present.stdout || '').trim() === 't') {
      console.log('APPLY SKIP already_present shop_company_name — running no DDL this pass');
      return { skipped: true };
    }
    const res = psqlConnect(attempt.conn, ['-f', sqlFile], 180000);
    if (res.status !== 0) {
      throw new Error((res.stderr || res.stdout || 'psql failed').slice(0, 1600));
    }
    return { skipped: false };
  }
  throw new Error(lastErr);
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
    const result = applyWithPsql(dbUrl, SQL_FILE);
    report.apply = {
      ok: true,
      via: result?.skipped ? 'already_applied_skip_ddl' : 'STAGING_DATABASE_URL_psql',
      skipped_because_present: Boolean(result?.skipped),
    };
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
