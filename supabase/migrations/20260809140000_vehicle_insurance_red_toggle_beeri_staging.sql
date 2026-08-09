-- Staging: per-vehicle insurance red highlight + Beeri defaults (alerts ON, red OFF)
-- Rollback: ALTER TABLE vehicles DROP COLUMN IF EXISTS insurance_alerts_red_enabled;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS insurance_alerts_red_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vehicles.insurance_alerts_red_enabled IS
  'When false: insurance 30/7/1 alerts remain active but without red/destructive styling';

-- קיבוץ בארי: התראות ביטוח ON, הדגשה אדומה OFF (מצב התחלתי בלבד)
UPDATE public.vehicles
SET
  insurance_alerts_enabled = true,
  insurance_alerts_red_enabled = false
WHERE company_name = 'קיבוץ בארי';
