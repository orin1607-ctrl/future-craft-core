-- Oren Car Production: required insurance claim number and searchable
-- accident-document metadata. Additive only; no data backfill or policy changes.

ALTER TABLE public.accidents
  ADD COLUMN IF NOT EXISTS claim_number text NOT NULL DEFAULT '';

ALTER TABLE public.document_metadata
  ADD COLUMN IF NOT EXISTS claim_number text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS accidents_company_claim_number_idx
  ON public.accidents (company_name, claim_number)
  WHERE claim_number <> '';

CREATE INDEX IF NOT EXISTS document_metadata_company_claim_number_idx
  ON public.document_metadata (company_name, claim_number)
  WHERE claim_number <> '';
