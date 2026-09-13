-- Additive driver-area settings (Staging/dev). Does not drop tables, columns,
-- or policies. Does not touch claims_* or production-only objects.

-- 1. Contact fields: Dalia global + per-company
ALTER TABLE public.dalia_contact_settings
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

ALTER TABLE public.driver_app_company_config
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_timeout_minutes integer NOT NULL DEFAULT 10;

ALTER TABLE public.driver_app_action_settings
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_to_fleet_managers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_to_company_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_app_to_dalia boolean NOT NULL DEFAULT false;

-- Existing saved rows had no in-app flags; keep today's in-app-to-fleet behaviour.
UPDATE public.driver_app_action_settings
SET in_app_enabled = true,
    in_app_to_fleet_managers = true
WHERE action_key IN ('fault', 'accident', 'service_order', 'emergency', 'expenses')
  AND COALESCE(in_app_enabled, false) = false
  AND COALESCE(in_app_to_fleet_managers, false) = false
  AND COALESCE(in_app_to_company_contact, false) = false
  AND COALESCE(in_app_to_dalia, false) = false;

-- 2. Emergency SLA (server-side, not only the driver screen)
ALTER TABLE public.emergency_logs
  ADD COLUMN IF NOT EXISTS sla_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_dispatched_at timestamptz;

-- 3. Odometer history: reuse vehicle_history, add driver_name for reports
ALTER TABLE public.vehicle_history
  ADD COLUMN IF NOT EXISTS driver_name text;

-- Skip the generic odometer trigger when the driver RPC writes the history row.
CREATE OR REPLACE FUNCTION public.log_vehicle_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  drv_old TEXT;
  drv_new TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.vehicle_history (vehicle_id, company_name, event_type, event_date, title, description, source)
    VALUES (NEW.id, COALESCE(NEW.company_name, ''), 'status_change', now(),
            'שינוי סטטוס רכב',
            'מ-' || COALESCE(OLD.status, '—') || ' ל-' || COALESCE(NEW.status, '—'),
            'system');
  END IF;

  IF NEW.odometer IS DISTINCT FROM OLD.odometer AND NEW.odometer IS NOT NULL
     AND COALESCE(current_setting('app.skip_odometer_history', true), '') IS DISTINCT FROM '1' THEN
    INSERT INTO public.vehicle_history (vehicle_id, company_name, event_type, event_date, title, description, odometer, source)
    VALUES (NEW.id, COALESCE(NEW.company_name, ''), 'odometer', now(),
            'עדכון קילומטראז׳',
            'מ-' || COALESCE(OLD.odometer::text, '—') || ' ל-' || NEW.odometer::text,
            NEW.odometer, 'system');
  END IF;

  IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    SELECT full_name INTO drv_old FROM public.drivers WHERE id = OLD.assigned_driver_id;
    SELECT full_name INTO drv_new FROM public.drivers WHERE id = NEW.assigned_driver_id;
    INSERT INTO public.vehicle_history (vehicle_id, company_name, event_type, event_date, title, description, source)
    VALUES (NEW.id, COALESCE(NEW.company_name, ''), 'driver_assignment', now(),
            'שיוך נהג',
            'מ-' || COALESCE(drv_old, '—') || ' ל-' || COALESCE(drv_new, '—'),
            'system');
  END IF;

  RETURN NEW;
END;
$$;

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

-- 4. In-app routing helper (legacy default: fleet managers ON when no row saved)
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
    -- No saved row: keep today's behaviour (notify fleet managers).
    target := 'fleet_managers';
    RETURN NEXT;
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
    -- company_contact in-app is resolved in notify-driver-event (email lives in auth.users, not profiles).
  END LOOP;
END;
$$;

-- Honor saved in-app flags while keeping legacy behaviour when no row exists.
CREATE OR REPLACE FUNCTION public.notify_managers_on_fault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := CASE WHEN NEW.urgency IN ('urgent', 'critical') THEN 'fault_urgent' ELSE 'fault' END;
  PERFORM public.notify_in_app_for_driver_event(
    NEW.company_name,
    v_key,
    CASE WHEN v_key = 'fault_urgent' THEN 'תקלה דחופה דווחה' ELSE 'תקלה חדשה דווחה' END,
    'נהג ' || COALESCE(NEW.driver_name, '') || ' דיווח תקלה ברכב ' || COALESCE(NEW.vehicle_plate, '') || ': ' || COALESCE(NEW.description, ''),
    '/faults',
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_managers_on_accident()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_in_app_for_driver_event(
    NEW.company_name,
    'accident',
    '🚨 תאונה חדשה דווחה',
    'נהג ' || COALESCE(NEW.driver_name, '') || ' דיווח תאונה ברכב ' || COALESCE(NEW.vehicle_plate, '') || ': ' || COALESCE(NEW.description, ''),
    '/accidents',
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_managers_on_service_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_in_app_for_driver_event(
    NEW.company_name,
    'service_order',
    CASE WHEN NEW.urgency IN ('critical', 'urgent') THEN '🚨 הזמנת שירות דחופה' ELSE '🔧 הזמנת שירות חדשה' END,
    'הזמנת שירות חדשה לרכב ' || COALESCE(NEW.vehicle_plate, '') ||
    CASE WHEN NEW.towing_requested = true THEN ' (נדרש שינוע)' ELSE '' END ||
    ': ' || COALESCE(NEW.description, ''),
    '/service-orders',
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

-- Emergency insert: deadline + in-app, independent of the driver staying on the page.
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

-- Server-side SLA: mark overdue open emergencies even if the driver closed the app.
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

    -- Also notify the driver so the next app open shows the fallback number.
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
  RAISE NOTICE 'pg_cron not available on this project — SLA still runs via notify-driver-event check_sla';
END $$;
