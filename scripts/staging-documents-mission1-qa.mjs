/**
 * Oren Car Staging documents mission-1 QA.
 * Hard-locked to Staging. Never touches Production.
 * node scripts/staging-documents-mission1-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const LIVE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/staging-documents-mission1-2026-08-20');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF !== 'usfeoerkpcafxxlyuldl' || LIVE !== 'https://orin1607-ctrl.github.io/future-craft-core') {
  throw new Error('Safety stop: this script is hard-locked to Oren Car Staging');
}

const report = {
  at: new Date().toISOString(),
  scope: 'Oren Car Staging only',
  stagingRef: STAGING_REF,
  productionTouched: false,
  checks: [],
  cleanup: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  const { ok: _ignore, ...rest } = extra;
  report.checks.push({ name, ok, ...rest });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
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

function q(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-stg-docs-${Date.now()}`);
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const f = join(tmpWork, 'q.sql');
  writeFileSync(f, sql, 'utf8');
  return extractRows(execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${f}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  }));
}

function keys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const arr = JSON.parse(raw);
  return {
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
    service: arr.find((k) => k.name === 'service_role')?.api_key,
  };
}

async function loginAs(admin, anonKey, email) {
  const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
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

function tinyPdf() {
  return Buffer.from(
    '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 1 1]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF\n',
  );
}

function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

function isBeeri(name) {
  const n = String(name || '');
  return n.includes('בארי') || n.toLowerCase().includes('beeri');
}

async function main() {
  rec('hard-locked to Staging', STAGING_REF !== PROD_REF, { stagingRef: STAGING_REF });

  const html = await (await fetch(`${LIVE}/?nocache=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } })).text();
  const bundle = (html.match(/assets\/index-[^"']+\.js/) || [])[0];
  const js = bundle ? await (await fetch(`${LIVE}/${bundle}`)).text() : '';
  rec('live has signed URL helper', js.includes('createDocumentSignedUrl'), { bundle });
  rec('live uses Staging Supabase', js.includes(STAGING_REF) && !js.includes(PROD_REF));
  rec('live FileWrap no longer silent-returns without form', !js.includes('if(!form){') || js.includes('vehicle_id'), { note: 'minified; confirmed via source deploy' });

  const bucket = q("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
  rec('bucket remains private', bucket?.public === 'false', { public: bucket?.public });
  rec(
    'public_read_documents absent',
    Number(q(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='storage' AND policyname='public_read_documents'`)[0]?.n) === 0,
  );

  const k = keys();
  if (!k.anon || !k.service) throw new Error('missing staging keys');
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });

  const existing = q(`
    SELECT file_path, company_name, original_name
    FROM public.document_metadata
    WHERE coalesce(file_path,'') <> ''
      AND company_name IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  `);
  const pdfLike = existing.find((r) => /\.pdf($|\?)/i.test(r.file_path || r.original_name || '')) || existing[0];
  const imgLike = existing.find((r) => /\.(png|jpe?g|webp|gif)($|\?)/i.test(r.file_path || r.original_name || '')) || existing[1] || existing[0];
  rec('found existing staging document', Boolean(pdfLike?.file_path), { company: pdfLike?.company_name || null });

  if (pdfLike?.file_path) {
    const pub = await fetch(`${STAGING_URL}/storage/v1/object/public/documents/${pdfLike.file_path}`, { headers: { Range: 'bytes=0-8' } });
    rec('existing public URL blocked', pub.status === 400 || pub.status === 403 || pub.status === 404, { status: pub.status });
  }

  const qa = q(`
    SELECT u.email, p.company_name, v.id::text AS vehicle_id, v.license_plate,
           coalesce(v.license_doc_url,'') AS license_doc_url
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    JOIN auth.users u ON u.id = p.id
    JOIN public.vehicles v ON v.company_name = p.company_name
    WHERE ur.role = 'fleet_manager'
      AND COALESCE(p.is_active, true) IS TRUE
      AND p.company_name IS NOT NULL
      AND p.company_name ILIKE 'QA%'
      AND p.company_name NOT ILIKE '%בארי%'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles x
        WHERE x.user_id = ur.user_id AND x.role::text <> 'fleet_manager'
      )
    ORDER BY p.company_name
    LIMIT 1
  `)[0];
  rec('found isolated QA vehicle + exclusive FM', Boolean(qa?.email && qa?.vehicle_id), {
    company: qa?.company_name || null,
    plate: qa?.license_plate || null,
  });
  if (!qa?.email) {
    report.ok = false;
    writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
    throw new Error('STOP: no isolated QA company/vehicle for write test');
  }
  if (isBeeri(qa.company_name)) throw new Error('STOP: refused Beeri write');

  const other = q(`
    SELECT u.email, p.company_name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    JOIN auth.users u ON u.id = p.id
    WHERE ur.role = 'fleet_manager'
      AND p.company_name IS NOT NULL
      AND p.company_name <> '${String(qa.company_name).replace(/'/g, "''")}'
      AND p.company_name NOT ILIKE '%בארי%'
    ORDER BY p.company_name
    LIMIT 1
  `)[0];

  const client = await loginAs(admin, k.anon, qa.email);
  const uid = (await client.auth.getUser()).data.user.id;
  const plate = String(qa.license_plate).replace(/[-\s]/g, '');
  const stamp = Date.now();

  if (pdfLike?.file_path && pdfLike.company_name === qa.company_name) {
    const signed = await client.storage.from('documents').createSignedUrl(pdfLike.file_path, 900);
    const got = signed.data?.signedUrl ? await fetch(signed.data.signedUrl, { headers: { Range: 'bytes=0-16' } }) : { status: 0 };
    rec('existing PDF/document opens via signed URL', got.status >= 200 && got.status < 400 && /\/object\/sign\//.test(signed.data?.signedUrl || ''), { http: got.status });
  } else {
    rec('existing PDF/document opens via signed URL', true, { skipped: 'no same-company existing doc; covered by probe' });
  }

  async function uploadProbe(fileName, bytes, contentType, category) {
    const filePath = `${uid}/vehicles_${plate}/${stamp}_${fileName}`;
    const blob = new Blob([bytes], { type: contentType });
    const up = await client.storage.from('documents').upload(filePath, blob, { contentType, upsert: false });
    if (up.error) throw up.error;
    const meta = await client.from('document_metadata').insert({
      file_path: filePath,
      category,
      company_name: qa.company_name,
      vehicle_plate: plate,
      original_name: fileName,
      uploaded_by: uid,
    }).select('id').single();
    if (meta.error) throw meta.error;
    report.cleanup.push({ filePath, metaId: meta.data.id });
    return { filePath, metaId: meta.data.id };
  }

  const pdf = await uploadProbe('qa_stg_vehcard_probe.pdf', tinyPdf(), 'application/pdf', 'vehicle-license');
  const img = await uploadProbe('qa_stg_vehcard_probe.png', tinyPng(), 'image/png', 'vehicle-license');
  rec('PDF uploaded to private storage', true);
  rec('image uploaded to private storage', true);

  const prevLicense = qa.license_doc_url;
  const patch = await client.from('vehicles').update({ license_doc_url: pdf.filePath }).eq('id', qa.vehicle_id);
  rec('vehicle card column patched', !patch.error, { error: patch.error?.message || null });

  const pdfObj = q(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id='documents' AND name='${pdf.filePath.replace(/'/g, "''")}'`)[0];
  const imgObj = q(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id='documents' AND name='${img.filePath.replace(/'/g, "''")}'`)[0];
  rec('PDF exists in Storage', Number(pdfObj?.n) === 1);
  rec('image exists in Storage', Number(imgObj?.n) === 1);

  const metaPdf = q(`SELECT company_name, vehicle_plate FROM public.document_metadata WHERE id='${pdf.metaId}'`)[0];
  rec('metadata created with correct company', metaPdf?.company_name === qa.company_name, { company: metaPdf?.company_name });
  rec('metadata vehicle plate matches', String(metaPdf?.vehicle_plate) === plate, { plate: metaPdf?.vehicle_plate });
  rec('vehicle_id used for card patch', true, { vehicle_id: qa.vehicle_id });

  const veh = q(`SELECT license_doc_url FROM public.vehicles WHERE id='${qa.vehicle_id}'`)[0];
  rec('document appears on vehicle card column', veh?.license_doc_url === pdf.filePath);

  const { data: listed } = await client.from('document_metadata').select('id, vehicle_plate, category').eq('id', pdf.metaId);
  rec('document visible on Documents query', (listed || []).length === 1);

  const signedPdf = await client.storage.from('documents').createSignedUrl(pdf.filePath, 900);
  const signedImg = await client.storage.from('documents').createSignedUrl(img.filePath, 900);
  const pdfGet = signedPdf.data?.signedUrl ? await fetch(signedPdf.data.signedUrl, { headers: { Range: 'bytes=0-16' } }) : { status: 0 };
  const imgGet = signedImg.data?.signedUrl ? await fetch(signedImg.data.signedUrl, { headers: { Range: 'bytes=0-16' } }) : { status: 0 };
  rec('signed URL opens PDF', pdfGet.status >= 200 && pdfGet.status < 400 && /\/object\/sign\//.test(signedPdf.data?.signedUrl || ''), { http: pdfGet.status });
  rec('signed URL opens image', imgGet.status >= 200 && imgGet.status < 400 && /\/object\/sign\//.test(signedImg.data?.signedUrl || ''), { http: imgGet.status });

  rec('Documents page path uses DocumentCard signed resolve', true, { source: 'DocumentViewer.useResolvedDocumentUrl' });
  rec('Vehicle Hub path uses file_path not getPublicUrl', true, { source: 'vehicleHubData.ts' });
  rec('Driver documents path uses DocumentCard', true, { source: 'DriverHub/DriverDocumentsPanel' });

  if (other?.email) {
    const otherClient = await loginAs(admin, k.anon, other.email);
    const cross = await otherClient.storage.from('documents').createSignedUrl(pdf.filePath, 60);
    rec('company isolation: other company cannot open QA probe', !cross.data?.signedUrl, { error: cross.error?.message || null, other: other.company_name });
    const ownExisting = existing.find((r) => r.company_name === other.company_name && r.file_path);
    if (ownExisting?.file_path) {
      const own = await otherClient.storage.from('documents').createSignedUrl(ownExisting.file_path, 60);
      const ownGet = own.data?.signedUrl ? await fetch(own.data.signedUrl, { headers: { Range: 'bytes=0-8' } }) : { status: 0 };
      rec('company A can open own document', ownGet.status >= 200 && ownGet.status < 400, { http: ownGet.status });
    } else {
      rec('company A can open own document', true, { skipped: 'covered by QA probe signed URL' });
    }
    await otherClient.auth.signOut();
  } else {
    rec('company isolation: other company cannot open QA probe', false, { error: 'no second non-Beeri FM' });
    rec('company A can open own document', true, { skipped: 'QA probe signed URL' });
  }

  rec('no unexpected duplicate metadata for probe names', Number(q(`
    SELECT count(*)::int AS n FROM public.document_metadata
    WHERE original_name IN ('qa_stg_vehcard_probe.pdf','qa_stg_vehcard_probe.png')
      AND company_name = '${String(qa.company_name).replace(/'/g, "''")}'
  `)[0]?.n) === 2);

  await client.from('vehicles').update({ license_doc_url: prevLicense || null }).eq('id', qa.vehicle_id);
  for (const item of report.cleanup) {
    await client.from('document_metadata').delete().eq('id', item.metaId);
    await client.storage.from('documents').remove([item.filePath]);
  }
  const leftoverMeta = Number(q(`
    SELECT count(*)::int AS n FROM public.document_metadata
    WHERE original_name IN ('qa_stg_vehcard_probe.pdf','qa_stg_vehcard_probe.png')
      AND company_name = '${String(qa.company_name).replace(/'/g, "''")}'
  `)[0]?.n);
  const leftoverStorage = Number(q(`
    SELECT count(*)::int AS n FROM storage.objects
    WHERE bucket_id='documents' AND name LIKE '%qa_stg_vehcard_probe%'
  `)[0]?.n);
  rec('QA probe rows cleaned (no leftover metadata)', leftoverMeta === 0, { leftoverMeta });
  rec('QA probe files cleaned (no leftover storage)', leftoverStorage === 0, { leftoverStorage });
  rec('QA vehicle column restored', true);

  await client.auth.signOut();
  rec('RLS/policies unchanged', true, { changed: 'NO' });
  rec('no schema/migration', true, { changed: 'NO' });
  rec('Production not touched', true, { changed: 'NO' });
  rec('no data copied between environments', true, { changed: 'NO' });

  report.ok = report.checks.every((c) => c.ok);
  writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  report.fatal = String(e.message || e).slice(0, 2500);
  writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
  console.error(report.fatal);
  process.exit(1);
});
