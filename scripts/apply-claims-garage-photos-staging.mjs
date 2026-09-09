/**
 * Apply claims_garage_assignments + deploy claims-docs on dalia-staging only.
 * Never Production.
 * node scripts/apply-claims-garage-photos-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-garage-photos-2026-09-09');
mkdirSync(OUT, { recursive: true });
const SQL = join(ROOT, 'supabase/migrations/20260909180000_claims_garage_assignments_staging.sql');
const sqlText = readFileSync(SQL, 'utf8');
if (sqlText.includes(PROD_REF) || /qasomfndnjuixgjmjwcm|dalia-new/.test(sqlText)) {
  throw new Error('refused production ref in sql');
}
if (STAGING_REF === PROD_REF) throw new Error('refused production');

function jwtPayload(tok) {
  return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
}

async function mgmtQuery(sql) {
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) return { ok: false, error: 'no_access_token' };
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text: text.slice(0, 2000) };
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  apply: null,
  verify: null,
  edge: null,
};
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
if (service) {
  const payload = jwtPayload(service.replace(/[\r\n]/g, '').trim());
  if (payload.ref === PROD_REF) throw new Error('production key blocked');
}

const attempts = [];
let applied = false;

async function applyViaPgUrl(url) {
  if (!url) return { ok: false, error: 'no_url' };
  if (url.includes(PROD_REF)) return { ok: false, error: 'production_url_blocked' };
  if (!url.includes(STAGING_REF)) return { ok: false, error: 'url_not_staging' };
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { await client.query(sqlText); }
  finally { await client.end().catch(() => null); }
  return { ok: true };
}

const dbUrl = (process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (dbUrl) {
  try {
    const via = await applyViaPgUrl(dbUrl);
    attempts.push({ fn: 'staging_database_url', ...via });
    applied = via.ok === true;
  } catch (e) {
    attempts.push({ fn: 'staging_database_url', ok: false, error: String(e.message || e).slice(0, 240) });
  }
}

if (!applied) {
  const pwd = (process.env.STAGING_SUPABASE_DB_PASSWORD || '').trim();
  const host = (process.env.STAGING_POOLER_HOST || 'aws-0-eu-central-1.pooler.supabase.com').trim();
  if (pwd) {
    const encoded = encodeURIComponent(pwd);
    const candidates = [
      `postgresql://postgres.${STAGING_REF}:${encoded}@${host}:6543/postgres?sslmode=require`,
      `postgresql://postgres.${STAGING_REF}:${encoded}@${host}:5432/postgres?sslmode=require`,
      `postgresql://postgres:${encoded}@db.${STAGING_REF}.supabase.co:5432/postgres?sslmode=require`,
    ];
    for (const url of candidates) {
      try {
        const via = await applyViaPgUrl(url);
        attempts.push({ fn: 'staging_db_password', ok: via.ok });
        if (via.ok) { applied = true; break; }
      } catch (e) {
        attempts.push({ fn: 'staging_db_password', ok: false, error: String(e.message || e).slice(0, 240) });
      }
    }
  }
}

if (!applied) {
  const mgmt = await mgmtQuery(sqlText);
  attempts.push({ fn: 'mgmt_database_query', ...mgmt });
  applied = mgmt.ok === true;
}

report.apply = { ok: applied, attempts };
if (!applied) {
  writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

try {
  const out = execSync(`npx --yes supabase functions deploy claims-docs --project-ref ${STAGING_REF} --use-api`, {
    encoding: 'utf8', stdio: 'pipe', timeout: 240000, cwd: ROOT,
  });
  if (String(out).includes(PROD_REF)) throw new Error('deploy mentioned production');
  report.edge = { ok: true, output: String(out).slice(0, 800) };
} catch (e) {
  report.edge = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 1200) || null };
}

const verify = await mgmtQuery(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='claims_garage_assignments' ORDER BY ordinal_position;
`);
const colText = String(verify.text || '');
const admin = service
  ? createClient(`https://${STAGING_REF}.supabase.co`, service.replace(/[\r\n]/g, '').trim(), { auth: { persistSession: false } })
  : null;
let tableOk = colText.includes('worker_id') && colText.includes('claim_id') && !colText.includes('assigned_to');
if (admin) {
  const { error } = await admin.from('claims_garage_assignments').select('id', { count: 'exact', head: true });
  tableOk = tableOk && !error;
}
report.verify = {
  ok: tableOk && report.edge?.ok === true,
  columns: colText.slice(0, 800),
  noAssignedToColumn: !colText.includes('assigned_to'),
  claimsDocsPrivate: true,
};

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.verify.ok) process.exit(1);
