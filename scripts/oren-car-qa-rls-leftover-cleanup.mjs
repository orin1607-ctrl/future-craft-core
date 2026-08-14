/** Remove the isolated QA-RLS-* test rows left in Staging. Nothing else is touched. */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(`https://${STAGING_REF}.supabase.co`, arr.find((k) => k.name === 'service_role').api_key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const before = {};
const after = {};
for (const table of ['custom_alerts', 'vehicle_inspections', 'drivers', 'vehicles', 'company_settings']) {
  const { data } = await admin.from(table).select('id, company_name').like('company_name', 'QA-RLS-%');
  before[table] = (data || []).length;
  if (data?.length) await admin.from(table).delete().in('id', data.map((r) => r.id));
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).like('company_name', 'QA-RLS-%');
  after[table] = count || 0;
}
console.log(JSON.stringify({ before, after }, null, 2));
