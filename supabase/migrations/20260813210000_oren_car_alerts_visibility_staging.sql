-- Oren Car Staging ONLY — additive SELECT policies (no columns, no deletes).
-- Rollback:
--   DROP POLICY IF EXISTS "Company members can view company custom alerts" ON public.custom_alerts;
--   DROP POLICY IF EXISTS "Users can view inspections of company vehicles" ON public.vehicle_inspections;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_alerts'
      AND policyname = 'Company members can view company custom alerts'
  ) THEN
    CREATE POLICY "Company members can view company custom alerts"
    ON public.custom_alerts
    FOR SELECT
    TO authenticated
    USING (
      company_name IS NOT NULL
      AND length(btrim(company_name)) > 0
      AND company_name = public.get_user_company(auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_inspections'
      AND policyname = 'Users can view inspections of company vehicles'
  ) THEN
    CREATE POLICY "Users can view inspections of company vehicles"
    ON public.vehicle_inspections
    FOR SELECT
    TO authenticated
    USING (
      vehicle_id IN (
        SELECT id FROM public.vehicles
        WHERE company_name = public.get_user_company(auth.uid())
      )
    );
  END IF;
END $$;
