-- Staging ONLY rollback. Restores the previous claims_documents doc_kind check.
-- Never Production.

ALTER TABLE public.claims_documents DROP CONSTRAINT IF EXISTS claims_documents_doc_kind_chk;
ALTER TABLE public.claims_documents ADD CONSTRAINT claims_documents_doc_kind_chk
  CHECK (doc_kind = ANY (ARRAY[
    'general',
    'surveyor_report',
    'surveyor_photo',
    'surveyor_attachment',
    'garage_invoice'
  ]));
