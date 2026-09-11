-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- Canonical paste-and-run copy (with BEGIN/COMMIT for SQL Editor):
--   src/modules/garage-management/garage-book.staging.manual.sql
-- This migration is the same DDL. Supabase CLI already wraps files in a
-- transaction, so BEGIN/COMMIT are not repeated here.
-- ============================================================================

-- ============================================================================
-- Preflight: exact existing signatures. Do not create replacements.
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.has_role(uuid, public.app_role) ב-Staging. עוצרים לפני יצירת טבלאות המוסך. לא יוצרים תחליף.';
  END IF;

  IF (
    SELECT p.prorettype
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.has_role(uuid, public.app_role)')
  ) <> 'boolean'::regtype THEN
    RAISE EXCEPTION
      'public.has_role(uuid, public.app_role) קיים אבל לא מחזיר boolean. עוצרים. לא יוצרים תחליף.';
  END IF;

  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.app_role ב-Staging. עוצרים לפני יצירת טבלאות המוסך. לא יוצרים תחליף.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND t.typtype = 'e'
  ) THEN
    RAISE EXCEPTION
      'public.app_role קיים אבל אינו enum. עוצרים. לא יוצרים תחליף.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'super_admin'
  ) THEN
    RAISE EXCEPTION
      'חסר ערך super_admin ב-public.app_role. עוצרים. לא יוצרים תחליף.';
  END IF;

  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.update_updated_at_column() ב-Staging. עוצרים לפני יצירת טבלאות המוסך. לא יוצרים תחליף.';
  END IF;

  IF (
    SELECT p.prorettype
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.update_updated_at_column()')
  ) <> 'trigger'::regtype THEN
    RAISE EXCEPTION
      'public.update_updated_at_column() קיים אבל אינו RETURNS trigger. עוצרים. לא יוצרים תחליף.';
  END IF;
END;
$$;

-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- garage_customers + garage_vehicles + garage_cases
-- No FK to claims_records / public.vehicles / public.customers / drivers.
-- No DELETE. No new app_role. No driver shortcut. No garage_staff yet.
-- Phase 1 access: super_admin only. fleet_manager is blocked.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.garage_customers_number_seq
  AS bigint
  START WITH 1281
  INCREMENT BY 1
  MINVALUE 1281
  NO MAXVALUE
  CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.garage_cases_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Internal numbering helpers. Not granted to authenticated / anon / PUBLIC.
-- Called only from SECURITY DEFINER BEFORE INSERT triggers.
CREATE OR REPLACE FUNCTION public.next_garage_customer_number()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.nextval('public.garage_customers_number_seq'::regclass)::integer;
$$;

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

REVOKE ALL ON FUNCTION public.next_garage_customer_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_garage_case_number() FROM PUBLIC, anon, authenticated;

-- Phase 1 staff = super_admin only.
-- fleet_manager is a fleet/customer-company role, not a body-shop worker.
-- Future: replace body with an explicit garage_staff allow-list. Do not create that table now.
CREATE OR REPLACE FUNCTION public.garage_is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    public.has_role(_user_id, 'super_admin'::public.app_role),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.garage_is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.garage_is_staff(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.garage_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number integer NOT NULL,
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
COMMENT ON COLUMN public.garage_customers.customer_number IS
  'Assigned by BEFORE INSERT trigger from garage_customers_number_seq. Immutable after insert. Starts at 1281.';

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
  CONSTRAINT garage_vehicles_plate_present CHECK (length(trim(plate)) > 0),
  CONSTRAINT garage_vehicles_id_customer_unique UNIQUE (id, customer_id)
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
  case_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.garage_customers(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL,
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
  CONSTRAINT garage_cases_case_data_object CHECK (jsonb_typeof(case_data) = 'object'),
  CONSTRAINT garage_cases_vehicle_customer_fkey
    FOREIGN KEY (vehicle_id, customer_id)
    REFERENCES public.garage_vehicles (id, customer_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.garage_cases IS
  'Body-shop work cases. Independent of claims_records. Close = status סגור. No DELETE. Staging only.';
COMMENT ON COLUMN public.garage_cases.case_data IS
  'Flow state JSON only. FORBIDDEN: base64, data URLs, file blobs.';
COMMENT ON COLUMN public.garage_cases.case_number IS
  'Assigned by BEFORE INSERT trigger as GM-YYYY-NNNN. Immutable after insert.';
COMMENT ON COLUMN public.garage_cases.opened_by IS
  'User who opened the case. Immutable after insert.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'garage_vehicles_id_customer_unique'
      AND conrelid = 'public.garage_vehicles'::regclass
  ) THEN
    ALTER TABLE public.garage_vehicles
      ADD CONSTRAINT garage_vehicles_id_customer_unique UNIQUE (id, customer_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'garage_cases_vehicle_id_fkey'
      AND conrelid = 'public.garage_cases'::regclass
  ) THEN
    ALTER TABLE public.garage_cases DROP CONSTRAINT garage_cases_vehicle_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'garage_cases_vehicle_customer_fkey'
      AND conrelid = 'public.garage_cases'::regclass
  ) THEN
    ALTER TABLE public.garage_cases
      ADD CONSTRAINT garage_cases_vehicle_customer_fkey
      FOREIGN KEY (vehicle_id, customer_id)
      REFERENCES public.garage_vehicles (id, customer_id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT garage_vehicles_id_customer_unique ON public.garage_vehicles IS
  'Required target for garage_cases composite FK (vehicle_id, customer_id).';
COMMENT ON CONSTRAINT garage_cases_vehicle_customer_fkey ON public.garage_cases IS
  'A case vehicle must belong to the same garage customer as the case.';

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

-- If an earlier draft attached a column DEFAULT, drop it. Triggers own numbering.
ALTER TABLE public.garage_customers ALTER COLUMN customer_number DROP DEFAULT;
ALTER TABLE public.garage_cases ALTER COLUMN case_number DROP DEFAULT;

-- Forced numbering: always overwrite client-supplied values.
CREATE OR REPLACE FUNCTION public.garage_customers_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.customer_number := public.next_garage_customer_number();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.garage_cases_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.case_number := public.next_garage_case_number();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.garage_customers_assign_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.garage_cases_assign_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garage_customers_assign_number ON public.garage_customers;
CREATE TRIGGER garage_customers_assign_number
  BEFORE INSERT ON public.garage_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_customers_assign_number();

DROP TRIGGER IF EXISTS garage_cases_assign_number ON public.garage_cases;
CREATE TRIGGER garage_cases_assign_number
  BEFORE INSERT ON public.garage_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_cases_assign_number();

-- Immutable after insert.
CREATE OR REPLACE FUNCTION public.garage_customers_protect_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.customer_number IS DISTINCT FROM OLD.customer_number THEN
    RAISE EXCEPTION 'לא ניתן לשנות מספר לקוח לאחר יצירה';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.garage_cases_protect_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.case_number IS DISTINCT FROM OLD.case_number THEN
    RAISE EXCEPTION 'לא ניתן לשנות מספר תיק לאחר יצירה';
  END IF;
  IF NEW.opened_by IS DISTINCT FROM OLD.opened_by THEN
    RAISE EXCEPTION 'לא ניתן לשנות את פותח התיק לאחר יצירה';
  END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'לא ניתן לשנות את לקוח התיק לאחר יצירה';
  END IF;
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    RAISE EXCEPTION 'לא ניתן לשנות את רכב התיק לאחר יצירה';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.garage_customers_protect_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.garage_cases_protect_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garage_customers_protect_immutable ON public.garage_customers;
CREATE TRIGGER garage_customers_protect_immutable
  BEFORE UPDATE ON public.garage_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_customers_protect_immutable();

DROP TRIGGER IF EXISTS garage_cases_protect_immutable ON public.garage_cases;
CREATE TRIGGER garage_cases_protect_immutable
  BEFORE UPDATE ON public.garage_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.garage_cases_protect_immutable();

REVOKE ALL ON TABLE public.garage_customers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_vehicles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_cases FROM PUBLIC, anon;

REVOKE ALL ON SEQUENCE public.garage_customers_number_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.garage_cases_number_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_cases TO authenticated;

ALTER TABLE public.garage_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garage_customers_select_staff ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_insert_staff ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_update_staff ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_select_super_admin ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_insert_super_admin ON public.garage_customers;
DROP POLICY IF EXISTS garage_customers_update_super_admin ON public.garage_customers;

CREATE POLICY garage_customers_select_super_admin
  ON public.garage_customers
  FOR SELECT
  TO authenticated
  USING (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_customers_insert_super_admin
  ON public.garage_customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_customers_update_super_admin
  ON public.garage_customers
  FOR UPDATE
  TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_vehicles_select_staff ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_insert_staff ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_update_staff ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_select_super_admin ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_insert_super_admin ON public.garage_vehicles;
DROP POLICY IF EXISTS garage_vehicles_update_super_admin ON public.garage_vehicles;

CREATE POLICY garage_vehicles_select_super_admin
  ON public.garage_vehicles
  FOR SELECT
  TO authenticated
  USING (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_vehicles_insert_super_admin
  ON public.garage_vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_vehicles_update_super_admin
  ON public.garage_vehicles
  FOR UPDATE
  TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_cases_select_staff ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_insert_staff ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_update_staff ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_select_super_admin ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_insert_super_admin ON public.garage_cases;
DROP POLICY IF EXISTS garage_cases_update_super_admin ON public.garage_cases;

CREATE POLICY garage_cases_select_super_admin
  ON public.garage_cases
  FOR SELECT
  TO authenticated
  USING (public.garage_is_staff(auth.uid()));

CREATE POLICY garage_cases_insert_super_admin
  ON public.garage_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.garage_is_staff(auth.uid())
    AND opened_by = auth.uid()
  );

CREATE POLICY garage_cases_update_super_admin
  ON public.garage_cases
  FOR UPDATE
  TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));
