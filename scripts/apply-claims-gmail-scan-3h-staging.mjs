/**
 * Apply the already-approved 3h Inbox+Sent Gmail tick on Oren Car Staging only.
 * Replaces existing claims_mail_dispatch_now. Never Production. Never a new cron.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-gmail-3h-scan-2026-09-06');
mkdirSync(OUT, { recursive: true });
const SQL = join(ROOT, 'supabase/migrations/20260906180000_claims_gmail_scan_tick_3h.sql');
if (!existsSync(SQL)) throw new Error('missing 3h scan migration');

const sqlText = readFileSync(SQL, 'utf8');
if (sqlText.includes(`https://${PROD_REF}.supabase.co/functions/v1`)) {
  throw new Error('refused: production function url in sql');
}

function jwtPayload(tok) {
  return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
}

function serviceRole() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SERVICE_ROLE_KEY;
  if (fromEnv) {
    const k = fromEnv.replace(/[\r\n]/g, '').trim();
    const payload = jwtPayload(k);
    if (payload.ref === PROD_REF) throw new Error('service role is production');
    if (payload.ref && payload.ref !== STAGING_REF) throw new Error(`service role ref ${payload.ref}`);
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) throw new Error('need SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'service_role')?.api_key;
  if (!service) throw new Error('no staging service_role');
  const payload = jwtPayload(service);
  if (payload.ref === PROD_REF) throw new Error('fetched production key');
  return service;
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
  return { ok: res.ok, status: res.status, text: text.slice(0, 800) };
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  newCronCreated: false,
  apply: null,
  verify: null,
};

try {
  const service = serviceRole();
  const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });

  const attempts = [];
  const execNames = ['exec_sql', 'exec_sql_query', 'run_sql'];
  const argNames = ['query', 'sql', 'q'];
  let applied = false;
  for (const fn of execNames) {
    for (const arg of argNames) {
      const { data, error } = await admin.rpc(fn, { [arg]: sqlText });
      attempts.push({ fn, arg, error: error?.message || null, hasData: data != null });
      if (!error) {
        applied = true;
        break;
      }
    }
    if (applied) break;
  }

  if (!applied) {
    const mgmt = await mgmtQuery(sqlText);
    attempts.push({ fn: 'mgmt_database_query', ...mgmt });
    applied = mgmt.ok === true;
  }

  report.apply = { ok: applied, attempts };
  if (!applied) throw new Error(`all apply paths failed: ${JSON.stringify(attempts).slice(0, 1200)}`);

  await admin.rpc('exec_sql', { query: "NOTIFY pgrst, 'reload schema';" }).catch(() => null);

  const { data: dispatch, error: dispatchErr } = await admin.rpc('claims_mail_dispatch_now');
  const tick = dispatch?.inboxScanTick || {};
  const cronLive = !dispatchErr && tick && (tick.queued === true || tick.skipped === true || tick.success === true);
  report.verify = {
    ok: cronLive,
    mode: dispatch?.mode,
    tick,
    error: dispatchErr?.message || null,
  };
  writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!cronLive) process.exit(2);
} catch (e) {
  report.apply = report.apply || { ok: false, error: String(e.message || e).slice(0, 2000) };
  writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
