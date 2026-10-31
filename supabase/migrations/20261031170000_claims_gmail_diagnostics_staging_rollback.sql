-- Rollback for Staging Claims diagnostics migration.
-- Staging ONLY (usfeoerkpcafxxlyuldl).

ALTER TABLE public.claims_gmail_connection
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS last_error_at,
  DROP COLUMN IF EXISTS last_error_class,
  DROP COLUMN IF EXISTS is_token_expired;

DROP TABLE IF EXISTS public.claims_gmail_sync_runs;
