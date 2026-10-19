-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Per-call CPU allowance: 4 sites per call, 10 workers (cron entries 9–10 added; each gated by nr_control.identify_workers).
DO $$
DECLARE w int;
BEGIN
  FOR w IN 9..10 LOOP
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-identify-' || w;
    PERFORM cron.schedule('nr-identify-' || w, '* * * * *', format($cmd$
      select net.http_post(
        url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
        body := '{"action":"identify","worker":%s}'::jsonb,
        timeout_milliseconds := 150000)
      where (select enrich_running and identify_workers >= %s from public.nr_control where id = 1)
        and exists (select 1 from public.nr_site_queue where status = 'queued')
    $cmd$, w, w));
  END LOOP;
END $$;
UPDATE public.nr_control SET identify_workers = 10, identify_batch = 4 WHERE id = 1;
