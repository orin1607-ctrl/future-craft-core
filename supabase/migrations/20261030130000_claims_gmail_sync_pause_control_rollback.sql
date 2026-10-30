-- Rollback for 20261030130000_claims_gmail_sync_pause_control.sql
-- SAFETY GUARANTEE: Rollback NEVER re-enables or unpauses Gmail sync!
-- GMAIL_SYNC_PAUSED is strictly preserved as 'true'.
-- The cron job is unscheduled so no background scan can fire upon rollback without explicit user approval.

-- 1. Drop the helper control functions
DROP FUNCTION IF EXISTS public.claims_gmail_pause_sync();
DROP FUNCTION IF EXISTS public.claims_gmail_resume_sync(text);

-- 2. SAFETY LOCK: Keep GMAIL_SYNC_PAUSED = 'true' (DO NOT delete or set to false)
INSERT INTO public.claims_config (key, value, updated_at)
VALUES ('GMAIL_SYNC_PAUSED', 'true', now())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();

-- 3. SAFETY LOCK: Unschedule the background dispatch cron job so rollback cannot trigger scans
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'claims-mail-dispatch-staging' LOOP
      PERFORM cron.unschedule(v_jobid);
    END LOOP;
  END IF;
END;
$$;
