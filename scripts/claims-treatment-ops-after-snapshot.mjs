/**
 * Staging-only snapshot for treatment-ops owner report. No deletes.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: c14 } = await admin.from('claims_records').select('id, status, client_name, row_data').eq('id', 'DAL-2026-0014').maybeSingle();
const { data: c18 } = await admin.from('claims_records').select('id, status, client_name, row_data').eq('id', 'DAL-2026-0018').maybeSingle();
const { data: rem } = await admin.from('claims_reminders').select('id, claim_id, status, next_run_at, row_data').eq('id', 'NT-DAL-2026-0014');
const { data: tasks } = await admin.from('claims_tasks').select('id, claim_id, row_data');
const { data: gmail } = await admin.from('claims_documents').select('id').eq('claim_id', 'DAL-2026-0014').eq('gmail_message_id', '1a05cb16e0a328f5');
const out = {
  c14: {
    status: c14?.status,
    client: c14?.client_name,
    archived: c14?.row_data?.archived || '',
    deletedAt: c14?.row_data?.deletedAt || '',
    lastTreatmentAt: c14?.row_data?.lastTreatmentAt || '',
    nextDate: c14?.row_data?.nextDate || '',
  },
  c18: {
    status: c18?.status,
    client: c18?.client_name,
    archived: c18?.row_data?.archived || '',
    deletedAt: c18?.row_data?.deletedAt || '',
  },
  reminder: rem,
  taskNames: (tasks || []).map((t) => ({ id: t.id, claim: t.claim_id, action: t.row_data?.action, done: t.row_data?.done })),
  gmailDocs0014: (gmail || []).length,
};
writeFileSync(join('docs/audit-reports/claims-treatment-ops-2026-09-01', 'after-snapshot.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
