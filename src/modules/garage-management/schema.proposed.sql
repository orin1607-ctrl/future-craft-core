-- ============================================================================
-- APPROVED STAGING SCHEMA.
-- Canonical runnable copy (SQL Editor, BEGIN/COMMIT):
--   src/modules/garage-management/garage-book.staging.manual.sql
-- This file remains the review copy. Production is still forbidden.
--
-- Isolation (hard):
--   - Independent of claims_records / CLAIM_COUNTER / claim_id / linked_claim_id.
--   - Independent of public.vehicles (fleet) and public.customers (CRM/fleet).
--   - No Storage / claims-docs / photographer portal /garage.
--   - No new app_role. No Auth changes. No driver shortcut.
--   - No garage_staff table yet (deferred).
--   - No DELETE policies. Closed case = status 'סגור', row stays.
--   - Phase 1 RLS: super_admin only. fleet_manager is blocked.
-- ============================================================================
--
-- Why NOT public.vehicles / public.customers
-- ------------------------------------------
-- public.vehicles is the company FLEET register: license_plate, assigned_driver_id,
-- insurance/test expiry, company_name, GPS/FleetOS. Inserting a private car that
-- arrived for body work would pollute the fleet and tracking.
-- public.customers is the fleet/CRM company book, scoped by company_name.
-- Garage walk-in / returning body-shop clients are a different book.
-- Future link, if ever wanted, is an explicit later decision.
--
-- ============================================================================
-- COUNTERS — two sequences, never shared, never CLAIM_COUNTER
-- ============================================================================

-- Customer numbers: 1281, 1282, 1283...  (display: #1281)
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
SET search_path = public
AS $$
  SELECT nextval('public.garage_customers_number_seq')::integer;
$$;

REVOKE ALL ON FUNCTION public.next_garage_customer_number() FROM PUBLIC, anon, authenticated;

-- Work-case numbers: GM-YYYY-NNNN  (year is a prefix; sequence does NOT reset yearly)
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
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.garage_cases_number_seq');
  RETURN 'GM-' || to_char(timezone('Asia/Jerusalem', now()), 'YYYY') || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_garage_case_number() FROM PUBLIC, anon, authenticated;

-- Staff helper for RLS. NOT a new role. Existing enum only.
-- Phase 1: super_admin only. fleet_manager is NOT garage staff.
-- Explicitly NOT driver / garage_photographer / claims worker.
-- Future: garage_staff allow-list. Do not create that table in this script.
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

-- ============================================================================
-- 1. garage_customers  — real returning customer book
-- ============================================================================
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
  'Body-shop customer book for /garage-management. NOT public.customers (fleet CRM).';
COMMENT ON COLUMN public.garage_customers.customer_number IS
  'Sequential garage customer number starting at 1281. Not a case number. Not a claim id.';
COMMENT ON COLUMN public.garage_customers.business_id IS
  'ח.פ / עוסק מורשה. No company_id FK — that would imply fleet/CRM coupling.';
COMMENT ON COLUMN public.garage_customers.preferred_channel IS
  'Approved Flow field (WhatsApp / Email / טלפון).';

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

-- ============================================================================
-- 2. garage_vehicles  — real cars that return with the customer
--    NO FK to public.vehicles.
-- ============================================================================
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
  'Body-shop vehicles for /garage-management. NOT public.vehicles (company fleet).';
COMMENT ON COLUMN public.garage_vehicles.internal_number IS
  'Optional garage-internal mark. Not fleet vehicles.internal_number.';
COMMENT ON COLUMN public.garage_vehicles.customer_id IS
  'Owner in the garage customer book. One customer, many vehicles.';

-- Same physical car should not be duplicated. Search-by-plate uses this.
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

-- ============================================================================
-- 3. garage_cases  — work-order file. Source of customer/vehicle is the FKs.
--    Snapshots are display/history only.
-- ============================================================================
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
  'Body-shop work cases. Independent of claims_records. Close = status סגור. No DELETE.';
COMMENT ON COLUMN public.garage_cases.case_number IS
  'GM-YYYY-NNNN from garage_cases_number_seq. Not customer_number. Not CLAIM_COUNTER.';
COMMENT ON COLUMN public.garage_cases.customer_name_snapshot IS
  'Frozen display name at open/last save. Source of truth remains garage_customers.';
COMMENT ON COLUMN public.garage_cases.vehicle_plate_snapshot IS
  'Frozen plate at open/last save. Source of truth remains garage_vehicles.';
COMMENT ON COLUMN public.garage_cases.case_data IS
  'Flow state JSON only: flags, quote, parts, work order, timeline, current screen. FORBIDDEN: base64, data URLs, file blobs. Not a Storage substitute.';

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

-- Numbering and immutability (full SQL in garage-book.staging.manual.sql):
-- BEFORE INSERT SECURITY DEFINER triggers always set customer_number / case_number
-- from the sequences, ignoring any client-supplied value.
-- BEFORE UPDATE triggers reject changes to customer_number, case_number, opened_by.
-- next_garage_* are not granted to authenticated; counters advance only on real INSERT.

-- ============================================================================
-- 4. Grants — authenticated only. Never anon. Never PUBLIC.
--    DELETE is not granted. Sequences and numbering functions are not granted.
-- ============================================================================
REVOKE ALL ON TABLE public.garage_customers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_vehicles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_cases FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.garage_customers_number_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.garage_cases_number_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_cases TO authenticated;

-- ============================================================================
-- 5. RLS — Phase 1: super_admin only.
--    fleet_manager is blocked (may be an external fleet customer, not shop staff).
--    driver / garage_photographer / claims worker: NOT included.
--    No DELETE policy on any table.
--    garage_staff allow-list is deferred; do not create it here.
-- ============================================================================
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

-- no DELETE policy

-- ============================================================================
-- case_data shape (app-enforced; not a Storage bucket)
--
-- ALLOWED:
--   photos: {fl,fr,rl,rr: boolean}     -- captured flags only, not image bytes
--   damage / quote / parts / workOrder -- structured objects
--   timeline: array of {at, text}
--   flags: quoteCreated, quoteSent, quoteApproved, workOrderSaved,
--          intakeDone, signatureCaptured, workStarted, workFinished, caseClosed
--   currentScreen: text
--
-- FORBIDDEN inside case_data:
--   base64, data URLs, File/Blob, storage paths-as-content, signature PNG bytes
--   If real photos or signature images are required: STOP and propose a bucket.
-- ============================================================================
--
-- Intentionally ABSENT from all three tables:
--   claim_id, linked_claim_id, insurer
--   FK to claims_records / public.vehicles / public.customers / public.drivers
--   DELETE, archive flag, assigned_to worker role
-- ============================================================================
