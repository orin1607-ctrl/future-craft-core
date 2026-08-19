/**
 * S7 ONLY — private documents bucket + DROP public_read_documents.
 * No other policy changes. No Hostinger, RPCs, C4, users, or file writes.
 * node scripts/s7-production-close-public-documents.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const EXPECTED_BUNDLE = 'assets/index-CnhgFhN-.js';
const BASELINE_FILES = 371;
const S1_TAR = '/root/s1-safety-backup-2026-08-19T061550Z.tgz';
const S1_SHA = '85658300f848e6048ee0a78f48ef7272ff5cab8cece8ccefeed7062feb060835';
const S3_TAR = '/root/pre-s3-dist-2026-08-19T06-58-56.tgz';
const OUT = join(process.cwd(), 'public/project-001/production-s7-close-public-documents-report.json');
const BACKUP = join(process.cwd(), 'public/project-001/production-s7-storage-policy-backup.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_ROLES = new Set(['super_admin', 'fleet_manager', 'office_manager', 'driver', 'customer', 'admin']);

const SET_PRIVATE = "UPDATE storage.buckets SET public = false WHERE id = 'documents'";
const SET_PUBLIC = "UPDATE storage.buckets SET public = true WHERE id = 'documents'";
const DROP_PUBLIC_READ = 'DROP POLICY IF EXISTS "public_read_documents" ON storage.objects';

const report = {
  id: 'production-s7-close-public-documents',
  at: new Date().toISOString(),
  step: 'S7',
  changedApplied: false,
  droppedPolicies: [],
  bucketPublicAfter: null,
  s8Started: false,
  hostingerChanged: false,
  rpcsChanged: false,
  c4Touched: false,
  filesOpened: false,
  tests: [],
  skipped: [],
  fileProbes: [],
  rollbackDone: false,
  verdict: 'FAIL',
};

let authClient = null;

function rec(name, ok, extra = {}) {
  report.tests.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) {
    const err = new Error(`STOP: ${name}`);
    err.rollback = extra.rollback === true && report.changedApplied;
    throw err;
  }
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
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-s7-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function dbAllowlisted(sql) {
  const n = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const createOk = (report.restoreSql || []).some((s) => s.replace(/\s+/g, ' ').trim().replace(/;$/, '') === n);
  const ok = n === SET_PRIVATE || n === SET_PUBLIC || n === DROP_PUBLIC_READ || createOk;
  if (!ok) throw new Error(`ABORT: SQL not on S7 allowlist: ${n.slice(0, 160)}`);
  return runSql(sql.endsWith(';') ? sql : `${sql};`);
}

function toCreateSql(p) {
  const roles = String(p.roles || 'anon').replace(/[{}]/g, '');
  let sql = `CREATE POLICY "${p.policyname}" ON ${p.schemaname}.${p.tablename} FOR ${p.cmd} TO ${roles}`;
  if (p.qual) sql += ` USING (${p.qual})`;
  if (p.with_check) sql += ` WITH CHECK (${p.with_check})`;
  return `${sql};`;
}

function ssh(remote) {
  return execSync('ssh -o BatchMode=yes -o ConnectTimeout=20 dalia-vps bash -s', {
    encoding: 'utf8',
    input: `${remote}\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
  return Number(dbSelect("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'documents'")[0]?.n);
}

function bucketPublic() {
  return dbSelect("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0]?.public === 'true';
}

function publicReadCount() {
  return Number(dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_read_documents'
  `)[0]?.n);
}

function c4Count() {
  return Number(dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token','Anonymous can update by token',
      'Anon view exam by token','Anon submit exam by token'
    )
  `)[0]?.n);
}

function pathShape(name) {
  const parts = String(name || '').split('/');
  const folder = parts[1] || '';
  return {
    seg1: UUID_RE.test(parts[0] || '') ? 'uuid' : (parts[0] === 'declarations' ? 'declarations' : 'other'),
    folder: /^vehicles_\d+$/.test(folder) ? 'vehicles_{numeric}' : (folder === 'declarations' || folder.length < 24 ? folder : 'redacted'),
  };
}

function publicObjectUrl(name) {
  const encoded = String(name).split('/').map(encodeURIComponent).join('/');
  return `${PROD_URL}/storage/v1/object/public/documents/${encoded}`;
}

async function publicUrlStatus(name) {
  const url = publicObjectUrl(name);
  const res = await fetch(url, { method: 'GET', redirect: 'manual' });
  const ct = res.headers.get('content-type') || '';
  if (res.body) {
    try { await res.body.cancel(); } catch { /* ignore */ }
  }
  return { status: res.status, jsonLike: ct.includes('json') || ct.includes('text') };
}

function restoreS7(reason) {
  console.log(`ROLLBACK S7: ${reason}`);
  const errors = [];
  try { dbAllowlisted(SET_PUBLIC); } catch (e) { errors.push(String(e.message || e).slice(0, 200)); }
  try { dbAllowlisted(DROP_PUBLIC_READ); } catch (e) { errors.push(String(e.message || e).slice(0, 200)); }
  for (const sql of report.restoreSql || []) {
    try { dbAllowlisted(sql); } catch (e) { errors.push(String(e.message || e).slice(0, 200)); }
  }
  report.rollbackDone = true;
  report.rollbackReason = reason;
  report.rollbackErrors = errors;
  report.bucketPublicAfterRollback = bucketPublic();
  report.publicReadAfterRollback = publicReadCount();
}

async function probeNewObjects(sinceIso) {
  const rows = dbSelect(`
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
      m.category
    FROM storage.objects o
    LEFT JOIN public.profiles p ON p.id::text = o.owner_id::text
    LEFT JOIN public.document_metadata m ON m.file_path = o.name
    WHERE o.bucket_id = 'documents'
      AND o.created_at > '${sinceIso.replace(/'/g, '')}'
  `);
  return (rows || []).map((r) => {
    const meta = r.metadata && typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
    const folder = String(r.seg2 || '');
    const pathOk = UUID_RE.test(String(r.seg1 || '')) && /^\d{10,13}_/.test(String(r.seg3 || ''));
    const legitimate = pathOk && (r.profile_exists === true || r.profile_exists === 't')
      && (r.is_active === true || r.is_active === 't')
      && APP_ROLES.has(String(r.role || ''));
    return {
      created_at: r.created_at,
      mimeType: meta.mimetype || null,
      sizeBytes: meta.size || null,
      folderShape: /^vehicles_\d+$/.test(folder) ? 'vehicles_{numeric}' : 'redacted',
      legitimate,
      metadataExists: r.metadata_exists === true || r.metadata_exists === 't',
      category: r.category && !/[\u0590-\u05FF]/.test(String(r.category)) ? r.category : null,
    };
  });
}

async function main() {
  const s6 = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/production-s6-verify-report.json'), 'utf8'));
  rec('S6 verify was PASS', s6.verdict === 'PASS');
  rec('C4 still closed before change', c4Count() === 0);

  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const page = await html.text();
  const bundle = (page.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site is S3 bundle', html.ok && bundle === EXPECTED_BUNDLE, { http: html.status, bundle });
  const js = await (await fetch(`${LIVE}/${EXPECTED_BUNDLE}`, { headers: { 'Cache-Control': 'no-cache' } })).text();
  rec('live JS still has signed URL + token RPCs', js.includes('createSignedUrl') && js.includes('get_declaration_by_token') && js.includes(PROD_REF) && !js.includes(STAGING_REF));

  const filesBefore = fileCount();
  rec('documents count is 371 before change', filesBefore === BASELINE_FILES, { files: filesBefore });
  report.filesBefore = filesBefore;
  const declBefore = Number(dbSelect('SELECT count(*)::int AS n FROM public.driver_declarations')[0]?.n);
  const examBefore = Number(dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0]?.n);
  report.dataBefore = { declarations: declBefore, exams: examBefore };

  rec('documents bucket is public before change', bucketPublic() === true);
  rec('public_read_documents present before change', publicReadCount() === 1);

  const storagePolicies = dbSelect(`
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname
  `);
  const publicRead = storagePolicies.find((p) => p.policyname === 'public_read_documents');
  rec('captured public_read_documents definition', Boolean(publicRead?.qual));
  report.restoreSql = publicRead ? [toCreateSql(publicRead)] : [];
  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(BACKUP, JSON.stringify({
    at: new Date().toISOString(),
    bucketPublic: true,
    policies: storagePolicies.map((p) => ({
      schemaname: p.schemaname,
      tablename: p.tablename,
      policyname: p.policyname,
      cmd: p.cmd,
      roles: p.roles,
      qual: p.qual,
      with_check: p.with_check,
    })),
    restoreSql: report.restoreSql.concat([`${SET_PUBLIC};`]),
    note: 'S7 rollback restores bucket public=true and public_read_documents only. Other policies were not dropped.',
  }, null, 2));
  rec('S7 rollback SQL documented', report.restoreSql.length === 1);

  const sshOut = ssh(`
    set -e
    test -f ${S1_TAR}
    test -f ${S3_TAR}
    sha256sum ${S1_TAR} | awk '{print $1}'
    wc -c < ${S1_TAR}
    test -f /root/future-craft-core/dist/index.html && echo LIVE_OK
  `).trim().split(/\r?\n/);
  rec('S1 and S3 backups still present on VPS', sshOut.includes('LIVE_OK') && sshOut.includes(S1_SHA), {
    s1ShaMatches: sshOut.includes(S1_SHA),
    liveOk: sshOut.includes('LIVE_OK'),
  });

  rec('Anonymous can view declaration signatures left untouched on purpose', storagePolicies.some((p) => p.policyname === 'Anonymous can view declaration signatures'));
  rec('Anonymous can upload declaration signatures left untouched', storagePolicies.some((p) => p.policyname === 'Anonymous can upload declaration signatures'));

  const k = keys();
  const anon = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  if (!k.service) throw new Error('STOP: no service key');
  const admin = createClient(PROD_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const qaEmail = process.env.S7_QA_EMAIL || process.env.S6_QA_EMAIL || process.env.S4_QA_EMAIL || 'k.auto@beeri.co.il';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: qaEmail });
  if (linkErr) throw linkErr;
  const authClientLocal = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  authClient = authClientLocal;
  const { data: auth, error: verifyErr } = await authClientLocal.auth.verifyOtp({
    email: qaEmail,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  rec('authorized user session established for S7 checks', true, {
    note: 'temporary in-memory session; no password/role change; signed out at end',
  });

  const { data: ownDocs, error: ownErr } = await authClient
    .from('document_metadata')
    .select('id, file_path, company_name')
    .limit(20);
  if (ownErr) throw ownErr;
  const ownPath = (ownDocs || []).find((d) => d.file_path && !/[\u0590-\u05FF]/.test(d.file_path))?.file_path
    || (ownDocs || [])[0]?.file_path;
  rec('authorized user can list own document metadata before change', Boolean(ownPath), { rowCount: (ownDocs || []).length });
  const signedBefore = await authClient.storage.from('documents').createSignedUrl(ownPath, 60);
  rec('authorized signed URL works before change', Boolean(signedBefore.data?.signedUrl) && String(signedBefore.data.signedUrl).includes('/object/sign/'), {
    error: signedBefore.error?.message || null,
  });

  const sample = dbSelect(`
    SELECT name
    FROM storage.objects
    WHERE bucket_id = 'documents'
      AND split_part(name, '/', 1) <> 'declarations'
    LIMIT 1
  `)[0];
  rec('found a non-declaration object for public-URL probe', Boolean(sample?.name), {
    pathShape: pathShape(sample.name),
    pathHash: createHash('sha256').update(String(sample.name)).digest('hex').slice(0, 12),
  });

  dbAllowlisted(SET_PRIVATE);
  report.changedApplied = true;
  rec('documents bucket now private', bucketPublic() === false, { rollback: true });
  dbAllowlisted(DROP_PUBLIC_READ);
  rec('public_read_documents dropped', publicReadCount() === 0, { rollback: true });
  report.droppedPolicies = ['public_read_documents'];
  report.bucketPublicAfter = false;

  rec('C4 still closed after S7', c4Count() === 0, { rollback: true });
  rec('Anonymous can view declaration signatures still present', Number(dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Anonymous can view declaration signatures'
  `)[0]?.n) === 1, { rollback: true });

  const liveAfter = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const liveBundle = ((await liveAfter.text()).match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site still S3 bundle after lock', liveAfter.ok && liveBundle === EXPECTED_BUNDLE, {
    rollback: true,
    bundle: liveBundle,
  });

  const signedAfter = await authClient.storage.from('documents').createSignedUrl(ownPath, 60);
  rec('authorized user still receives a signed URL after lock', Boolean(signedAfter.data?.signedUrl) && String(signedAfter.data.signedUrl).includes('/object/sign/'), {
    rollback: true,
    error: signedAfter.error?.message || null,
    usesSignPath: String(signedAfter.data?.signedUrl || '').includes('/object/sign/'),
  });

  const { data: ownDocsAfter, error: ownAfterErr } = await authClient
    .from('document_metadata')
    .select('id, file_path, company_name')
    .limit(20);
  if (ownAfterErr) throw ownAfterErr;
  const companies = new Set((ownDocsAfter || []).map((r) => r.company_name).filter(Boolean));
  rec('authorized user still lists own-company document metadata', Array.isArray(ownDocsAfter) && (ownDocsAfter.length === 0 || companies.size <= 1), {
    rollback: true,
    rowCount: (ownDocsAfter || []).length,
    distinctCompanies: companies.size,
  });

  const publicAfter = await publicUrlStatus(sample.name);
  rec('old public URL no longer serves the file', publicAfter.status !== 200, {
    rollback: false,
    status: publicAfter.status,
  });

  const anonSigned = await anon.storage.from('documents').createSignedUrl(sample.name, 60);
  rec('unauthenticated cannot issue signed URL for a non-declaration object', !anonSigned.data?.signedUrl, {
    rollback: false,
    error: anonSigned.error?.message || null,
  });

  const uid = auth.session.user.id;
  const foreign = dbSelect(`
    SELECT name
    FROM storage.objects
    WHERE bucket_id = 'documents'
      AND split_part(name, '/', 1) <> '${uid.replace(/'/g, '')}'
      AND split_part(name, '/', 1) <> 'declarations'
    LIMIT 1
  `)[0];
  if (!foreign?.name) {
    report.skipped.push({ name: 'company A cannot issue signed URL for another company object', reason: 'no foreign-path object found' });
  } else {
    const foreignSigned = await authClient.storage.from('documents').createSignedUrl(foreign.name, 60);
    const blocked = !foreignSigned.data?.signedUrl;
    report.tests.push({
      name: 'company A cannot issue signed URL for another company object',
      ok: blocked,
      leftover: !blocked,
      rollback: false,
      note: blocked
        ? 'storage isolation held'
        : 'pre-existing authenticated bucket-wide SELECT leftover; not dropped in S7; file body not fetched',
      error: foreignSigned.error?.message || null,
    });
    console.log(`${blocked ? 'PASS' : 'FAIL'} company A cannot issue signed URL for another company object`);
  }

  rec('anon cannot read driver_declarations', Number((await anon.from('driver_declarations').select('id', { count: 'exact', head: true })).count || 0) === 0, { rollback: true });
  rec('anon cannot read driving_exams', Number((await anon.from('driving_exams').select('id', { count: 'exact', head: true })).count || 0) === 0, { rollback: true });

  await authClient.auth.signOut();
  rec('test session signed out', true);

  const filesAfter = fileCount();
  report.filesAfter = filesAfter;
  if (filesAfter === filesBefore) {
    rec('document count unchanged at 371', filesAfter === BASELINE_FILES, { files: filesAfter });
  } else if (filesAfter > filesBefore) {
    const probes = await probeNewObjects(report.at);
    report.fileProbes = probes;
    rec('count rose during S7 window; new objects look like legitimate app uploads', probes.length === filesAfter - filesBefore && probes.every((p) => p.legitimate), {
      files: filesAfter,
      added: filesAfter - filesBefore,
    });
  } else {
    rec('document count must not drop', false, { filesBefore, filesAfter });
  }
  const declAfter = Number(dbSelect('SELECT count(*)::int AS n FROM public.driver_declarations')[0]?.n);
  const examAfter = Number(dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0]?.n);
  rec('declaration and exam totals unchanged', declAfter === declBefore && examAfter === examBefore, {
    declarations: { before: declBefore, after: declAfter },
    exams: { before: examBefore, after: examAfter },
  });

  report.bucketPublicAfter = bucketPublic();
  report.publicReadRemaining = publicReadCount();
  const leftoverIso = report.tests.find((t) => t.leftover);
  report.knownLeftover = leftoverIso
    ? 'Authenticated bucket-wide SELECT policies still allow an authenticated user to request a signed URL for another company object. This existed before S7 and was not changed. File body was not fetched.'
    : null;
  const hardFails = report.tests.filter((t) => !t.ok && !t.leftover);
  report.verdict = hardFails.length ? 'FAIL' : 'PASS';
  report.safeToRequestFinalSecurityReview = report.verdict === 'PASS';
}

try {
  await main();
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.message || e).slice(0, 800);
  report.safeToRequestFinalSecurityReview = false;
  if (e.rollback && report.changedApplied && !report.rollbackDone) {
    try { restoreS7(report.error); } catch (re) { report.rollbackError = String(re.message || re).slice(0, 400); }
  }
} finally {
  try { if (authClient) await authClient.auth.signOut(); } catch { /* ignore */ }
}

if (report.verdict !== 'FAIL') {
  const hardFails = report.tests.filter((t) => !t.ok && !t.leftover);
  report.verdict = hardFails.length ? 'FAIL' : 'PASS';
}

try {
  if (!report.filesAfter && report.changedApplied) report.filesAfter = fileCount();
  report.bucketPublicAfter = bucketPublic();
  report.publicReadRemaining = publicReadCount();
} catch { /* ignore */ }

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  backup: BACKUP,
  verdict: report.verdict,
  changedApplied: report.changedApplied,
  bucketPublicAfter: report.bucketPublicAfter,
  droppedPolicies: report.droppedPolicies,
  rollbackDone: report.rollbackDone,
  failed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  filesBefore: report.filesBefore,
  filesAfter: report.filesAfter,
  s8Started: false,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
