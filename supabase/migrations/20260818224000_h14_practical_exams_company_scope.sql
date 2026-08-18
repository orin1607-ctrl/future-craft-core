-- HIGH H14 Staging ONLY.
-- practical_driving_exams UPDATE/DELETE/INSERT were any fleet_manager, any company.
-- Rollback: restore policies from 20260424085902.

DROP POLICY IF EXISTS "Managers create practical exams" ON public.practical_driving_exams;
DROP POLICY IF EXISTS "Managers update practical exams" ON public.practical_driving_exams;
DROP POLICY IF EXISTS "Managers delete practical exams" ON public.practical_driving_exams;

CREATE POLICY "Managers create practical exams"
ON public.practical_driving_exams FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'fleet_manager'::app_role)
    AND company_name = public.get_user_company(auth.uid())
  )
);

CREATE POLICY "Managers update practical exams"
ON public.practical_driving_exams FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'fleet_manager'::app_role)
    AND company_name = public.get_user_company(auth.uid())
  )
);

CREATE POLICY "Managers delete practical exams"
ON public.practical_driving_exams FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'fleet_manager'::app_role)
    AND company_name = public.get_user_company(auth.uid())
  )
);
