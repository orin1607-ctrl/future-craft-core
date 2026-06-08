/**
 * Apply vehicle upload migration via DATABASE_URL or Supabase CLI password.
 * Does not print secrets.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

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
const projectRef = process.env.SUPABASE_PROJECT_REF || fileEnv.SUPABASE_PROJECT_REF || 'qasomfndnjuixgjmjwcm';

const sqlPath = join(process.cwd(), 'supabase/migrations/20260602120000_fix_vehicle_document_upload.sql');
const sql = readFileSync(sqlPath, 'utf8');

async function runWithPg() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('OK: migration applied via DATABASE_URL');
  return true;
}

function runWithCli() {
  const args = ['supabase', 'db', 'push', '--linked', '--yes'];
  const env = { ...process.env };
  if (accessToken) env.SUPABASE_ACCESS_TOKEN = accessToken;

  let linkFirst = spawnSync('npx', ['supabase', 'link', '--project-ref', projectRef, '-p', dbPassword, '--yes'], {
    cwd: process.cwd(),
    env,
    shell: true,
    encoding: 'utf8',
  });

  if (linkFirst.status !== 0 && !existsSync(join(process.cwd(), '.supabase'))) {
    console.error('LINK_FAILED');
    if (linkFirst.stderr) console.error(linkFirst.stderr.slice(0, 500));
    return false;
  }

  const push = spawnSync('npx', args, { cwd: process.cwd(), env, shell: true, encoding: 'utf8' });
  if (push.status === 0) {
    console.log('OK: migration applied via supabase db push');
    return true;
  }
  console.error('PUSH_FAILED');
  if (push.stdout) console.error(push.stdout.slice(0, 800));
  if (push.stderr) console.error(push.stderr.slice(0, 800));
  return false;
}

async function main() {
  if (dbUrl) {
    try {
      return void (await runWithPg());
    } catch (e) {
      console.error('PG_FAILED:', e.message);
    }
  }

  if (accessToken && dbPassword) {
    if (runWithCli()) return;
  }

  if (dbPassword && !accessToken) {
    process.env.SUPABASE_DB_PASSWORD = dbPassword;
    if (runWithCli()) return;
  }

  console.error('MISSING_CREDENTIALS');
  process.exit(1);
}

main();
