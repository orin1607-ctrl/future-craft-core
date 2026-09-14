-- Rollback for 20260913220000_prod_driver_area_only.sql
-- Run ONLY to restore Production DB to the pre-driver-area state.
-- Does not touch claims_*, vehicles rows, or existing notify_managers_on_* functions.

DO $$
BEGIN
  PERFORM cron.unschedule('driver-emergency-sla');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.unschedule skipped';
END $$;

DROP TRIGGER IF EXISTS trg_emergency_log_after_insert ON public.emergency_logs;
DROP TRIGGER IF EXISTS trg_emergency_log_before_insert ON public.emergency_logs;

DROP FUNCTION IF EXISTS public.process_driver_emergency_jobs();
DROP FUNCTION IF EXISTS public.on_emergency_log_after_insert();
DROP FUNCTION IF EXISTS public.on_emergency_log_insert();
DROP FUNCTION IF EXISTS public.notify_in_app_for_driver_event(text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.driver_action_in_app_targets(text, text);
DROP FUNCTION IF EXISTS public.report_driver_odometer(uuid, integer);

DROP POLICY IF EXISTS "Drivers read own vehicle odometer history" ON public.vehicle_history;

ALTER TABLE public.emergency_logs
  DROP COLUMN IF EXISTS sla_deadline_at,
  DROP COLUMN IF EXISTS escalated_at,
  DROP COLUMN IF EXISTS notify_dispatched_at;

ALTER TABLE public.vehicle_history
  DROP COLUMN IF EXISTS assigned_driver_id,
  DROP COLUMN IF EXISTS driver_name;

DROP INDEX IF EXISTS public.idx_vehicle_history_driver_assignment;
DROP INDEX IF EXISTS public.idx_vehicle_history_odometer_vehicle;

DROP TABLE IF EXISTS public.driver_app_action_settings;
DROP TABLE IF EXISTS public.driver_app_company_config;
DROP TABLE IF EXISTS public.dalia_contact_settings;
