
CREATE TABLE IF NOT EXISTS public.vehicle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  company_name text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'note',
  event_date timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  odometer integer,
  cost numeric,
  source text DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_history_vehicle ON public.vehicle_history(vehicle_id, event_date DESC);

ALTER TABLE public.vehicle_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own company vehicle history"
ON public.vehicle_history FOR SELECT TO authenticated
USING ((company_name = get_user_company(auth.uid())) OR has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "Authenticated can insert vehicle history"
ON public.vehicle_history FOR INSERT TO authenticated
WITH CHECK ((company_name = get_user_company(auth.uid())) OR has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "Managers can manage vehicle history"
ON public.vehicle_history FOR ALL TO authenticated
USING ((has_role(auth.uid(),'fleet_manager'::app_role) AND company_name = get_user_company(auth.uid())) OR has_role(auth.uid(),'super_admin'::app_role))
WITH CHECK ((has_role(auth.uid(),'fleet_manager'::app_role) AND company_name = get_user_company(auth.uid())) OR has_role(auth.uid(),'super_admin'::app_role));
