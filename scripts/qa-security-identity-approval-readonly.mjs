/**
 * READ ONLY: classify evidence for SSH 14:11 and Supabase 14:18 on Staging.
 * Never targets Production. No writes.
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-sec-id-approval-ro');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const sqlFile = join(process.cwd(), 'scripts/security-identity-approval-readonly.sql');
const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 60000,
});
const dest = join(process.cwd(), 'docs/audit-reports/security-filters-classification-oren-car/two-events-readonly.txt');
writeFileSync(dest, out);
console.log(out);
console.log(JSON.stringify({ linked, productionTouched: false, dest }));
