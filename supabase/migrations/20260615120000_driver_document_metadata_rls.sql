-- Staging: allow drivers to register document_metadata for allowed uploads only.
-- Also restrict driver SELECT to own vehicle/driver docs (not all company docs).

CREATE OR REPLACE FUNCTION public.driver_profile_names(_user_id uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name
  FROM public.profiles p
  WHERE p.id = _user_id
    AND NULLIF(trim(p.full_name), '') IS NOT NULL
  UNION
  SELECT d.full_name
  FROM public.drivers d
  INNER JOIN auth.users u ON lower(u.email) = lower(d.email)
  WHERE u.id = _user_id
    AND NULLIF(trim(d.full_name), '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.driver_assigned_plates(_user_id uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT regexp_replace(v.license_plate, '[\s-]', '', 'g')
  FROM public.vehicles v
  WHERE v.assigned_driver_id = _user_id
    AND NULLIF(trim(v.license_plate), '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.driver_may_register_document_metadata(
  _category text,
  _driver_name text,
  _vehicle_plate text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _category IN ('driver-license', 'health', 'contracts', 'other') THEN
      COALESCE(NULLIF(trim(_driver_name), ''), (SELECT full_name FROM public.profiles WHERE id = _user_id))
        IN (SELECT public.driver_profile_names(_user_id))
    WHEN _category IN ('vehicle-license', 'insurance', 'comprehensive', 'test') THEN
      regexp_replace(COALESCE(NULLIF(trim(_vehicle_plate), ''), ''), '[\s-]', '', 'g')
        IN (SELECT public.driver_assigned_plates(_user_id))
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.driver_can_view_document_metadata(
  _driver_name text,
  _vehicle_plate text,
  _uploaded_by uuid,
  _category text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _category IN ('driver-license', 'health', 'contracts', 'other') THEN
      NULLIF(trim(_driver_name), '') IS NOT NULL
      AND _driver_name IN (SELECT public.driver_profile_names(_user_id))
    WHEN _category IN ('vehicle-license', 'insurance', 'comprehensive', 'test') THEN
      NULLIF(trim(_vehicle_plate), '') IS NOT NULL
      AND regexp_replace(_vehicle_plate, '[\s-]', '', 'g')
        IN (SELECT public.driver_assigned_plates(_user_id))
    ELSE false
  END;
$$;

-- Storage: uid-scoped upload/read (idempotent; may already exist from manual apply)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can upload to own uid folder'
  ) THEN
    CREATE POLICY "Users can upload to own uid folder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'documents'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can view own uid folder'
  ) THEN
    CREATE POLICY "Users can view own uid folder"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'documents'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = get_user_company(auth.uid())
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
    );
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can view docs metadata" ON public.document_metadata;

CREATE POLICY "Users can view docs metadata"
ON public.document_metadata FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    company_name = get_user_company(auth.uid())
    AND NOT has_role(auth.uid(), 'driver'::app_role)
  )
  OR (
    has_role(auth.uid(), 'driver'::app_role)
    AND company_name = get_user_company(auth.uid())
    AND public.driver_can_view_document_metadata(
      driver_name, vehicle_plate, uploaded_by, category, auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Company users can insert docs metadata" ON public.document_metadata;

CREATE POLICY "Company users can insert docs metadata"
ON public.document_metadata FOR INSERT TO authenticated
WITH CHECK (
  (
    company_name = get_user_company(auth.uid())
    AND NOT has_role(auth.uid(), 'driver'::app_role)
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Drivers can insert own document metadata" ON public.document_metadata;

CREATE POLICY "Drivers can insert own document metadata"
ON public.document_metadata FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'driver'::app_role)
  AND company_name = get_user_company(auth.uid())
  AND uploaded_by = auth.uid()
  AND public.driver_may_register_document_metadata(
    category, driver_name, vehicle_plate, auth.uid()
  )
);
