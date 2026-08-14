/** Confirm the isolated QA companies used for the alert work left nothing behind. */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const url = `https://${STAGING_REF}.supabase.co`;
const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(url, arr.find((k) => k.name === 'service_role').api_key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const patterns = ['QA-IMP-%', 'QA-RLS-%', 'QA-AD-A-%', 'QA-AD-B-%'];
const leftovers = {};
for (const p of patterns) {
  for (const table of ['custom_alerts', 'vehicles', 'drivers', 'vehicle_inspections', 'company_settings']) {
    const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).like('company_name', p);
    if (count) leftovers[`${table} ${p}`] = count;
  }
}

const { count: profiles } = await admin
  .from('profiles')
  .select('id', { count: 'exact', head: true })
  .like('full_name', 'QA IMP%');
if (profiles) leftovers['profiles QA IMP%'] = profiles;

const out = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-impersonation-qa');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'cleanup-verify.json'), JSON.stringify({ at: new Date().toISOString(), leftovers, clean: Object.keys(leftovers).length === 0 }, null, 2), 'utf8');
console.log(JSON.stringify({ leftovers, clean: Object.keys(leftovers).length === 0 }, null, 2));
