-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Measured 21.10.2026 on two random groups of 600 sites marked "unreachable" from Mumbai: retried from Frankfurt 57 answered
-- (9 matched / new / review), retried from Mumbai 7 answered (2). The identify workers now run in Frankfurt for good, and
-- every site marked unreachable from Mumbai gets one retry from there (statuses are backed up first; nothing is deleted).
-- This also restarts collection: the site queue had run out at 00:19 UTC.
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

CREATE TABLE IF NOT EXISTS nr_backup_20261021.unreachable_retry_all AS
  SELECT domain, status, note, attempts, checked_at, priority FROM public.nr_site_queue WHERE status = 'unreachable';
UPDATE public.nr_site_queue q SET status = 'queued', attempts = 0, priority = 150, claimed_at = NULL,
       note = 'ניסיון חוזר מפרנקפורט (לא ענה מאזור מומבאי)'
 WHERE q.status = 'unreachable'
   AND q.domain NOT IN (SELECT domain FROM nr_backup_20261021.unreachable_retry_test UNION SELECT domain FROM nr_backup_20261021.unreachable_retry_control);

SELECT (SELECT count(*) FROM public.nr_site_queue WHERE status = 'queued') queued,
       (SELECT count(*) FROM cron.job WHERE jobname LIKE 'nr-identify-%' AND command LIKE '%eu-central-1%' AND command LIKE '%nr_engine_on%') frankfurt_jobs;
