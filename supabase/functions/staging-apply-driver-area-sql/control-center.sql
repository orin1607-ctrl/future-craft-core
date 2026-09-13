-- Additive expansion of the driver-app control center (staging/dev only).
-- Does not alter user_roles, profiles, company_settings.whatsapp_phone,
-- emergency_categories, notify functions, vehicles.odometer, or Production.

ALTER TABLE public.driver_app_company_config
  ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_whatsapp text NOT NULL DEFAULT '';

ALTER TABLE public.driver_app_action_settings
  ADD COLUMN IF NOT EXISTS email_to_company_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_to_fleet_managers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_to_company_contact boolean NOT NULL DEFAULT false;

-- Extend existing vehicle_history rather than creating a second assignment log.
ALTER TABLE public.vehicle_history
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_history_driver_assignment
  ON public.vehicle_history (vehicle_id, assigned_driver_id, event_date DESC)
  WHERE event_type = 'driver_assignment';
