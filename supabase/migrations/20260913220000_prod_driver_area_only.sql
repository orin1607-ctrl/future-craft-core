-- Production isolated driver-area schema (additive only).
-- Required directly by the six approved driver-area tasks.
-- Does NOT: DROP TABLE, delete data, replace log_vehicle_changes,
-- replace notify_managers_on_fault / notify_managers_on_accident /
-- notify_managers_on_service_order, or touch claims_*.

-- 1. Control-center tables
CREATE TABLE IF NOT EXISTS public.dalia_contact_settings (
  id text PRIMARY KEY DEFAULT 'global',
  email text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

CREATE TABLE IF NOT EXISTS public.driver_app_company_config (
  company_name text PRIMARY KEY,
  dalia_service_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

CREATE TABLE IF NOT EXISTS public.driver_app_action_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  action_key text NOT NULL,
  visible_to_driver boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  email_to_fleet_managers boolean NOT NULL DEFAULT false,
  email_to_dalia boolean NOT NULL DEFAULT false,
  email_extra text NOT NULL DEFAULT '',
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  whatsapp_to_dalia boolean NOT NULL DEFAULT false,
  whatsapp_extra text NOT NULL DEFAULT '',
  condition_mode text NOT NULL DEFAULT 'all',
  condition_values text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT driver_app_action_settings_company_action_key UNIQUE (company_name, action_key)
);

ALTER TABLE public.dalia_contact_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_app_company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_app_action_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage dalia contact settings" ON public.dalia_contact_settings;
CREATE POLICY "Super admins manage dalia contact settings"
  ON public.dalia_contact_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins manage driver app company config" ON public.driver_app_company_config;
CREATE POLICY "Super admins manage driver app company config"
  ON public.driver_app_company_config
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users view own company driver app config" ON public.driver_app_company_config;
CREATE POLICY "Users view own company driver app config"
  ON public.driver_app_company_config
  FOR SELECT
  TO authenticated
  USING (
    company_name = get_user_company(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Super admins manage driver app action settings" ON public.driver_app_action_settings;
CREATE POLICY "Super admins manage driver app action settings"
  ON public.driver_app_action_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users view own company driver app action settings" ON public.driver_app_action_settings;
CREATE POLICY "Users view own company driver app action settings"
  ON public.driver_app_action_settings
  FOR SELECT
  TO authenticated
  USING (
    company_name = get_user_company(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

INSERT INTO public.dalia_contact_settings (id, email, whatsapp)
VALUES ('global', '', '')
ON CONFLICT (id) DO NOTHING;

-- 2. Contact / notification columns
ALTER TABLE public.dalia_contact_settings
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

ALTER TABLE public.driver_app_company_config
  ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_whatsapp text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_timeout_minutes integer NOT NULL DEFAULT 10;

ALTER TABLE public.driver_app_action_settings
  ADD COLUMN IF NOT EXISTS email_to_company_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_to_fleet_managers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_to_company_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_to_fleet_managers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_to_company_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_to_dalia boolean NOT NULL DEFAULT false;

-- 3. Emergency SLA columns (emergency_logs only)
ALTER TABLE public.emergency_logs
  ADD COLUMN IF NOT EXISTS sla_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_dispatched_at timestamptz;

-- 4. Odometer history columns (additive on existing vehicle_history)
ALTER TABLE public.vehicle_history
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid NULL,
  ADD COLUMN IF NOT EXISTS driver_name text;

CREATE INDEX IF NOT EXISTS idx_vehicle_history_driver_assignment
  ON public.vehicle_history (vehicle_id, assigned_driver_id, event_date DESC)
  WHERE event_type = 'driver_assignment';

CREATE INDEX IF NOT EXISTS idx_vehicle_history_odometer_vehicle
  ON public.vehicle_history (vehicle_id, event_date DESC)
  WHERE event_type = 'odometer';

-- Drivers may read odometer history for their assigned vehicle.
DROP POLICY IF EXISTS "Drivers read own vehicle odometer history" ON public.vehicle_history;
CREATE POLICY "Drivers read own vehicle odometer history"
  ON public.vehicle_history
  FOR SELECT
  TO authenticated
  USING (
    event_type = 'odometer'
    AND (
      assigned_driver_id = auth.uid()
      OR vehicle_id IN (SELECT v.id FROM public.vehicles v WHERE v.assigned_driver_id = auth.uid())
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        has_role(auth.uid(), 'fleet_manager'::app_role)
        AND company_name = get_user_company(auth.uid())
      )
    )
  );

-- 5. Odometer RPC — updates vehicles.odometer only as designed (cannot decrease).
-- Does not replace log_vehicle_changes. Sets a skip GUC in case a future/existing
-- trigger honors it; duplicate history rows are avoided by writing history here.
CREATE OR REPLACE FUNCTION public.report_driver_odometer(p_vehicle_id uuid, p_odometer integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vehicles%ROWTYPE;
  v_hist_id uuid;
  v_name text;
BEGIN
  IF p_odometer IS NULL OR p_odometer < 0 THEN
    RAISE EXCEPTION 'invalid odometer';
  END IF;

  SELECT * INTO v_row FROM public.vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vehicle not found';
  END IF;

  IF NOT (
    v_row.assigned_driver_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (public.has_role(auth.uid(), 'fleet_manager'::app_role)
        AND v_row.company_name = public.get_user_company(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not allowed to report odometer for this vehicle';
  END IF;

  IF v_row.odometer IS NOT NULL AND p_odometer < v_row.odometer THEN
    RAISE EXCEPTION 'odometer cannot decrease';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

  PERFORM set_config('app.skip_odometer_history', '1', true);

  INSERT INTO public.vehicle_history (
    vehicle_id, company_name, event_type, event_date, title, description,
    odometer, source, created_by, assigned_driver_id, driver_name
  ) VALUES (
    v_row.id,
    COALESCE(v_row.company_name, ''),
    'odometer',
    now(),
    'דיווח קילומטראז׳ נהג',
    'נהג ' || COALESCE(v_name, '') || ' דיווח ' || p_odometer::text || ' ק"מ לרכב ' || COALESCE(v_row.license_plate, ''),
    p_odometer,
    'driver_report',
    auth.uid(),
    COALESCE(v_row.assigned_driver_id, auth.uid()),
    COALESCE(v_name, '')
  )
  RETURNING id INTO v_hist_id;

  UPDATE public.vehicles
     SET odometer = p_odometer, updated_at = now()
   WHERE id = v_row.id;

  RETURN v_hist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_driver_odometer(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_driver_odometer(uuid, integer) TO authenticated;

-- 6. In-app helper used by emergency SLA + notify-driver-event (new names only).
CREATE OR REPLACE FUNCTION public.driver_action_in_app_targets(p_company text, p_action_key text)
RETURNS TABLE(target text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.driver_app_action_settings%ROWTYPE;
  cfg public.driver_app_company_config%ROWTYPE;
BEGIN
  SELECT * INTO s
    FROM public.driver_app_action_settings
   WHERE company_name = p_company AND action_key = p_action_key;

  SELECT * INTO cfg
    FROM public.driver_app_company_config
   WHERE company_name = p_company;

  IF s.id IS NULL THEN
    -- Unconfigured company: do not add extra in-app on top of existing fault triggers.
    -- Emergency/expenses have no legacy in-app — notify fleet managers.
    IF p_action_key IN ('emergency', 'expenses') THEN
      target := 'fleet_managers';
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  IF COALESCE(s.in_app_enabled, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  IF s.in_app_to_fleet_managers THEN
    target := 'fleet_managers';
    RETURN NEXT;
  END IF;
  IF s.in_app_to_company_contact THEN
    target := 'company_contact';
    RETURN NEXT;
  END IF;
  IF s.in_app_to_dalia AND COALESCE(cfg.dalia_service_enabled, false) THEN
    target := 'dalia';
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_in_app_for_driver_event(
  p_company text,
  p_action_key text,
  p_title text,
  p_message text,
  p_link text,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT target FROM public.driver_action_in_app_targets(p_company, p_action_key)
  LOOP
    IF t = 'fleet_managers' THEN
      INSERT INTO public.driver_notifications (user_id, type, title, message, link)
      SELECT ur.user_id, p_action_key, p_title, p_message, p_link
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'fleet_manager'
        AND p.company_name = p_company
        AND ur.user_id IS DISTINCT FROM COALESCE(p_created_by, '00000000-0000-0000-0000-000000000000'::uuid);
    ELSIF t = 'dalia' THEN
      INSERT INTO public.driver_notifications (user_id, type, title, message, link)
      SELECT ur.user_id, p_action_key, p_title, p_message, p_link
      FROM public.user_roles ur
      WHERE ur.role = 'super_admin'
        AND ur.user_id IS DISTINCT FROM COALESCE(p_created_by, '00000000-0000-0000-0000-000000000000'::uuid);
    END IF;
  END LOOP;
END;
$$;

-- 7. Emergency SLA on emergency_logs only (no service_orders insert).
CREATE OR REPLACE FUNCTION public.on_emergency_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer;
BEGIN
  SELECT COALESCE(emergency_timeout_minutes, 10) INTO v_minutes
    FROM public.driver_app_company_config
   WHERE company_name = NEW.company_name;

  IF NEW.sla_deadline_at IS NULL THEN
    NEW.sla_deadline_at := now() + make_interval(mins => COALESCE(v_minutes, 10));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emergency_log_before_insert ON public.emergency_logs;
CREATE TRIGGER trg_emergency_log_before_insert
BEFORE INSERT ON public.emergency_logs
FOR EACH ROW
EXECUTE FUNCTION public.on_emergency_log_insert();

CREATE OR REPLACE FUNCTION public.on_emergency_log_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_in_app_for_driver_event(
    NEW.company_name,
    'emergency',
    '🚨 בקשת חירום',
    COALESCE(NEW.user_name, '') || ' פתח בקשת חירום: ' || COALESCE(NEW.category_label, '') ||
    CASE WHEN COALESCE(NEW.vehicle_plate, '') <> '' THEN ' • רכב ' || NEW.vehicle_plate ELSE '' END,
    '/emergency-settings',
    NEW.user_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emergency_log_after_insert ON public.emergency_logs;
CREATE TRIGGER trg_emergency_log_after_insert
AFTER INSERT ON public.emergency_logs
FOR EACH ROW
EXECUTE FUNCTION public.on_emergency_log_after_insert();

CREATE OR REPLACE FUNCTION public.process_driver_emergency_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.emergency_logs%ROWTYPE;
  n integer := 0;
  v_phone text;
BEGIN
  FOR rec IN
    SELECT * FROM public.emergency_logs
     WHERE status = 'open'
       AND escalated_at IS NULL
       AND sla_deadline_at IS NOT NULL
       AND sla_deadline_at <= now()
  LOOP
    UPDATE public.emergency_logs
       SET escalated_at = now()
     WHERE id = rec.id;

    SELECT COALESCE(NULLIF(cfg.emergency_phone, ''), NULLIF(d.phone, ''))
      INTO v_phone
      FROM (SELECT rec.company_name AS company_name) x
      LEFT JOIN public.driver_app_company_config cfg ON cfg.company_name = rec.company_name
      LEFT JOIN public.dalia_contact_settings d ON d.id = 'global';

    PERFORM public.notify_in_app_for_driver_event(
      rec.company_name,
      'emergency',
      '⚠️ חירום ללא מענה',
      'בקשת החירום של ' || COALESCE(rec.user_name, '') || ' לא טופלה בזמן. מספר חירום: ' || COALESCE(v_phone, 'לא הוגדר'),
      '/emergency-settings',
      rec.user_id
    );

    INSERT INTO public.driver_notifications (user_id, type, title, message, link)
    VALUES (
      rec.user_id,
      'emergency_escalated',
      'אין מענה — חייג למוקד',
      'בקשת החירום שלך ממתינה. חייג עכשיו: ' || COALESCE(v_phone, 'מספר לא הוגדר בהגדרות'),
      '/emergency'
    );

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.process_driver_emergency_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_driver_emergency_jobs() TO authenticated;

DO $$
BEGIN
  PERFORM cron.schedule(
    'driver-emergency-sla',
    '* * * * *',
    'SELECT public.process_driver_emergency_jobs();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — SLA still runs via notify-driver-event check_sla';
END $$;
