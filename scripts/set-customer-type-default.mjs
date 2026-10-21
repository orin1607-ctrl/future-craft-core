// scripts/set-customer-type-default.mjs
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const tmpWork = join(process.env.TEMP || 'C:\\Temp', `sb-fix-cust-type-${Date.now()}`);
mkdirSync(tmpWork, { recursive: true });

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});

const sql = `ALTER TABLE public.garage_customers ALTER COLUMN customer_type SET DEFAULT 'private';`;
writeFileSync(join(tmpWork, 'fix.sql'), sql, 'utf8');

const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${join(tmpWork, 'fix.sql')}"`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
console.log(out);
console.log('✅ garage_customers.customer_type set default to private!');
