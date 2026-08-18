-- Staging only (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Durable guard: token RPCs remain the public sign path.
-- Never recreate USING(true) anon policies on declarations/exams.

DROP POLICY IF EXISTS "Anonymous can view by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anonymous can update by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anon view exam by token" ON public.driving_exams;
DROP POLICY IF EXISTS "Anon submit exam by token" ON public.driving_exams;
DROP POLICY IF EXISTS "Anonymous can view declaration signatures" ON storage.objects;
