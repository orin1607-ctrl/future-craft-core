-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Measured 21.10.2026: some Israeli business sites do not answer the Mumbai edge region (ap-south-1) at all but answer
-- Frankfurt (eu-central-1). Edge functions can be pinned to a region with the x-region header (free, documented).
-- The identify workers now run in Frankfurt, and a random 600 of the 82k sites marked "unreachable" from Mumbai are
-- retried as a measured test (note says so; nothing is deleted).
DO $$
DECLARE w int;
BEGIN
  FOR w IN 1..10 LOOP
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-identify-' || w;
    PERFORM cron.schedule('nr-identify-' || w, '* * * * *', format($cmd$
      select net.http_post(
        url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
          'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
        body := '{"action":"identify","worker":%s}'::jsonb,
        timeout_milliseconds := 150000)
      where public.nr_engine_on('identify') and (select enrich_running and identify_workers >= %s from public.nr_control where id = 1)
        and exists (select 1 from public.nr_site_queue where status = 'queued')
    $cmd$, w, w));
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS nr_backup_20261021.unreachable_retry_test AS
  SELECT domain, status, note, attempts, checked_at, priority FROM public.nr_site_queue WHERE false;
WITH pick AS (
  SELECT domain FROM public.nr_site_queue WHERE status = 'unreachable' ORDER BY md5(domain || 'fra1') LIMIT 600
), bk AS (
  INSERT INTO nr_backup_20261021.unreachable_retry_test SELECT q.domain, q.status, q.note, q.attempts, q.checked_at, q.priority FROM public.nr_site_queue q JOIN pick USING (domain) RETURNING 1
)
UPDATE public.nr_site_queue q SET status = 'queued', attempts = 0, priority = 130, note = 'ניסיון חוזר מפרנקפורט (לא ענה מאזור מומבאי)', claimed_at = NULL
  FROM pick WHERE q.domain = pick.domain;

SELECT (SELECT count(*) FROM nr_backup_20261021.unreachable_retry_test) retry_test,
       (SELECT count(*) FROM cron.job WHERE jobname LIKE 'nr-identify-%' AND command LIKE '%eu-central-1%') frankfurt_jobs;
