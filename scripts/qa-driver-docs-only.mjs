/**
 * QA — Driver document upload (Storage + document_metadata) on Staging only.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const runId = Date.now();
const COMPANY = `QA-DRV-DOC-${runId}`;
const PASS = `Qa!${runId}`;
const PLATE = `QA${String(runId).slice(-5)}`;
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'driver-docs-qa');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  company: COMPANY,
  plate: PLATE,
  formats: {},
  metadataSaved: false,
  storageOk: false,
  isolationOk: false,
  refreshVisible: false,
  passed: false,
  errors: [],
};

function loadKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

function tinyPdf() {
  return Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
}
function tinyPng() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}
function tinyJpg() {
  return Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=', 'base64');
}

async function createDriverSession(admin, anonKey) {
  const email = `qa-drv-doc-${runId}@staging.local`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) throw error;
  const id = created.user.id;
  await admin.from('profiles').upsert({
    id, full_name: 'QA Driver Doc', company_name: COMPANY, is_active: true,
    approval_status: 'approved', two_factor_approved: true,
  });
  await admin.from('user_roles').insert({ user_id: id, role: 'driver' });
  await admin.from('drivers').insert({
    full_name: 'QA Driver Doc', email, company_name: COMPANY, status: 'active',
  });
  await admin.from('vehicles').insert({
    license_plate: PLATE,
    manufacturer: 'QA',
    model: 'DOC',
    company_name: COMPANY,
    status: 'active',
    approval_status: 'approved',
    assigned_driver_id: id,
  });
  const anon = createClient(STAGING_URL, anonKey);
  const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password: PASS });
  if (authErr) throw authErr;
  const client = createClient(STAGING_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
  });
  return { id, email, client };
}

async function uploadAndMeta(client, userId, ext) {
  const buf = ext === 'pdf' ? tinyPdf() : ext === 'png' ? tinyPng() : tinyJpg();
  const fileName = `license-${runId}.${ext}`;
  const path = `${userId}/driver-license/${fileName}`;
  const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
  const up = await client.storage.from('documents').upload(path, buf, { contentType, upsert: false });
  if (up.error) return { ext, ok: false, step: 'storage', error: up.error.message };

  const meta = await client.from('document_metadata').insert({
    file_path: path,
    category: 'driver-license',
    company_name: COMPANY,
    driver_name: 'QA Driver Doc',
    original_name: fileName,
    uploaded_by: userId,
  }).select('id').single();

  if (meta.error) {
    await client.storage.from('documents').remove([path]);
    return { ext, ok: false, step: 'metadata', error: meta.error.message };
  }

  const pub = client.storage.from('documents').getPublicUrl(path);
  const dl = await fetch(pub.data.publicUrl);
  const { data: listed } = await client.from('document_metadata')
    .select('id')
    .eq('category', 'driver-license')
    .eq('driver_name', 'QA Driver Doc');

  return {
    ext,
    ok: dl.ok && !!meta.data?.id && (listed?.length ?? 0) >= 1,
    storage: !up.error,
    metadata: !meta.error,
    visibleAfterInsert: (listed?.length ?? 0) >= 1,
    metaId: meta.data?.id,
    path,
  };
}

async function main() {
  const { service, anon } = loadKeys();
  const admin = createClient(STAGING_URL, service);
  const { id, client } = await createDriverSession(admin, anon);

  const paths = [];
  const metaIds = [];

  for (const ext of ['pdf', 'jpg', 'png']) {
    const r = await uploadAndMeta(client, id, ext);
    report.formats[ext] = r;
    if (r.path) paths.push(r.path);
    if (r.metaId) metaIds.push(r.metaId);
  }

  report.metadataSaved = Object.values(report.formats).every((r) => r.metadata);
  report.storageOk = Object.values(report.formats).every((r) => r.storage);
  report.refreshVisible = Object.values(report.formats).every((r) => r.visibleAfterInsert);

  const fmEmail = `qa-fm-doc-${runId}@staging.local`;
  const { data: fmCreated } = await admin.auth.admin.createUser({ email: fmEmail, password: PASS, email_confirm: true });
  const fmId = fmCreated.user.id;
  await admin.from('profiles').upsert({
    id: fmId, full_name: 'QA FM Doc', company_name: COMPANY, is_active: true,
    approval_status: 'approved', two_factor_approved: true,
  });
  await admin.from('user_roles').insert({ user_id: fmId, role: 'fleet_manager' });

  await admin.from('document_metadata').insert({
    file_path: `${fmId}/other/other.pdf`,
    category: 'driver-license',
    company_name: COMPANY,
    driver_name: 'Other Driver QA',
    original_name: 'other.pdf',
    uploaded_by: fmId,
  });

  const { data: visible } = await client.from('document_metadata').select('driver_name');
  const names = (visible || []).map((r) => r.driver_name);
  report.isolationOk = names.every((n) => n === 'QA Driver Doc') && !names.includes('Other Driver QA');

  report.passed =
    report.metadataSaved &&
    report.storageOk &&
    report.refreshVisible &&
    report.isolationOk &&
    Object.values(report.formats).every((r) => r.ok);

  await admin.storage.from('documents').remove(paths);
  if (metaIds.length) await admin.from('document_metadata').delete().in('id', metaIds);
  await admin.from('document_metadata').delete().eq('company_name', COMPANY);
  await admin.from('vehicles').delete().eq('license_plate', PLATE);
  await admin.from('drivers').delete().eq('email', `qa-drv-doc-${runId}@staging.local`);
  await admin.auth.admin.deleteUser(fmId);
  await admin.auth.admin.deleteUser(id);

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}

main().catch((e) => {
  report.errors.push(e.message);
  console.error(e);
  process.exit(1);
});
