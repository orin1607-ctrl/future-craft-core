/**
 * Apply claims contact directory on dalia-staging only. Never Production.
 * node scripts/apply-claims-contact-directory-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-contact-directory-2026-09-09');
mkdirSync(OUT, { recursive: true });
const SQL = join(ROOT, 'supabase/migrations/20260909120000_claims_contact_directory_staging.sql');
const sqlText = readFileSync(SQL, 'utf8');
if (sqlText.includes(PROD_REF) || sqlText.includes('qasomfndnjuixgjmjwcm')) throw new Error('refused production ref in sql');

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
  return { ok: res.ok, status: res.status, text: text.slice(0, 1200) };
}

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, apply: null, verify: null };
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
if (service) {
  const payload = jwtPayload(service.replace(/[\r\n]/g, '').trim());
  if (payload.ref === PROD_REF) throw new Error('production key blocked');
}

const attempts = [];
let applied = false;

const dbUrl = (process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (dbUrl) {
  if (dbUrl.includes(PROD_REF)) throw new Error('production url blocked');
  if (!dbUrl.includes(STAGING_REF)) throw new Error('url not staging');
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try { await client.query(sqlText); applied = true; attempts.push({ fn: 'staging_database_url', ok: true }); }
    finally { await client.end().catch(() => null); }
  } catch (e) {
    attempts.push({ fn: 'staging_database_url', ok: false, error: String(e.message || e).slice(0, 240) });
  }
}

if (!applied) {
  const mgmt = await mgmtQuery(sqlText);
  attempts.push({ fn: 'mgmt_database_query', ...mgmt });
  applied = mgmt.ok === true;
}

if (!applied && service) {
  const adminTry = createClient(`https://${STAGING_REF}.supabase.co`, service.replace(/[\r\n]/g, '').trim(), { auth: { persistSession: false } });
  for (const fn of ['exec_sql', 'exec_sql_query', 'run_sql']) {
    for (const arg of ['query', 'sql', 'q']) {
      const { error } = await adminTry.rpc(fn, { [arg]: sqlText });
      attempts.push({ fn, arg, error: error?.message || null });
      if (!error) { applied = true; break; }
    }
    if (applied) break;
  }
}

report.apply = { ok: applied, attempts };
if (!applied) {
  writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const admin = createClient(
  `https://${STAGING_REF}.supabase.co`,
  (service || (process.env.VITE_SUPABASE_ANON_KEY || '')).replace(/[\r\n]/g, '').trim() || 'missing',
  { auth: { persistSession: false } },
);

const checks = {};
for (const t of ['claims_contacts', 'claims_contact_channels', 'claims_claim_contacts']) {
  const col = t === 'claims_claim_contacts' ? 'claim_id' : 'id';
  const { error, count } = await admin.from(t).select(col, { count: 'exact', head: true });
  checks[t] = { error: error?.message || null, count: count ?? 0 };
}
report.verify = {
  ok: Object.values(checks).every((c) => !c.error),
  checks,
  noMassMigration: true,
};
writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.verify.ok ? 0 : 1);
