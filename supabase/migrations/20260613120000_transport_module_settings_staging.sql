-- Staging only: transport module feature toggles (additive, no data loss)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS module_transport_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS transport_hidden_features text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.company_settings.module_transport_enabled IS 'Master switch: show transport module hub and dashboard card';
COMMENT ON COLUMN public.company_settings.transport_hidden_features IS 'Transport feature IDs to hide when module is enabled';
