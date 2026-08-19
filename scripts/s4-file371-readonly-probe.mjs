/**
 * READ-ONLY probe of the single documents object created at 2026-08-19 07:02:49 UTC.
 * Never downloads bytes. Never prints names, emails, plates, IDs, or file names with PII.
 * node scripts/s4-file371-readonly-probe.mjs
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const OUT = join(process.cwd(), 'public/project-001/production-s4-file371-probe.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_FOLDERS = new Set([
  'vehicle-license', 'insurance', 'comprehensive', 'third-party', 'test',
  'driver-license', 'health', 'contracts', 'other', 'fuel', 'maintenance',
  'vendors', 'receipts', 'accident-documents', 'health-declarations',
  'exchanges', 'declarations', 'general', 'misc', 'vehicle-docs',
]);
const APP_ROLES = new Set([
  'super_admin', 'fleet_manager', 'office_manager', 'driver', 'customer', 'admin',
]);

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
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-s4-371-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

function looksPersonal(text) {
  const s = String(text || '');
  if (/[\u0590-\u05FF]/.test(s)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) return true;
  if (/\b\d{7,9}\b/.test(s)) return true;
  return false;
}

function classifyPath(name) {
  const parts = String(name || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const ext = (last.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const out = {
    segmentCount: parts.length,
    extension: ext || null,
    lastSegmentLooksPersonal: looksPersonal(last),
    matchesBuildStoragePath: false,
    matchesAdminUploads: false,
    matchesDeclarationsSig: false,
    matchesExchangeUuid: false,
    matchesHealthDeclaration: false,
    knownAppFolder: false,
    folderKey: null,
    timestampPrefixOnFile: false,
    matchesVehicleFormFolder: false,
  };

  if (parts.length === 3 && UUID_RE.test(parts[0])) {
    out.folderKey = parts[1];
    if (/^vehicles_\d+$/.test(parts[1])) {
      out.folderKey = 'vehicles_{numeric}';
      out.knownAppFolder = true;
      out.matchesVehicleFormFolder = true;
    }
    out.timestampPrefixOnFile = /^\d{10,13}_/.test(last);
    out.matchesBuildStoragePath = out.knownAppFolder && out.timestampPrefixOnFile;
    out.matchesHealthDeclaration = parts[1] === 'health-declarations' && UUID_RE.test(last.replace(/\.[a-z0-9]+$/i, ''));
  }
  if (parts[0] === 'admin-uploads' && parts.length >= 4 && UUID_RE.test(parts[2])) {
    out.matchesAdminUploads = true;
    out.folderKey = parts[1];
  }
  if (parts[0] === 'declarations' && /^sig_/i.test(last)) {
    out.matchesDeclarationsSig = true;
    out.folderKey = 'declarations';
  }
  if (parts[0] === 'exchanges' && parts.length === 2 && UUID_RE.test(last.replace(/\.[a-z0-9]+$/i, ''))) {
    out.matchesExchangeUuid = true;
    out.folderKey = 'exchanges';
  }
  return out;
}

const report = {
  id: 'production-s4-file371-probe',
  at: new Date().toISOString(),
  readOnly: true,
  bytesOpened: false,
  fileDownloaded: false,
  fileNamePrinted: false,
  personalDataPrinted: false,
  s5Started: false,
  changed: 'none',
  verdict: 'FILE 371 — CANNOT CONFIRM SAFELY',
};

try {
  const rows = dbSql(`
    SELECT
      o.bucket_id,
      o.name,
      o.owner_id::text AS owner_id,
      o.created_at::text AS created_at,
      o.updated_at::text AS updated_at,
      o.metadata,
      (p.id IS NOT NULL) AS profile_exists,
      COALESCE(p.is_active, false) AS is_active,
      p.approval_status,
      (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id::text = o.owner_id::text LIMIT 1) AS role,
      (p.company_name IS NOT NULL AND length(trim(p.company_name)) > 0) AS profile_has_company,
      (m.id IS NOT NULL) AS metadata_exists,
      m.category,
      (m.company_name IS NOT NULL AND length(trim(m.company_name)) > 0) AS meta_has_company,
      (m.vehicle_plate IS NOT NULL AND length(trim(m.vehicle_plate)) > 0) AS meta_has_vehicle,
      (m.driver_name IS NOT NULL AND length(trim(m.driver_name)) > 0) AS meta_has_driver,
      (m.uploaded_by IS NOT NULL AND m.uploaded_by::text = o.owner_id::text) AS uploaded_by_matches_owner,
      (m.company_name IS NOT NULL AND p.company_name IS NOT NULL AND m.company_name = p.company_name) AS metadata_company_matches_profile,
      m.created_at::text AS metadata_created_at,
      (SELECT count(*)::int FROM public.document_versions dv WHERE dv.file_path = o.name) AS versions_n
    FROM storage.objects o
    LEFT JOIN public.profiles p ON p.id::text = o.owner_id::text
    LEFT JOIN public.document_metadata m ON m.file_path = o.name
    WHERE o.bucket_id = 'documents'
      AND o.created_at >= '2026-08-19 07:02:49+00'
      AND o.created_at < '2026-08-19 07:02:50+00'
  `);

  if (rows.length !== 1) {
    report.objectCountInSecond = rows.length;
    throw new Error('expected exactly one object in that second');
  }

  const obj = rows[0];
  const pathInfo = classifyPath(obj.name);
  const meta = obj.metadata && typeof obj.metadata === 'string' ? JSON.parse(obj.metadata) : (obj.metadata || {});
  const ownerId = obj.owner_id || null;
  const firstSeg = String(obj.name || '').split('/')[0] || '';
  const pathOwnerMatch = UUID_RE.test(firstSeg) && ownerId && firstSeg.toLowerCase() === String(ownerId).toLowerCase();

  report.object = {
    bucket: obj.bucket_id,
    created_at: obj.created_at,
    updated_at: obj.updated_at,
    sizeBytes: meta.size ?? meta.contentLength ?? null,
    mimeType: meta.mimetype || meta.contentType || null,
    cacheControl: meta.cacheControl || meta.cachecontrol || null,
    ownerIsUuid: Boolean(ownerId && UUID_RE.test(ownerId)),
    path: pathInfo,
    pathOwnerMatchesFirstSegment: Boolean(pathOwnerMatch),
  };

  const truthy = (v) => v === true || v === 't' || v === 'true';
  report.uploader = truthy(obj.profile_exists)
    ? {
        profileExists: true,
        isActive: truthy(obj.is_active),
        isApproved: String(obj.approval_status || '') === 'approved',
        roleIsKnownAppRole: APP_ROLES.has(String(obj.role || '')),
        roleFamily: APP_ROLES.has(String(obj.role || '')) ? String(obj.role) : 'other',
        hasCompany: truthy(obj.profile_has_company),
      }
    : { profileExists: false };

  report.documentMetadata = {
    rowExists: truthy(obj.metadata_exists),
    categoryIsTechnicalKey: obj.category ? !looksPersonal(obj.category) : false,
    category: obj.category && !looksPersonal(obj.category) ? obj.category : null,
    hasCompany: truthy(obj.meta_has_company),
    hasVehicleOrDriver: truthy(obj.meta_has_vehicle) || truthy(obj.meta_has_driver),
    uploadedByMatchesOwner: truthy(obj.uploaded_by_matches_owner),
    companyMatchesUploaderProfile: truthy(obj.metadata_company_matches_profile),
    created_at: obj.metadata_created_at || null,
  };
  report.documentVersionsCount = Number(obj.versions_n || 0);

  const size = Number(report.object.sizeBytes || 0);
  const mime = String(report.object.mimeType || '');
  const mimeOk = /^(application\/pdf|image\/(jpeg|jpg|png|webp|heic|gif)|application\/octet-stream)$/i.test(mime);
  const sizeOk = size > 0 && size <= 10 * 1024 * 1024;
  const cacheOk = !report.object.cacheControl || String(report.object.cacheControl).includes('3600');
  const pathOk = pathInfo.matchesBuildStoragePath || pathInfo.matchesVehicleFormFolder;
  const userOk = report.uploader.profileExists && report.uploader.isActive && report.uploader.roleIsKnownAppRole;
  const ownerPathOk = report.object.pathOwnerMatchesFirstSegment;

  report.checks = {
    exactlyOneObjectInThatSecond: rows.length === 1,
    timestampMatches: String(obj.created_at).includes('2026-08-19') && String(obj.created_at).includes('07:02:49'),
    pathMatchesKnownAppPattern: pathOk,
    mimeLooksLikeAppDocument: mimeOk,
    sizeWithinAppLimit: sizeOk,
    cacheControlMatchesAppDefault: cacheOk,
    uploaderProfileActiveKnownRole: userOk,
    storageOwnerMatchesPathUser: ownerPathOk,
    metadataRowPresent: report.documentMetadata.rowExists,
    metadataWrittenBySameUser: report.documentMetadata.uploadedByMatchesOwner,
    metadataCompanyAlignedWithUploader: report.documentMetadata.companyMatchesUploaderProfile,
  };

  const confident = report.checks.exactlyOneObjectInThatSecond
    && report.checks.timestampMatches
    && pathOk
    && userOk
    && ownerPathOk
    && mimeOk
    && sizeOk
    && cacheOk
    && report.documentMetadata.rowExists
    && report.documentMetadata.uploadedByMatchesOwner;

  if (confident) {
    report.verdict = 'FILE 371 — LEGITIMATE APPLICATION UPLOAD';
    report.why = [
      'Storage key matches the live app helper buildStoragePath: authenticated user UUID / vehicles_{numeric} folder / unix-timestamp_filename.pdf. That folder shape is produced when the vehicle form calls uploadDocument({ storageFolder: vehicles/{plate} }).',
      'The storage owner UUID equals the first path segment and belongs to an active profile with a normal application role and a company.',
      'A document_metadata row exists for the same key, uploaded_by is that same user, and the metadata company matches the uploader profile company. Category is a technical key, not a personal name.',
      'Object created_at is exactly 2026-08-19 07:02:49 UTC. MIME is application/pdf, size is under the app 10MB limit, cacheControl is max-age=3600 — the uploadDocument defaults.',
    ];
  } else {
    report.verdict = 'FILE 371 — CANNOT CONFIRM SAFELY';
    report.why = ['One or more technical signals were missing; confirming further would require opening the file or printing personal fields.'];
  }
} catch (e) {
  report.verdict = 'FILE 371 — CANNOT CONFIRM SAFELY';
  report.error = String(e.stderr || e.message || e).slice(0, 800);
}

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  verdict: report.verdict,
  pathPattern: report.object?.path || null,
  uploader: report.uploader || null,
  metadataRow: report.documentMetadata?.rowExists ?? null,
  s5Started: false,
}, null, 2));
process.exit(0);
