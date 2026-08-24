import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-followup-staging');
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

const sql = `SELECT json_build_object(
  'calls', (
    SELECT json_agg(json_build_object(
      'id', id,
      'employee_name', employee_name,
      'company_name', company_name,
      'phone', phone,
      'status', status,
      'result', result,
      'summary', left(coalesce(summary, ''), 80),
      'needs_follow_up', needs_follow_up,
      'follow_up_date', follow_up_date,
      'source_followup_id', source_followup_id,
      'recording_status', recording_status,
      'started_at', started_at
    ) ORDER BY created_at)
    FROM public.telemarketing_calls
  ),
  'followups', (
    SELECT json_agg(json_build_object(
      'id', f.id,
      'company_name', f.company_name,
      'contact_name', f.contact_name,
      'phone', f.phone,
      'due_date', f.due_date,
      'due_time', f.due_time,
      'status', f.status,
      'urgency', f.urgency,
      'action_needed', f.action_needed,
      'call_id', f.call_id,
      'closed_by_call_id', f.closed_by_call_id,
      'employee_name', c.employee_name
    ) ORDER BY f.due_date, f.created_at)
    FROM public.telemarketing_followups f
    JOIN public.telemarketing_calls c ON c.id = f.call_id
  ),
  'fu_policies', (
    SELECT json_agg(json_build_object('name', policyname, 'cmd', cmd) ORDER BY policyname)
    FROM pg_policies WHERE tablename = 'telemarketing_followups'
  ),
  'no_delete', NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename LIKE 'telemarketing%' AND cmd = 'DELETE'
  )
);`;

writeFileSync(join(tmpWork, 'qa.sql'), sql, 'utf8');
execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);
const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${join(tmpWork, 'qa.sql')}"`, {
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 120000,
});
console.log(out);
writeFileSync(join('docs/audit-reports/telemarketing-followup-staging-2026-08-24', 'qa-dump.json'), out, 'utf8');
