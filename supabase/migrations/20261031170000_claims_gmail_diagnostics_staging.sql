-- Staging Claims only (usfeoerkpcafxxlyuldl).
-- Adds persistent diagnostic fields to claims_gmail_connection and sync run history.
-- Does NOT affect Production (qasomfndnjuixgjmjwcm). Does NOT touch customer data or pause flags.

ALTER TABLE public.claims_gmail_connection
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_class text,
  ADD COLUMN IF NOT EXISTS is_token_expired boolean DEFAULT false;

-- Table to store sync run summaries for monitoring (read-only for control center)
CREATE TABLE IF NOT EXISTS public.claims_gmail_sync_runs (
  id text PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  scanned_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  pending_review_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  duration_ms integer,
  trigger_source text DEFAULT 'cron'
);

ALTER TABLE public.claims_gmail_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.claims_gmail_sync_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_gmail_sync_runs FROM anon;
GRANT SELECT ON TABLE public.claims_gmail_sync_runs TO authenticated;
GRANT ALL ON TABLE public.claims_gmail_sync_runs TO service_role;
