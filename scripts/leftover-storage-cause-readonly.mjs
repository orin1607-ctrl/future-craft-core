/**
 * Read-only leftover cause check. No policy/storage/user changes.
 * node scripts/leftover-storage-cause-readonly.mjs
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';

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
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-cause-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

const bucket = dbSelect("SELECT public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
const files = dbSelect("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'documents'")[0];
const c4 = dbSelect(`
  SELECT count(*)::int AS n FROM pg_policies
  WHERE policyname IN (
    'Anonymous can view by token','Anonymous can update by token',
    'Anon view exam by token','Anon submit exam by token'
  )
`)[0];
const publicRead = dbSelect(`
  SELECT count(*)::int AS n FROM pg_policies
  WHERE schemaname = 'storage' AND policyname = 'public_read_documents'
`)[0];
const leftovers = dbSelect(`
  SELECT policyname, cmd, roles::text AS roles, qual
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN (
      'Authenticated users can view documents',
      'auth_read_documents',
      'Anonymous can view declaration signatures',
      'Anonymous can upload declaration signatures',
      'Users can view own uid folder',
      'Users can view own company documents'
    )
  ORDER BY policyname
`);
const shapes = dbSelect(`
  SELECT
    CASE
      WHEN split_part(name, '/', 1) = 'declarations' THEN 'declarations'
      WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'uuid'
      ELSE 'other'
    END AS shape,
    count(*)::int AS n
  FROM storage.objects
  WHERE bucket_id = 'documents'
  GROUP BY 1
  ORDER BY 1
`);
const sameCompanyNeed = dbSelect(`
  SELECT
    count(*)::int AS uuid_prefixed_metadata,
    count(*) FILTER (
      WHERE split_part(file_path, '/', 1) <> company_name
    )::int AS uuid_folder_not_company_name
  FROM public.document_metadata
  WHERE split_part(file_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
`);
const companiesWithMultipleUploaders = dbSelect(`
  SELECT count(*)::int AS n
  FROM (
    SELECT company_name
    FROM public.document_metadata
    WHERE split_part(file_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY company_name
    HAVING count(DISTINCT split_part(file_path, '/', 1)) > 1
  ) s
`);
const ownerMatch = dbSelect(`
  SELECT
    count(*)::int AS uuid_objects,
    count(*) FILTER (
      WHERE o.owner_id IS NOT NULL
        AND o.owner_id::text = split_part(o.name, '/', 1)
    )::int AS owner_equals_folder
  FROM storage.objects o
  WHERE o.bucket_id = 'documents'
    AND split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
`);

const out = {
  bucketPublic: bucket?.public,
  files: files?.n,
  c4: c4?.n,
  publicRead: publicRead?.n,
  leftovers,
  shapes,
  sameCompanyNeed,
  companiesWithMultipleUploaders,
  ownerMatch,
};
console.log(JSON.stringify(out, null, 2));
