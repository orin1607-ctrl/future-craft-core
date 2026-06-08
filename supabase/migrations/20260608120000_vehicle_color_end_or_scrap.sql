-- dalia-staging ONLY — requires explicit approval before running.
-- Adds columns referenced by Dalia form persist layer.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS end_or_scrap_date date;

COMMENT ON COLUMN public.vehicles.vehicle_color IS 'Dalia form: vehicle_color';
COMMENT ON COLUMN public.vehicles.end_or_scrap_date IS 'Dalia form: end_or_scrap_date';
