/**
 * Staging-only GUARD: declaration access must stay token-RPC scoped.
 * Never recreates USING(true) anon table/storage SELECT policies.
 * Never touches Production (qasomfndnjuixgjmjwcm / dalia-car.online).
 *
 * GitHub Actions uses the Management API (SUPABASE_ACCESS_TOKEN). That API
 * does not reliably accept multi-statement SQL or return { rows: [] } like
 * `supabase db query`. This script therefore:
 *   1) runs each DROP separately
 *   2) runs a SELECT-only check
 *   3) parses array / rows / data payloads
 * Security behavior is unchanged: drop leftovers, never CREATE USING(true).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const ARTIFACT = process.env.RUNNER_TEMP || process.env.TEMP || '/opt/cursor/artifacts';
mkdirSync(ARTIFACT, { recursive: true });

const DROP_SQL = [
  'DROP POLICY IF EXISTS "Anonymous can view by token" ON public.driver_declarations',
  'DROP POLICY IF EXISTS "Anonymous can update by token" ON public.driver_declarations',
  'DROP POLICY IF EXISTS "Anon view exam by token" ON public.driving_exams',
  'DROP POLICY IF EXISTS "Anon submit exam by token" ON public.driving_exams',
  'DROP POLICY IF EXISTS "Anonymous can view declaration signatures" ON storage.objects',
];

const VERIFY_SQL = `
SELECT 'policy' AS kind, schemaname || '.' || tablename AS obj, policyname AS name, cmd
FROM pg_policies
WHERE (
    schemaname = 'public'
    AND tablename IN ('driver_declarations', 'driving_exams')
    AND policyname IN (
      'Anonymous can view by token',
      'Anonymous can update by token',
      'Anon view exam by token',
      'Anon submit exam by token'
    )
  )
  OR (
    schemaname = 'storage'
    AND policyname = 'Anonymous can view declaration signatures'
  )
UNION ALL
SELECT 'rpc' AS kind, 'public' AS obj, p.proname AS name, 'EXECUTE' AS cmd
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_declaration_by_token',
    'sign_declaration_by_token',
    'get_driving_exam_by_token',
    'start_driving_exam_by_token',
    'submit_driving_exam_by_token'
  )
ORDER BY 1, 3;
`;

function abortIfProduction(haystack, label) {
  const text = String(haystack || '');
  if (text.includes(PROD) || text.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
  }
}

if (STAGING === PROD) throw new Error('ABORT_PROD_REF');
abortIfProduction(DROP_SQL.join('\n') + VERIFY_SQL, 'sql');

const out = {
  at: new Date().toISOString(),
  staging: STAGING,
  productionTouched: false,
  mode: 'guard-drop-insecure-never-create',
  ok: false,
};

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && (payload[0]?.kind || payload[0]?.name || payload[0]?.proname)) return payload;
    if (payload.length && Array.isArray(payload[0]?.rows)) return payload[0].rows;
    return payload;
  }
  if (typeof payload === 'string') {
    try {
      return extractRows(JSON.parse(payload));
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.result)) return payload.result;
  if (payload.json) return extractRows(payload.json);
  if (payload.text) return extractRows(payload.text);
  return [];
}

function rowKind(r) {
  return String(r?.kind || r?.Kind || '').toLowerCase();
}

function rowName(r) {
  return String(r?.name || r?.Name || r?.proname || '');
}

async function mgmtQuery(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  abortIfProduction(text, 'mgmt output');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: String(text).slice(0, 800) };
  }
  return { status: res.status, json, text };
}

function viaCliFile(sql) {
  const tmpWork = join(process.env.TEMP || process.env.RUNNER_TEMP || '/tmp', 'fcc-c4-guard');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const cmd = process.env.SUPABASE_ACCESS_TOKEN
    ? `npx --yes supabase db query --project-ref ${STAGING} -f "${sqlFile}"`
    : null;
  if (cmd) {
    const raw = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', env: process.env });
    abortIfProduction(raw, 'db query output');
    return raw;
  }
  execSync(`npx --yes supabase link --project-ref ${STAGING} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  abortIfProduction(raw, 'db query output');
  return raw;
}

const tokenPresent = Boolean(process.env.SUPABASE_ACCESS_TOKEN);
out.path = tokenPresent ? 'management-api-split' : 'cli-linked';

if (tokenPresent) {
  out.drops = [];
  for (const sql of DROP_SQL) {
    const dropRes = await mgmtQuery(sql);
    out.drops.push({ sql: sql.slice(0, 80), status: dropRes?.status });
    if (!dropRes || dropRes.status < 200 || dropRes.status >= 300) {
      out.http = dropRes?.status || 0;
      out.result_preview = String(dropRes?.text || '').slice(0, 800);
      out.error = 'drop_failed';
      writeFileSync(join(ARTIFACT, 'sync-staging-declaration-anon-rls.json'), JSON.stringify(out, null, 2));
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }
  }
  const verifyRes = await mgmtQuery(VERIFY_SQL);
  out.http = verifyRes?.status || 0;
  out.result_preview = String(verifyRes?.text || '').slice(0, 1200);
  // Management API returns a raw array; CLI returns { rows: [] }.
  out.rows = extractRows(verifyRes?.json ?? verifyRes?.text);
} else {
  const raw = viaCliFile(`${DROP_SQL.map((s) => `${s};`).join('\n')}\n${VERIFY_SQL}`);
  out.http = 200;
  out.result_preview = String(raw).slice(0, 1200);
  out.rows = extractRows(raw);
}

const leftover = (out.rows || []).filter((r) => rowKind(r) === 'policy');
const rpcs = (out.rows || []).filter((r) => rowKind(r) === 'rpc').map(rowName);
const requiredRpcs = [
  'get_declaration_by_token',
  'sign_declaration_by_token',
  'get_driving_exam_by_token',
  'start_driving_exam_by_token',
  'submit_driving_exam_by_token',
];
out.leftoverInsecurePolicies = leftover;
out.rpcs = rpcs;
out.ok =
  leftover.length === 0 &&
  requiredRpcs.every((n) => rpcs.includes(n)) &&
  Number(out.http) >= 200 &&
  Number(out.http) < 300;
out.productionTouched = false;

writeFileSync(join(ARTIFACT, 'sync-staging-declaration-anon-rls.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
