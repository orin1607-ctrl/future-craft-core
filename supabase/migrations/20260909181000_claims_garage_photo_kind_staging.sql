-- Staging ONLY (usfeoerkpcafxxlyuldl / dalia-staging). Do not apply to Production.
-- Allow garage_photo on existing claims_documents.doc_kind check.
-- Rollback: supabase/migrations/20260909181000_claims_garage_photo_kind_staging_rollback.sql

ALTER TABLE public.claims_documents DROP CONSTRAINT IF EXISTS claims_documents_doc_kind_chk;
ALTER TABLE public.claims_documents ADD CONSTRAINT claims_documents_doc_kind_chk
  CHECK (doc_kind = ANY (ARRAY[
    'general',
    'surveyor_report',
    'surveyor_photo',
    'surveyor_attachment',
    'garage_invoice',
    'garage_photo'
  ]));
