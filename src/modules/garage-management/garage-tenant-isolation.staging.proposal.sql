-- ============================================================================
-- PROPOSAL ONLY — DO NOT RUN until the owner explicitly approves this gate.
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- Not a migration. Not applied. No DELETE. No Claims. No garage-gmail rewrite.
-- Does NOT change public.garage_is_staff (stays super_admin only) so
-- garage_gmail_* and other staff-only objects stay closed to fleet_manager.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.garage_is_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION 'חסר public.garage_is_staff(uuid). עוצרים.';
  END IF;
  IF to_regprocedure('public.get_user_company(uuid)') IS NULL THEN
    RAISE EXCEPTION 'חסר public.get_user_company(uuid). עוצרים. לא יוצרים תחליף.';
  END IF;
  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'חסר public.has_role. עוצרים.';
  END IF;
  IF to_regclass('public.garage_customers') IS NULL
     OR to_regclass('public.garage_vehicles') IS NULL
     OR to_regclass('public.garage_cases') IS NULL THEN
    RAISE EXCEPTION 'חסרות טבלאות ספר המוסך. עוצרים.';
  END IF;
END;
$$;

-- Tenant key = profiles.company_name (existing).
-- NOT garage_customers.company_name (that is the customer's legal/business name).
ALTER TABLE public.garage_customers
  ADD COLUMN IF NOT EXISTS shop_company_name text NOT NULL DEFAULT '';

ALTER TABLE public.garage_vehicles
  ADD COLUMN IF NOT EXISTS shop_company_name text NOT NULL DEFAULT '';

ALTER TABLE public.garage_cases
  ADD COLUMN IF NOT EXISTS shop_company_name text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.garage_customers.shop_company_name IS
  'Body-shop tenant. Same string as profiles.company_name / get_user_company(). Not the customer company_name.';
COMMENT ON COLUMN public.garage_vehicles.shop_company_name IS
  'Copied from garage_customers.shop_company_name. RLS tenant key.';
COMMENT ON COLUMN public.garage_cases.shop_company_name IS
  'Copied from garage_customers.shop_company_name. RLS tenant key.';

CREATE INDEX IF NOT EXISTS garage_customers_shop_company_name_idx
  ON public.garage_customers (shop_company_name);
CREATE INDEX IF NOT EXISTS garage_vehicles_shop_company_name_idx
  ON public.garage_vehicles (shop_company_name);
CREATE INDEX IF NOT EXISTS garage_cases_shop_company_name_idx
  ON public.garage_cases (shop_company_name);

-- Backfill from the opener's profile company. Empty stays empty (hidden from fleet_manager, visible to super_admin).
UPDATE public.garage_cases gc
SET shop_company_name = trim(coalesce(p.company_name, ''))
FROM public.profiles p
WHERE p.id = gc.opened_by
  AND length(trim(gc.shop_company_name)) = 0
  AND length(trim(coalesce(p.company_name, ''))) > 0;

UPDATE public.garage_customers c
SET shop_company_name = src.shop_company_name
FROM (
  SELECT DISTINCT ON (customer_id) customer_id, shop_company_name
  FROM public.garage_cases
  WHERE length(trim(shop_company_name)) > 0
  ORDER BY customer_id, created_at
) src
WHERE src.customer_id = c.id
  AND length(trim(c.shop_company_name)) = 0;

UPDATE public.garage_vehicles v
SET shop_company_name = c.shop_company_name
FROM public.garage_customers c
WHERE c.id = v.customer_id
  AND length(trim(v.shop_company_name)) = 0
  AND length(trim(c.shop_company_name)) > 0;

CREATE OR REPLACE FUNCTION public.garage_shop_visible(_shop_company_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
      AND length(trim(coalesce(_shop_company_name, ''))) > 0
      AND trim(_shop_company_name) = trim(coalesce(public.get_user_company(auth.uid()), ''))
    );
$$;

REVOKE ALL ON FUNCTION public.garage_shop_visible(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.garage_shop_visible(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.garage_force_shop_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  my_company text;
BEGIN
  my_company := trim(coalesce(public.get_user_company(auth.uid()), ''));
  IF public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    NEW.shop_company_name := trim(coalesce(NEW.shop_company_name, ''));
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'fleet_manager'::public.app_role) THEN
    IF length(my_company) = 0 THEN
      RAISE EXCEPTION 'למנהל מוסך חסר company_name בפרופיל. לא שומרים תיק בלי מוסך.';
    END IF;
    NEW.shop_company_name := my_company;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'אין הרשאה לשמור נתוני מוסך';
END;
$$;

REVOKE ALL ON FUNCTION public.garage_force_shop_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garage_customers_force_shop ON public.garage_customers;
CREATE TRIGGER garage_customers_force_shop
  BEFORE INSERT OR UPDATE ON public.garage_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_force_shop_company();

DROP TRIGGER IF EXISTS garage_vehicles_force_shop ON public.garage_vehicles;
CREATE TRIGGER garage_vehicles_force_shop
  BEFORE INSERT OR UPDATE ON public.garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_force_shop_company();

DROP TRIGGER IF EXISTS garage_cases_force_shop ON public.garage_cases;
CREATE TRIGGER garage_cases_force_shop
  BEFORE INSERT OR UPDATE ON public.garage_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_force_shop_company();

-- Replace garage_* RLS. No DELETE policies. garage_is_staff unchanged.
DROP POLICY IF EXISTS garage_customers_select_super_admin ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_insert_super_admin ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_update_super_admin ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_select_shop ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_insert_shop ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_update_shop ON public.garage_customers;

CREATE POLICY garage_customers_select_shop
  ON public.garage_customers FOR SELECT TO authenticated
  USING (public.garage_shop_visible(shop_company_name));

CREATE POLICY garage_customers_insert_shop
  ON public.garage_customers FOR INSERT TO authenticated
  WITH CHECK (public.garage_shop_visible(shop_company_name));

CREATE POLICY garage_customers_update_shop
  ON public.garage_customers FOR UPDATE TO authenticated
  USING (public.garage_shop_visible(shop_company_name))
  WITH CHECK (public.garage_shop_visible(shop_company_name));

DROP POLICY IF EXISTS garage_vehicles_select_super_admin ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_insert_super_admin ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_update_super_admin ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_select_shop ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_insert_shop ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_update_shop ON public.garage_vehicles;

CREATE POLICY garage_vehicles_select_shop
  ON public.garage_vehicles FOR SELECT TO authenticated
  USING (public.garage_shop_visible(shop_company_name));

CREATE POLICY garage_vehicles_insert_shop
  ON public.garage_vehicles FOR INSERT TO authenticated
  WITH CHECK (public.garage_shop_visible(shop_company_name));

CREATE POLICY garage_vehicles_update_shop
  ON public.garage_vehicles FOR UPDATE TO authenticated
  USING (public.garage_shop_visible(shop_company_name))
  WITH CHECK (public.garage_shop_visible(shop_company_name));

DROP POLICY IF EXISTS garage_cases_select_super_admin ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_insert_super_admin ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_update_super_admin ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_select_shop ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_insert_shop ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_update_shop ON public.garage_cases;

CREATE POLICY garage_cases_select_shop
  ON public.garage_cases FOR SELECT TO authenticated
  USING (public.garage_shop_visible(shop_company_name));

CREATE POLICY garage_cases_insert_shop
  ON public.garage_cases FOR INSERT TO authenticated
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
    AND opened_by = auth.uid()
  );

CREATE POLICY garage_cases_update_shop
  ON public.garage_cases FOR UPDATE TO authenticated
  USING (public.garage_shop_visible(shop_company_name))
  WITH CHECK (public.garage_shop_visible(shop_company_name));

-- garage_media: isolate through the case tenant. No new bucket.
DROP POLICY IF EXISTS garage_media_select_super_admin ON public.garage_media;
DROP POLICY IF EXISTS garage_media_insert_super_admin ON public.garage_media;
DROP POLICY IF EXISTS garage_media_select_shop ON public.garage_media;
DROP POLICY IF EXISTS garage_media_insert_shop ON public.garage_media;

CREATE POLICY garage_media_select_shop
  ON public.garage_media FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_case_id
        AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

CREATE POLICY garage_media_insert_shop
  ON public.garage_media FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_case_id
        AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

DROP POLICY IF EXISTS garage_media_storage_select ON storage.objects;
DROP POLICY IF EXISTS garage_media_storage_insert ON storage.objects;

CREATE POLICY garage_media_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'garage-media'
    AND (
      public.garage_is_staff(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.garage_media m
        JOIN public.garage_cases gc ON gc.id = m.garage_case_id
        WHERE m.storage_path = name
          AND public.garage_shop_visible(gc.shop_company_name)
      )
    )
  );

CREATE POLICY garage_media_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'garage-media'
    AND (
      public.garage_is_staff(auth.uid())
      OR public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
    )
  );

COMMIT;

-- Rollback (surgical, no DELETE of rows):
-- BEGIN;
-- restore previous garage_*_super_admin policies using garage_is_staff only;
-- restore garage_media storage policies using garage_is_staff only;
-- DROP TRIGGER garage_*_force_shop;
-- DROP FUNCTION public.garage_force_shop_company();
-- DROP FUNCTION public.garage_shop_visible(text);
-- leave shop_company_name columns in place (empty default, no row deletes).
-- COMMIT;
