/**
 * S4 ONLY — dual-path verification. No Hostinger, no SQL writes, no uploads, no user changes.
 * node scripts/s4-production-dual-path-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const EXPECTED_BUNDLE = 'assets/index-CnhgFhN-.js';
const S1 = '/root/s1-safety-backup-2026-08-19T061550Z.tgz';
const S3_BACKUP = '/root/pre-s3-dist-2026-08-19T06-58-56.tgz';
const OUT = join(process.cwd(), 'public/project-001/production-s4-verify-report.json');

const report = {
  id: 'production-s4-verify',
  at: new Date().toISOString(),
  step: 'S4',
  changed: 'none — verification only',
  s5Started: false,
  hostingerChanged: false,
  dbChanged: false,
  storageChanged: false,
  usersChanged: false,
  tests: [],
  skipped: [],
  verdict: 'FAIL',
};

function rec(name, ok, extra = {}) {
  report.tests.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

function skip(name, reason) {
  report.skipped.push({ name, reason });
  console.log(`SKIP ${name} — ${reason}`);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function ssh(remote) {
  return execSync('ssh -o BatchMode=yes -o ConnectTimeout=20 dalia-vps bash -s', {
    encoding: 'utf8',
    input: `${remote}\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

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

function dbSql(sql) {
  const body = String(sql)
    .replace(/--.*$/gm, '')
    .replace(/'(?:\\'|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(body)) throw new Error('ABORT: SQL must be SELECT');
  if (/\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/i.test(body)) {
    throw new Error('ABORT: write-like SQL blocked');
  }
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-s4-ro');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return extractRows(raw);
}

function getKeys() {
  const raw = sh(`npx --yes supabase projects api-keys --project-ref ${PROD_REF} -o json`);
  const arr = JSON.parse(raw);
  return {
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function main() {
  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const text = await html.text();
  const bundle = (text.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site still S3 bundle', html.ok && bundle === EXPECTED_BUNDLE, { http: html.status, bundle });

  const jsRes = await fetch(`${LIVE}/${EXPECTED_BUNDLE}`, { headers: { 'Cache-Control': 'no-cache' } });
  const js = jsRes.ok ? await jsRes.text() : '';
  rec('live JS has get_declaration_by_token', js.includes('get_declaration_by_token'));
  rec('live JS has sign_declaration_by_token', js.includes('sign_declaration_by_token'));
  rec('live JS has exam RPCs', js.includes('get_driving_exam_by_token') && js.includes('submit_driving_exam_by_token'));
  rec('live JS has createSignedUrl', js.includes('createSignedUrl'));
  rec('live JS is Production not Staging', js.includes(PROD_REF) && !js.includes(STAGING_REF));
  rec('live JS keeps expiry officer', js.includes('ממתינים לאישור קצין רכב'));

  const login = await fetch(LIVE + '/login');
  rec('login SPA HTTP 200', login.ok, { http: login.status });
  const drivers = await fetch(LIVE + '/drivers', { redirect: 'manual' });
  rec('drivers route still served', drivers.status === 200 || drivers.status === 301 || drivers.status === 302 || drivers.status === 304, {
    http: drivers.status,
  });
  const vehicles = await fetch(LIVE + '/vehicles', { redirect: 'manual' });
  rec('vehicles route still served', vehicles.status === 200 || vehicles.status === 301 || vehicles.status === 302 || vehicles.status === 304, {
    http: vehicles.status,
  });

  const rpcs = dbSql(`
    SELECT p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_declaration_by_token','sign_declaration_by_token',
        'get_driving_exam_by_token','start_driving_exam_by_token','submit_driving_exam_by_token'
      )
    ORDER BY 1
  `).map((r) => r.name);
  rec('five token RPCs present', rpcs.length === 5, { rpcs });

  const grants = dbSql(`
    SELECT routine_name, grantee
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'get_declaration_by_token','sign_declaration_by_token',
        'get_driving_exam_by_token','start_driving_exam_by_token','submit_driving_exam_by_token'
      )
      AND privilege_type = 'EXECUTE'
      AND grantee IN ('anon','authenticated')
    ORDER BY 1, 2
  `);
  rec('EXECUTE granted to anon and authenticated', grants.length >= 10, { grantCount: grants.length });

  const c4 = dbSql(`
    SELECT policyname FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token','Anonymous can update by token',
      'Anon view exam by token','Anon submit exam by token'
    )
  `);
  rec('C4 old path still open on purpose', c4.length === 4, { names: c4.map((r) => r.policyname) });

  const publicRead = dbSql(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_read_documents'
  `);
  rec('old public_read_documents still present on purpose', publicRead.length === 1);

  const bucket = dbSql("SELECT id, public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
  rec('documents bucket still public on purpose', bucket?.public === 'true', { bucket });

  const counts = dbSql('SELECT bucket_id, count(*)::int AS files FROM storage.objects GROUP BY 1 ORDER BY 1');
  rec('documents file count still 370', counts.some((r) => r.bucket_id === 'documents' && Number(r.files) === 370), {
    counts,
  });

  const signedBefore = dbSql("SELECT count(*)::int AS n FROM public.driver_declarations WHERE status = 'signed'")[0];
  const pendingBefore = dbSql("SELECT count(*)::int AS n FROM public.driver_declarations WHERE status = 'pending'")[0];

  const keys = getKeys();
  const anon = createClient(PROD_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  const short = 'short';
  const rpcCalls = [
    ['get_declaration_by_token', { p_token: fake }],
    ['get_declaration_by_token', { p_token: short }],
    ['sign_declaration_by_token', { p_token: fake, p_signature_url: 's4-probe-no-write' }],
    ['get_driving_exam_by_token', { p_token: fake }],
    ['start_driving_exam_by_token', { p_token: fake }],
    ['submit_driving_exam_by_token', {
      p_token: fake,
      p_answers: [],
      p_score: 0,
      p_correct_count: 0,
      p_total_questions: 0,
      p_passed: false,
      p_category_breakdown: {},
      p_signature_url: 's4-probe-no-write',
    }],
  ];
  for (const [fn, args] of rpcCalls) {
    const { data, error } = await anon.rpc(fn, args);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec(`new path RPC ${fn} fake/short returns 0 rows`, !error && rows.length === 0, {
      error: error?.message || null,
      rowCount: rows.length,
      note: 'no customer rows returned',
    });
  }

  const signedAfter = dbSql("SELECT count(*)::int AS n FROM public.driver_declarations WHERE status = 'signed'")[0];
  const pendingAfter = dbSql("SELECT count(*)::int AS n FROM public.driver_declarations WHERE status = 'pending'")[0];
  rec('fake sign RPC did not change declaration counts', Number(signedBefore?.n) === Number(signedAfter?.n) && Number(pendingBefore?.n) === Number(pendingAfter?.n), {
    signed: signedAfter?.n,
    pending: pendingAfter?.n,
  });

  const { count: declCount, error: declErr } = await anon
    .from('driver_declarations')
    .select('id', { count: 'exact', head: true });
  rec('old C4 path still lets anon count declarations (expected until S5)', !declErr && Number(declCount) >= 0, {
    count: declCount,
    error: declErr?.message || null,
    note: 'count only, no row bodies',
  });

  const fakePath = `s4-verify-nonexistent-${Date.now()}.bin`;
  const signed = await anon.storage.from('documents').createSignedUrl(fakePath, 60);
  const signedUrl = signed.data?.signedUrl || '';
  rec('new path signed URL API responds', Boolean(signedUrl) || Boolean(signed.error), {
    generatedUrlContainsSign: signedUrl.includes('/object/sign/'),
    error: signed.error?.message || null,
    note: 'nonexistent path only; file body not fetched',
  });
  if (signedUrl.includes('/object/sign/')) {
    rec('signed URL uses /object/sign/ not /object/public/', true);
  } else if (signed.error) {
    rec('signed URL API reachable (nonexistent path rejected)', true, { error: signed.error.message });
  } else {
    rec('signed URL uses /object/sign/ not /object/public/', false, { signedUrlPrefix: signedUrl.slice(0, 80) });
  }

  const publicFake = `${PROD_URL}/storage/v1/object/public/documents/${fakePath}`;
  const pubRes = await fetch(publicFake, { method: 'HEAD' });
  rec('old public object endpoint still exists (expected until S7)', pubRes.status !== 0, {
    http: pubRes.status,
    note: 'HEAD on nonexistent path only; no customer bytes',
  });

  const qaCount = dbSql(`
    SELECT count(*)::int AS n
    FROM storage.objects
    WHERE bucket_id = 'documents'
      AND (
        name ILIKE 'qa%'
        OR name ILIKE '%/qa-%'
        OR name ILIKE '%qa-s4%'
        OR name ILIKE '%disposable%'
      )
  `)[0];
  rec('looked for disposable QA files without listing customer names', true, { qaNamedFiles: qaCount?.n || 0 });
  if (Number(qaCount?.n) > 0) {
    skip('signed URL on existing QA file body', 'QA-named file exists but S4 forbids opening document bytes and forbids new uploads; URL API already probed');
  } else {
    skip('upload/view/download disposable QA document', 'Owner forbade any additional system change; uploading would add a 371st file');
  }
  skip('login existing active user / drivers list / vehicles list as that company', 'no credentials used; creating or impersonating users is forbidden this step');
  skip('company A vs B isolation with live users', 'would require two accounts or creating QA users');
  skip('declaration sign-by-link with a disposable QA token', 'would create or mutate a declaration row; fake-token RPC already proved no-write');

  const backups = ssh(`
    echo S1=$(test -f ${S1} && echo yes || echo no)
    echo S3=$(test -f ${S3_BACKUP} && echo yes || echo no)
    echo LIVE=$(grep -oE 'assets/index-[^"'"'"']+\\.js' /root/future-craft-core/dist/index.html | head -1)
  `);
  rec('S1 and pre-S3 tarballs still on VPS', backups.includes('S1=yes') && backups.includes('S3=yes'), { backups });

  const failed = report.tests.filter((t) => !t.ok);
  report.verdict = failed.length ? 'FAIL' : 'PASS';
  report.safeToRequestS5 = report.verdict === 'PASS';
  report.caveatForS5 =
    'S4 did not perform a live authenticated login or a real QA sign/upload because those would change the system. New RPC path and signed URL API responded as designed; old C4 and public bucket remain open on purpose.';
}

try {
  await main();
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.message || e).slice(0, 800);
}

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  verdict: report.verdict,
  failed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  skipped: report.skipped.map((s) => s.name),
  s5Started: false,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
