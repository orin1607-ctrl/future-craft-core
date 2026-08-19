/**
 * S5 ONLY — DROP the four C4 anon policies. No storage, no Hostinger, no S6.
 * node scripts/s5-production-close-c4.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const EXPECTED_BUNDLE = 'assets/index-CnhgFhN-.js';
const OUT = join(process.cwd(), 'public/project-001/production-s5-c4-close-report.json');
const BACKUP = join(process.cwd(), 'public/project-001/production-s5-c4-policy-backup.json');

const C4 = [
  { name: 'Anonymous can view by token', table: 'public.driver_declarations' },
  { name: 'Anonymous can update by token', table: 'public.driver_declarations' },
  { name: 'Anon view exam by token', table: 'public.driving_exams' },
  { name: 'Anon submit exam by token', table: 'public.driving_exams' },
];

const report = {
  id: 'production-s5-c4-close',
  at: new Date().toISOString(),
  step: 'S5',
  s6Started: false,
  bucketChanged: false,
  hostingerChanged: false,
  dropped: [],
  tests: [],
  rollbackDone: false,
  verdict: 'FAIL',
};

function rec(name, ok, extra = {}) {
  report.tests.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) throw new Error(`STOP: ${name}`);
}

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && Array.isArray(payload[0]?.rows)) return payload[0].rows;
    return payload;
  }
  if (typeof payload === 'string') {
    try { return extractRows(JSON.parse(payload)); } catch { return []; }
  }
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function runSql(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-s5-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function dbSelect(sql) {
  const body = String(sql)
    .replace(/--.*$/gm, '')
    .replace(/'(?:\\'|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(body)) throw new Error('ABORT: SQL must be SELECT');
  if (/\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/i.test(body)) {
    throw new Error('ABORT: write-like SQL blocked in SELECT path');
  }
  return extractRows(runSql(sql));
}

const emergencySql = [];

function dbAllowlisted(sql) {
  const n = sql.replace(/\s+/g, ' ').trim();
  const dropOk = C4.some((p) => n === `DROP POLICY IF EXISTS "${p.name}" ON ${p.table}`);
  const createOk = report.c4RestoreSql && report.c4RestoreSql.some((s) => s.replace(/\s+/g, ' ').trim() === n);
  const emergencyOk = emergencySql.some((s) => s.replace(/\s+/g, ' ').trim() === n);
  if (!dropOk && !createOk && !emergencyOk) throw new Error(`ABORT: SQL not on S5 allowlist: ${n.slice(0, 120)}`);
  return runSql(sql);
}

function toCreateSql(p) {
  const roles = String(p.roles || 'anon').replace(/[{}]/g, '');
  let sql = `CREATE POLICY "${p.policyname}" ON ${p.schemaname}.${p.tablename} FOR ${p.cmd} TO ${roles}`;
  if (p.qual) sql += ` USING (${p.qual})`;
  if (p.with_check) sql += ` WITH CHECK (${p.with_check})`;
  return `${sql};`;
}

function listC4() {
  return dbSelect(`
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token',
      'Anonymous can update by token',
      'Anon view exam by token',
      'Anon submit exam by token'
    )
    ORDER BY tablename, policyname
  `);
}

function keys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${PROD_REF} -o json`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const arr = JSON.parse(raw);
  return {
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

function restoreC4(reason) {
  console.log(`ROLLBACK C4: ${reason}`);
  const errors = [];
  for (const p of C4) {
    try {
      dbAllowlisted(`DROP POLICY IF EXISTS "${p.name}" ON ${p.table}`);
    } catch (e) {
      errors.push(String(e.message || e).slice(0, 200));
    }
  }
  for (const sql of report.c4RestoreSql || []) {
    try {
      dbAllowlisted(sql.replace(/\s+/g, ' ').trim());
    } catch (e) {
      errors.push(String(e.message || e).slice(0, 200));
    }
  }
  report.rollbackDone = true;
  report.rollbackReason = reason;
  report.rollbackErrors = errors;
  report.rollbackRemaining = listC4().map((p) => p.policyname);
}

async function main() {
  const s4 = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/production-s4-complete-report.json'), 'utf8'));
  rec('S4 complete was PASS', s4.verdict === 'PASS', { s4verdict: s4.verdict });

  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const page = await html.text();
  const bundle = (page.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site is S3 bundle', html.ok && bundle === EXPECTED_BUNDLE, { http: html.status, bundle });
  const js = await (await fetch(`${LIVE}/${EXPECTED_BUNDLE}`, { headers: { 'Cache-Control': 'no-cache' } })).text();
  rec('live JS uses token RPCs', js.includes('get_declaration_by_token') && js.includes('sign_declaration_by_token') && js.includes('get_driving_exam_by_token'));

  const rpcs = dbSelect(`
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
  rec('five RPCs exist', rpcs.length === 5, { rpcs });

  const filesBefore = dbSelect("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'documents'")[0];
  const declBefore = dbSelect(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'signed')::int AS signed
    FROM public.driver_declarations
  `)[0];
  const examBefore = dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0];
  rec('documents still 371 before change', Number(filesBefore?.n) === 371, { files: filesBefore?.n });

  const c4Now = listC4();
  rec('four C4 policies present before drop', c4Now.length === 4, { names: c4Now.map((p) => p.policyname) });
  report.c4Snapshot = c4Now;
  report.c4RestoreSql = c4Now.map(toCreateSql);
  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(BACKUP, JSON.stringify({
    at: new Date().toISOString(),
    policies: c4Now,
    restoreSql: report.c4RestoreSql,
  }, null, 2));
  rec('C4 rollback SQL documented', report.c4RestoreSql.length === 4);
  report.relatedPoliciesBefore = dbSelect(`
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN ('driver_declarations', 'driving_exams'))
       OR (schemaname = 'storage' AND tablename = 'objects' AND (
         policyname ILIKE '%declaration%'
         OR policyname = 'public_read_documents'
       ))
    ORDER BY schemaname, tablename, policyname
  `);

  const publicRead = dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'public_read_documents'
  `)[0];
  rec('public_read_documents still present (must stay)', Number(publicRead?.n) === 1);
  const bucket = dbSelect("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
  rec('documents bucket still public (must stay)', bucket?.public === 'true');

  const k = keys();
  const anon = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

  const pendingDecl = dbSelect(`
    SELECT id::text AS id, status
    FROM public.driver_declarations
    WHERE token IS NOT NULL AND length(token) >= 24 AND status = 'pending'
    LIMIT 1
  `)[0];
  const signedDecl = dbSelect(`
    SELECT id::text AS id, status
    FROM public.driver_declarations
    WHERE token IS NOT NULL AND length(token) >= 24 AND status = 'signed'
    LIMIT 1
  `)[0];
  const anyExam = dbSelect(`
    SELECT id::text AS id, status
    FROM public.driving_exams
    WHERE token IS NOT NULL AND length(token) >= 16
    LIMIT 1
  `)[0];

  const pendingTok = pendingDecl
    ? dbSelect(`SELECT token FROM public.driver_declarations WHERE id = '${pendingDecl.id}'`)[0]?.token
    : null;
  const signedTok = signedDecl
    ? dbSelect(`SELECT token FROM public.driver_declarations WHERE id = '${signedDecl.id}'`)[0]?.token
    : null;
  const examTok = anyExam
    ? dbSelect(`SELECT token FROM public.driving_exams WHERE id = '${anyExam.id}'`)[0]?.token
    : null;

  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: fake });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('pre: fake get_declaration_by_token empty', !error && rows.length === 0, { error: error?.message || null });
  }

  if (!pendingTok) throw new Error('STOP: no pending declaration with token >= 24 for read-only valid-token GET');
  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: pendingTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('pre: valid token GET returns exactly one matching declaration', !error && rows.length === 1 && String(rows[0].id) === pendingDecl.id, {
      rowCount: rows.length,
      idMatches: rows[0] ? String(rows[0].id) === pendingDecl.id : false,
      note: 'no personal fields stored',
    });
  }

  if (signedTok) {
    const pendingCount = Number(declBefore.pending);
    const { data, error } = await anon.rpc('sign_declaration_by_token', {
      p_token: signedTok,
      p_signature_url: 's5-precheck-no-write-xxxxxxxx',
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const pendingAfter = dbSelect("SELECT count(*) FILTER (WHERE status = 'pending')::int AS n FROM public.driver_declarations")[0];
    rec('pre: sign RPC on already-signed token returns row without changing pending count', !error && rows.length === 1 && Number(pendingAfter?.n) === pendingCount, {
      rowCount: rows.length,
      pendingUnchanged: Number(pendingAfter?.n) === pendingCount,
    });
  }

  if (examTok) {
    const { data, error } = await anon.rpc('get_driving_exam_by_token', { p_token: examTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('pre: valid exam token GET returns exactly one matching exam', !error && rows.length === 1 && String(rows[0].id) === anyExam.id, {
      rowCount: rows.length,
      idMatches: rows[0] ? String(rows[0].id) === anyExam.id : false,
    });
  } else {
    rec('pre: valid exam token GET', false, { note: 'no exam token >= 16 found' });
  }

  const { count: anonCountBefore } = await anon.from('driver_declarations').select('id', { count: 'exact', head: true });
  rec('pre: anon can still count declarations via C4 (expected)', Number(anonCountBefore) > 0, { count: anonCountBefore });

  for (const p of C4) {
    const sql = `DROP POLICY IF EXISTS "${p.name}" ON ${p.table}`;
    dbAllowlisted(sql);
    report.dropped.push(p.name);
    const still = listC4().some((x) => x.policyname === p.name);
    rec(`dropped ${p.name}`, !still);
  }
  rec('all four C4 policies gone', listC4().length === 0, { remaining: listC4().map((p) => p.policyname) });

  rec('public_read_documents still present after C4 drop', Number(dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'public_read_documents'
  `)[0]?.n) === 1);
  rec('documents bucket still public after C4 drop', dbSelect("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0]?.public === 'true');

  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: fake });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('post: fake token still empty', !error && rows.length === 0, { error: error?.message || null });
  }
  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: pendingTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('post: valid token GET still returns only that declaration', !error && rows.length === 1 && String(rows[0].id) === pendingDecl.id, {
      rowCount: rows.length,
      idMatches: rows[0] ? String(rows[0].id) === pendingDecl.id : false,
    });
  }
  if (examTok) {
    const { data, error } = await anon.rpc('get_driving_exam_by_token', { p_token: examTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('post: valid exam token GET still returns only that exam', !error && rows.length === 1 && String(rows[0].id) === anyExam.id, {
      rowCount: rows.length,
    });
    const { data: fakeExam, error: fakeErr } = await anon.rpc('get_driving_exam_by_token', { p_token: fake });
    const fakeRows = Array.isArray(fakeExam) ? fakeExam : fakeExam ? [fakeExam] : [];
    rec('post: fake exam token empty', !fakeErr && fakeRows.length === 0);
  }
  if (signedTok) {
    const pendingCount = Number(declBefore.pending);
    const { error } = await anon.rpc('sign_declaration_by_token', {
      p_token: signedTok,
      p_signature_url: 's5-postcheck-no-write-xxxxxxxx',
    });
    const pendingAfter = dbSelect("SELECT count(*) FILTER (WHERE status = 'pending')::int AS n FROM public.driver_declarations")[0];
    rec('post: sign RPC still reachable without mutating pending rows', !error && Number(pendingAfter?.n) === pendingCount);
  }

  const { count: anonCountAfter, error: anonSelErr } = await anon.from('driver_declarations').select('id', { count: 'exact', head: true });
  rec('post: anon cannot read declarations table directly', Number(anonCountAfter || 0) === 0, {
    count: anonCountAfter,
    error: anonSelErr?.message || null,
  });
  const { count: anonExamAfter } = await anon.from('driving_exams').select('id', { count: 'exact', head: true });
  rec('post: anon cannot read exams table directly', Number(anonExamAfter || 0) === 0, { count: anonExamAfter });

  const { data: updFake, error: updFakeErr } = await anon
    .from('driver_declarations')
    .update({ status: 'signed' })
    .eq('id', '00000000-0000-4000-8000-000000000000')
    .select('id');
  rec('post: anon cannot update nonexistent declaration id', !updFake?.length, {
    updatedRows: Array.isArray(updFake) ? updFake.length : 0,
    error: updFakeErr?.message || null,
  });

  const pendingSnap = dbSelect(`
    SELECT status,
           signed_at IS NULL AS signed_at_null,
           signature_url IS NULL AS signature_url_null
    FROM public.driver_declarations
    WHERE id = '${pendingDecl.id}'
  `)[0];
  const { data: updReal, error: updRealErr } = await anon
    .from('driver_declarations')
    .update({ status: 'signed' })
    .eq('id', pendingDecl.id)
    .select('id');
  const pendingAfterUpd = dbSelect(`
    SELECT status,
           signed_at IS NULL AS signed_at_null,
           signature_url IS NULL AS signature_url_null
    FROM public.driver_declarations
    WHERE id = '${pendingDecl.id}'
  `)[0];
  if (pendingAfterUpd?.status !== 'pending') {
    const restoreRow = `UPDATE public.driver_declarations SET status = 'pending', signed_at = NULL, signature_url = NULL WHERE id = '${pendingDecl.id}' AND status = 'signed'`;
    emergencySql.push(restoreRow);
    dbAllowlisted(restoreRow);
    throw new Error('STOP: anon table UPDATE changed a real pending declaration; row restored; C4 rollback required');
  }
  rec('post: anon cannot update real pending declaration row', !updReal?.length && pendingAfterUpd?.status === 'pending' && pendingAfterUpd?.signed_at_null === pendingSnap?.signed_at_null, {
    updatedRows: Array.isArray(updReal) ? updReal.length : 0,
    error: updRealErr?.message || null,
    status: pendingAfterUpd?.status || null,
  });

  const signPage = await fetch(`${LIVE}/sign-declaration?token=${encodeURIComponent(fake)}`, { headers: { 'Cache-Control': 'no-cache' } });
  rec('live sign-declaration page still served', signPage.ok, { http: signPage.status });
  const examPage = await fetch(`${LIVE}/take-exam?token=${encodeURIComponent(fake)}`, { headers: { 'Cache-Control': 'no-cache' } });
  rec('live take-exam page still served', examPage.ok, { http: examPage.status });

  {
    const { data, error } = await anon.rpc('submit_driving_exam_by_token', {
      p_token: fake,
      p_answers: [],
      p_score: 0,
      p_correct_count: 0,
      p_total_questions: 1,
      p_passed: false,
      p_category_breakdown: {},
      p_signature_url: 's5-fake-no-write-xxxxxxxx',
    });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('post: fake submit_driving_exam_by_token empty', !error && rows.length === 0, { error: error?.message || null });
  }

  const liveAfter = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const liveBundle = ((await liveAfter.text()).match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site still S3 bundle', liveAfter.ok && liveBundle === EXPECTED_BUNDLE, { bundle: liveBundle });

  const filesAfter = dbSelect("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'documents'")[0];
  rec('documents count unchanged', Number(filesAfter?.n) === Number(filesBefore?.n), { files: filesAfter?.n });
  const declAfter = dbSelect(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'signed')::int AS signed
    FROM public.driver_declarations
  `)[0];
  rec('declaration totals unchanged', Number(declAfter.total) === Number(declBefore.total) && Number(declAfter.pending) === Number(declBefore.pending) && Number(declAfter.signed) === Number(declBefore.signed), {
    before: declBefore,
    after: declAfter,
  });
  const examAfter = dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0];
  rec('exam totals unchanged', Number(examAfter?.n) === Number(examBefore?.n), { before: examBefore?.n, after: examAfter?.n });

  report.verdict = 'PASS';
  report.c4Closed = true;
  report.safeToRequestS6 = true;
}

try {
  await main();
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.message || e).slice(0, 800);
  if (report.dropped?.length && !report.rollbackDone) {
    try {
      restoreC4(report.error);
    } catch (re) {
      report.rollbackError = String(re.message || re).slice(0, 400);
    }
  }
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  backup: BACKUP,
  verdict: report.verdict,
  dropped: report.dropped,
  c4Closed: report.c4Closed || false,
  rollbackDone: report.rollbackDone,
  failed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  s6Started: false,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
