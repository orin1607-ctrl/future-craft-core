-- ============================================================================
-- MANUAL RUN ONLY — Supabase SQL Editor
-- Project (required): dalia-staging / usfeoerkpcafxxlyuldl
-- FORBIDDEN:          dalia-new / qasomfndnjuixgjmjwcm / dalia-car.online
--
-- Audit:
--   garage_customers already exists with contact_person text (one name).
--   There is no garage_contacts table. Do not reuse Claims contacts.
--   App writes contacts to this jsonb column. It no longer encodes JSON in notes.
--
-- This script:
--   ADD COLUMN contacts jsonb on the existing table
--   CHECK that it is a JSON array
--   optionally copy leftover <!--gm-contacts:...--> markers into the column
--   strips that marker from notes
--
-- No new table. No DELETE. No TRUNCATE. No Claims. No Storage. No Auth.
-- RLS: unchanged (existing garage_is_staff / super_admin policies on the table).
-- GRANT: unchanged (SELECT, INSERT, UPDATE already granted; no DELETE).
--
-- Do not run from CI, the agent, or Production.
-- Owner approval required before this is executed on Staging.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.garage_customers') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.garage_customers. עוצרים. לא מוסיפים contacts בלי ספר המוסך.';
  END IF;

  IF to_regprocedure('public.garage_is_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.garage_is_staff(uuid). עוצרים. לא משנים RLS ולא יוצרים תחליף.';
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
  'Named contact directory for a garage customer (name, role, phone, email, notes). NOT claims contacts. Staging only.';

DO $$
DECLARE
  r record;
  marker text;
  extracted jsonb;
BEGIN
  FOR r IN
    SELECT id, notes, contacts
    FROM public.garage_customers
    WHERE notes LIKE '%<!--gm-contacts:%'
  LOOP
    BEGIN
      marker := substring(r.notes from '<!--gm-contacts:(.*?)-->');
      IF marker IS NULL OR length(trim(marker)) = 0 THEN
        CONTINUE;
      END IF;
      extracted := marker::jsonb;
      IF jsonb_typeof(extracted) <> 'array' THEN
        CONTINUE;
      END IF;
      UPDATE public.garage_customers
      SET
        contacts = CASE
          WHEN r.contacts IS NULL OR r.contacts = '[]'::jsonb THEN extracted
          ELSE r.contacts
        END,
        notes = btrim(regexp_replace(r.notes, '<!--gm-contacts:.*?-->', '', 'g'))
      WHERE id = r.id;
    EXCEPTION WHEN others THEN
      UPDATE public.garage_customers
      SET notes = btrim(regexp_replace(notes, '<!--gm-contacts:.*?-->', '', 'g'))
      WHERE id = r.id;
    END;
  END LOOP;
END;
$$;

COMMIT;
