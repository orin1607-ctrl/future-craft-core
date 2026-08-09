-- Production schema only: insurance toggle columns (NO data UPDATE — preserve existing Production values)
-- Rollback: ALTER TABLE vehicles DROP COLUMN IF EXISTS insurance_alerts_red_enabled;
--           ALTER TABLE vehicles DROP COLUMN IF EXISTS insurance_alerts_enabled;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS insurance_alerts_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS insurance_alerts_red_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vehicles.insurance_alerts_enabled IS
  'When false: suppress insurance expiry/gap alerts for this vehicle only';

COMMENT ON COLUMN public.vehicles.insurance_alerts_red_enabled IS
  'When false: insurance alerts remain active but without red/destructive styling';
