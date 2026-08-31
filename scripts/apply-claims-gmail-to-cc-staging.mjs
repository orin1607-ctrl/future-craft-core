/**
 * Apply To/CC columns on Staging claims_gmail_imports. No Production. No import.
 * node scripts/apply-claims-gmail-to-cc-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260831220000_claims_gmail_to_cc.sql');
const OUT = join(ROOT, 'docs/audit-reports/claims-tomer-display-2026-08-31');
mkdirSync(OUT, { recursive: true });

const tmpWork = join(process.env.TEMP || tmpdir(), 'fcc-claims-to-cc');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { stdio: 'pipe' });
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF || linked !== STAGING_REF) throw new Error(`refused ${linked}`);

function q(sql) {
  const f = join(tmpWork, 'q.sql');
  writeFileSync(f, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${f}"`, {
    encoding: 'utf8',
    timeout: 120000,
  });
}

const before = q(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'imports_0004', (SELECT count(*) FROM public.claims_gmail_imports WHERE claim_id='DAL-2026-0004'),
  'docs_0004', (SELECT count(*) FROM public.claims_documents WHERE claim_id='DAL-2026-0004'),
  'other_imports', (SELECT count(*) FROM public.claims_gmail_imports WHERE claim_id<>'DAL-2026-0004'),
  'other_docs', (SELECT count(*) FROM public.claims_documents WHERE claim_id<>'DAL-2026-0004')
) AS j;
`);
q(readFileSync(SQL, 'utf8'));
q(`NOTIFY pgrst, 'reload schema';`);
const after = q(`
SELECT json_build_object(
  'to_col', exists(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='claims_gmail_imports' AND column_name='to_addr'),
  'cc_col', exists(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='claims_gmail_imports' AND column_name='cc_addr'),
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'imports_0004', (SELECT count(*) FROM public.claims_gmail_imports WHERE claim_id='DAL-2026-0004'),
  'docs_0004', (SELECT count(*) FROM public.claims_documents WHERE claim_id='DAL-2026-0004'),
  'other_imports', (SELECT count(*) FROM public.claims_gmail_imports WHERE claim_id<>'DAL-2026-0004'),
  'other_docs', (SELECT count(*) FROM public.claims_documents WHERE claim_id<>'DAL-2026-0004')
) AS j;
`);
writeFileSync(join(OUT, 'apply-to-cc.json'), JSON.stringify({ before, after, linked }, null, 2));
console.log(after);
