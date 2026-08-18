/**
 * P0-A: private documents bucket + scoped storage policies.
 * STAGING ONLY — usfeoerkpcafxxlyuldl
 * Abort if Production ref is present.
 *
 * node scripts/apply-p0-storage-private-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const MIGRATION = join(ROOT, 'supabase/migrations/20260818220000_p0_storage_private_staging.sql');
const OUT_DIR = join(ROOT, 'public/project-001');
const OUT = join(OUT_DIR, 'security-remediation-staging.json');

function abortIfProduction(haystack, label) {
  const text = String(haystack || '');
  if (text.includes(PROD_REF) || text.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production. No Production changes.`);
  }
}

function loadJson() {
  if (!existsSync(OUT)) {
    return {
      environment: 'staging',
      stagingRef: STAGING_REF,
      productionTouched: false,
      findings: [],
    };
  }
  return JSON.parse(readFileSync(OUT, 'utf8'));
}

function getKeys() {
  abortIfProduction(process.env.DATABASE_URL, 'DATABASE_URL');
  abortIfProduction(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  abortIfProduction(raw, 'api-keys output');
  const keys = JSON.parse(raw);
  return {
    service:
      keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'service_role')?.api_key,
    anon:
      keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'anon')?.api_key,
  };
}

function dbQuery(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-p0-storage-staging');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  abortIfProduction(out, 'db query output');
  return out;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(MIGRATION)) throw new Error('migration missing');
  abortIfProduction(readFileSync(MIGRATION, 'utf8'), 'migration file');

  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const policiesBefore = dbQuery(`
    SELECT policyname, roles::text, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname;
  `);

  const applyOut = dbQuery(readFileSync(MIGRATION, 'utf8'));

  const { data: bucket, error: bucketErr } = await admin.storage.getBucket('documents');
  const policiesAfter = dbQuery(`
    SELECT policyname, roles::text, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname;
  `);

  const report = loadJson();
  report.updatedAt = new Date().toISOString();
  report.productionTouched = false;
  const finding = {
    id: 'C1',
    code: 'P0-A',
    title: 'Document Storage Exposure',
    rootCause: 'documents bucket was public with bucket-wide SELECT policies and getPublicUrl consumers.',
    changeMade:
      'Bucket set private; wide SELECT/INSERT policies dropped; scoped uid/company policies; app uses short-lived signed URLs.',
    files: [
      'supabase/migrations/20260818220000_p0_storage_private_staging.sql',
      'src/lib/documentUrl.ts',
      'src/components/documents/DocumentViewer.tsx',
      'src/lib/uploadDocument.ts',
    ],
    apply: {
      ok: !bucketErr && bucket?.public === false,
      bucketPublic: bucket?.public ?? null,
      bucketError: bucketErr?.message || null,
      applyOutput: String(applyOut).slice(0, 500),
    },
    policiesBefore: String(policiesBefore).slice(0, 8000),
    policiesAfter: String(policiesAfter).slice(0, 8000),
    tests: [],
  };
  report.findings = (report.findings || []).filter((f) => f.id !== 'C1');
  report.findings.push(finding);
  writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ apply: finding.apply, bucketPublic: bucket?.public }, null, 2));
  if (bucket?.public !== false) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
