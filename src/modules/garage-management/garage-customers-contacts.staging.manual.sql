-- ============================================================================
-- MANUAL RUN ONLY — Supabase SQL Editor
-- Project (required): dalia-staging / usfeoerkpcafxxlyuldl
-- FORBIDDEN:          dalia-new / qasomfndnjuixgjmjwcm / dalia-car.online
--
-- Optional column for a proper garage customer contacts directory.
-- The PUBLIC STAGING app already persists contacts without this column
-- (encoded in garage_customers.notes). Run this only if you want a real
-- jsonb column. Do not run from CI, the agent, or Production.
-- No new table. No DELETE. No Claims objects.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.garage_customers') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.garage_customers. עוצרים. לא מוסיפים contacts בלי ספר המוסך.';
  END IF;
END;
$$;

ALTER TABLE public.garage_customers
  ADD COLUMN IF NOT EXISTS contacts jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.garage_customers
  DROP CONSTRAINT IF EXISTS garage_customers_contacts_array;

ALTER TABLE public.garage_customers
  ADD CONSTRAINT garage_customers_contacts_array
  CHECK (jsonb_typeof(contacts) = 'array');

COMMENT ON COLUMN public.garage_customers.contacts IS
  'Directory of named contacts for a garage customer. Not claims contacts. Staging only.';

COMMIT;
