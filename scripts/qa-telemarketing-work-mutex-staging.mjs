import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-work-leads-staging');
const sql = `
DO $$
DECLARE
  emp uuid;
BEGIN
  SELECT employee_id INTO emp FROM public.telemarketing_calls WHERE status = 'in_progress' LIMIT 1;
  IF emp IS NULL THEN
    RAISE NOTICE 'no open call; skip mutex check';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.telemarketing_work_sessions (employee_id, employee_name, client_token)
    VALUES (emp, 'qa-mutex', gen_random_uuid()::text);
    RAISE EXCEPTION 'MUTEX_FAIL_INSERT_SUCCEEDED';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%שיחה פעילה%' THEN
        RAISE NOTICE 'mutex_ok';
      ELSIF SQLERRM LIKE '%MUTEX_FAIL%' THEN
        RAISE;
      ELSE
        RAISE NOTICE 'mutex_ok_other: %', SQLERRM;
      END IF;
  END;
END $$;

SELECT json_build_object(
  'work_count', (SELECT count(*) FROM public.telemarketing_work_sessions),
  'lead_count', (SELECT count(*) FROM public.telemarketing_lead_states),
  'open_calls', (SELECT count(*) FROM public.telemarketing_calls WHERE status='in_progress'),
  'no_delete_work', NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='telemarketing_work_sessions' AND cmd='DELETE')
);
`;
writeFileSync(join(tmpWork, 'mutex.sql'), sql, 'utf8');
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused production');
if (linked !== STAGING_REF) throw new Error(linked);
const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${join(tmpWork, 'mutex.sql')}"`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
console.log(out);
