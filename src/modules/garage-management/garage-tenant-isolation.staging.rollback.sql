-- Rollback for garage tenant isolation on STAGING usfeoerkpcafxxlyuldl only.
-- Surgical. No DELETE of rows. Leaves shop_company_name columns in place.
-- Restores garage_is_staff-only policies. Does not change garage_is_staff().
-- Production / qasomfndnjuixgjmjwcm / dalia-car.online: FORBIDDEN.

BEGIN;

DROP TRIGGER IF EXISTS garage_customers_apply_shop ON public.garage_customers;
DROP TRIGGER IF EXISTS garage_vehicles_apply_shop ON public.garage_vehicles;
DROP TRIGGER IF EXISTS garage_cases_apply_shop ON public.garage_cases;
DROP TRIGGER IF EXISTS garage_customers_force_shop ON public.garage_customers;
DROP TRIGGER IF EXISTS garage_vehicles_force_shop ON public.garage_vehicles;
DROP TRIGGER IF EXISTS garage_cases_force_shop ON public.garage_cases;

ALTER TABLE public.garage_cases DROP CONSTRAINT IF EXISTS garage_cases_vehicle_shop_fkey;
ALTER TABLE public.garage_cases DROP CONSTRAINT IF EXISTS garage_cases_customer_shop_fkey;
ALTER TABLE public.garage_vehicles DROP CONSTRAINT IF EXISTS garage_vehicles_customer_shop_fkey;
ALTER TABLE public.garage_vehicles DROP CONSTRAINT IF EXISTS garage_vehicles_id_shop_unique;
ALTER TABLE public.garage_customers DROP CONSTRAINT IF EXISTS garage_customers_id_shop_unique;

DROP FUNCTION IF EXISTS public.garage_apply_shop_tenant();
DROP FUNCTION IF EXISTS public.garage_force_shop_company();
DROP FUNCTION IF EXISTS public.garage_shop_visible(text);

DROP POLICY IF EXISTS garage_customers_select_shop ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_insert_shop ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_update_shop ON public.garage_customers;
DROP POLICY IF EXISTS garage_vehicles_select_shop ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_insert_shop ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_update_shop ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_cases_select_shop ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_insert_shop ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_update_shop ON public.garage_cases;
DROP POLICY IF EXISTS garage_media_select_shop ON public.garage_media;
DROP POLICY IF EXISTS garage_media_insert_shop ON public.garage_media;
DROP POLICY IF EXISTS garage_media_storage_select ON storage.objects;
DROP POLICY IF EXISTS garage_media_storage_insert ON storage.objects;

CREATE POLICY garage_customers_select_super_admin
  ON public.garage_customers FOR SELECT TO authenticated
  USING (public.garage_is_staff(auth.uid()));
CREATE POLICY garage_customers_insert_super_admin
  ON public.garage_customers FOR INSERT TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));
CREATE POLICY garage_customers_update_super_admin
  ON public.garage_customers FOR UPDATE TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_vehicles_select_super_admin
  ON public.garage_vehicles FOR SELECT TO authenticated
  USING (public.garage_is_staff(auth.uid()));
CREATE POLICY garage_vehicles_insert_super_admin
  ON public.garage_vehicles FOR INSERT TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));
CREATE POLICY garage_vehicles_update_super_admin
  ON public.garage_vehicles FOR UPDATE TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_cases_select_super_admin
  ON public.garage_cases FOR SELECT TO authenticated
  USING (public.garage_is_staff(auth.uid()));
CREATE POLICY garage_cases_insert_super_admin
  ON public.garage_cases FOR INSERT TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()) AND opened_by = auth.uid());
CREATE POLICY garage_cases_update_super_admin
  ON public.garage_cases FOR UPDATE TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_media_select_super_admin
  ON public.garage_media FOR SELECT TO authenticated
  USING (public.garage_is_staff(auth.uid()));
CREATE POLICY garage_media_insert_super_admin
  ON public.garage_media FOR INSERT TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_media_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'garage-media' AND public.garage_is_staff(auth.uid()));
CREATE POLICY garage_media_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'garage-media' AND public.garage_is_staff(auth.uid()));

COMMIT;
