/**
 * READ-ONLY audit of telemarketing QA/Demo rows on Staging.
 * node scripts/audit-telemarketing-qa-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-qa-cleanup-2026-08-26');
mkdirSync(OUT, { recursive: true });
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-qa-audit');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}
function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const out = dbQueryText(`
SELECT json_build_object(
  'tair', (SELECT json_build_object('id', p.id, 'name', p.full_name, 'email', u.email, 'active', p.is_active)
           FROM public.profiles p JOIN auth.users u ON u.id = p.id
           WHERE p.id = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e'),
  'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
  'lead_numbers', (SELECT json_agg(lead_number ORDER BY CASE WHEN lead_number ~ '^[0-9]+$' THEN lead_number::int END)
                   FROM public.telemarketing_lead_directory),
  'claimed', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE claimed_by IS NOT NULL),
  'assigned_tair', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE assigned_to = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e'),
  'qa_calls', (
    SELECT coalesce(json_agg(json_build_object('id', id, 'company', company_name, 'phone', phone, 'result', result, 'token', client_token, 'employee', employee_name, 'status', status) ORDER BY created_at), '[]'::json)
    FROM public.telemarketing_calls
    WHERE company_name ILIKE '%QA%'
       OR coalesce(result,'') ILIKE '%qa%'
       OR client_token ILIKE 'qa-%'
       OR phone IN ('03-9999999', '039999999')
       OR coalesce(summary,'') ILIKE '%QA%'
  ),
  'qa_followups', (
    SELECT coalesce(json_agg(json_build_object('id', id, 'call_id', call_id, 'company', company_name, 'action', action_needed, 'owner', owner, 'status', status)), '[]'::json)
    FROM public.telemarketing_followups
    WHERE action_needed ILIKE '%QA%'
       OR company_name ILIKE '%QA%'
       OR phone IN ('03-9999999', '039999999')
  ),
  'qa_work', (
    SELECT coalesce(json_agg(json_build_object('id', id, 'company', company_name, 'phone', phone, 'employee', employee_name, 'status', status)), '[]'::json)
    FROM public.telemarketing_work_sessions
    WHERE company_name ILIKE '%QA%' OR phone IN ('03-9999999', '039999999') OR coalesce(note,'') ILIKE '%QA%'
  ),
  'qa_chats', (
    SELECT coalesce(json_agg(json_build_object('id', id, 'agent', agent_name, 'company', company_name, 'care', care_type, 'status', status)), '[]'::json)
    FROM public.telemarketing_team_chats
    WHERE agent_name ILIKE '%QA%'
       OR agent_name ILIKE '%deactivated%'
       OR company_name ILIKE '%QA%'
       OR coalesce(request_detail,'') ILIKE '%QA%'
  ),
  'calls_on_real_leads_qa_result', (
    SELECT coalesce(json_agg(json_build_object('id', c.id, 'company', c.company_name, 'phone', c.phone, 'result', c.result, 'employee', c.employee_name)), '[]'::json)
    FROM public.telemarketing_calls c
    WHERE coalesce(c.result,'') ILIKE '%qa%'
       OR c.client_token ILIKE 'qa-%'
  ),
  'open_calls', (SELECT count(*) FROM public.telemarketing_calls WHERE status = 'in_progress'),
  'open_work', (SELECT count(*) FROM public.telemarketing_work_sessions WHERE status = 'in_progress')
);
`);
writeFileSync(join(OUT, 'qa-audit.json'), out, 'utf8');
console.log(out.slice(0, 8000));
