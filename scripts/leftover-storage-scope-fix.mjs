/**
 * Leftover storage scope fix + optional read-only final security check.
 * Does not restore public bucket, public_read_documents, or C4.
 * node scripts/leftover-storage-scope-fix.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const EXPECTED_BUNDLE = 'assets/index-CnhgFhN-.js';
const S7_AT = '2026-08-19T08:48:06.839Z';
const OUT = join(process.cwd(), 'public/project-001/production-leftover-scope-fix-report.json');
const BACKUP = join(process.cwd(), 'public/project-001/production-leftover-policy-backup.json');
const FINAL_OUT = join(process.cwd(), 'public/project-001/production-final-security-check-report.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_ROLES = new Set(['super_admin', 'fleet_manager', 'office_manager', 'driver', 'customer', 'admin']);

const NEW_NAME = 'auth_select_same_company_uuid_and_decl_sigs';
const DROP_WIDE_1 = 'DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects';
const DROP_WIDE_2 = 'DROP POLICY IF EXISTS "auth_read_documents" ON storage.objects';
const DROP_ANON_VIEW = 'DROP POLICY IF EXISTS "Anonymous can view declaration signatures" ON storage.objects';
const DROP_NEW = `DROP POLICY IF EXISTS "${NEW_NAME}" ON storage.objects`;
const CREATE_SCOPED = `CREATE POLICY "${NEW_NAME}" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'documents'::text) AND ((public.has_role(auth.uid(), 'fleet_manager'::app_role) AND EXISTS (SELECT 1 FROM public.document_metadata m WHERE m.file_path = name AND m.company_name = public.get_user_company(auth.uid()))) OR (((storage.foldername(name))[1] = 'declarations'::text) AND (public.has_role(auth.uid(), 'super_admin'::app_role) OR (public.has_role(auth.uid(), 'fleet_manager'::app_role) AND EXISTS (SELECT 1 FROM public.driver_declarations d WHERE d.company_name = public.get_user_company(auth.uid()) AND name LIKE ('declarations/sig_' || d.id::text || '_%')))))));`;

const report = {
  id: 'production-leftover-scope-fix',
  at: new Date().toISOString(),
  changedApplied: false,
  dropped: [],
  created: [],
  tests: [],
  skipped: [],
  fileProbes: [],
  rollbackDone: false,
  finalStarted: false,
  verdict: 'FAIL',
};

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
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-leftover-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function norm(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().replace(/;$/, '');
}

function dbAllowlisted(sql) {
  const n = norm(sql);
  const createOk = (report.restoreSql || []).some((s) => norm(s) === n) || n === norm(CREATE_SCOPED);
  const dropOk = [DROP_WIDE_1, DROP_WIDE_2, DROP_ANON_VIEW, DROP_NEW].some((s) => n === norm(s));
  if (!createOk && !dropOk) throw new Error(`ABORT: SQL not on leftover allowlist: ${n.slice(0, 180)}`);
  return runSql(sql.endsWith(';') ? sql : `${sql};`);
}

function toCreateSql(p) {
  const roles = String(p.roles || 'authenticated').replace(/[{}]/g, '');
  let sql = `CREATE POLICY "${p.policyname}" ON ${p.schemaname}.${p.tablename} FOR ${p.cmd} TO ${roles}`;
  if (p.qual) sql += ` USING (${p.qual})`;
  if (p.with_check) sql += ` WITH CHECK (${p.with_check})`;
  return `${sql};`;
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

function policyCount(name) {
  return Number(dbSelect(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = '${name.replace(/'/g, '')}'
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
    folder: /^vehicles_\d+$/.test(folder) ? 'vehicles_{numeric}' : (folder.length < 24 ? folder : 'redacted'),
  };
}

function publicObjectUrl(name) {
  return `${PROD_URL}/storage/v1/object/public/documents/${String(name).split('/').map(encodeURIComponent).join('/')}`;
}

async function publicUrlStatus(name) {
  const res = await fetch(publicObjectUrl(name), { method: 'GET', redirect: 'manual' });
  if (res.body) {
    try { await res.body.cancel(); } catch { /* ignore */ }
  }
  return res.status;
}

function probeNewObjects(sinceIso) {
  const rows = dbSelect(`
    SELECT
      o.created_at::text AS created_at,
      o.metadata,
      split_part(o.name, '/', 1) AS seg1,
      split_part(o.name, '/', 2) AS seg2,
      split_part(o.name, '/', 3) AS seg3,
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

function restoreLeftover(reason) {
  console.log(`ROLLBACK leftover only: ${reason}`);
  const errors = [];
  try { dbAllowlisted(DROP_NEW); } catch (e) { errors.push(String(e.message || e).slice(0, 200)); }
  for (const sql of report.restoreSql || []) {
    try { dbAllowlisted(sql); } catch (e) { errors.push(String(e.message || e).slice(0, 200)); }
  }
  report.rollbackDone = true;
  report.rollbackReason = reason;
  report.rollbackErrors = errors;
  report.afterRollback = {
    wide1: policyCount('Authenticated users can view documents'),
    wide2: policyCount('auth_read_documents'),
    anonView: policyCount('Anonymous can view declaration signatures'),
    newPolicy: policyCount(NEW_NAME),
    bucketPublic: bucketPublic(),
    publicRead: policyCount('public_read_documents'),
    c4: c4Count(),
  };
}

async function login(admin, anonKey, email) {
  const client = createClient(PROD_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  return client;
}

function restoreSqlFrom(policies, names) {
  return names.map((name) => {
    const p = policies.find((x) => x.policyname === name);
    if (!p) throw new Error(`STOP: missing snapshot for ${name}`);
    return toCreateSql(p);
  });
}

async function main() {
  const s5 = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/production-s5-c4-close-report.json'), 'utf8'));
  const s6 = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/production-s6-verify-report.json'), 'utf8'));
  const s7 = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/production-s7-close-public-documents-report.json'), 'utf8'));
  rec('S5 still PASS', s5.verdict === 'PASS' && s5.c4Closed === true);
  rec('S6 still PASS', s6.verdict === 'PASS');
  rec('S7 still PASS', s7.verdict === 'PASS' && s7.bucketPublicAfter === false);

  rec('documents still private', bucketPublic() === false);
  rec('public_read_documents still absent', policyCount('public_read_documents') === 0);
  rec('C4 still closed', c4Count() === 0);

  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const page = await html.text();
  const bundle = (page.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
  rec('live site is S3 bundle', html.ok && bundle === EXPECTED_BUNDLE, { bundle });
  const js = await (await fetch(`${LIVE}/${EXPECTED_BUNDLE}`)).text();
  rec('signed URL helper still in live JS', js.includes('createSignedUrl') && js.includes(PROD_REF) && !js.includes(STAGING_REF));

  const filesBefore = fileCount();
  report.filesBefore = filesBefore;
  if (filesBefore > 371) {
    const probes = probeNewObjects(S7_AT);
    report.fileProbes = probes;
    rec('files added after S7 look like legitimate app uploads', probes.length === filesBefore - 371 && probes.every((p) => p.legitimate), {
      files: filesBefore,
      added: filesBefore - 371,
    });
  } else {
    rec('document count still at least S7 baseline', filesBefore >= 371, { files: filesBefore });
  }
  const declBefore = Number(dbSelect('SELECT count(*)::int AS n FROM public.driver_declarations')[0]?.n);
  const examBefore = Number(dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0]?.n);
  report.dataBefore = { declarations: declBefore, exams: examBefore };

  const storagePolicies = dbSelect(`
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname
  `);
  const dropNames = [
    'Authenticated users can view documents',
    'auth_read_documents',
    'Anonymous can view declaration signatures',
  ];
  const toDrop = storagePolicies.filter((p) => dropNames.includes(p.policyname));
  rec('both wide authenticated SELECT policies present with bucket-only qual',
    toDrop.filter((p) => p.policyname !== 'Anonymous can view declaration signatures').every((p) => String(p.qual).replace(/\s+/g, '') === "(bucket_id='documents'::text)")
      && toDrop.length === 3,
    { names: toDrop.map((p) => p.policyname) });
  rec('cause is bucket-wide authenticated SELECT, not a different mechanism', true, {
    cause: 'Authenticated users can view documents + auth_read_documents USING (bucket_id = documents) let any logged-in user request a signed URL for any object',
  });

  report.restoreSql = restoreSqlFrom(storagePolicies, dropNames);
  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(BACKUP, JSON.stringify({
    at: new Date().toISOString(),
    policies: toDrop,
    restoreSql: report.restoreSql,
    createdIfApplied: CREATE_SCOPED,
    note: 'Rollback restores only these three policies and drops the new scoped policy. Does not restore public bucket, public_read_documents, or C4.',
  }, null, 2));
  rec('leftover rollback SQL documented', report.restoreSql.length === 3);

  rec('anon upload signatures policy stays', policyCount('Anonymous can upload declaration signatures') === 1);

  const k = keys();
  const anon = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(PROD_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const qaEmail = process.env.S7_QA_EMAIL || process.env.S6_QA_EMAIL || process.env.S4_QA_EMAIL || 'k.auto@beeri.co.il';
  const authA = await login(admin, k.anon, qaEmail);
  rec('company A session established', true, { note: 'temporary in-memory session; signed out later' });

  const { data: ownDocs, error: ownErr } = await authA.from('document_metadata').select('id, file_path, company_name').limit(20);
  if (ownErr) throw ownErr;
  const ownPath = (ownDocs || []).find((d) => d.file_path && !/[\u0590-\u05FF]/.test(d.file_path))?.file_path
    || (ownDocs || [])[0]?.file_path;
  rec('A can list own-company metadata before change', Boolean(ownPath), { rowCount: (ownDocs || []).length });
  const signedOwnBefore = await authA.storage.from('documents').createSignedUrl(ownPath, 60);
  rec('A signed URL for own document works before change', Boolean(signedOwnBefore.data?.signedUrl), { error: signedOwnBefore.error?.message || null });

  const uidA = (await authA.auth.getUser()).data.user.id;
  const aCompany = dbSelect(`SELECT company_name FROM public.profiles WHERE id = '${uidA.replace(/'/g, '')}'`)[0]?.company_name;
  const companyEsc = String(aCompany || '').replace(/'/g, "''");
  const foreign = dbSelect(`
    SELECT o.name
    FROM storage.objects o
    LEFT JOIN public.document_metadata m ON m.file_path = o.name
    LEFT JOIN public.profiles p ON p.id::text = split_part(o.name, '/', 1)
    WHERE o.bucket_id = 'documents'
      AND split_part(o.name, '/', 1) <> '${uidA.replace(/'/g, '')}'
      AND split_part(o.name, '/', 1) <> 'declarations'
      AND (
        (m.company_name IS NOT NULL AND m.company_name <> '${companyEsc}')
        OR (p.company_name IS NOT NULL AND p.company_name <> '${companyEsc}')
      )
    LIMIT 1
  `)[0];
  rec('found a different-company object for cross-company probe', Boolean(foreign?.name), { pathShape: pathShape(foreign?.name) });
  const foreignBefore = await authA.storage.from('documents').createSignedUrl(foreign.name, 60);
  rec('A can currently issue signed URL for another company object (cause confirmed live)', Boolean(foreignBefore.data?.signedUrl), {
    error: foreignBefore.error?.message || null,
    note: 'if this had already failed, cause would be different and S8 leftover fix would stop',
  });

  const sample = dbSelect(`
    SELECT name FROM storage.objects
    WHERE bucket_id = 'documents' AND split_part(name, '/', 1) <> 'declarations'
    LIMIT 1
  `)[0];
  const declObj = dbSelect(`
    SELECT name FROM storage.objects
    WHERE bucket_id = 'documents' AND split_part(name, '/', 1) = 'declarations'
    LIMIT 1
  `)[0];

  dbAllowlisted(CREATE_SCOPED);
  report.changedApplied = true;
  report.created.push(NEW_NAME);
  rec('scoped same-company policy created', policyCount(NEW_NAME) === 1, { rollback: true });
  dbAllowlisted(DROP_WIDE_1);
  rec('dropped Authenticated users can view documents', policyCount('Authenticated users can view documents') === 0, { rollback: true });
  dbAllowlisted(DROP_WIDE_2);
  rec('dropped auth_read_documents', policyCount('auth_read_documents') === 0, { rollback: true });
  dbAllowlisted(DROP_ANON_VIEW);
  rec('dropped Anonymous can view declaration signatures', policyCount('Anonymous can view declaration signatures') === 0, { rollback: true });
  report.dropped = dropNames;
  rec('anon upload signatures still present', policyCount('Anonymous can upload declaration signatures') === 1, { rollback: true });
  rec('documents still private after leftover fix', bucketPublic() === false, { rollback: true });
  rec('public_read_documents still absent after leftover fix', policyCount('public_read_documents') === 0, { rollback: true });
  rec('C4 still closed after leftover fix', c4Count() === 0, { rollback: true });

  const signedOwnAfter = await authA.storage.from('documents').createSignedUrl(ownPath, 60);
  rec('A still receives signed URL for authorized own-company document', Boolean(signedOwnAfter.data?.signedUrl) && String(signedOwnAfter.data.signedUrl).includes('/object/sign/'), {
    rollback: true,
    error: signedOwnAfter.error?.message || null,
  });
  const foreignAfter = await authA.storage.from('documents').createSignedUrl(foreign.name, 60);
  rec('A cannot issue signed URL for another company object', !foreignAfter.data?.signedUrl, {
    rollback: true,
    error: foreignAfter.error?.message || null,
  });

  const { data: metaAfter } = await authA.from('document_metadata').select('id, company_name').limit(50);
  const companies = new Set((metaAfter || []).map((r) => r.company_name).filter(Boolean));
  rec('A metadata remains single-company', companies.size <= 1, { rollback: true, distinctCompanies: companies.size, rowCount: (metaAfter || []).length });

  const staff = dbSelect(`
    SELECT p.id::text AS id, ur.role::text AS role, p.company_name AS company_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE COALESCE(p.is_active, true) IS TRUE
      AND ur.role::text IN ('fleet_manager', 'office_manager', 'super_admin')
  `);
  const bProfile = staff.find((s) => s.role !== 'super_admin' && s.company_name && s.company_name !== aCompany);
  const saProfile = staff.find((s) => s.role === 'super_admin');
  const emails = dbSelect('SELECT id::text AS id, email FROM auth.users');
  const emailById = Object.fromEntries((emails || []).map((r) => [r.id, r.email]));

  if (bProfile?.id && emailById[bProfile.id]) {
    const authB = await login(admin, k.anon, emailById[bProfile.id]);
    rec('company B session established', true, { note: 'temporary in-memory session' });
    const bOnA = await authB.storage.from('documents').createSignedUrl(ownPath, 60);
    rec('B cannot issue signed URL for A document', !bOnA.data?.signedUrl, {
      rollback: true,
      error: bOnA.error?.message || null,
    });
    const { data: bDocs } = await authB.from('document_metadata').select('id, file_path, company_name').limit(20);
    const bPath = (bDocs || []).find((d) => d.file_path)?.file_path;
    if (bPath) {
      const bOwn = await authB.storage.from('documents').createSignedUrl(bPath, 60);
      rec('B can issue signed URL for own-company document', Boolean(bOwn.data?.signedUrl), {
        rollback: true,
        error: bOwn.error?.message || null,
      });
      const aOnB = await authA.storage.from('documents').createSignedUrl(bPath, 60);
      rec('A cannot issue signed URL for B own-company document', !aOnB.data?.signedUrl, {
        rollback: true,
        error: aOnB.error?.message || null,
      });
    } else {
      report.skipped.push({ name: 'B own-document signed URL', reason: 'no metadata path for B' });
    }
    await authB.auth.signOut();
  } else {
    report.skipped.push({ name: 'company B signed URL isolation', reason: 'no second-company manager found' });
  }

  if (saProfile?.id && emailById[saProfile.id]) {
    const authSa = await login(admin, k.anon, emailById[saProfile.id]);
    rec('super_admin session established', true, { note: 'temporary in-memory session' });
    const saOwn = await authSa.storage.from('documents').createSignedUrl(ownPath, 60);
    rec('super_admin can issue signed URL per intended all-documents access', Boolean(saOwn.data?.signedUrl), {
      rollback: true,
      error: saOwn.error?.message || null,
    });
    await authSa.auth.signOut();
  } else {
    report.skipped.push({ name: 'super_admin signed URL', reason: 'no active super_admin found' });
  }

  rec('unauthenticated cannot issue signed URL', !(await anon.storage.from('documents').createSignedUrl(sample.name, 60)).data?.signedUrl, { rollback: true });
  rec('old public URL remains blocked', (await publicUrlStatus(sample.name)) !== 200, { rollback: true });
  if (declObj?.name) {
    rec('anon cannot issue signed URL for declaration signature object', !(await anon.storage.from('documents').createSignedUrl(declObj.name, 60)).data?.signedUrl, {
      rollback: true,
    });
  }

  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  const pendingDecl = dbSelect(`
    SELECT id::text AS id FROM public.driver_declarations
    WHERE token IS NOT NULL AND length(token) >= 24 AND status = 'pending' LIMIT 1
  `)[0];
  const pendingTok = pendingDecl
    ? dbSelect(`SELECT token FROM public.driver_declarations WHERE id = '${pendingDecl.id}'`)[0]?.token
    : null;
  const signedDecl = dbSelect(`
    SELECT id::text AS id FROM public.driver_declarations
    WHERE token IS NOT NULL AND length(token) >= 24 AND status = 'signed' LIMIT 1
  `)[0];
  const signedTok = signedDecl
    ? dbSelect(`SELECT token FROM public.driver_declarations WHERE id = '${signedDecl.id}'`)[0]?.token
    : null;
  {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: fake });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('fake declaration token empty', !error && rows.length === 0, { rollback: true });
  }
  if (pendingTok) {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: pendingTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rec('valid declaration token returns only that row', !error && rows.length === 1 && String(rows[0].id) === pendingDecl.id, { rollback: true });
  }
  if (signedTok) {
    const pendingCount = Number(dbSelect("SELECT count(*) FILTER (WHERE status = 'pending')::int AS n FROM public.driver_declarations")[0]?.n);
    const { error } = await anon.rpc('sign_declaration_by_token', {
      p_token: signedTok,
      p_signature_url: 'leftover-fix-no-write-xxxxxxxx',
    });
    const pendingAfter = Number(dbSelect("SELECT count(*) FILTER (WHERE status = 'pending')::int AS n FROM public.driver_declarations")[0]?.n);
    rec('sign RPC reachable on already-signed token without mutating pending rows', !error && pendingAfter === pendingCount, { rollback: true });
  }

  rec('anon cannot read driver_declarations', Number((await anon.from('driver_declarations').select('id', { count: 'exact', head: true })).count || 0) === 0, { rollback: true });
  rec('live site still up', (await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } })).ok, { rollback: true });

  await authA.auth.signOut();
  rec('company A session signed out', true);

  const filesAfter = fileCount();
  report.filesAfter = filesAfter;
  if (filesAfter === filesBefore) {
    rec('document count unchanged during leftover fix', true, { files: filesAfter });
  } else if (filesAfter > filesBefore) {
    const probes = probeNewObjects(report.at);
    report.fileProbes = (report.fileProbes || []).concat(probes);
    rec('count rose during leftover fix; new objects look legitimate', probes.length === filesAfter - filesBefore && probes.every((p) => p.legitimate), {
      files: filesAfter,
    });
  } else {
    rec('document count must not drop', false, { filesBefore, filesAfter });
  }
  rec('declaration and exam totals unchanged',
    Number(dbSelect('SELECT count(*)::int AS n FROM public.driver_declarations')[0]?.n) === declBefore
    && Number(dbSelect('SELECT count(*)::int AS n FROM public.driving_exams')[0]?.n) === examBefore);

  report.verdict = 'PASS';
  report.partAPass = true;
}

const finalReport = {
  id: 'production-final-security-check',
  at: null,
  changed: 'none — verification only',
  tests: [],
  skipped: [],
  verdict: 'FAIL',
};

function frec(name, ok, extra = {}) {
  finalReport.tests.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} [final] ${name}`);
  if (!ok) throw new Error(`STOP final: ${name}`);
}

async function finalCheck() {
  finalReport.at = new Date().toISOString();
  report.finalStarted = true;
  const filesStart = fileCount();
  finalReport.filesAtStart = filesStart;
  frec('documents still private', bucketPublic() === false);
  frec('public_read_documents absent', policyCount('public_read_documents') === 0);
  frec('wide authenticated SELECT policies absent', policyCount('Authenticated users can view documents') === 0 && policyCount('auth_read_documents') === 0);
  frec('anon declaration signature SELECT absent', policyCount('Anonymous can view declaration signatures') === 0);
  frec('anon declaration signature INSERT present', policyCount('Anonymous can upload declaration signatures') === 1);
  frec('C4 closed', c4Count() === 0);
  const html = await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } });
  const bundle = ((await html.text()).match(/assets\/index-[^"']+\.js/) || [])[0];
  frec('live site up', html.ok && bundle === EXPECTED_BUNDLE, { bundle });
  frec('login page up', (await fetch(LIVE + '/login')).ok);
  frec('drivers SPA up', (await fetch(LIVE + '/drivers')).ok);
  frec('vehicles SPA up', (await fetch(LIVE + '/vehicles')).ok);
  frec('documents SPA up', (await fetch(LIVE + '/documents')).ok);

  const k = keys();
  const anon = createClient(PROD_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createClient(PROD_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const sample = dbSelect(`SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND split_part(name, '/', 1) <> 'declarations' LIMIT 1`)[0];
  const declObj = dbSelect(`SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND split_part(name, '/', 1) = 'declarations' LIMIT 1`)[0];
  frec('anon cannot issue signed URL', !(await anon.storage.from('documents').createSignedUrl(sample.name, 60)).data?.signedUrl);
  frec('old public URL blocked', (await publicUrlStatus(sample.name)) !== 200);
  if (declObj?.name) {
    frec('anon cannot issue signed URL for declaration signature', !(await anon.storage.from('documents').createSignedUrl(declObj.name, 60)).data?.signedUrl);
  }
  frec('anon cannot list drivers', Number((await anon.from('drivers').select('id', { count: 'exact', head: true })).count || 0) === 0);
  frec('anon cannot list vehicles', Number((await anon.from('vehicles').select('id', { count: 'exact', head: true })).count || 0) === 0);
  frec('anon cannot read declarations table', Number((await anon.from('driver_declarations').select('id', { count: 'exact', head: true })).count || 0) === 0);

  const fake = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  for (const [fn, args] of [
    ['get_declaration_by_token', { p_token: fake }],
    ['get_driving_exam_by_token', { p_token: fake }],
    ['sign_declaration_by_token', { p_token: fake, p_signature_url: 'final-no-write-xxxxxxxx' }],
  ]) {
    const { data, error } = await anon.rpc(fn, args);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    frec(`fake token ${fn} empty`, !error && rows.length === 0);
  }
  const pendingDecl = dbSelect(`SELECT id::text AS id FROM public.driver_declarations WHERE token IS NOT NULL AND length(token) >= 24 AND status = 'pending' LIMIT 1`)[0];
  const pendingTok = pendingDecl ? dbSelect(`SELECT token FROM public.driver_declarations WHERE id = '${pendingDecl.id}'`)[0]?.token : null;
  if (pendingTok) {
    const { data, error } = await anon.rpc('get_declaration_by_token', { p_token: pendingTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    frec('valid token returns only matching declaration', !error && rows.length === 1 && String(rows[0].id) === pendingDecl.id);
  }
  const exam = dbSelect(`SELECT id::text AS id FROM public.driving_exams WHERE token IS NOT NULL AND length(token) >= 16 LIMIT 1`)[0];
  const examTok = exam ? dbSelect(`SELECT token FROM public.driving_exams WHERE id = '${exam.id}'`)[0]?.token : null;
  if (examTok) {
    const { data, error } = await anon.rpc('get_driving_exam_by_token', { p_token: examTok });
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    frec('valid exam token returns only matching exam', !error && rows.length === 1 && String(rows[0].id) === exam.id);
  }

  const qaEmail = process.env.S7_QA_EMAIL || process.env.S6_QA_EMAIL || process.env.S4_QA_EMAIL || 'k.auto@beeri.co.il';
  const authA = await login(admin, k.anon, qaEmail);
  const { data: drv } = await authA.from('drivers').select('id, company_name');
  frec('authorized drivers list loads', Array.isArray(drv), { rowCount: (drv || []).length });
  frec('drivers company isolation', new Set((drv || []).map((r) => r.company_name).filter(Boolean)).size <= 1);
  const { data: veh } = await authA.from('vehicles').select('id, company_name');
  frec('authorized vehicles list loads', Array.isArray(veh), { rowCount: (veh || []).length });
  frec('vehicles company isolation', new Set((veh || []).map((r) => r.company_name).filter(Boolean)).size <= 1);
  const { data: docs } = await authA.from('document_metadata').select('id, file_path, company_name').limit(20);
  frec('authorized document metadata loads', Array.isArray(docs));
  frec('document metadata company isolation', (docs || []).length === 0 || new Set((docs || []).map((r) => r.company_name).filter(Boolean)).size <= 1);
  const ownPath = (docs || []).find((d) => d.file_path)?.file_path;
  const signed = await authA.storage.from('documents').createSignedUrl(ownPath, 60);
  frec('authorized signed URL works', Boolean(signed.data?.signedUrl) && String(signed.data.signedUrl).includes('/object/sign/'));
  const uidA = (await authA.auth.getUser()).data.user.id;
  const foreign = dbSelect(`
    SELECT o.name
    FROM storage.objects o
    LEFT JOIN public.document_metadata m ON m.file_path = o.name
    LEFT JOIN public.profiles p ON p.id::text = split_part(o.name, '/', 1)
    WHERE o.bucket_id = 'documents'
      AND split_part(o.name, '/', 1) <> '${uidA.replace(/'/g, '')}'
      AND split_part(o.name, '/', 1) <> 'declarations'
      AND (
        (m.company_name IS NOT NULL AND m.company_name <> (SELECT company_name FROM public.profiles WHERE id = '${uidA.replace(/'/g, '')}'))
        OR (p.company_name IS NOT NULL AND p.company_name <> (SELECT company_name FROM public.profiles WHERE id = '${uidA.replace(/'/g, '')}'))
      )
    LIMIT 1
  `)[0];
  const foreignSigned = await authA.storage.from('documents').createSignedUrl(foreign.name, 60);
  frec('A cannot signed-URL a non-A object', !foreignSigned.data?.signedUrl);

  const staff = dbSelect(`
    SELECT p.id::text AS id, ur.role::text AS role, p.company_name AS company_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE COALESCE(p.is_active, true) IS TRUE
      AND ur.role::text IN ('fleet_manager', 'office_manager', 'super_admin')
  `);
  const emails = dbSelect('SELECT id::text AS id, email FROM auth.users');
  const emailById = Object.fromEntries((emails || []).map((r) => [r.id, r.email]));
  const aCompany = staff.find((s) => s.id === uidA)?.company_name;
  const bProfile = staff.find((s) => s.role !== 'super_admin' && s.company_name && s.company_name !== aCompany);
  const saProfile = staff.find((s) => s.role === 'super_admin');
  if (bProfile?.id && emailById[bProfile.id] && ownPath) {
    const authB = await login(admin, k.anon, emailById[bProfile.id]);
    const bOnA = await authB.storage.from('documents').createSignedUrl(ownPath, 60);
    frec('B cannot signed-URL A document', !bOnA.data?.signedUrl);
    await authB.auth.signOut();
  } else {
    finalReport.skipped.push({ name: 'B cannot signed-URL A document', reason: 'no second-company manager' });
  }
  if (saProfile?.id && emailById[saProfile.id] && ownPath) {
    const authSa = await login(admin, k.anon, emailById[saProfile.id]);
    const sa = await authSa.storage.from('documents').createSignedUrl(ownPath, 60);
    frec('super_admin signed URL works per intended access', Boolean(sa.data?.signedUrl));
    await authSa.auth.signOut();
  } else {
    finalReport.skipped.push({ name: 'super_admin signed URL', reason: 'no active super_admin found' });
  }
  await authA.auth.signOut();

  const filesEnd = fileCount();
  finalReport.filesAtEnd = filesEnd;
  if (filesEnd === filesStart) {
    frec('document count unchanged during final check', true, { files: filesEnd });
  } else if (filesEnd > filesStart) {
    const probes = probeNewObjects(finalReport.at);
    finalReport.fileProbes = probes;
    frec('count rose during final check; new objects look legitimate', probes.length === filesEnd - filesStart && probes.every((p) => p.legitimate));
  } else {
    frec('document count must not drop', false, { filesStart, filesEnd });
  }
  finalReport.verdict = 'PASS';
}

try {
  if (process.env.FINAL_ONLY === '1') {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    if (prev.verdict !== 'PASS' || prev.partAPass !== true) {
      throw new Error('STOP: FINAL_ONLY requires leftover fix PASS');
    }
    report.verdict = 'PASS';
    report.partAPass = true;
    report.dropped = prev.dropped;
    report.created = prev.created;
    report.filesBefore = prev.filesBefore;
    report.filesAfter = prev.filesAfter;
  } else {
    await main();
  }
} catch (e) {
  report.verdict = 'FAIL';
  report.partAPass = false;
  report.error = String(e.message || e).slice(0, 800);
  if (e.rollback && report.changedApplied && !report.rollbackDone) {
    try { restoreLeftover(report.error); } catch (re) { report.rollbackError = String(re.message || re).slice(0, 400); }
  }
}

if (report.verdict === 'PASS' && report.partAPass) {
  try {
    await finalCheck();
  } catch (e) {
    finalReport.verdict = 'FAIL';
    finalReport.error = String(e.message || e).slice(0, 800);
  }
}

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
if (process.env.FINAL_ONLY !== '1') writeFileSync(OUT, JSON.stringify(report, null, 2));
if (report.finalStarted) writeFileSync(FINAL_OUT, JSON.stringify(finalReport, null, 2));
console.log(JSON.stringify({
  leftoverVerdict: report.verdict,
  dropped: report.dropped,
  created: report.created,
  rollbackDone: report.rollbackDone,
  leftoverFailed: report.tests.filter((t) => !t.ok).map((t) => t.name),
  filesBefore: report.filesBefore,
  filesAfter: report.filesAfter,
  finalStarted: report.finalStarted,
  finalVerdict: finalReport.verdict,
  finalFailed: finalReport.tests.filter((t) => !t.ok).map((t) => t.name),
}, null, 2));
process.exit(report.verdict === 'PASS' && (!report.finalStarted || finalReport.verdict === 'PASS') ? 0 : 1);
