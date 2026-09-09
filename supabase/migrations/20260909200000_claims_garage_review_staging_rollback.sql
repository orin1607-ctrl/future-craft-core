-- Staging-only rollback for claims_garage_review_staging.

ALTER TABLE public.claims_garage_assignments
  DROP CONSTRAINT IF EXISTS claims_garage_assignments_review_status_check;

ALTER TABLE public.claims_garage_assignments
  DROP COLUMN IF EXISTS review_status,
  DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_by_name,
  DROP COLUMN IF EXISTS reviewed_at;
