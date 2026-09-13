/**
 * Apply garage Gmail SQL to Oren Car PUBLIC STAGING only.
 * Never Production / qasomfndnjuixgjmjwcm.
 *
 * Auth paths:
 * 1. STAGING_DATABASE_URL
 * 2. SUPABASE_ACCESS_TOKEN Management API database/query
 * If both missing or 401/403, exit 0 so Edge deploy can still run.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const SQL = 'src/modules/garage-management/garage-gmail.staging.manual.sql';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function guardDbUrl(url) {
  if (!url) abort('Empty STAGING_DATABASE_URL');
  if (url.includes(PROD_REF)) abort('Refusing Production database URL');
  if (!url.includes(STAGING_REF)) abort('STAGING_DATABASE_URL must contain usfeoerkpcafxxlyuldl');
}

function writeReport(report) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'garage-gmail-sql.json'), JSON.stringify(report, null, 2));
}

const sql = readFileSync(SQL, 'utf8');
const sqlBody = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
if (sqlBody.includes(PROD_REF)) abort('SQL body mentions Production ref');
if (/(?:update|insert\s+into|delete\s+from|alter\s+table|drop\s+table|truncate)\s+(?:public\.)?claims_gmail_connection\b/i.test(sqlBody)) {
  abort('SQL would mutate claims_gmail_connection');
}

const report = {
  at: new Date().toISOString(),
  target: STAGING_REF,
  production_touched: false,
};

const dbUrl = String(process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').replace(/[\r\n]/g, '').trim();
if (dbUrl) {
  guardDbUrl(dbUrl);
  const res = spawnSync('npx', ['--yes', 'supabase', 'db', 'query', '--db-url', dbUrl, '-f', SQL], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN || '' },
  });
  report.via = 'STAGING_DATABASE_URL';
  report.ok = res.status === 0;
  report.stderr = String(res.stderr || '').slice(0, 400);
  writeReport(report);
  if (res.status !== 0) abort((res.stderr || res.stdout || 'db query failed').slice(0, 400));
  console.log('GARAGE GMAIL SQL OK on', STAGING_REF);
  process.exit(0);
}

const token = String(process.env.SUPABASE_ACCESS_TOKEN || process.env.STAGING_SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
if (!token) {
  report.ok = false;
  report.note = 'SKIP: no STAGING_DATABASE_URL and no SUPABASE_ACCESS_TOKEN';
  writeReport(report);
  console.log(report.note);
  process.exit(0);
}

const identRes = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (identRes.status === 401 || identRes.status === 403) {
  report.ok = false;
  report.note = `SKIP: staging management identity HTTP ${identRes.status}`;
  writeReport(report);
  console.log(report.note);
  process.exit(0);
}

const applyRes = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const applyText = await applyRes.text();
report.via = 'management_database_query';
report.http = applyRes.status;
report.preview = applyText.slice(0, 400);
report.ok = applyRes.status >= 200 && applyRes.status < 300;
writeReport(report);
if (!report.ok) {
  console.log('SKIP garage gmail SQL via management HTTP', applyRes.status);
  process.exit(0);
}
console.log('GARAGE GMAIL SQL OK on', STAGING_REF, 'via management API');
