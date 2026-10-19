-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Lead stream schedule (applied after the nr-enrichment "leads" action is deployed): every 2 minutes, in the cloud.
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-leads'; END $$;
SELECT cron.schedule('nr-leads', '*/2 * * * *', $cmd$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"leads"}'::jsonb,
    timeout_milliseconds := 150000)
  where (select enrich_running from public.nr_control where id = 1)
$cmd$);
