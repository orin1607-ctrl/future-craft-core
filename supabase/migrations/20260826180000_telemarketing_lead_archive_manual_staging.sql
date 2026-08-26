-- Staging ONLY. Archive + atomic manual lead numbers. Does not rewrite import/claim.
-- Rollback: see docs/audit-reports/telemarketing-qa-cleanup-2026-08-26/RESTORE-POINT.json

ALTER TABLE public.telemarketing_lead_directory
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_archived
  ON public.telemarketing_lead_directory (archived_at);

DROP POLICY IF EXISTS telemarketing_lead_directory_select ON public.telemarketing_lead_directory;
CREATE POLICY telemarketing_lead_directory_select ON public.telemarketing_lead_directory
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND assigned_to = auth.uid()
      AND archived_at IS NULL
    )
  );

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
  WHERE d.id = p_lead_id AND d.assigned_to = actor AND d.archived_at IS NULL
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

CREATE OR REPLACE FUNCTION public.telemarketing_create_manual_lead(
  p_company_name text,
  p_phone text,
  p_email text,
  p_industry text,
  p_region text,
  p_fleet_size text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
  phone_key text := regexp_replace(coalesce(p_phone, ''), '[^0-9*]', '', 'g');
  email_key text := lower(btrim(coalesce(p_email, '')));
  existing public.telemarketing_lead_directory%ROWTYPE;
  next_no integer;
  created public.telemarketing_lead_directory%ROWTYPE;
BEGIN
  IF NOT public.has_role(actor, 'telemarketing_agent'::app_role) THEN
    RAISE EXCEPTION 'רק עובד טלמיטינג יכול ליצור ליד ידני';
  END IF;
  IF btrim(coalesce(p_company_name, '')) = '' AND btrim(coalesce(p_phone, '')) = '' THEN
    RAISE EXCEPTION 'חובה למלא שם חברה או טלפון';
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = actor;

  IF phone_key <> '' THEN
    SELECT * INTO existing
    FROM public.telemarketing_lead_directory d
    WHERE regexp_replace(coalesce(d.phone, ''), '[^0-9*]', '', 'g') = phone_key
    LIMIT 1;
  END IF;
  IF existing.id IS NULL AND email_key <> '' THEN
    SELECT * INTO existing
    FROM public.telemarketing_lead_directory d
    WHERE lower(btrim(d.email)) = email_key
    LIMIT 1;
  END IF;
  IF existing.id IS NOT NULL THEN
    IF existing.archived_at IS NOT NULL THEN
      RETURN jsonb_build_object('action', 'duplicate_other', 'leadNumber', existing.lead_number);
    END IF;
    IF existing.assigned_to IS DISTINCT FROM actor AND NOT public.has_role(actor, 'super_admin'::app_role) THEN
      RETURN jsonb_build_object('action', 'duplicate_other', 'leadNumber', existing.lead_number);
    END IF;
    RETURN jsonb_build_object('action', 'existing', 'lead', to_jsonb(existing));
  END IF;

  PERFORM pg_advisory_xact_lock(872261400);
  SELECT coalesce(max(lead_number::int), 0) + 1 INTO next_no
  FROM public.telemarketing_lead_directory
  WHERE lead_number ~ '^[0-9]+$';

  INSERT INTO public.telemarketing_lead_directory (
    lead_number, company_name, industry, region, fleet_size, phone, email, extra, source,
    assigned_to, assigned_name, assigned_at, created_by
  ) VALUES (
    next_no::text,
    btrim(coalesce(p_company_name, '')),
    btrim(coalesce(p_industry, '')),
    btrim(coalesce(p_region, '')),
    btrim(coalesce(p_fleet_size, '')),
    btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')),
    '{}'::jsonb,
    'manual_agent',
    actor,
    actor_name,
    now(),
    actor
  ) RETURNING * INTO created;

  INSERT INTO public.telemarketing_lead_assignment_events (
    lead_id, lead_number, previous_agent_id, previous_agent_name, new_agent_id, new_agent_name, changed_by, changed_by_name
  ) VALUES (
    created.id, created.lead_number, NULL, NULL, actor, actor_name, actor, actor_name
  );

  RETURN jsonb_build_object('action', 'created', 'lead', to_jsonb(created));
END;
$$;

CREATE OR REPLACE FUNCTION public.telemarketing_set_leads_archived(p_lead_ids uuid[], p_archived boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  n integer;
BEGIN
  IF NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'רק מנהל-על יכול לארכב לידים';
  END IF;
  IF p_archived THEN
    UPDATE public.telemarketing_lead_directory
    SET archived_at = now(), archived_by = actor, claimed_by = NULL, claimed_at = NULL
    WHERE id = ANY (p_lead_ids) AND archived_at IS NULL;
  ELSE
    UPDATE public.telemarketing_lead_directory
    SET archived_at = NULL, archived_by = NULL
    WHERE id = ANY (p_lead_ids) AND archived_at IS NOT NULL;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('updatedCount', n, 'archived', p_archived);
END;
$$;

CREATE OR REPLACE FUNCTION public.telemarketing_preview_lead_delete(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  preview jsonb;
BEGIN
  IF NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'רק מנהל-על יכול לצפות ב-Preview מחיקה';
  END IF;
  SELECT jsonb_build_object(
    'leadNumber', d.lead_number,
    'companyName', d.company_name,
    'calls', (SELECT count(*) FROM public.telemarketing_calls c
              WHERE (regexp_replace(coalesce(c.phone,''), '[^0-9*]', '', 'g') = regexp_replace(coalesce(d.phone,''), '[^0-9*]', '', 'g')
                 AND regexp_replace(coalesce(d.phone,''), '[^0-9*]', '', 'g') <> '')
              OR (d.phone = '' AND lower(c.company_name) = lower(d.company_name))),
    'followups', (SELECT count(*) FROM public.telemarketing_followups f
                  WHERE regexp_replace(coalesce(f.phone,''), '[^0-9*]', '', 'g') = regexp_replace(coalesce(d.phone,''), '[^0-9*]', '', 'g')
                    AND regexp_replace(coalesce(d.phone,''), '[^0-9*]', '', 'g') <> ''),
    'assignmentEvents', (SELECT count(*) FROM public.telemarketing_lead_assignment_events e WHERE e.lead_id = d.id),
    'canDelete', false,
    'reason', 'ליד עם פעילות או שיוך — השתמשו בארכיון. מחיקה חסומה כדי לא למחוק היסטוריה.'
  )
  INTO preview
  FROM public.telemarketing_lead_directory d
  WHERE d.id = p_lead_id;
  RETURN preview;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.telemarketing_lead_directory FROM anon, authenticated;
GRANT SELECT ON TABLE public.telemarketing_lead_directory TO authenticated;

REVOKE ALL ON FUNCTION public.telemarketing_create_manual_lead(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telemarketing_set_leads_archived(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telemarketing_preview_lead_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_create_manual_lead(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_set_leads_archived(uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_preview_lead_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_claim_next_lead() TO authenticated;
GRANT EXECUTE ON FUNCTION public.telemarketing_claim_lead(uuid) TO authenticated;
