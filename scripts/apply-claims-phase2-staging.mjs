/**
 * Apply claims phase-2 schema to Oren Car Staging ONLY.
 * node scripts/apply-claims-phase2-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260831150000_claims_phase2_assignment_docs.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-module-phase2-staging-2026-08-31');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('phase2 sql missing');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-phase2');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}
function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  documentRequestsTouched: false,
  gmailTouched: false,
  whatsappTouched: false,
  backup: null,
  apply: null,
  verify: null,
};

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

  const backupOut = dbQueryText(`
    SELECT json_build_object(
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'profiles', (SELECT count(*) FROM public.profiles),
      'claims_records', (SELECT count(*) FROM public.claims_records),
      'document_requests', (SELECT count(*) FROM public.document_requests),
      'app_role', (SELECT coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
        FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role')
    );
  `);
  writeFileSync(join(OUT, 'schema-backup.json'), backupOut, 'utf8');
  report.backup = { ok: true, linked };

  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 2500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'assigned_col', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='claims_records' AND column_name='assigned_to'),
      'doc_tables', (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename IN ('claims_doc_requests','claims_upload_links','claims_documents')),
      'bucket_public', (SELECT public FROM storage.buckets WHERE id='claims-docs'),
      'fn_assign', (SELECT count(*) FROM pg_proc WHERE proname='claims_assign'),
      'vehicles', (SELECT count(*) FROM public.vehicles),
      'accidents', (SELECT count(*) FROM public.accidents),
      'document_requests', (SELECT count(*) FROM public.document_requests)
    );
  `);
  writeFileSync(join(OUT, 'verify.json'), verifyOut, 'utf8');
  report.verify = { ok: true, output: String(verifyOut).slice(0, 3000) };
} catch (e) {
  const failed = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 2000) || null };
  if (!report.backup) report.backup = failed;
  else if (!report.apply) report.apply = failed;
  else report.verify = failed;
}

writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.apply?.ok || !report.verify?.ok) process.exit(1);
