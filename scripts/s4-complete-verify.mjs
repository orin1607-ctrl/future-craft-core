/**
 * S4 completion — READ-ONLY verify against 371-file baseline.
 * Does not deploy, mutate DB/RLS/storage, or start S5.
 * node scripts/s4-complete-verify.mjs
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
const BASELINE_FILES = 371;
const OUT = join(process.cwd(), 'public/project-001/production-s4-complete-report.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_ROLES = new Set(['super_admin', 'fleet_manager', 'office_manager', 'driver', 'customer', 'admin']);

const report = {
  id: 'production-s4-complete',
  at: new Date().toISOString(),
  step: 'S4',
  changed: 'none — verification only',
  s5Started: false,
  tests: [],
  skipped: [],
  fileProbes: [],
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

function dbSql(sql) {
  const body = String(sql)
    .replace(/--.*$/gm, '')
    .replace(/'(?:\\'|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(body)) throw new Error('ABORT: SQL must be SELECT');
  if (/\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/i.test(body)) {
    throw new Error('ABORT: write-like SQL blocked');
  }
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-s4c-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function fileCount() {
  const rows = dbSql("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'documents'");
  return Number(rows[0]?.n || 0);
}

async function probeNewObjects(sinceIso) {
  const rows = dbSql(`
    SELECT
      o.created_at::text AS created_at,
      o.metadata,
      split_part(o.name, '/', 1) AS seg1,
      split_part(o.name, '/', 2) AS seg2,
      split_part(o.name, '/', 3) AS seg3,
      o.owner_id::text AS owner_id,
      (p.id IS NOT NULL) AS profile_exists,
      COALESCE(p.is_active, false) AS is_active,
      (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id::text = o.owner_id::text LIMIT 1) AS role,
      (m.id IS NOT NULL) AS metadata_exists,
      m.category,
      (m.uploaded_by IS NOT NULL AND m.uploaded_by::text = o.owner_id::text) AS uploaded_by_matches
    FROM storage.objects o
    LEFT JOIN public.profiles p ON p.id::text = o.owner_id::text
    LEFT JOIN public.document_metadata m ON m.file_path = o.name
    WHERE o.bucket_id = 'documents'
      AND o.created_at > '${sinceIso.replace(/'/g, '')}'
  `);
  return (rows || []).map((r) => {
    const meta = r.metadata && typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
    const folder = String(r.seg2 || '');
    const folderOk = folder === 'vehicles_{numeric}' || /^vehicles_\d+$/.test(folder)
      || ['vehicle-license', 'insurance', 'comprehensive', 'driver-license', 'health', 'other'].includes(folder);
    const pathOk = UUID_RE.test(String(r.seg1 || '')) && /^\d{10,13}_/.test(String(r.seg3 || ''));
    const legitimate = pathOk && (r.profile_exists === true || r.profile_exists === 't')
      && (r.is_active === true || r.is_active === 't')
      && APP_ROLES.has(String(r.role || ''))
      && (r.metadata_exists === true || r.metadata_exists === 't' || folderOk);
    return {
      created_at: r.created_at,
      mimeType: meta.mimetype || null,
      sizeBytes: meta.size || null,
      folderShape: /^vehicles_\d+$/.test(folder) ? 'vehicles_{numeric}' : (folder.length < 40 ? folder : 'redacted'),
      legitimate,
      metadataExists: r.metadata_exists === true || r.metadata_exists === 't',
      category: r.category && !/[\u0590-\u05FF]/.test(String(r.category)) ? r.category : null,
      uploadedByMatches: r.uploaded_by_matches === true || r.uploaded_by_matches === 't',
    };
  });
}

async function main() {
  const startedCount = fileCount();
  report.filesAtStart = startedCount;
  rec('document count at start is 371', startedCount === BASELINE_FILES, { filesAtStart: startedCount });

  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const text = await html.text();
  const bundle = (text.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site up', html.ok && bundle === EXPECTED_BUNDLE, { http: html.status, bundle });

  const jsRes = await fetch(`${LIVE}/${EXPECTED_BUNDLE}`, { headers: { 'Cache-Control': 'no-cache' } });
  const js = jsRes.ok ? await jsRes.text() : '';
  rec('signed URL helper live in bundle', js.includes('createSignedUrl'));
  rec('five RPCs present in live bundle',
    js.includes('get_declaration_by_token')
    && js.includes('sign_declaration_by_token')
    && js.includes('get_driving_exam_by_token')
    && js.includes('start_driving_exam_by_token')
    && js.includes('submit_driving_exam_by_token'));
  rec('bundle is Production not Staging', js.includes(PROD_REF) && !js.includes(STAGING_REF));

  const k = keys();
  const anon = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const loginPage = await fetch(LIVE + '/login');
  rec('login page HTTP 200', loginPage.ok, { http: loginPage.status });
  const challenge = await fetch(`${PROD_URL}/functions/v1/auth-login-challenge`, {
    method: 'POST',
    headers: {
      apikey: k.anon,
      Authorization: `Bearer ${k.anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: 's4-nonexistent-user@example.invalid', password: 'not-a-real-password' }),
  });
  rec('login challenge endpoint alive (fake user rejected, not 5xx)', challenge.status < 500, {
    http: challenge.status,
  });

  const driversPage = await fetch(LIVE + '/drivers');
  const vehiclesPage = await fetch(LIVE + '/vehicles');
  const docsPage = await fetch(LIVE + '/documents');
  rec('drivers SPA served', driversPage.ok);
  rec('vehicles SPA served', vehiclesPage.ok);
  rec('documents SPA served', docsPage.ok);

  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  for (const [fn, args] of [
    ['get_declaration_by_token', { p_token: fake }],
    ['sign_declaration_by_token', { p_token: fake, p_signature_url: 's4-complete-no-write' }],
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
      p_signature_url: 's4-complete-no-write',
    }],
  ]) {
    const { data, error } = await anon.rpc(fn, args);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec(`invalid token ${fn} exposes no rows`, !error && rows.length === 0, {
      rowCount: rows.length,
      error: error?.message || null,
    });
  }

  const signHtml = await fetch(`${LIVE}/sign-declaration?token=${fake}`);
  rec('invalid declaration link still serves SPA', signHtml.ok);

  const { count: anonDrivers, error: anonDrvErr } = await anon.from('drivers').select('id', { count: 'exact', head: true });
  rec('anon cannot list drivers', !anonDrvErr && Number(anonDrivers || 0) === 0, {
    count: anonDrivers,
    error: anonDrvErr?.message || null,
  });
  const { count: anonVehicles, error: anonVehErr } = await anon.from('vehicles').select('id', { count: 'exact', head: true });
  rec('anon cannot list vehicles', !anonVehErr && Number(anonVehicles || 0) === 0, {
    count: anonVehicles,
    error: anonVehErr?.message || null,
  });

  const c4 = dbSql(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token','Anonymous can update by token',
      'Anon view exam by token','Anon submit exam by token'
    )
  `)[0];
  rec('C4 still open on purpose (not a new exposure before S5)', Number(c4?.n) === 4);

  const bucket = dbSql("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
  rec('documents bucket still public on purpose (not a new exposure before S7)', bucket?.public === 'true');

  const isolationPolicies = dbSql(`
    SELECT tablename, count(*)::int AS n
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('drivers', 'vehicles', 'document_metadata')
    GROUP BY 1
    ORDER BY 1
  `);
  rec('company RLS policies still present on drivers/vehicles/documents',
    isolationPolicies.length === 3 && isolationPolicies.every((r) => Number(r.n) >= 1),
    { tables: isolationPolicies.map((r) => r.tablename) });

  let authClient = null;
  try {
    if (!k.service) throw new Error('no service key');
    const admin = createClient(PROD_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
    const qaEmail = process.env.S4_QA_EMAIL || 'k.auto@beeri.co.il';
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: qaEmail });
    if (linkErr) throw linkErr;
    authClient = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: verifyErr } = await authClient.auth.verifyOtp({
      email: qaEmail,
      token: linkData.properties.email_otp,
      type: 'email',
    });
    if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
    rec('existing authorized user session established for read-only UI/API checks', true, {
      note: 'temporary in-memory session; no password/role change; signed out at end',
    });

    const { data: drv, error: dErr } = await authClient.from('drivers').select('id, company_name');
    if (dErr) throw dErr;
    const drvCompanies = new Set((drv || []).map((r) => r.company_name).filter(Boolean));
    rec('drivers list loads for authorized user', Array.isArray(drv) && drv.length >= 0, { rowCount: (drv || []).length });
    rec('drivers company isolation (single company in result set)', drvCompanies.size <= 1, {
      distinctCompanies: drvCompanies.size,
    });

    const { data: veh, error: vErr } = await authClient.from('vehicles').select('id, company_name');
    if (vErr) throw vErr;
    const vehCompanies = new Set((veh || []).map((r) => r.company_name).filter(Boolean));
    rec('vehicles list loads for authorized user', Array.isArray(veh) && veh.length >= 0, { rowCount: (veh || []).length });
    rec('vehicles company isolation (single company in result set)', vehCompanies.size <= 1, {
      distinctCompanies: vehCompanies.size,
    });

    const { data: docs, error: docErr } = await authClient
      .from('document_metadata')
      .select('id, file_path, category, company_name')
      .limit(20);
    if (docErr) throw docErr;
    const docCompanies = new Set((docs || []).map((r) => r.company_name).filter(Boolean));
    rec('authorized user can list documents metadata', Array.isArray(docs), { rowCount: (docs || []).length });
    rec('document metadata company isolation', (docs || []).length === 0 || docCompanies.size <= 1, {
      distinctCompanies: docCompanies.size,
    });

    const ownPath = (docs || []).find((d) => d.file_path && !/[\u0590-\u05FF]/.test(d.file_path))?.file_path
      || (docs || [])[0]?.file_path;
    if (ownPath) {
      const signed = await authClient.storage.from('documents').createSignedUrl(ownPath, 60);
      rec('authorized user signed URL issued (file body not fetched)', Boolean(signed.data?.signedUrl) && String(signed.data.signedUrl).includes('/object/sign/'), {
        error: signed.error?.message || null,
        usesSignPath: String(signed.data?.signedUrl || '').includes('/object/sign/'),
      });
    } else {
      skip('signed URL on own document', 'no metadata rows for this user');
    }

    await authClient.auth.signOut();
    rec('test session signed out', true);
  } catch (e) {
    rec('authorized user read-only checks', false, { error: String(e.message || e).slice(0, 300) });
    try { if (authClient) await authClient.auth.signOut(); } catch { /* ignore */ }
  }

  const endedCount = fileCount();
  report.filesAtEnd = endedCount;
  if (endedCount === startedCount) {
    rec('document count unchanged during S4 complete', true, { filesAtEnd: endedCount });
  } else if (endedCount > startedCount) {
    const probes = await probeNewObjects(report.at);
    report.fileProbes = probes;
    const allLegit = probes.length === endedCount - startedCount && probes.every((p) => p.legitimate);
    rec('count rose during test; new objects are legitimate app uploads', allLegit, {
      filesAtEnd: endedCount,
      added: endedCount - startedCount,
      probes,
    });
  } else {
    rec('document count must not drop', false, { filesAtStart: startedCount, filesAtEnd: endedCount });
  }

  const failed = report.tests.filter((t) => !t.ok);
  report.verdict = failed.length ? 'FAIL' : 'PASS';
  report.safeToRequestS5 = report.verdict === 'PASS';
}

try {
  await main();
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.stderr || e.message || e).slice(0, 800);
}

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  verdict: report.verdict,
  failed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  filesAtStart: report.filesAtStart,
  filesAtEnd: report.filesAtEnd,
  s5Started: false,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
