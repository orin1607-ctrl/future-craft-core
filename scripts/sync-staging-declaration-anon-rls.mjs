/**
 * Staging-only GUARD: declaration access must stay token-RPC scoped.
 * Never recreates USING(true) anon table/storage SELECT policies.
 * Never touches Production (qasomfndnjuixgjmjwcm / dalia-car.online).
 *
 * If leftover C4/C1-declaration-read policies exist, they are dropped.
 * Anon INSERT of signature files under declarations/ is left intact
 * (sign-by-link upload). View/download stays signed-URL / authenticated.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const ARTIFACT = process.env.RUNNER_TEMP || process.env.TEMP || '/opt/cursor/artifacts';
mkdirSync(ARTIFACT, { recursive: true });

const SQL = `
-- Guard only. Drops insecure leftovers. Does not CREATE USING(true) policies.

DROP POLICY IF EXISTS "Anonymous can view by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anonymous can update by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anon view exam by token" ON public.driving_exams;
DROP POLICY IF EXISTS "Anon submit exam by token" ON public.driving_exams;
DROP POLICY IF EXISTS "Anonymous can view declaration signatures" ON storage.objects;

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
abortIfProduction(SQL, 'sql');

const out = {
  at: new Date().toISOString(),
  staging: STAGING,
  productionTouched: false,
  mode: 'guard-drop-insecure-never-create',
  ok: false,
};

async function viaManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
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

function viaCli() {
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-c4-guard');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, SQL, 'utf8');
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  abortIfProduction(raw, 'db query output');
  return raw;
}

function rowsFrom(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  if (result.json?.rows) return result.json.rows;
  try {
    const parsed = JSON.parse(typeof result === 'string' ? result : result.text || '{}');
    return parsed.rows || [];
  } catch {
    return [];
  }
}

const applied = await viaManagementApi();
if (applied) {
  out.http = applied.status;
  out.result_preview = typeof applied.text === 'string' ? applied.text.slice(0, 1200) : applied.json;
  out.rows = rowsFrom(applied);
} else {
  const raw = viaCli();
  out.http = 200;
  out.result_preview = String(raw).slice(0, 1200);
  out.rows = rowsFrom(raw);
}

const leftover = (out.rows || []).filter((r) => r.kind === 'policy');
const rpcs = (out.rows || []).filter((r) => r.kind === 'rpc').map((r) => r.name);
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
