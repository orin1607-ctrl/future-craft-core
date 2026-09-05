-- Driver app + notification control center (staging/dev only via guarded workflow).
-- Additive: does not alter user_roles, profiles, company_settings WhatsApp,
-- emergency_categories, notify functions, or company_subscriptions.

CREATE TABLE IF NOT EXISTS public.dalia_contact_settings (
  id text PRIMARY KEY DEFAULT 'global',
  email text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

CREATE TABLE IF NOT EXISTS public.driver_app_company_config (
  company_name text PRIMARY KEY,
  dalia_service_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

CREATE TABLE IF NOT EXISTS public.driver_app_action_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  action_key text NOT NULL,
  visible_to_driver boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  email_to_fleet_managers boolean NOT NULL DEFAULT false,
  email_to_dalia boolean NOT NULL DEFAULT false,
  email_extra text NOT NULL DEFAULT '',
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  whatsapp_to_dalia boolean NOT NULL DEFAULT false,
  whatsapp_extra text NOT NULL DEFAULT '',
  condition_mode text NOT NULL DEFAULT 'all',
  condition_values text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT driver_app_action_settings_company_action_key UNIQUE (company_name, action_key)
);

ALTER TABLE public.dalia_contact_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_app_company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_app_action_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage dalia contact settings" ON public.dalia_contact_settings;
CREATE POLICY "Super admins manage dalia contact settings"
  ON public.dalia_contact_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins manage driver app company config" ON public.driver_app_company_config;
CREATE POLICY "Super admins manage driver app company config"
  ON public.driver_app_company_config
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users view own company driver app config" ON public.driver_app_company_config;
CREATE POLICY "Users view own company driver app config"
  ON public.driver_app_company_config
  FOR SELECT
  TO authenticated
  USING (
    company_name = get_user_company(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Super admins manage driver app action settings" ON public.driver_app_action_settings;
CREATE POLICY "Super admins manage driver app action settings"
  ON public.driver_app_action_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users view own company driver app action settings" ON public.driver_app_action_settings;
CREATE POLICY "Users view own company driver app action settings"
  ON public.driver_app_action_settings
  FOR SELECT
  TO authenticated
  USING (
    company_name = get_user_company(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

INSERT INTO public.dalia_contact_settings (id, email, whatsapp)
VALUES ('global', '', '')
ON CONFLICT (id) DO NOTHING;
