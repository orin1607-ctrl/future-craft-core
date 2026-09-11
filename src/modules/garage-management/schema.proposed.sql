-- ============================================================================
-- PROPOSED ONLY — DO NOT RUN.
-- Table: public.garage_cases
-- Scope: Oren Car PUBLIC STAGING (dalia-staging / usfeoerkpcafxxlyuldl) only.
-- Production / dalia-car.online: FORBIDDEN.
--
-- This file is NOT a migration. It must not be copied to supabase/migrations/
-- until the owner explicitly approves the schema and RLS.
--
-- Isolation rules (hard):
--   - Separate entity from insurance claims.
--   - NO FK to claims_records.
--   - NO linked_claim_id.
--   - NO write to claims_config / CLAIM_COUNTER.
--   - NO Storage / claims-docs / garage photographer portal (/garage).
--   - NO new app_role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Case-number sequence (independent of DAL-YYYY-NNNN)
--    Display format: GM-YYYY-NNNN  e.g. GM-2026-0001
-- ---------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.next_garage_case_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_garage_case_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Table
--    Extra column beyond the approved minimum: case_data jsonb
--    Required so the approved /garage-management Flow (inspection flags,
--    quote, work order, intake, timeline) survives refresh WITHOUT Storage
--    and WITHOUT extra tables. No photo bucket in this phase.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garage_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL DEFAULT public.next_garage_case_number(),
  customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  vehicle jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'בדיקת רכב',
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  opened_by_name text NOT NULL DEFAULT '',
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
  CONSTRAINT garage_cases_customer_object CHECK (jsonb_typeof(customer) = 'object'),
  CONSTRAINT garage_cases_vehicle_object CHECK (jsonb_typeof(vehicle) = 'object'),
  CONSTRAINT garage_cases_case_data_object CHECK (jsonb_typeof(case_data) = 'object')
);

COMMENT ON TABLE public.garage_cases IS
  'Body-shop work cases for /garage-management. Independent of claims_records. Staging only.';
COMMENT ON COLUMN public.garage_cases.case_number IS
  'Human case number GM-YYYY-NNNN. Not a claim id. Not DAL-YYYY-NNNN.';
COMMENT ON COLUMN public.garage_cases.customer IS
  'Snapshot of customer fields used by the approved Flow. No FK to claims or CRM.';
COMMENT ON COLUMN public.garage_cases.vehicle IS
  'Snapshot of vehicle fields used by the approved Flow. No FK to public.vehicles.';
COMMENT ON COLUMN public.garage_cases.opened_by IS
  'auth.uid() of the user who opened the case. Used for worker RLS.';
COMMENT ON COLUMN public.garage_cases.case_data IS
  'Approved-Flow ephemeral state (photos flags, quote, work order, timeline). Not Storage.';

CREATE INDEX IF NOT EXISTS garage_cases_opened_by_idx
  ON public.garage_cases (opened_by, created_at DESC);
CREATE INDEX IF NOT EXISTS garage_cases_status_idx
  ON public.garage_cases (status);
CREATE INDEX IF NOT EXISTS garage_cases_created_at_idx
  ON public.garage_cases (created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
--    Reuses existing public.update_updated_at_column(). No new helper.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS garage_cases_set_updated_at ON public.garage_cases;
CREATE TRIGGER garage_cases_set_updated_at
  BEFORE UPDATE ON public.garage_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Grants — authenticated only. Never anon. Never PUBLIC.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.garage_cases FROM PUBLIC, anon;
REVOKE ALL ON SEQUENCE public.garage_cases_number_seq FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_cases TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.garage_cases_number_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS
--    Existing app_role values only: super_admin / fleet_manager / driver.
--    No new garage_worker role.
--    Super-admin: all rows.
--    Worker (existing roles): own rows (opened_by = auth.uid()).
--    fleet_manager does NOT see other workers' cases unless they are also
--    the opener. Manager table "all garage cases" is super_admin in this phase.
-- ---------------------------------------------------------------------------
ALTER TABLE public.garage_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garage_cases_select_own_or_admin ON public.garage_cases;
CREATE POLICY garage_cases_select_own_or_admin
  ON public.garage_cases
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR opened_by = auth.uid()
  );

DROP POLICY IF EXISTS garage_cases_insert_self ON public.garage_cases;
CREATE POLICY garage_cases_insert_self
  ON public.garage_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'driver'::public.app_role)
    )
  );

DROP POLICY IF EXISTS garage_cases_update_own_or_admin ON public.garage_cases;
CREATE POLICY garage_cases_update_own_or_admin
  ON public.garage_cases
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR opened_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR opened_by = auth.uid()
  );

DROP POLICY IF EXISTS garage_cases_delete_admin ON public.garage_cases;
CREATE POLICY garage_cases_delete_admin
  ON public.garage_cases
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Explicitly no policy for anon / public.

-- ---------------------------------------------------------------------------
-- JSON shapes used by the app (not enforced as columns)
--
-- customer:
--   {
--     "name": text,
--     "phone": text,
--     "email": text,
--     "type": "private" | "business" | "fleet",
--     "address": text,
--     "preferred_channel": text,
--     "notes": text
--   }
--
-- vehicle:
--   {
--     "plate": text,
--     "make": text,
--     "model": text,
--     "year": text,
--     "color": text,
--     "notes": text
--   }
--
-- case_data (Flow state only; no Storage objects in this phase):
--   {
--     "photos": {"fl": bool, "fr": bool, "rl": bool, "rr": bool},
--     "damageCount": number,
--     "quoteCreated": bool,
--     "quoteSent": bool,
--     "quoteApproved": bool,
--     "workOrderSaved": bool,
--     "workOrderAmount": number | null,
--     "workOrderNumber": text | null,
--     "intakeDone": bool,
--     "workStarted": bool,
--     "workFinished": bool,
--     "caseClosed": bool,
--     "workExtraPrice": number,
--     "currentScreen": text,
--     "timeline": array,
--     "quote": object,
--     "damage": array
--   }
--
-- Intentionally ABSENT:
--   linked_claim_id, claim_id, insurer, assigned_to (separate worker role),
--   storage_path, any FK to claims_records / vehicles / claims-docs.
-- ---------------------------------------------------------------------------
