-- Staging only. Claims worker flag on existing claims_access — no new app_role.
ALTER TABLE public.claims_access
  ADD COLUMN IF NOT EXISTS worker_only boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.claims_set_access(uuid, boolean);

CREATE OR REPLACE FUNCTION public.claims_set_access(
  p_user_id uuid,
  p_enabled boolean,
  p_worker_only boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'claims_set_access: super_admin only';
  END IF;
  IF p_enabled THEN
    INSERT INTO public.claims_access (user_id, granted_by, granted_at, worker_only)
    VALUES (p_user_id, auth.uid(), now(), coalesce(p_worker_only, false))
    ON CONFLICT (user_id) DO UPDATE
      SET granted_by = EXCLUDED.granted_by,
          granted_at = now(),
          worker_only = CASE
            WHEN EXCLUDED.worker_only THEN true
            ELSE public.claims_access.worker_only
          END;
  ELSE
    DELETE FROM public.claims_access WHERE user_id = p_user_id;
  END IF;
  RETURN p_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claims_set_access(uuid, boolean, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.claims_set_access(uuid, boolean, boolean) FROM PUBLIC;
