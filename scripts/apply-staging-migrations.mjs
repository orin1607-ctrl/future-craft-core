/**
 * Apply dalia-staging ONLY migrations (usfeoerkpcafxxlyuldl).
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD + SUPABASE_ACCESS_TOKEN.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const FORBIDDEN_REFS = ['qasomfndnjuixgjmjwcm'];

const MIGRATIONS = [
  '20260608120000_vehicle_color_end_or_scrap.sql',
  '20260608130000_documents_bucket_staging.sql',
  '20260625120000_marketing_unified_system.sql',
  '20260626120000_dalia_form_config.sql',
];

function loadEnv() {
  const env = {};
  for (const name of ['.env.local', '.env']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const dbUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL || fileEnv.SUPABASE_DB_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD || fileEnv.SUPABASE_DB_PASSWORD;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN;

const report = {
  project: STAGING_REF,
  at: new Date().toISOString(),
  applied: [],
  errors: [],
};

function guardUrl(url) {
  if (!url) return;
  for (const ref of FORBIDDEN_REFS) {
    if (url.includes(ref)) throw new Error(`Refusing: URL contains forbidden project ${ref}`);
  }
  if (!url.includes(STAGING_REF) && !url.includes('postgres')) {
    console.warn('WARN: DATABASE_URL does not mention staging ref — verify manually');
  }
}

async function runSql(sql, name) {
  const { default: pg } = await import('pg');
  guardUrl(dbUrl);
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  report.applied.push(name);
  console.log('OK', name);
}

async function main() {
  mkdirSync('test-results', { recursive: true });

  if (dbUrl) {
    for (const file of MIGRATIONS) {
      const sql = readFileSync(join('supabase/migrations', file), 'utf8');
      try {
        await runSql(sql, file);
      } catch (e) {
        report.errors.push({ file, error: e.message });
        console.error('FAIL', file, e.message);
      }
    }
  } else if (dbPassword && accessToken) {
    const env = { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken };
    spawnSync('npx', ['supabase', 'link', '--project-ref', STAGING_REF, '-p', dbPassword, '--yes'], {
      cwd: process.cwd(),
      env,
      shell: true,
      encoding: 'utf8',
    });
    for (const file of MIGRATIONS) {
      const sql = readFileSync(join('supabase/migrations', file), 'utf8');
      const res = spawnSync(
        'npx',
        ['supabase', 'db', 'query', '--linked', '-f', join('supabase/migrations', file)],
        { cwd: process.cwd(), env, shell: true, encoding: 'utf8' },
      );
      if (res.status === 0) {
        report.applied.push(file);
        console.log('OK', file);
      } else {
        report.errors.push({ file, error: (res.stderr || res.stdout || '').slice(0, 300) });
        console.error('FAIL', file);
      }
    }
  } else {
    report.errors.push({ error: 'Missing DATABASE_URL or SUPABASE_DB_PASSWORD+SUPABASE_ACCESS_TOKEN' });
    console.error('MISSING_CREDENTIALS for staging migration');
    process.exit(2);
  }

  writeFileSync(join('test-results', 'staging-migrations-report.json'), JSON.stringify(report, null, 2));
  console.log('Report → test-results/staging-migrations-report.json');
  process.exit(report.errors.length ? 1 : 0);
}

main();
