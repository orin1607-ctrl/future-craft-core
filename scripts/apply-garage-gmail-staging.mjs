/**
 * Apply garage Gmail SQL to Oren Car PUBLIC STAGING only.
 * Never Production / qasomfndnjuixgjmjwcm.
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

const dbUrl = String(process.env.STAGING_DATABASE_URL || '').replace(/[\r\n]/g, '').trim();
guardDbUrl(dbUrl);
const sql = readFileSync(SQL, 'utf8');
const sqlBody = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
if (sqlBody.includes(PROD_REF)) abort('SQL body mentions Production ref');
if (/(?:update|insert\s+into|delete\s+from|alter\s+table|drop\s+table|truncate)\s+(?:public\.)?claims_gmail_connection\b/i.test(sqlBody)) {
  abort('SQL would mutate claims_gmail_connection');
}

const res = spawnSync('npx', ['--yes', 'supabase', 'db', 'query', '--db-url', dbUrl, '-f', SQL], {
  encoding: 'utf8',
  timeout: 120000,
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN || '' },
});
mkdirSync('test-results', { recursive: true });
writeFileSync(join('test-results', 'garage-gmail-sql.json'), JSON.stringify({
  at: new Date().toISOString(),
  target: STAGING_REF,
  production_touched: false,
  ok: res.status === 0,
  stderr: String(res.stderr || '').slice(0, 400),
}, null, 2));
if (res.status !== 0) {
  abort((res.stderr || res.stdout || 'db query failed').slice(0, 400));
}
console.log('GARAGE GMAIL SQL OK on', STAGING_REF);
