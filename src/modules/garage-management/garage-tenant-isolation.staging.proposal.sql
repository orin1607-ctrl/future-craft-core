-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- PROPOSAL — DO NOT RUN until the owner explicitly approves this gate.
-- Apply only via: APPLY_GARAGE_TENANT_STAGING=1 node scripts/apply-garage-tenant-staging.mjs
--
-- No DELETE of rows. No Claims. No garage-gmail rewrite.
-- Does NOT change public.garage_is_staff (stays super_admin only).
-- Does NOT open /garage-management to fleet_manager.
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

-- Tenant key = profiles.company_name / get_user_company().
-- NOT garage_customers.company_name (customer legal/business name).
ALTER TABLE public.garage_customers
  ADD COLUMN IF NOT EXISTS shop_company_name text NOT NULL DEFAULT '';

ALTER TABLE public.garage_vehicles
  ADD COLUMN IF NOT EXISTS shop_company_name text NOT NULL DEFAULT '';

ALTER TABLE public.garage_cases
  ADD COLUMN IF NOT EXISTS shop_company_name text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.garage_customers.shop_company_name IS
  'Body-shop tenant. Same string as profiles.company_name / get_user_company(). Not the customer company_name.';
COMMENT ON COLUMN public.garage_vehicles.shop_company_name IS
  'Must match garage_customers.shop_company_name of customer_id. Enforced by trigger + composite FK.';
COMMENT ON COLUMN public.garage_cases.shop_company_name IS
  'Must match both customer and vehicle shop_company_name. Enforced by trigger + composite FKs.';

CREATE INDEX IF NOT EXISTS garage_customers_shop_company_name_idx
  ON public.garage_customers (shop_company_name);
CREATE INDEX IF NOT EXISTS garage_vehicles_shop_company_name_idx
  ON public.garage_vehicles (shop_company_name);
CREATE INDEX IF NOT EXISTS garage_cases_shop_company_name_idx
  ON public.garage_cases (shop_company_name);

-- Backfill FAIL CLOSED:
-- Signal = opened_by -> profiles.company_name, non-empty only.
-- If a customer_id or vehicle_id has 2+ distinct non-empty shops, leave ALL related rows as ''.
-- Do not pick the earliest case. Do not guess.
WITH case_signal AS (
  SELECT
    gc.customer_id,
    gc.vehicle_id,
    trim(coalesce(p.company_name, '')) AS opener_shop
  FROM public.garage_cases gc
  LEFT JOIN public.profiles p ON p.id = gc.opened_by
),
customer_one_shop AS (
  SELECT customer_id, min(opener_shop) AS shop_company_name
  FROM case_signal
  WHERE opener_shop <> ''
  GROUP BY customer_id
  HAVING count(DISTINCT opener_shop) = 1
),
vehicle_conflict AS (
  SELECT vehicle_id
  FROM case_signal
  WHERE opener_shop <> ''
  GROUP BY vehicle_id
  HAVING count(DISTINCT opener_shop) > 1
)
UPDATE public.garage_customers c
SET shop_company_name = src.shop_company_name
FROM customer_one_shop src
WHERE src.customer_id = c.id
  AND length(trim(c.shop_company_name)) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.garage_vehicles v
    JOIN vehicle_conflict vc ON vc.vehicle_id = v.id
    WHERE v.customer_id = c.id
  );

UPDATE public.garage_vehicles v
SET shop_company_name = c.shop_company_name
FROM public.garage_customers c
WHERE c.id = v.customer_id
  AND length(trim(v.shop_company_name)) = 0
  AND length(trim(c.shop_company_name)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.garage_cases gc
    LEFT JOIN public.profiles p ON p.id = gc.opened_by
    WHERE gc.vehicle_id = v.id
    GROUP BY gc.vehicle_id
    HAVING count(DISTINCT trim(coalesce(p.company_name, '')) )
      FILTER (WHERE trim(coalesce(p.company_name, '')) <> '') > 1
  );

UPDATE public.garage_cases gc
SET shop_company_name = c.shop_company_name
FROM public.garage_customers c
JOIN public.garage_vehicles v
  ON v.id = gc.vehicle_id
 AND v.customer_id = gc.customer_id
WHERE c.id = gc.customer_id
  AND length(trim(gc.shop_company_name)) = 0
  AND length(trim(c.shop_company_name)) > 0
  AND c.shop_company_name = v.shop_company_name;

-- Refuse to continue if any remaining parent/child shop mismatch (empty vs empty is OK).
DO $$
DECLARE
  mismatches bigint;
BEGIN
  SELECT count(*) INTO mismatches
  FROM public.garage_vehicles v
  JOIN public.garage_customers c ON c.id = v.customer_id
  WHERE v.shop_company_name IS DISTINCT FROM c.shop_company_name;

  IF mismatches > 0 THEN
    RAISE EXCEPTION 'Backfill left % vehicle/customer shop mismatches. Rolling back. No RLS change.', mismatches;
  END IF;

  SELECT count(*) INTO mismatches
  FROM public.garage_cases gc
  JOIN public.garage_customers c ON c.id = gc.customer_id
  JOIN public.garage_vehicles v ON v.id = gc.vehicle_id
  WHERE gc.shop_company_name IS DISTINCT FROM c.shop_company_name
     OR gc.shop_company_name IS DISTINCT FROM v.shop_company_name
     OR c.shop_company_name IS DISTINCT FROM v.shop_company_name;

  IF mismatches > 0 THEN
    RAISE EXCEPTION 'Backfill left % case shop mismatches. Rolling back. No RLS change.', mismatches;
  END IF;
END;
$$;

ALTER TABLE public.garage_customers
  DROP CONSTRAINT IF EXISTS garage_customers_id_shop_unique;
ALTER TABLE public.garage_customers
  ADD CONSTRAINT garage_customers_id_shop_unique UNIQUE (id, shop_company_name);

ALTER TABLE public.garage_vehicles
  DROP CONSTRAINT IF EXISTS garage_vehicles_id_shop_unique;
ALTER TABLE public.garage_vehicles
  ADD CONSTRAINT garage_vehicles_id_shop_unique UNIQUE (id, shop_company_name);

ALTER TABLE public.garage_vehicles
  DROP CONSTRAINT IF EXISTS garage_vehicles_customer_shop_fkey;
ALTER TABLE public.garage_vehicles
  ADD CONSTRAINT garage_vehicles_customer_shop_fkey
  FOREIGN KEY (customer_id, shop_company_name)
  REFERENCES public.garage_customers (id, shop_company_name)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE public.garage_cases
  DROP CONSTRAINT IF EXISTS garage_cases_customer_shop_fkey;
ALTER TABLE public.garage_cases
  ADD CONSTRAINT garage_cases_customer_shop_fkey
  FOREIGN KEY (customer_id, shop_company_name)
  REFERENCES public.garage_customers (id, shop_company_name)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE public.garage_cases
  DROP CONSTRAINT IF EXISTS garage_cases_vehicle_shop_fkey;
ALTER TABLE public.garage_cases
  ADD CONSTRAINT garage_cases_vehicle_shop_fkey
  FOREIGN KEY (vehicle_id, shop_company_name)
  REFERENCES public.garage_vehicles (id, shop_company_name)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

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

CREATE OR REPLACE FUNCTION public.garage_apply_shop_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  my_company text;
  parent_shop text;
  vehicle_shop text;
BEGIN
  my_company := trim(coalesce(public.get_user_company(auth.uid()), ''));

  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'fleet_manager'::public.app_role) THEN
    RAISE EXCEPTION 'אין הרשאה לשמור נתוני מוסך';
  END IF;

  IF TG_TABLE_NAME = 'garage_customers' THEN
    IF public.has_role(auth.uid(), 'fleet_manager'::public.app_role) THEN
      IF length(my_company) = 0 THEN
        RAISE EXCEPTION 'למנהל מוסך חסר company_name בפרופיל. לא שומרים תיק בלי מוסך.';
      END IF;
      NEW.shop_company_name := my_company;
    ELSE
      NEW.shop_company_name := trim(coalesce(NEW.shop_company_name, ''));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'garage_vehicles' THEN
    SELECT trim(coalesce(c.shop_company_name, '')) INTO parent_shop
    FROM public.garage_customers c
    WHERE c.id = NEW.customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'לא שומרים רכב בלי לקוח קיים.';
    END IF;
    NEW.shop_company_name := parent_shop;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'garage_cases' THEN
    SELECT trim(coalesce(c.shop_company_name, '')) INTO parent_shop
    FROM public.garage_customers c
    WHERE c.id = NEW.customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'לא שומרים תיק בלי לקוח קיים.';
    END IF;
    SELECT trim(coalesce(v.shop_company_name, '')) INTO vehicle_shop
    FROM public.garage_vehicles v
    WHERE v.id = NEW.vehicle_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'לא שומרים תיק בלי רכב קיים.';
    END IF;
    IF parent_shop <> vehicle_shop THEN
      RAISE EXCEPTION 'לקוח ורכב לא שייכים לאותו מוסך. לא שומרים תיק.';
    END IF;
    NEW.shop_company_name := parent_shop;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.garage_apply_shop_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garage_customers_force_shop ON public.garage_customers;
DROP TRIGGER IF EXISTS garage_customers_apply_shop ON public.garage_customers;
CREATE TRIGGER garage_customers_apply_shop
  BEFORE INSERT OR UPDATE ON public.garage_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_apply_shop_tenant();

DROP TRIGGER IF EXISTS garage_vehicles_force_shop ON public.garage_vehicles;
DROP TRIGGER IF EXISTS garage_vehicles_apply_shop ON public.garage_vehicles;
CREATE TRIGGER garage_vehicles_apply_shop
  BEFORE INSERT OR UPDATE ON public.garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_apply_shop_tenant();

DROP TRIGGER IF EXISTS garage_cases_force_shop ON public.garage_cases;
DROP TRIGGER IF EXISTS garage_cases_apply_shop ON public.garage_cases;
CREATE TRIGGER garage_cases_apply_shop
  BEFORE INSERT OR UPDATE ON public.garage_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_apply_shop_tenant();

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

-- Fail closed: object name must start with a visible case UUID.
-- App path: {garageCaseId}/{category}/{id}.ext
-- Does not create the garage-media bucket (already from garage_media staging SQL).
-- No storage UPDATE/DELETE policies (overwrite of another shop's object is denied).
CREATE POLICY garage_media_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'garage-media'
    AND EXISTS (
      SELECT 1
      FROM public.garage_cases gc
      WHERE gc.id::text = split_part(name, '/', 1)
        AND public.garage_shop_visible(gc.shop_company_name)
        AND (
          public.garage_is_staff(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.garage_media m
            WHERE m.storage_path = name
              AND m.garage_case_id = gc.id
          )
        )
    )
  );

CREATE POLICY garage_media_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'garage-media'
    AND EXISTS (
      SELECT 1
      FROM public.garage_cases gc
      WHERE gc.id::text = split_part(name, '/', 1)
        AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

COMMIT;
