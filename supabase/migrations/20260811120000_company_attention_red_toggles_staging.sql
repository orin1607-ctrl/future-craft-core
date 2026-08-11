-- Staging: per-company red display toggles for vehicle dashboard attention tiles (display only).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS show_insurance_attention_red boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_gaps_attention_red boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.company_settings.show_insurance_attention_red IS
  'When false: hide red styling on "יש לטפל" insurance/licenses tile for all company vehicles; data unchanged';

COMMENT ON COLUMN public.company_settings.show_gaps_attention_red IS
  'When false: hide red styling on "דורש טיפול" gaps/alerts tile for all company vehicles; data unchanged';
