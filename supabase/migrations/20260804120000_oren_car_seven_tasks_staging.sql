-- Oren Car staging: department on drivers, per-company list templates, document metadata fields.
-- Rollback:
--   ALTER TABLE public.drivers DROP COLUMN IF EXISTS department;
--   ALTER TABLE public.company_settings DROP COLUMN IF EXISTS custom_treatment_items, DROP COLUMN IF EXISTS custom_inspection_checklist;
--   ALTER TABLE public.document_metadata DROP COLUMN IF EXISTS document_date, DROP COLUMN IF EXISTS display_name;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS department text;

COMMENT ON COLUMN public.drivers.department IS 'Optional department label; same vocabulary as vehicles.department per company';

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS custom_treatment_items jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_inspection_checklist jsonb DEFAULT NULL;

COMMENT ON COLUMN public.company_settings.custom_treatment_items IS 'Per-company treatment subtype list; NULL = system defaults';
COMMENT ON COLUMN public.company_settings.custom_inspection_checklist IS 'Per-company tri/semi inspection checklist; NULL = system defaults';

ALTER TABLE public.document_metadata
  ADD COLUMN IF NOT EXISTS document_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS display_name text DEFAULT NULL;

COMMENT ON COLUMN public.document_metadata.document_date IS 'User-entered document entry date';
COMMENT ON COLUMN public.document_metadata.display_name IS 'User-entered document display name';
