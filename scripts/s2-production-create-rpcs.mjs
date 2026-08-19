/**
 * S2 ONLY — create 5 token RPCs on Production. No DROP POLICY, no Hostinger, no bucket change.
 * Uses CREATE FUNCTION (not OR REPLACE) so an existing function cannot be overwritten.
 * node scripts/s2-production-create-rpcs.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const REQUIRED = [
  'get_declaration_by_token',
  'sign_declaration_by_token',
  'get_driving_exam_by_token',
  'start_driving_exam_by_token',
  'submit_driving_exam_by_token',
];
const OUT = join(process.cwd(), 'public/project-001/production-s2-rpc-report.json');

const CREATES = [
  {
    name: 'get_declaration_by_token',
    sql: `CREATE FUNCTION public.get_declaration_by_token(p_token text)
RETURNS SETOF public.driver_declarations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 24 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT d.*
  FROM public.driver_declarations d
  WHERE d.token = trim(p_token)
  LIMIT 1;
END;
$$;`,
  },
  {
    name: 'sign_declaration_by_token',
    sql: `CREATE FUNCTION public.sign_declaration_by_token(p_token text, p_signature_url text)
RETURNS SETOF public.driver_declarations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 24 THEN
    RETURN;
  END IF;
  IF p_signature_url IS NULL OR length(trim(p_signature_url)) < 8 THEN
    RETURN;
  END IF;

  SELECT id INTO v_id
  FROM public.driver_declarations
  WHERE token = trim(p_token)
    AND status = 'pending'
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN QUERY
    SELECT d.*
    FROM public.driver_declarations d
    WHERE d.token = trim(p_token)
    LIMIT 1;
    RETURN;
  END IF;

  UPDATE public.driver_declarations
  SET
    status = 'signed',
    signed_at = now(),
    signature_url = trim(p_signature_url),
    expires_at = now() + interval '5 years',
    updated_at = now()
  WHERE id = v_id
    AND token = trim(p_token)
    AND status = 'pending';

  RETURN QUERY
  SELECT d.*
  FROM public.driver_declarations d
  WHERE d.id = v_id
  LIMIT 1;
END;
$$;`,
  },
  {
    name: 'get_driving_exam_by_token',
    sql: `CREATE FUNCTION public.get_driving_exam_by_token(p_token text)
RETURNS SETOF public.driving_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT e.*
  FROM public.driving_exams e
  WHERE e.token = trim(p_token)
  LIMIT 1;
END;
$$;`,
  },
  {
    name: 'start_driving_exam_by_token',
    sql: `CREATE FUNCTION public.start_driving_exam_by_token(p_token text)
RETURNS SETOF public.driving_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  UPDATE public.driving_exams
  SET
    status = 'in_progress',
    started_at = COALESCE(started_at, now()),
    updated_at = now()
  WHERE token = trim(p_token)
    AND status = 'sent';

  RETURN QUERY
  SELECT e.*
  FROM public.driving_exams e
  WHERE e.token = trim(p_token)
  LIMIT 1;
END;
$$;`,
  },
  {
    name: 'submit_driving_exam_by_token',
    sql: `CREATE FUNCTION public.submit_driving_exam_by_token(
  p_token text,
  p_answers jsonb,
  p_score integer,
  p_correct_count integer,
  p_total_questions integer,
  p_passed boolean,
  p_category_breakdown jsonb,
  p_signature_url text
)
RETURNS SETOF public.driving_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  UPDATE public.driving_exams
  SET
    status = 'completed',
    completed_at = now(),
    answers = COALESCE(p_answers, '[]'::jsonb),
    score = p_score,
    correct_count = p_correct_count,
    total_questions = p_total_questions,
    passed = p_passed,
    category_breakdown = COALESCE(p_category_breakdown, '{}'::jsonb),
    signature_url = COALESCE(p_signature_url, signature_url),
    updated_at = now()
  WHERE token = trim(p_token)
    AND status IN ('sent', 'in_progress');

  RETURN QUERY
  SELECT e.*
  FROM public.driving_exams e
  WHERE e.token = trim(p_token)
  LIMIT 1;
END;
$$;`,
  },
];

const GRANTS = [
  'REVOKE ALL ON FUNCTION public.get_declaration_by_token(text) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.get_declaration_by_token(text) TO anon, authenticated',
  'REVOKE ALL ON FUNCTION public.sign_declaration_by_token(text, text) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.sign_declaration_by_token(text, text) TO anon, authenticated',
  'REVOKE ALL ON FUNCTION public.get_driving_exam_by_token(text) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.get_driving_exam_by_token(text) TO anon, authenticated',
  'REVOKE ALL ON FUNCTION public.start_driving_exam_by_token(text) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.start_driving_exam_by_token(text) TO anon, authenticated',
  'REVOKE ALL ON FUNCTION public.submit_driving_exam_by_token(text, jsonb, integer, integer, integer, boolean, jsonb, text) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.submit_driving_exam_by_token(text, jsonb, integer, integer, integer, boolean, jsonb, text) TO anon, authenticated',
];

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
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
  return [];
}

function dbSql(ref, sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-s2-${ref.slice(0, 6)}`);
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${ref} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return { raw, rows: extractRows(raw) };
}

function listRpcNames(ref) {
  const { rows } = dbSql(
    ref,
    `SELECT p.proname AS name
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
     ORDER BY 1`,
  );
  return rows.map((r) => r.name);
}

function functionDefs(ref) {
  const { rows } = dbSql(
    ref,
    `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS def
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
     ORDER BY 1`,
  );
  return rows;
}

function norm(def) {
  return String(def || '')
    .replace(/\s+/g, ' ')
    .replace(/CREATE OR REPLACE FUNCTION/gi, 'CREATE FUNCTION')
    .trim();
}

function fingerprint(def) {
  return createHash('sha256').update(norm(def)).digest('hex').slice(0, 16);
}

function getKeys(ref) {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${ref} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    anon:
      keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'anon')?.api_key,
  };
}

const report = {
  id: 'production-s2-rpcs',
  at: new Date().toISOString(),
  step: 'S2',
  s3Started: false,
  c4Closed: false,
  bucketChanged: false,
  hostingerChanged: false,
  created: [],
  tests: [],
  verdict: 'FAIL',
};

function rec(name, ok, detail) {
  report.tests.push({ name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail?.note || detail?.error || '');
}

try {
  const before = listRpcNames(PROD_REF);
  rec('precheck none exist on Production', before.length === 0, { present: before });
  if (before.length) {
    report.verdict = 'FAIL';
    report.error = 'One or more RPCs already exist. Refusing to overwrite.';
    throw new Error(report.error);
  }

  for (const item of CREATES) {
    try {
      dbSql(PROD_REF, item.sql);
      const now = listRpcNames(PROD_REF);
      const ok = now.includes(item.name);
      rec(`create ${item.name}`, ok, { presentAfter: now });
      report.created.push(item.name);
      if (!ok) throw new Error(`created but not listed: ${item.name}`);
    } catch (e) {
      rec(`create ${item.name}`, false, { error: String(e.message || e).slice(0, 400) });
      report.partialCreated = [...report.created];
      report.verdict = 'FAIL';
      report.error = `CREATE failed at ${item.name}`;
      throw e;
    }
  }

  for (const sql of GRANTS) {
    dbSql(PROD_REF, sql);
  }
  rec('grant execute to anon/authenticated', true, {});

  const after = listRpcNames(PROD_REF);
  rec('all five exist on Production', REQUIRED.every((n) => after.includes(n)), { after });

  const prodDefs = functionDefs(PROD_REF);
  const stgDefs = functionDefs(STAGING_REF);
  const stgByName = Object.fromEntries(stgDefs.map((r) => [r.name, r.def]));
  const defCompare = [];
  for (const p of prodDefs) {
    const same = fingerprint(p.def) === fingerprint(stgByName[p.name] || '');
    defCompare.push({
      name: p.name,
      matchStaging: same,
      prodFp: fingerprint(p.def),
      stagingFp: fingerprint(stgByName[p.name] || ''),
      hasSecurityDefiner: /SECURITY DEFINER/i.test(p.def),
    });
    rec(`def match staging ${p.name}`, same, { prodFp: fingerprint(p.def), stagingFp: fingerprint(stgByName[p.name] || '') });
  }
  report.defCompare = defCompare;

  const keys = getKeys(PROD_REF);
  const anon = createClient(PROD_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const short = 'short';
  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  const calls = [
    ['get_declaration_by_token', { p_token: short }],
    ['get_declaration_by_token', { p_token: fake }],
    ['sign_declaration_by_token', { p_token: short, p_signature_url: 'x' }],
    ['get_driving_exam_by_token', { p_token: short }],
    ['start_driving_exam_by_token', { p_token: short }],
    ['submit_driving_exam_by_token', {
      p_token: short,
      p_answers: [],
      p_score: 0,
      p_correct_count: 0,
      p_total_questions: 0,
      p_passed: false,
      p_category_breakdown: {},
      p_signature_url: 'x',
    }],
  ];
  for (const [fn, args] of calls) {
    const { data, error } = await anon.rpc(fn, args);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const ok = !error && rows.length === 0;
    rec(`anon rpc ${fn} empty on fake/short token`, ok, {
      error: error?.message || null,
      rowCount: rows.length,
      note: 'no customer rows requested or returned',
    });
  }

  const html = await fetch('https://dalia-car.online/');
  const text = await html.text();
  const bundle = (text.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site still old bundle', html.ok && bundle === 'assets/index-CECbN36N.js', {
    http: html.status,
    bundle,
  });

  const counts = dbSql(
    PROD_REF,
    'SELECT bucket_id, count(*)::int AS files FROM storage.objects GROUP BY 1 ORDER BY 1',
  ).rows;
  rec('documents file count still 370', counts.some((r) => r.bucket_id === 'documents' && Number(r.files) === 370), {
    counts,
  });

  const c4 = dbSql(
    PROD_REF,
    `SELECT policyname FROM pg_policies
     WHERE policyname IN (
       'Anonymous can view by token',
       'Anonymous can update by token',
       'Anon view exam by token',
       'Anon submit exam by token'
     )`,
  ).rows;
  rec('C4 policies still present', c4.length === 4, { names: c4.map((r) => r.policyname) });

  const bucket = dbSql(PROD_REF, "SELECT id, public::text AS public FROM storage.buckets WHERE id = 'documents'").rows[0];
  rec('documents bucket still public', bucket?.public === 'true' || bucket?.public === true, { bucket });

  const failed = report.tests.filter((t) => !t.ok);
  report.verdict = failed.length ? 'FAIL' : 'PASS';
  report.safeToRequestS3 = report.verdict === 'PASS';
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.message || e).slice(0, 800);
  if (report.created.length && report.created.length < REQUIRED.length) {
    try {
      const drops = {
        get_declaration_by_token: 'DROP FUNCTION IF EXISTS public.get_declaration_by_token(text)',
        sign_declaration_by_token: 'DROP FUNCTION IF EXISTS public.sign_declaration_by_token(text, text)',
        get_driving_exam_by_token: 'DROP FUNCTION IF EXISTS public.get_driving_exam_by_token(text)',
        start_driving_exam_by_token: 'DROP FUNCTION IF EXISTS public.start_driving_exam_by_token(text)',
        submit_driving_exam_by_token:
          'DROP FUNCTION IF EXISTS public.submit_driving_exam_by_token(text, jsonb, integer, integer, integer, boolean, jsonb, text)',
      };
      for (const name of report.created) {
        if (drops[name]) dbSql(PROD_REF, drops[name]);
      }
      report.rollbackOnPartialCreate = {
        done: true,
        dropped: report.created,
        remaining: listRpcNames(PROD_REF),
      };
    } catch (re) {
      report.rollbackOnPartialCreate = { done: false, error: String(re.message || re).slice(0, 400) };
    }
  }
}

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  verdict: report.verdict,
  created: report.created,
  failed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  s3Started: false,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
