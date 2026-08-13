-- Staging only: per-company VISIBILITY toggles for vehicle dashboard attention labels (display only).
-- Independent from show_*_attention_red (color). Default true = no behavior change for existing companies.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS show_insurance_attention boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_gaps_attention boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.company_settings.show_insurance_attention IS
  'When false: hide "יש לטפל" label on insurance/licenses tile for this company vehicles only; data/gaps unchanged';

COMMENT ON COLUMN public.company_settings.show_gaps_attention IS
  'When false: hide "דורש טיפול" label on gaps/alerts tile for this company vehicles only; data/gaps unchanged';
