/**
 * Reopen the two real 0014 tasks that buggy QA marked done. Staging only.
 * Does not delete anything. Does not touch QA-* tasks.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const keepOpen = new Set(['פוליסה', 'השלמת מסמכים לפי הבקשה במייל']);
const { data: tasks } = await admin.from('claims_tasks').select('id, claim_id, row_data').eq('claim_id', 'DAL-2026-0014');
const changed = [];
for (const t of tasks || []) {
  const action = String(t.row_data?.action || '');
  if (!keepOpen.has(action)) continue;
  if (t.row_data?.done !== 'true') continue;
  const rd = { ...t.row_data, done: 'false', workStatus: 'open' };
  const { error } = await admin.from('claims_tasks').update({ row_data: rd }).eq('id', t.id);
  if (error) throw error;
  changed.push({ id: t.id, action });
}
console.log(JSON.stringify({ reopened: changed }, null, 2));
