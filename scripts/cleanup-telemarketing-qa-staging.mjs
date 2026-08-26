/**
 * Backup then delete proven telemarketing QA/Demo rows on Staging ONLY.
 * Never deletes Tair, never deletes directory leads 1-29.
 * node scripts/cleanup-telemarketing-qa-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-qa-cleanup-2026-08-26');
mkdirSync(OUT, { recursive: true });
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-qa-cleanup');
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

const backup = dbQueryText(`
SELECT json_build_object(
  'calls', (SELECT coalesce(json_agg(c), '[]'::json) FROM public.telemarketing_calls c WHERE
      c.company_name ILIKE '%QA%' OR coalesce(c.result,'') ILIKE '%qa%' OR c.client_token ILIKE 'qa-%'
      OR c.phone IN ('03-9999999','0501111001','0501111002') OR c.employee_name ILIKE 'QA %'),
  'followups', (SELECT coalesce(json_agg(f), '[]'::json) FROM public.telemarketing_followups f WHERE
      f.action_needed ILIKE '%QA%' OR f.company_name ILIKE '%QA%' OR f.phone IN ('03-9999999','0501111001','0501111002')),
  'work', (SELECT coalesce(json_agg(w), '[]'::json) FROM public.telemarketing_work_sessions w WHERE
      w.company_name ILIKE '%QA%' OR w.phone IN ('03-9999999','0501111001','0501111002') OR w.employee_name ILIKE 'QA %'),
  'chats', (SELECT coalesce(json_agg(t), '[]'::json) FROM public.telemarketing_team_chats t WHERE t.agent_name ILIKE 'QA %')
);
`);
writeFileSync(join(OUT, 'qa-backup.json'), backup, 'utf8');

const cleaned = dbQueryText(`
DO $$
DECLARE
  call_ids uuid[];
  chat_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO call_ids FROM public.telemarketing_calls
  WHERE company_name ILIKE '%QA%'
     OR coalesce(result,'') ILIKE '%qa%'
     OR client_token ILIKE 'qa-%'
     OR phone IN ('03-9999999','0501111001','0501111002')
     OR employee_name ILIKE 'QA %';

  SELECT coalesce(array_agg(id), '{}') INTO chat_ids FROM public.telemarketing_team_chats
  WHERE agent_name ILIKE 'QA %';

  DELETE FROM public.telemarketing_team_chat_reads WHERE chat_id = ANY (chat_ids);
  DELETE FROM public.telemarketing_team_messages WHERE chat_id = ANY (chat_ids);
  DELETE FROM public.telemarketing_team_chats WHERE id = ANY (chat_ids);

  BEGIN
    UPDATE public.telemarketing_followups SET closed_by_call_id = NULL WHERE closed_by_call_id = ANY (call_ids);
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  DELETE FROM public.telemarketing_followups
  WHERE call_id = ANY (call_ids)
     OR action_needed ILIKE '%QA%'
     OR company_name ILIKE '%QA%'
     OR phone IN ('03-9999999','0501111001','0501111002');

  DELETE FROM public.telemarketing_lead_status_events
  WHERE lead_key IN ('p:0501111001','p:0501111002','p:039999999','c:qa-tele-09270134','c:qa-tele-09321993','c:שיחה ידנית qa');
  DELETE FROM public.telemarketing_lead_states
  WHERE lead_key IN ('p:0501111001','p:0501111002','p:039999999','c:qa-tele-09270134','c:qa-tele-09321993','c:שיחה ידנית qa');

  DELETE FROM public.telemarketing_calls WHERE id = ANY (call_ids);
  DELETE FROM public.telemarketing_work_sessions
  WHERE company_name ILIKE '%QA%' OR phone IN ('03-9999999','0501111001','0501111002') OR employee_name ILIKE 'QA %';

  UPDATE public.telemarketing_lead_directory SET claimed_by = NULL, claimed_at = NULL;
END $$;

SELECT json_build_object(
  'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
  'lead_numbers', (SELECT json_agg(lead_number ORDER BY CASE WHEN lead_number ~ '^[0-9]+$' THEN lead_number::int END) FROM public.telemarketing_lead_directory),
  'tair_exists', EXISTS (SELECT 1 FROM public.profiles WHERE id = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' AND full_name = 'תאיר'),
  'assigned_tair', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE assigned_to = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e'),
  'qa_calls_left', (SELECT count(*) FROM public.telemarketing_calls WHERE company_name ILIKE '%QA%' OR coalesce(result,'') ILIKE '%qa%' OR employee_name ILIKE 'QA %'),
  'qa_chats_left', (SELECT count(*) FROM public.telemarketing_team_chats WHERE agent_name ILIKE 'QA %'),
  'claimed_left', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE claimed_by IS NOT NULL)
);
`);
writeFileSync(join(OUT, 'qa-cleanup-verify.json'), cleaned, 'utf8');
console.log(cleaned.slice(0, 4000));
