-- Staging only: per-vehicle insurance alert toggle + Beeri defaults (insurance off)
-- Rollback: ALTER TABLE vehicles DROP COLUMN IF EXISTS insurance_alerts_enabled;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS insurance_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vehicles.insurance_alerts_enabled IS
  'When false: suppress insurance expiry/gap alerts and red marks for this vehicle only; docs/dates unchanged';

-- קיבוץ בארי בלבד: all existing vehicles start with insurance alerts OFF (manager enables per vehicle)
UPDATE public.vehicles
SET insurance_alerts_enabled = false
WHERE company_name = 'קיבוץ בארי';

-- alert_days_before נשאר ללא שינוי (30 לבארי)
