-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
--
-- Canonical paste-and-run copy (with BEGIN/COMMIT for SQL Editor):
--   src/modules/garage-management/garage-media.staging.manual.sql
-- This migration is the same DDL. Supabase CLI already wraps files in a
-- transaction, so BEGIN/COMMIT are not repeated here.
--
-- Isolated garage media. Does not touch claims_records, claims-docs,
-- documents bucket, or /garage photographer storage.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.garage_is_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.garage_is_staff(uuid). עוצרים. הרץ קודם את SQL של ספר המוסך ב-Staging בלבד.';
  END IF;
  IF to_regclass('public.garage_cases') IS NULL THEN
    RAISE EXCEPTION
      'חסר public.garage_cases. עוצרים. לא יוצרים אחסון מוסך בלי תיקי מוסך.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.garage_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_case_id uuid NOT NULL REFERENCES public.garage_cases(id),
  category text NOT NULL,
  title text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT '',
  byte_size bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_media_category_check CHECK (category IN (
    'customer_order',
    'quote_photos',
    'intake',
    'angles',
    'damage',
    'during_work',
    'finish',
    'parts_invoices',
    'quotes',
    'customer_approvals',
    'intake_docs',
    'delivery',
    'other'
  )),
  CONSTRAINT garage_media_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS garage_media_case_idx
  ON public.garage_media (garage_case_id, created_at DESC);

ALTER TABLE public.garage_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_media FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.garage_media FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.garage_media TO authenticated;

DROP POLICY IF EXISTS garage_media_select_super_admin ON public.garage_media;
CREATE POLICY garage_media_select_super_admin
  ON public.garage_media FOR SELECT TO authenticated
  USING (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_media_insert_super_admin ON public.garage_media;
CREATE POLICY garage_media_insert_super_admin
  ON public.garage_media FOR INSERT TO authenticated
  WITH CHECK (public.garage_is_staff(auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'garage-media',
  'garage-media',
  false,
  20971520,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS garage_media_storage_select ON storage.objects;
DROP POLICY IF EXISTS garage_media_storage_insert ON storage.objects;

CREATE POLICY garage_media_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'garage-media' AND public.garage_is_staff(auth.uid()));

CREATE POLICY garage_media_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'garage-media' AND public.garage_is_staff(auth.uid()));
