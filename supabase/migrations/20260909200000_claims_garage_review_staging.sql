-- Staging-only (dalia-staging). Do not apply to any other project.
-- Adds garage-photo review columns on claims_garage_assignments.
-- Does NOT alter claims_documents. Does NOT backfill existing completed rows.

ALTER TABLE public.claims_garage_assignments
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.claims_garage_assignments
  DROP CONSTRAINT IF EXISTS claims_garage_assignments_review_status_check;

ALTER TABLE public.claims_garage_assignments
  ADD CONSTRAINT claims_garage_assignments_review_status_check
  CHECK (review_status = ANY (ARRAY[''::text, 'awaiting_review'::text, 'approved'::text, 'needs_update'::text]));
