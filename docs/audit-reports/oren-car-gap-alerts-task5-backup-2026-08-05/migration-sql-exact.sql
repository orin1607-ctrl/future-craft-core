-- Staging: per-company template for vehicle dashboard "חוסרים והתראות" rows (display only).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS custom_gap_alerts_config jsonb DEFAULT NULL;

COMMENT ON COLUMN public.company_settings.custom_gap_alerts_config IS
  'Per-company gap/alert row template (visibility, order, display labels); NULL = system defaults';
