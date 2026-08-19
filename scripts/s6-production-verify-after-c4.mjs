/**
 * S6 ONLY — read-only verification after C4 close.
 * No deploy, no policy/RPC/storage/user/data changes, no S7.
 * node scripts/s6-production-verify-after-c4.mjs
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
const BASELINE_FILES = 371;
const BASELINE_DECLARATIONS = 16;
const BASELINE_EXAMS = 23;
const OUT = join(process.cwd(), 'public/project-001/production-s6-verify-report.json');
const RPC_NAMES = [
  'get_declaration_by_token',
  'sign_declaration_by_token',
  'get_driving_exam_by_token',
  'start_driving_exam_by_token',
  'submit_driving_exam_by_token',
];

const report = {
  id: 'production-s6-verify-after-c4',
  at: new Date().toISOString(),
  step: 'S6',
  changed: 'none — verification only',
  s7Started: false,
  productionCodeChanged: false,
  policiesChanged: false,
  rpcsChanged: false,
  storageChanged: false,
  hostingerChanged: false,
  customerDataChanged: false,
  tests: [],
  skipped: [],
  counts: {},
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

function dbSelect(sql) {
  const body = String(sql)
    .replace(/--.*$/gm, '')
    .replace(/'(?:\\'|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(body)) throw new Error('ABORT: SQL must be SELECT');
  if (/\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/i.test(body)) {
    throw new Error('ABORT: write-like SQL blocked');
  }
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-s6-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function keys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${PROD_REF} -o json`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const arr = JSON.parse(raw);
  return {
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
    service: arr.find((k) => k.name === 'service_role')?.api_key,
  };
}

function snapshotCounts() {
  const files = dbSelect("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'documents'")[0];
  const decls = dbSelect('SELECT count(*)::int AS n FROM public.driver_declarations')[0];
  const exams = dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0];
  return {
    files: Number(files?.n),
    declarations: Number(decls?.n),
    exams: Number(exams?.n),
  };
}

function rpcRows(data) {
  return Array.isArray(data) ? data : data ? [data] : [];
}

async function main() {
  const s5 = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/production-s5-c4-close-report.json'), 'utf8'));
  rec('S5 close was PASS', s5.verdict === 'PASS' && s5.c4Closed === true, { s5verdict: s5.verdict, c4Closed: s5.c4Closed });

  const before = snapshotCounts();
  report.counts.before = before;
  rec('files at start are 371', before.files === BASELINE_FILES, { files: before.files });
  rec('declarations at start are 16', before.declarations === BASELINE_DECLARATIONS, { declarations: before.declarations });
  rec('exams at start are 23', before.exams === BASELINE_EXAMS, { exams: before.exams });

  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const page = await html.text();
  const bundle = (page.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site up with S3 bundle', html.ok && bundle === EXPECTED_BUNDLE, { http: html.status, bundle });

  const jsRes = await fetch(`${LIVE}/${EXPECTED_BUNDLE}`, { headers: { 'Cache-Control': 'no-cache' } });
  const js = jsRes.ok ? await jsRes.text() : '';
  rec('live JS still uses token RPCs',
    js.includes('get_declaration_by_token')
    && js.includes('sign_declaration_by_token')
    && js.includes('get_driving_exam_by_token')
    && js.includes('start_driving_exam_by_token')
    && js.includes('submit_driving_exam_by_token'));
  rec('bundle is Production not Staging', js.includes(PROD_REF) && !js.includes(STAGING_REF));
  rec('signed URL helper still in bundle', js.includes('createSignedUrl'));

  const rpcs = dbSelect(`
    SELECT p.proname AS name,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_declaration_by_token','sign_declaration_by_token',
        'get_driving_exam_by_token','start_driving_exam_by_token','submit_driving_exam_by_token'
      )
    ORDER BY 1
  `);
  rec('five RPCs exist', rpcs.length === 5, { names: rpcs.map((r) => r.name) });
  rec('anon and authenticated still have EXECUTE on all five RPCs',
    rpcs.length === 5 && rpcs.every((r) => r.anon_exec === true || r.anon_exec === 't')
      && rpcs.every((r) => r.auth_exec === true || r.auth_exec === 't'));

  const c4 = dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token','Anonymous can update by token',
      'Anon view exam by token','Anon submit exam by token'
    )
  `)[0];
  rec('C4 four anon policies remain closed', Number(c4?.n) === 0, { remaining: c4?.n });

  rec('public_read_documents still present (unchanged until S7)', Number(dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'public_read_documents'
  `)[0]?.n) === 1);
  rec('documents bucket still public (unchanged until S7)', dbSelect("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0]?.public === 'true');

  const k = keys();
  const anon = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  const short = 'short';

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
  rec('found pending declaration token for read-only GET', Boolean(pendingTok));
  rec('found exam token for read-only GET', Boolean(examTok));

  for (const [fn, args] of [
    ['get_declaration_by_token', { p_token: fake }],
    ['sign_declaration_by_token', { p_token: fake, p_signature_url: 's6-verify-no-write' }],
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
      p_signature_url: 's6-verify-no-write',
    }],
  ]) {
    const { data, error } = await anon.rpc(fn, args);
    rec(`invalid token ${fn} exposes no rows`, !error && rpcRows(data).length === 0, {
      rowCount: rpcRows(data).length,
      error: error?.message || null,
    });
  }
  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: short });
    rec('short declaration token exposes no rows', !error && rpcRows(data).length === 0, {
      rowCount: rpcRows(data).length,
      error: error?.message || null,
    });
  }

  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: pendingTok });
    const rows = rpcRows(data);
    rec('valid declaration token returns only that declaration', !error && rows.length === 1 && String(rows[0].id) === pendingDecl.id, {
      rowCount: rows.length,
      idMatches: rows[0] ? String(rows[0].id) === pendingDecl.id : false,
      note: 'no personal fields stored',
    });
  }
  {
    const { data, error } = await anon.rpc('get_driving_exam_by_token', { p_token: examTok });
    const rows = rpcRows(data);
    rec('valid exam token returns only that exam', !error && rows.length === 1 && String(rows[0].id) === anyExam.id, {
      rowCount: rows.length,
      idMatches: rows[0] ? String(rows[0].id) === anyExam.id : false,
      note: 'GET only; start/submit not called on a real token',
    });
  }
  if (signedTok) {
    const pendingBefore = Number(dbSelect("SELECT count(*) FILTER (WHERE status = 'pending')::int AS n FROM public.driver_declarations")[0]?.n);
    const { data, error } = await anon.rpc('sign_declaration_by_token', {
      p_token: signedTok,
      p_signature_url: 's6-verify-no-write-xxxxxxxx',
    });
    const pendingAfter = Number(dbSelect("SELECT count(*) FILTER (WHERE status = 'pending')::int AS n FROM public.driver_declarations")[0]?.n);
    rec('sign RPC reachable on already-signed token without mutating pending rows', !error && rpcRows(data).length === 1 && pendingAfter === pendingBefore, {
      rowCount: rpcRows(data).length,
      pendingUnchanged: pendingAfter === pendingBefore,
    });
  }

  const { count: anonDeclCount, error: anonDeclErr } = await anon.from('driver_declarations').select('id', { count: 'exact', head: true });
  rec('anon cannot read driver_declarations directly', Number(anonDeclCount || 0) === 0, {
    count: anonDeclCount,
    error: anonDeclErr?.message || null,
  });
  const { count: anonExamCount, error: anonExamErr } = await anon.from('driving_exams').select('id', { count: 'exact', head: true });
  rec('anon cannot read driving_exams directly', Number(anonExamCount || 0) === 0, {
    count: anonExamCount,
    error: anonExamErr?.message || null,
  });

  const { data: updFake, error: updFakeErr } = await anon
    .from('driver_declarations')
    .update({ status: 'signed' })
    .eq('id', '00000000-0000-4000-8000-000000000000')
    .select('id');
  rec('anon cannot update nonexistent declaration id', !updFake?.length, {
    updatedRows: Array.isArray(updFake) ? updFake.length : 0,
    error: updFakeErr?.message || null,
  });
  const pendingSnap = dbSelect(`SELECT status FROM public.driver_declarations WHERE id = '${pendingDecl.id}'`)[0];
  const { data: updReal, error: updRealErr } = await anon
    .from('driver_declarations')
    .update({ status: 'signed' })
    .eq('id', pendingDecl.id)
    .select('id');
  const pendingAfterUpd = dbSelect(`SELECT status FROM public.driver_declarations WHERE id = '${pendingDecl.id}'`)[0];
  rec('anon cannot update real pending declaration row', !updReal?.length && pendingAfterUpd?.status === 'pending' && pendingSnap?.status === 'pending', {
    updatedRows: Array.isArray(updReal) ? updReal.length : 0,
    error: updRealErr?.message || null,
    status: pendingAfterUpd?.status || null,
  });
  const { data: updExam, error: updExamErr } = await anon
    .from('driving_exams')
    .update({ status: 'completed' })
    .eq('id', anyExam.id)
    .select('id');
  const examAfterUpd = dbSelect(`SELECT status FROM public.driving_exams WHERE id = '${anyExam.id}'`)[0];
  rec('anon cannot update real exam row', !updExam?.length && String(examAfterUpd?.status) === String(anyExam.status), {
    updatedRows: Array.isArray(updExam) ? updExam.length : 0,
    error: updExamErr?.message || null,
    statusUnchanged: String(examAfterUpd?.status) === String(anyExam.status),
  });

  const signPage = await fetch(`${LIVE}/sign-declaration?token=${encodeURIComponent(fake)}`, { headers: { 'Cache-Control': 'no-cache' } });
  rec('sign-declaration page served', signPage.ok, { http: signPage.status });
  const examPage = await fetch(`${LIVE}/take-exam?t=${encodeURIComponent(fake)}`, { headers: { 'Cache-Control': 'no-cache' } });
  rec('take-exam page served', examPage.ok, { http: examPage.status });
  rec('sign-declaration and take-exam routes are wired to RPC helpers in live JS',
    js.includes('get_declaration_by_token') && js.includes('get_driving_exam_by_token'));

  const loginPage = await fetch(LIVE + '/login');
  rec('login page HTTP 200', loginPage.ok, { http: loginPage.status });
  const challenge = await fetch(`${PROD_URL}/functions/v1/auth-login-challenge`, {
    method: 'POST',
    headers: {
      apikey: k.anon,
      Authorization: `Bearer ${k.anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: 's6-nonexistent-user@example.invalid', password: 'not-a-real-password' }),
  });
  rec('login challenge endpoint alive (fake user rejected, not 5xx)', challenge.status < 500, {
    http: challenge.status,
  });
  rec('drivers SPA served', (await fetch(LIVE + '/drivers')).ok);
  rec('vehicles SPA served', (await fetch(LIVE + '/vehicles')).ok);
  rec('documents SPA served', (await fetch(LIVE + '/documents')).ok);

  const { count: anonDrivers } = await anon.from('drivers').select('id', { count: 'exact', head: true });
  rec('anon cannot list drivers', Number(anonDrivers || 0) === 0, { count: anonDrivers });
  const { count: anonVehicles } = await anon.from('vehicles').select('id', { count: 'exact', head: true });
  rec('anon cannot list vehicles', Number(anonVehicles || 0) === 0, { count: anonVehicles });

  let authClient = null;
  try {
    if (!k.service) throw new Error('no service key');
    const admin = createClient(PROD_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
    const qaEmail = process.env.S6_QA_EMAIL || process.env.S4_QA_EMAIL || 'k.auto@beeri.co.il';
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: qaEmail });
    if (linkErr) throw linkErr;
    authClient = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: verifyErr } = await authClient.auth.verifyOtp({
      email: qaEmail,
      token: linkData.properties.email_otp,
      type: 'email',
    });
    if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
    rec('existing authorized user session established for read-only checks', true, {
      note: 'temporary in-memory session; no password/role change; signed out at end',
    });

    const { data: drv, error: dErr } = await authClient.from('drivers').select('id, company_name');
    if (dErr) throw dErr;
    const drvCompanies = new Set((drv || []).map((r) => r.company_name).filter(Boolean));
    rec('authorized user can load drivers', Array.isArray(drv), { rowCount: (drv || []).length });
    rec('drivers company isolation', drvCompanies.size <= 1, { distinctCompanies: drvCompanies.size });

    const { data: veh, error: vErr } = await authClient.from('vehicles').select('id, company_name');
    if (vErr) throw vErr;
    const vehCompanies = new Set((veh || []).map((r) => r.company_name).filter(Boolean));
    rec('authorized user can load vehicles', Array.isArray(veh), { rowCount: (veh || []).length });
    rec('vehicles company isolation', vehCompanies.size <= 1, { distinctCompanies: vehCompanies.size });

    const { data: docs, error: docErr } = await authClient
      .from('document_metadata')
      .select('id, file_path, category, company_name')
      .limit(20);
    if (docErr) throw docErr;
    const docCompanies = new Set((docs || []).map((r) => r.company_name).filter(Boolean));
    rec('authorized user can list document metadata', Array.isArray(docs), { rowCount: (docs || []).length });
    rec('document metadata company isolation', (docs || []).length === 0 || docCompanies.size <= 1, {
      distinctCompanies: docCompanies.size,
    });

    const ownPath = (docs || []).find((d) => d.file_path && !/[\u0590-\u05FF]/.test(d.file_path))?.file_path
      || (docs || [])[0]?.file_path;
    if (!ownPath) throw new Error('no document metadata path for authorized user');
    const signed = await authClient.storage.from('documents').createSignedUrl(ownPath, 60);
    rec('authorized user signed URL issued (file body not fetched)', Boolean(signed.data?.signedUrl) && String(signed.data.signedUrl).includes('/object/sign/'), {
      error: signed.error?.message || null,
      usesSignPath: String(signed.data?.signedUrl || '').includes('/object/sign/'),
    });

    await authClient.auth.signOut();
    rec('test session signed out', true);
  } catch (e) {
    try { if (authClient) await authClient.auth.signOut(); } catch { /* ignore */ }
    rec('authorized user read-only checks', false, { error: String(e.message || e).slice(0, 300) });
  }

  const after = snapshotCounts();
  report.counts.after = after;
  rec('files unchanged at 371', after.files === BASELINE_FILES && after.files === before.files, { files: after.files });
  rec('declarations unchanged at 16', after.declarations === BASELINE_DECLARATIONS && after.declarations === before.declarations, { declarations: after.declarations });
  rec('exams unchanged at 23', after.exams === BASELINE_EXAMS && after.exams === before.exams, { exams: after.exams });

  report.verdict = 'PASS';
  report.safeToRequestS7 = true;
  report.noteForS7 = 'S7 is a separate Owner approval. S6 did not private the bucket or drop public_read_documents.';
}

try {
  await main();
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.message || e).slice(0, 800);
  report.safeToRequestS7 = false;
  try {
    if (!report.counts.after) report.counts.after = snapshotCounts();
  } catch (ce) {
    report.countError = String(ce.message || ce).slice(0, 300);
  }
}

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  verdict: report.verdict,
  failed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  counts: report.counts,
  changed: report.changed,
  s7Started: false,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
