/**
 * Apply marketing SSOT migration to Supabase (staging default: usfeoerkpcafxxlyuldl)
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const STAGING_REF = process.env.SUPABASE_PROJECT_REF || 'usfeoerkpcafxxlyuldl';
const STAGING_URL = process.env.VITE_SUPABASE_URL || `https://${STAGING_REF}.supabase.co`;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function loadEnv() {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const fileEnv = loadEnv();
const dbUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL || fileEnv.SUPABASE_DB_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD || fileEnv.SUPABASE_DB_PASSWORD || fileEnv.DB_PASSWORD;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN;
const sqlPath = join(process.cwd(), 'supabase/migrations/20260623120000_marketing_client_ssot.sql');
const sql = readFileSync(sqlPath, 'utf8');

const TABLES = [
  'marketing_profiles', 'marketing_contacts', 'marketing_sites', 'marketing_domains',
  'marketing_connections', 'marketing_api_items', 'marketing_campaigns', 'marketing_ai_setup',
];

async function verifyTables() {
  let anon = ANON_KEY;
  if (!anon) {
    try {
      const keys = JSON.parse(
        spawnSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', STAGING_REF, '-o', 'json'], {
          cwd: process.cwd(), shell: true, encoding: 'utf8',
        }).stdout || '[]',
      );
      anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || '';
    } catch (e) { /* ignore */ }
  }
  if (!anon) return { ok: false, note: 'no anon key for verify' };
  const results = {};
  for (const t of TABLES) {
    const r = await fetch(`${STAGING_URL}/rest/v1/${t}?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    results[t] = r.status !== 404 && r.status !== 406;
  }
  const cust = await fetch(`${STAGING_URL}/rest/v1/customers?select=service_type&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  results.customers_service_type = cust.ok;
  return { ok: Object.values(results).every(Boolean), results };
}

async function runWithPg() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  return true;
}

function runWithCli() {
  const env = { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken };
  spawnSync('npx', ['supabase', 'link', '--project-ref', STAGING_REF, '-p', dbPassword, '--yes'], {
    cwd: process.cwd(), env, shell: true, encoding: 'utf8',
  });
  const push = spawnSync('npx', ['supabase', 'db', 'push', '--linked', '--yes'], {
    cwd: process.cwd(), env, shell: true, encoding: 'utf8',
  });
  return push.status === 0;
}

const report = { migration: 'pending', verify: null, at: new Date().toISOString() };

try {
  if (dbUrl) {
    await runWithPg();
    report.migration = 'applied_via_database_url';
  } else if (accessToken && dbPassword) {
    if (runWithCli()) report.migration = 'applied_via_supabase_cli';
    else report.migration = 'cli_failed';
  } else {
    const q = spawnSync('npx', ['supabase', 'db', 'query', '--linked'], {
      cwd: process.cwd(), input: sql, shell: true, encoding: 'utf8',
    });
    if (q.status === 0) report.migration = 'applied_via_supabase_db_query';
    else report.migration = 'skipped_no_credentials';
  }
} catch (e) {
  report.migration = 'error';
  report.error = e.message;
}

report.verify = await verifyTables();
const outPath = join(process.cwd(), 'docs/audit-reports/project-001/marketing-ssot-migration.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.verify?.ok ? 0 : 1);
