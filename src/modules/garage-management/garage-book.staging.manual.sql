-- ============================================================================
-- MANUAL RUN ONLY — Supabase SQL Editor
-- Project (required): dalia-staging / usfeoerkpcafxxlyuldl
-- FORBIDDEN:          dalia-new / qasomfndnjuixgjmjwcm / dalia-car.online
--
-- Do not run this from CI, the agent, or Production.
-- After this succeeds, tell the agent — QA only, then persist wiring.
-- ============================================================================
-- Safety audit of this file:
--   no claims_records writes
--   no public.vehicles / public.customers / drivers writes
--   no Auth/role enum changes
--   no Storage
--   no Edge Functions
--   no DROP TABLE / DELETE FROM / TRUNCATE of existing tables
--   new objects only: garage_customers, garage_vehicles, garage_cases
--                     + garage_* sequences/functions/policies/triggers
--   DROP TRIGGER/POLICY IF EXISTS only on those new garage_* objects
--   opened_by references auth.users(id) (FK only; does not change Auth)
--   REVOKE from anon/PUBLIC; GRANT SELECT,INSERT,UPDATE (no DELETE)
--   RLS Variant A: super_admin all cases; fleet_manager own cases only
--   driver not in garage_is_staff()
-- ============================================================================

-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- garage_customers + garage_vehicles + garage_cases
-- No FK to claims_records / public.vehicles / public.customers / drivers.
-- No DELETE. No new app_role. No driver shortcut.
-- fleet_manager visibility: Variant A (own cases only).
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.garage_customers_number_seq
  AS bigint
  START WITH 1281
  INCREMENT BY 1
  MINVALUE 1281
  NO MAXVALUE
  CACHE 1;

CREATE OR REPLACE FUNCTION public.next_garage_customer_number()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.nextval('public.garage_customers_number_seq'::regclass)::integer;
$$;

REVOKE ALL ON FUNCTION public.next_garage_customer_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_garage_customer_number() TO authenticated;

CREATE SEQUENCE IF NOT EXISTS public.garage_cases_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

CREATE OR REPLACE FUNCTION public.next_garage_case_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n bigint;
BEGIN
  n := pg_catalog.nextval('public.garage_cases_number_seq'::regclass);
  RETURN 'GM-'
    || pg_catalog.to_char(pg_catalog.timezone('Asia/Jerusalem'::text, pg_catalog.now()), 'YYYY')
    || '-'
    || pg_catalog.lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_garage_case_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_garage_case_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.garage_is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    public.has_role(_user_id, 'super_admin'::public.app_role)
    OR public.has_role(_user_id, 'fleet_manager'::public.app_role),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.garage_is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.garage_is_staff(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.garage_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number integer NOT NULL DEFAULT public.next_garage_customer_number(),
  customer_type text NOT NULL,
  name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  second_phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  business_id text NOT NULL DEFAULT '',
  contact_person text NOT NULL DEFAULT '',
  preferred_channel text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_customers_number_unique UNIQUE (customer_number),
  CONSTRAINT garage_customers_type_check CHECK (customer_type IN ('private', 'business', 'fleet')),
  CONSTRAINT garage_customers_has_display_name CHECK (
    (customer_type = 'private' AND length(trim(name)) > 0)
    OR (customer_type IN ('business', 'fleet') AND length(trim(company_name)) > 0)
  ),
  CONSTRAINT garage_customers_phone_present CHECK (length(trim(phone)) > 0)
);

COMMENT ON TABLE public.garage_customers IS
  'Body-shop customer book for /garage-management. NOT public.customers (fleet CRM). Staging only.';

CREATE INDEX IF NOT EXISTS garage_customers_name_idx
  ON public.garage_customers (name);
CREATE INDEX IF NOT EXISTS garage_customers_company_name_idx
  ON public.garage_customers (company_name);
CREATE INDEX IF NOT EXISTS garage_customers_phone_idx
  ON public.garage_customers (phone);
CREATE INDEX IF NOT EXISTS garage_customers_second_phone_idx
  ON public.garage_customers (second_phone);
CREATE INDEX IF NOT EXISTS garage_customers_business_id_idx
  ON public.garage_customers (business_id);
CREATE INDEX IF NOT EXISTS garage_customers_created_at_idx
  ON public.garage_customers (created_at DESC);

DROP TRIGGER IF EXISTS garage_customers_set_updated_at ON public.garage_customers;
CREATE TRIGGER garage_customers_set_updated_at
  BEFORE UPDATE ON public.garage_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.garage_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.garage_customers(id) ON DELETE RESTRICT,
  plate text NOT NULL,
  make text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  year integer,
  color text NOT NULL DEFAULT '',
  vin text NOT NULL DEFAULT '',
  vehicle_type text NOT NULL DEFAULT '',
  internal_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_vehicles_plate_present CHECK (length(trim(plate)) > 0)
);

COMMENT ON TABLE public.garage_vehicles IS
  'Body-shop vehicles for /garage-management. NOT public.vehicles (company fleet). Staging only.';

CREATE UNIQUE INDEX IF NOT EXISTS garage_vehicles_plate_unique_idx
  ON public.garage_vehicles (lower(regexp_replace(plate, '[^0-9A-Za-z]', '', 'g')));
CREATE UNIQUE INDEX IF NOT EXISTS garage_vehicles_vin_unique_idx
  ON public.garage_vehicles (upper(trim(vin)))
  WHERE length(trim(vin)) > 0;
CREATE INDEX IF NOT EXISTS garage_vehicles_customer_id_idx
  ON public.garage_vehicles (customer_id);
CREATE INDEX IF NOT EXISTS garage_vehicles_plate_idx
  ON public.garage_vehicles (plate);

DROP TRIGGER IF EXISTS garage_vehicles_set_updated_at ON public.garage_vehicles;
CREATE TRIGGER garage_vehicles_set_updated_at
  BEFORE UPDATE ON public.garage_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.garage_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL DEFAULT public.next_garage_case_number(),
  customer_id uuid NOT NULL REFERENCES public.garage_customers(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES public.garage_vehicles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'בדיקת רכב',
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  opened_by_name text NOT NULL DEFAULT '',
  customer_name_snapshot text NOT NULL DEFAULT '',
  vehicle_plate_snapshot text NOT NULL DEFAULT '',
  vehicle_label_snapshot text NOT NULL DEFAULT '',
  case_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_cases_case_number_unique UNIQUE (case_number),
  CONSTRAINT garage_cases_status_check CHECK (status IN (
    'בדיקת רכב',
    'הצעה בהכנה',
    'ממתין לאישור',
    'אושר',
    'הרכב התקבל',
    'בעבודה',
    'מוכן למסירה',
    'סגור'
  )),
  CONSTRAINT garage_cases_case_data_object CHECK (jsonb_typeof(case_data) = 'object')
);

COMMENT ON TABLE public.garage_cases IS
  'Body-shop work cases. Independent of claims_records. Close = status סגור. No DELETE. Staging only.';
COMMENT ON COLUMN public.garage_cases.case_data IS
  'Flow state JSON only. FORBIDDEN: base64, data URLs, file blobs.';

CREATE INDEX IF NOT EXISTS garage_cases_customer_id_idx
  ON public.garage_cases (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS garage_cases_vehicle_id_idx
  ON public.garage_cases (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS garage_cases_opened_by_idx
  ON public.garage_cases (opened_by, created_at DESC);
CREATE INDEX IF NOT EXISTS garage_cases_status_idx
  ON public.garage_cases (status);
CREATE INDEX IF NOT EXISTS garage_cases_created_at_idx
  ON public.garage_cases (created_at DESC);

DROP TRIGGER IF EXISTS garage_cases_set_updated_at ON public.garage_cases;
CREATE TRIGGER garage_cases_set_updated_at
  BEFORE UPDATE ON public.garage_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON TABLE public.garage_customers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_vehicles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_cases FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.garage_customers_number_seq FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.garage_cases_number_seq FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_cases TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.garage_customers_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.garage_cases_number_seq TO authenticated;

ALTER TABLE public.garage_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garage_customers_select_staff ON public.garage_customers;
CREATE POLICY garage_customers_select_staff
  ON public.garage_customers
  FOR SELECT
  TO authenticated
  USING (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_customers_insert_staff ON public.garage_customers;
CREATE POLICY garage_customers_insert_staff
  ON public.garage_customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_customers_update_staff ON public.garage_customers;
CREATE POLICY garage_customers_update_staff
  ON public.garage_customers
  FOR UPDATE
  TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_vehicles_select_staff ON public.garage_vehicles;
CREATE POLICY garage_vehicles_select_staff
  ON public.garage_vehicles
  FOR SELECT
  TO authenticated
  USING (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_vehicles_insert_staff ON public.garage_vehicles;
CREATE POLICY garage_vehicles_insert_staff
  ON public.garage_vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_vehicles_update_staff ON public.garage_vehicles;
CREATE POLICY garage_vehicles_update_staff
  ON public.garage_vehicles
  FOR UPDATE
  TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_cases_select_staff ON public.garage_cases;
CREATE POLICY garage_cases_select_staff
  ON public.garage_cases
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
      AND opened_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS garage_cases_insert_staff ON public.garage_cases;
CREATE POLICY garage_cases_insert_staff
  ON public.garage_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.garage_is_staff(auth.uid())
    AND opened_by = auth.uid()
  );

DROP POLICY IF EXISTS garage_cases_update_staff ON public.garage_cases;
CREATE POLICY garage_cases_update_staff
  ON public.garage_cases
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
      AND opened_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
      AND opened_by = auth.uid()
    )
  );
