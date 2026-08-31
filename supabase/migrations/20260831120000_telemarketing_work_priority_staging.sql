-- Staging ONLY. Work-priority flag for already-assigned leads.
-- Does NOT change assigned_to, claimed_by, claimed_at, phones, history, or wave.
-- Next-lead pick prefers priority rows but skips busy/claimed/in-progress leads.

ALTER TABLE public.telemarketing_lead_directory
  ADD COLUMN IF NOT EXISTS work_priority_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_work_priority
  ON public.telemarketing_lead_directory (assigned_to, work_priority_at)
  WHERE work_priority_at IS NOT NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.telemarketing_set_work_priority(p_lead_ids uuid[], p_priority boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  updated integer := 0;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'רק מנהל-על יכול לקבוע עדיפות לעבודה';
  END IF;
  IF p_lead_ids IS NULL OR coalesce(array_length(p_lead_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'לא נבחרו לידים';
  END IF;
  IF array_length(p_lead_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'יותר מדי לידים לעדיפות בבת אחת';
  END IF;

  IF p_priority THEN
    UPDATE public.telemarketing_lead_directory
    SET work_priority_at = coalesce(work_priority_at, now())
    WHERE id = ANY (p_lead_ids)
      AND archived_at IS NULL;
  ELSE
    UPDATE public.telemarketing_lead_directory
    SET work_priority_at = NULL
    WHERE id = ANY (p_lead_ids);
  END IF;
  GET DIAGNOSTICS updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'updatedCount', updated,
    'priority', p_priority
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.telemarketing_claim_next_lead()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  picked public.telemarketing_lead_directory%ROWTYPE;
BEGIN
  IF NOT public.has_role(actor, 'telemarketing_agent'::app_role) THEN
    RAISE EXCEPTION 'רק עובד טלמיטינג יכול לקחת ליד מהתור';
  END IF;
  SELECT * INTO picked
  FROM public.telemarketing_lead_directory d
  WHERE d.assigned_to = actor
    AND d.archived_at IS NULL
    AND (d.claimed_by IS NULL OR d.claimed_at < now() - interval '2 hours')
    AND NOT public.telemarketing_lead_is_busy(d.phone, d.company_name)
  ORDER BY
    CASE WHEN d.work_priority_at IS NOT NULL THEN 0 ELSE 1 END,
    d.work_priority_at ASC NULLS LAST,
    CASE WHEN d.lead_number ~ '^[0-9]+$' THEN d.lead_number::int END NULLS LAST,
    d.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.telemarketing_lead_directory
  SET claimed_by = actor, claimed_at = now()
  WHERE id = picked.id;
  picked.claimed_by := actor;
  picked.claimed_at := now();
  RETURN to_jsonb(picked);
END;
$$;

REVOKE ALL ON FUNCTION public.telemarketing_set_work_priority(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_set_work_priority(uuid[], boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.telemarketing_claim_next_lead() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_claim_next_lead() TO authenticated;

NOTIFY pgrst, 'reload schema';
