-- Staging: fleet managers can insert/update own company_settings (lists + existing settings rows).

DROP POLICY IF EXISTS "Fleet managers manage own company settings" ON public.company_settings;

CREATE POLICY "Fleet managers manage own company settings"
ON public.company_settings
FOR ALL
TO authenticated
USING (
  company_name = get_user_company(auth.uid())
  AND (
    has_role(auth.uid(), 'fleet_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  company_name = get_user_company(auth.uid())
  AND (
    has_role(auth.uid(), 'fleet_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);
