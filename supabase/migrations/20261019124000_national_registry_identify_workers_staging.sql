-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Edge calls fail with 546 (per-call CPU allowance) when one call parses many pages: smaller calls (8 sites), more of them.
-- Cron entries for workers 5–8 (each runs only while nr_control.identify_workers allows it). No paid resources involved.
DO $$
DECLARE w int;
BEGIN
  FOR w IN 5..8 LOOP
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
UPDATE public.nr_control SET identify_workers = 6, identify_batch = 8 WHERE id = 1;
SELECT identify_workers, identify_batch, (SELECT count(*) FROM cron.job WHERE jobname LIKE 'nr-identify-%') jobs FROM public.nr_control WHERE id = 1;
