-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Second deep-crawl call on the even minutes (the enrichment tick runs on the odd ones): identification attaches ~700
-- sites an hour, one 30-site slice per tick reads ~740. Same call size as before, ~720 more calls a day.
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-deep-2'; END $$;
SELECT cron.schedule('nr-deep-2', '*/2 * * * *', $cmd$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"deep"}'::jsonb,
    timeout_milliseconds := 150000)
  where (select enrich_running from public.nr_control where id = 1)
    and exists (select 1 from public.nr_businesses where website is not null and enr_site_checked_at is null)
$cmd$);
