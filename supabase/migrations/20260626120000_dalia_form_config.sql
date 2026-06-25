-- Dalia form configuration (required fields, future form flags) — dalia-staging
CREATE TABLE IF NOT EXISTS public.dalia_form_config (
  config_key text PRIMARY KEY,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.dalia_form_config IS 'Global form configuration — required field overrides, extensible keys';

ALTER TABLE public.dalia_form_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dalia_form_config_select_authenticated" ON public.dalia_form_config;
CREATE POLICY "dalia_form_config_select_authenticated"
  ON public.dalia_form_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "dalia_form_config_super_admin_write" ON public.dalia_form_config;
CREATE POLICY "dalia_form_config_super_admin_write"
  ON public.dalia_form_config FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Seed: comprehensive + third-party insurance fields optional (no overrides = schema defaults)
