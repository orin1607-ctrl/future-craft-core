-- Staging ONLY. Extend existing lead directory with assignment + atomic claim.
-- Does NOT rewrite import RPC. Does NOT delete directory rows.
-- Rollback: see docs/audit-reports/telemarketing-lead-assign-2026-08-26/RESTORE-POINT.json

ALTER TABLE public.telemarketing_lead_directory
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_name text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_assigned
  ON public.telemarketing_lead_directory (assigned_to);
CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_claimed
  ON public.telemarketing_lead_directory (claimed_by);

CREATE TABLE IF NOT EXISTS public.telemarketing_lead_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.telemarketing_lead_directory(id) ON DELETE RESTRICT,
  lead_number text NOT NULL DEFAULT '',
  previous_agent_id uuid,
  previous_agent_name text,
  new_agent_id uuid,
  new_agent_name text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_assignment_lead
  ON public.telemarketing_lead_assignment_events (lead_id, created_at DESC);

ALTER TABLE public.telemarketing_lead_assignment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemarketing_lead_assignment_select ON public.telemarketing_lead_assignment_events;
CREATE POLICY telemarketing_lead_assignment_select ON public.telemarketing_lead_assignment_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT ON public.telemarketing_lead_assignment_events TO authenticated;

DROP POLICY IF EXISTS telemarketing_lead_directory_select ON public.telemarketing_lead_directory;
CREATE POLICY telemarketing_lead_directory_select ON public.telemarketing_lead_directory
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND assigned_to = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.telemarketing_lead_is_busy(p_phone text, p_company_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.telemarketing_calls c
    WHERE c.status = 'in_progress'
      AND (
        (regexp_replace(coalesce(p_phone, ''), '[^0-9*]', '', 'g') <> ''
          AND regexp_replace(coalesce(c.phone, ''), '[^0-9*]', '', 'g')
            = regexp_replace(coalesce(p_phone, ''), '[^0-9*]', '', 'g'))
        OR (btrim(coalesce(p_company_name, '')) <> ''
          AND lower(btrim(c.company_name)) = lower(btrim(p_company_name))
          AND regexp_replace(coalesce(p_phone, ''), '[^0-9*]', '', 'g') = '')
      )
  ) OR EXISTS (
    SELECT 1 FROM public.telemarketing_work_sessions w
    WHERE w.status = 'in_progress'
      AND regexp_replace(coalesce(p_phone, ''), '[^0-9*]', '', 'g') <> ''
      AND regexp_replace(coalesce(w.phone, ''), '[^0-9*]', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '[^0-9*]', '', 'g')
  );
$$;

CREATE OR REPLACE FUNCTION public.telemarketing_assign_leads(p_lead_ids uuid[], p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
  agent_name text;
  lead_row public.telemarketing_lead_directory%ROWTYPE;
  assigned integer := 0;
  skipped integer := 0;
  skipped_items jsonb := '[]'::jsonb;
  prev_id uuid;
  prev_name text;
  found_ids uuid[] := '{}';
  missing uuid;
BEGIN
  IF NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'אין הרשאה לשיוך לידים';
  END IF;
  IF p_lead_ids IS NULL OR coalesce(array_length(p_lead_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'לא נבחרו לידים';
  END IF;
  IF array_length(p_lead_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'יותר מדי לידים לשיוך בבת אחת';
  END IF;
  IF NOT public.has_role(p_agent_id, 'telemarketing_agent'::app_role) THEN
    RAISE EXCEPTION 'יש לבחור עובד טלמיטינג';
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = actor;
  SELECT full_name INTO agent_name FROM public.profiles WHERE id = p_agent_id;
  IF agent_name IS NULL THEN
    RAISE EXCEPTION 'עובד לא נמצא';
  END IF;

  FOR lead_row IN
    SELECT * FROM public.telemarketing_lead_directory d
    WHERE d.id = ANY (p_lead_ids)
    ORDER BY d.created_at
    FOR UPDATE
  LOOP
    found_ids := array_append(found_ids, lead_row.id);
    IF public.telemarketing_lead_is_busy(lead_row.phone, lead_row.company_name) THEN
      skipped := skipped + 1;
      skipped_items := skipped_items || jsonb_build_array(jsonb_build_object(
        'leadNumber', lead_row.lead_number,
        'companyName', lead_row.company_name,
        'reason', 'הליד בשיחה או במשימה פעילה — לא הועבר'
      ));
      CONTINUE;
    END IF;
    prev_id := lead_row.assigned_to;
    prev_name := lead_row.assigned_name;
    UPDATE public.telemarketing_lead_directory
    SET assigned_to = p_agent_id,
        assigned_name = agent_name,
        assigned_at = now(),
        claimed_by = NULL,
        claimed_at = NULL
    WHERE id = lead_row.id;
    INSERT INTO public.telemarketing_lead_assignment_events (
      lead_id, lead_number, previous_agent_id, previous_agent_name, new_agent_id, new_agent_name, changed_by, changed_by_name
    ) VALUES (
      lead_row.id, lead_row.lead_number, prev_id, prev_name, p_agent_id, agent_name, actor, actor_name
    );
    UPDATE public.telemarketing_followups f
    SET owner = agent_name
    WHERE f.status = 'open'
      AND (
        (regexp_replace(coalesce(lead_row.phone, ''), '[^0-9*]', '', 'g') <> ''
          AND regexp_replace(coalesce(f.phone, ''), '[^0-9*]', '', 'g')
            = regexp_replace(coalesce(lead_row.phone, ''), '[^0-9*]', '', 'g'))
        OR (
          regexp_replace(coalesce(lead_row.phone, ''), '[^0-9*]', '', 'g') = ''
          AND btrim(lead_row.company_name) <> ''
          AND lower(btrim(f.company_name)) = lower(btrim(lead_row.company_name))
        )
      );
    assigned := assigned + 1;
  END LOOP;

  FOREACH missing IN ARRAY p_lead_ids
  LOOP
    IF NOT (missing = ANY (found_ids)) THEN
      skipped := skipped + 1;
      skipped_items := skipped_items || jsonb_build_array(jsonb_build_object(
        'leadNumber', '',
        'companyName', '',
        'reason', 'ליד לא נמצא במאגר'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'assignedCount', assigned,
    'skippedCount', skipped,
    'skipped', skipped_items,
    'agentName', agent_name,
    'agentId', p_agent_id
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
    AND (d.claimed_by IS NULL OR d.claimed_at < now() - interval '2 hours')
    AND NOT public.telemarketing_lead_is_busy(d.phone, d.company_name)
  ORDER BY
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

CREATE OR REPLACE FUNCTION public.telemarketing_claim_lead(p_lead_id uuid)
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
    RAISE EXCEPTION 'רק עובד טלמיטינג יכול לקחת ליד';
  END IF;
  SELECT * INTO picked
  FROM public.telemarketing_lead_directory d
  WHERE d.id = p_lead_id AND d.assigned_to = actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'הליד אינו משויך אליך';
  END IF;
  IF public.telemarketing_lead_is_busy(picked.phone, picked.company_name) AND (picked.claimed_by IS DISTINCT FROM actor) THEN
    RAISE EXCEPTION 'הליד בטיפול פעיל';
  END IF;
  IF picked.claimed_by IS NOT NULL AND picked.claimed_by IS DISTINCT FROM actor AND picked.claimed_at >= now() - interval '2 hours' THEN
    RAISE EXCEPTION 'הליד כבר נלקח לעבודה';
  END IF;
  UPDATE public.telemarketing_lead_directory
  SET claimed_by = actor, claimed_at = now()
  WHERE id = picked.id;
  RETURN to_jsonb(picked);
END;
$$;

REVOKE ALL ON FUNCTION public.telemarketing_assign_leads(uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telemarketing_claim_next_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telemarketing_claim_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_assign_leads(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_claim_next_lead() TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_claim_lead(uuid) TO authenticated;
