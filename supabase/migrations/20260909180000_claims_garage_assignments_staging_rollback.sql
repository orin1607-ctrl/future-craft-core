-- Staging ONLY rollback for claims_garage_assignments. Never Production.

DROP POLICY IF EXISTS claims_garage_assignments_staff ON public.claims_garage_assignments;
DROP TABLE IF EXISTS public.claims_garage_assignments;
