-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- Canonical paste-and-run copy (with BEGIN/COMMIT for SQL Editor):
--   src/modules/garage-management/garage-customers-default-workflow.staging.manual.sql
-- ============================================================================

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
