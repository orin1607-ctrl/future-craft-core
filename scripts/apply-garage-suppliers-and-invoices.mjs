// scripts/apply-garage-suppliers-and-invoices.mjs
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL_PATH = join(ROOT, 'supabase/migrations/20261021235000_garage_suppliers_and_invoices_staging.sql');

if (!existsSync(SQL_PATH)) throw new Error('SQL migration missing');

const tmpWork = join(process.env.TEMP || 'C:\\Temp', `sb-staging-garage-inv-${Date.now()}`);
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

try {
  console.log('Linking to STAGING ref:', STAGING_REF);
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('Refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`Unexpected ref: ${linked}`);
  console.log('✅ Safely linked to STAGING only.');

  console.log('Executing migration query on STAGING...');
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${SQL_PATH}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
  console.log('Query result:', out);

  // Verify tables exist
  const verifySql = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('garage_suppliers', 'garage_invoices');
  `;
  const vTmp = join(tmpWork, 'v.sql');
  writeFileSync(vTmp, verifySql, 'utf8');
  const vOut = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${vTmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log('Verification tables in STAGING:', vOut);
  console.log('✅ Migration applied and verified successfully!');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
