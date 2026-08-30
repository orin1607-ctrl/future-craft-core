-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Adds released status so stuck in_progress rows can be cleared without counting as work.
-- Completed rows are never released. No DELETE. No follow-up / traffic-light changes.
-- Rollback: DROP the new functions/triggers; optionally restore CHECK to in_progress|completed.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.telemarketing_calls'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%in_progress%'
    AND pg_get_constraintdef(oid) ILIKE '%completed%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%released%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.telemarketing_calls DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.telemarketing_calls
  DROP CONSTRAINT IF EXISTS telemarketing_calls_status_check;
ALTER TABLE public.telemarketing_calls
  ADD CONSTRAINT telemarketing_calls_status_check
  CHECK (status IN ('in_progress', 'completed', 'released'));

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.telemarketing_work_sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%in_progress%'
    AND pg_get_constraintdef(oid) ILIKE '%completed%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%released%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.telemarketing_work_sessions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.telemarketing_work_sessions
  DROP CONSTRAINT IF EXISTS telemarketing_work_sessions_status_check;
ALTER TABLE public.telemarketing_work_sessions
  ADD CONSTRAINT telemarketing_work_sessions_status_check
  CHECK (status IN ('in_progress', 'completed', 'released'));

CREATE OR REPLACE FUNCTION public.telemarketing_status_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'released' THEN
    RAISE EXCEPTION 'לא ניתן לשנות פעולה ששוחררה';
  END IF;
  IF NEW.status = 'released' THEN
    IF OLD.status <> 'in_progress' THEN
      RAISE EXCEPTION 'ניתן לשחרר רק פעולה פתוחה';
    END IF;
    IF public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RETURN NEW;
    END IF;
    IF OLD.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'לא ניתן לבטל שיחה שהתחילה או הסתיימה';
    END IF;
    IF OLD.started_at < now() - interval '15 seconds' THEN
      RAISE EXCEPTION 'חלון הביטול הסתיים — השיחה כבר נחשבת פעילה';
    END IF;
    IF OLD.employee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ניתן לבטל רק פעולה של עצמך';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telemarketing_calls_release_guard ON public.telemarketing_calls;
CREATE TRIGGER trg_telemarketing_calls_release_guard
  BEFORE UPDATE OF status ON public.telemarketing_calls
  FOR EACH ROW EXECUTE FUNCTION public.telemarketing_status_release_guard();

DROP TRIGGER IF EXISTS trg_telemarketing_work_release_guard ON public.telemarketing_work_sessions;
CREATE TRIGGER trg_telemarketing_work_release_guard
  BEFORE UPDATE OF status ON public.telemarketing_work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.telemarketing_status_release_guard();

CREATE OR REPLACE FUNCTION public.telemarketing_preview_stuck_action(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  emp_name text;
  open_call jsonb;
  open_work jsonb;
  claims jsonb;
  will jsonb := '[]'::jsonb;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'רק מנהל-על יכול לבדוק פעולה תקועה';
  END IF;
  SELECT coalesce(nullif(trim(full_name), ''), p_employee_id::text)
    INTO emp_name
  FROM public.profiles
  WHERE id = p_employee_id;
  IF emp_name IS NULL THEN
    RAISE EXCEPTION 'העובד לא נמצא';
  END IF;

  SELECT to_jsonb(c) INTO open_call
  FROM (
    SELECT id, company_name, phone, started_at, ended_at, duration_seconds, report_started_at, status,
      CASE WHEN ended_at IS NULL THEN 'active_call' ELSE 'pending_report' END AS kind
    FROM public.telemarketing_calls
    WHERE employee_id = p_employee_id AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1
  ) c;

  SELECT to_jsonb(w) INTO open_work
  FROM (
    SELECT id, company_name, phone, started_at, ended_at, duration_seconds, report_started_at, status, task_type,
      CASE WHEN ended_at IS NULL THEN 'active_work' ELSE 'pending_work_report' END AS kind
    FROM public.telemarketing_work_sessions
    WHERE employee_id = p_employee_id AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1
  ) w;

  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    INTO claims
  FROM (
    SELECT id, lead_number, company_name, claimed_at
    FROM public.telemarketing_lead_directory
    WHERE claimed_by = p_employee_id
    ORDER BY claimed_at DESC NULLS LAST
    LIMIT 20
  ) d;

  IF open_call IS NOT NULL THEN
    will := will || jsonb_build_array(jsonb_build_object(
      'kind', open_call->>'kind',
      'label', CASE WHEN open_call->>'kind' = 'pending_report' THEN 'דיווח פתוח אחרי שיחה' ELSE 'שיחה פתוחה' END,
      'since', coalesce(open_call->>'ended_at', open_call->>'started_at')
    ));
  END IF;
  IF open_work IS NOT NULL THEN
    will := will || jsonb_build_array(jsonb_build_object(
      'kind', open_work->>'kind',
      'label', CASE WHEN open_work->>'kind' = 'pending_work_report' THEN 'דיווח משימה פתוח' ELSE 'משימת עבודה פתוחה' END,
      'since', coalesce(open_work->>'ended_at', open_work->>'started_at')
    ));
  END IF;
  IF jsonb_array_length(coalesce(claims, '[]'::jsonb)) > 0 THEN
    will := will || jsonb_build_array(jsonb_build_object(
      'kind', 'claimed_leads',
      'label', 'שחרור נעילת ליד (claimed_by בלבד, בלי שינוי שיוך)',
      'count', jsonb_array_length(claims)
    ));
  END IF;

  RETURN jsonb_build_object(
    'employeeId', p_employee_id,
    'employeeName', emp_name,
    'hasStuck', (open_call IS NOT NULL OR open_work IS NOT NULL OR jsonb_array_length(coalesce(claims, '[]'::jsonb)) > 0),
    'openCall', open_call,
    'openWork', open_work,
    'claimedLeads', coalesce(claims, '[]'::jsonb),
    'willReset', will,
    'willNot', jsonb_build_array(
      'לא מוחקים שיחה שהושלמה',
      'לא מוסיפים זמן / ניסיון חיוג / Follow-up / רמזור',
      'לא מזייפים סיום שיחה',
      'לא משנים שיוך לידים'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.telemarketing_release_stuck_action(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  preview jsonb;
  call_ids uuid[];
  work_ids uuid[];
  claim_ids uuid[];
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'רק מנהל-על יכול לאפס פעולה תקועה';
  END IF;
  preview := public.telemarketing_preview_stuck_action(p_employee_id);
  IF coalesce((preview->>'hasStuck')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', true,
      'didReset', false,
      'employeeId', p_employee_id,
      'employeeName', preview->>'employeeName',
      'releasedCallIds', '[]'::jsonb,
      'releasedWorkIds', '[]'::jsonb,
      'releasedClaimIds', '[]'::jsonb,
      'message', 'אין מצב פעיל — לא בוצע איפוס'
    );
  END IF;

  WITH updated_calls AS (
    UPDATE public.telemarketing_calls
    SET status = 'released'
    WHERE employee_id = p_employee_id AND status = 'in_progress'
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO call_ids FROM updated_calls;

  WITH updated_work AS (
    UPDATE public.telemarketing_work_sessions
    SET status = 'released'
    WHERE employee_id = p_employee_id AND status = 'in_progress'
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO work_ids FROM updated_work;

  WITH updated_claims AS (
    UPDATE public.telemarketing_lead_directory
    SET claimed_by = NULL, claimed_at = NULL
    WHERE claimed_by = p_employee_id
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO claim_ids FROM updated_claims;

  RETURN jsonb_build_object(
    'ok', true,
    'didReset', true,
    'employeeId', p_employee_id,
    'employeeName', preview->>'employeeName',
    'releasedCallIds', to_jsonb(coalesce(call_ids, ARRAY[]::uuid[])),
    'releasedWorkIds', to_jsonb(coalesce(work_ids, ARRAY[]::uuid[])),
    'releasedClaimIds', to_jsonb(coalesce(claim_ids, ARRAY[]::uuid[])),
    'preview', preview
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.telemarketing_void_unstarted_call(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  rec public.telemarketing_calls%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'telemarketing_agent'::app_role) THEN
    RAISE EXCEPTION 'רק עובד טלמיטינג יכול לבטל שיחה שלא התחילה';
  END IF;
  SELECT * INTO rec
  FROM public.telemarketing_calls
  WHERE id = p_call_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'השיחה לא נמצאה';
  END IF;
  IF rec.employee_id IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'ניתן לבטל רק שיחה של עצמך';
  END IF;
  IF rec.status = 'released' THEN
    RETURN jsonb_build_object('ok', true, 'didVoid', false, 'callId', rec.id, 'status', rec.status);
  END IF;
  IF rec.status <> 'in_progress' OR rec.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'השיחה כבר התחילה או הסתיימה — לא ניתן לבטל';
  END IF;
  IF rec.started_at < now() - interval '15 seconds' THEN
    RAISE EXCEPTION 'חלון הביטול הסתיים — השיחה כבר נחשבת פעילה';
  END IF;
  UPDATE public.telemarketing_calls
  SET status = 'released'
  WHERE id = rec.id;
  RETURN jsonb_build_object('ok', true, 'didVoid', true, 'callId', rec.id, 'status', 'released');
END;
$$;

REVOKE ALL ON FUNCTION public.telemarketing_preview_stuck_action(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telemarketing_release_stuck_action(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telemarketing_void_unstarted_call(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_preview_stuck_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_release_stuck_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_void_unstarted_call(uuid) TO authenticated;
