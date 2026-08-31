-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Isolated claims module. No ALTER on existing tables. No app_role change.
-- Rollback: DROP claims_* tables/functions listed in RESTORE-POINT.json.

CREATE TABLE IF NOT EXISTS public.claims_access (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.claims_config (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.claims_records (
  id text PRIMARY KEY,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  plate text,
  client_name text,
  status text NOT NULL DEFAULT 'חדש',
  company_name text,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_claims_records_plate ON public.claims_records (plate);
CREATE INDEX IF NOT EXISTS idx_claims_records_status ON public.claims_records (status);
CREATE INDEX IF NOT EXISTS idx_claims_records_vehicle ON public.claims_records (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_claims_records_company ON public.claims_records (company_name);
CREATE INDEX IF NOT EXISTS idx_claims_records_updated ON public.claims_records (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.claims_comm_log (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_comm_log_claim ON public.claims_comm_log (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_tasks (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_tasks_claim ON public.claims_tasks (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_reminders (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_reminders_claim ON public.claims_reminders (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_history (
  id text PRIMARY KEY,
  claim_id text REFERENCES public.claims_records(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_history_claim ON public.claims_history (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_notifications (
  id text PRIMARY KEY,
  claim_id text,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.claims_config (key, value) VALUES
  ('VERSION', '4.0-oren-car'),
  ('INITIALIZED', 'true'),
  ('CLAIM_COUNTER', '0'),
  ('GMAIL_PENDING', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_claims_access(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_uid IS NOT NULL
    AND (
      public.has_role(p_uid, 'super_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.claims_access a WHERE a.user_id = p_uid
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.claims_can_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_claims_access(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.claims_set_access(p_user_id uuid, p_enabled boolean)
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
    INSERT INTO public.claims_access (user_id, granted_by, granted_at)
    VALUES (p_user_id, auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET granted_by = EXCLUDED.granted_by,
          granted_at = now();
  ELSE
    DELETE FROM public.claims_access WHERE user_id = p_user_id;
  END IF;
  RETURN p_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_search_vehicles(p_q text DEFAULT '')
RETURNS TABLE (
  id uuid,
  license_plate text,
  company_name text,
  manufacturer text,
  model text,
  internal_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id,
    v.license_plate,
    v.company_name,
    v.manufacturer,
    v.model,
    v.internal_number
  FROM public.vehicles v
  WHERE public.has_claims_access(auth.uid())
    AND coalesce(v.status, '') <> 'archived'
    AND (
      coalesce(trim(p_q), '') = ''
      OR v.license_plate ILIKE '%' || trim(p_q) || '%'
      OR coalesce(v.internal_number, '') ILIKE '%' || trim(p_q) || '%'
      OR coalesce(v.manufacturer, '') ILIKE '%' || trim(p_q) || '%'
      OR coalesce(v.model, '') ILIKE '%' || trim(p_q) || '%'
      OR coalesce(v.company_name, '') ILIKE '%' || trim(p_q) || '%'
    )
  ORDER BY v.license_plate
  LIMIT 40;
$$;

ALTER TABLE public.claims_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_comm_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_access_select ON public.claims_access;
CREATE POLICY claims_access_select ON public.claims_access
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS claims_config_all ON public.claims_config;
CREATE POLICY claims_config_all ON public.claims_config
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_records_all ON public.claims_records;
CREATE POLICY claims_records_all ON public.claims_records
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_comm_log_all ON public.claims_comm_log;
CREATE POLICY claims_comm_log_all ON public.claims_comm_log
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_tasks_all ON public.claims_tasks;
CREATE POLICY claims_tasks_all ON public.claims_tasks
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_reminders_all ON public.claims_reminders;
CREATE POLICY claims_reminders_all ON public.claims_reminders
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_history_all ON public.claims_history;
CREATE POLICY claims_history_all ON public.claims_history
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_notifications_all ON public.claims_notifications;
CREATE POLICY claims_notifications_all ON public.claims_notifications
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

REVOKE ALL ON TABLE public.claims_access FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_config FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_records FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_comm_log FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_tasks FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_reminders FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_history FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_notifications FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_comm_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_notifications TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_claims_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_can_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_set_access(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_search_vehicles(text) TO authenticated;
