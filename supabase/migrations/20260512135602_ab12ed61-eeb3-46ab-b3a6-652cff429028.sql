
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS department text DEFAULT '',
  ADD COLUMN IF NOT EXISTS companion text DEFAULT '',
  ADD COLUMN IF NOT EXISTS route_group text DEFAULT '';

CREATE TABLE IF NOT EXISTS public.route_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  kind text NOT NULL,
  code text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own company route_options"
  ON public.route_options FOR SELECT TO authenticated
  USING ((company_name = get_user_company(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Managers manage route_options"
  ON public.route_options FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'fleet_manager'::app_role) AND company_name = get_user_company(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((has_role(auth.uid(), 'fleet_manager'::app_role) AND company_name = get_user_company(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));
