-- ============================================================================
-- MANUAL RUN ONLY — Supabase SQL Editor
-- Project (required): dalia-staging / usfeoerkpcafxxlyuldl
-- FORBIDDEN:          dalia-new / qasomfndnjuixgjmjwcm / dalia-car.online
--
-- Isolated column on existing garage_customers.
-- Does not recreate tables. Does not touch claims_records, /garage, Production.
-- Default for existing rows: quote_first (not inferred from customer_type).
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.garage_customers') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.garage_customers. עוצרים. לא מוסיפים default_workflow בלי ספר המוסך.';
  END IF;
END;
$$;

ALTER TABLE public.garage_customers
  ADD COLUMN IF NOT EXISTS default_workflow text NOT NULL DEFAULT 'quote_first';

ALTER TABLE public.garage_customers
  DROP CONSTRAINT IF EXISTS garage_customers_default_workflow_check;

ALTER TABLE public.garage_customers
  ADD CONSTRAINT garage_customers_default_workflow_check
  CHECK (default_workflow IN ('quote_first', 'intake_first'));

COMMENT ON COLUMN public.garage_customers.default_workflow IS
  'Customer default garage case route. quote_first or intake_first. Not derived from customer_type. A case may override.';

COMMIT;
