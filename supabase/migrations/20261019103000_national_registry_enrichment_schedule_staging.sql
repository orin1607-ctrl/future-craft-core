-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Enrichment: the government Employment Service blocks the cloud server (HTTP 403 from the Supabase region, served
-- normally to Israeli visitors). Not bypassed: the source is marked blocked with the exact reason. Schedule turned on.

UPDATE public.nr_sources SET status = 'blocked', updated_at = now(),
  status_reason = 'נבדק 19.10.2026: האתר מתיר קריאה (robots.txt פתוח, תנאי השימוש אינם אוסרים) ועובד מכתובת ישראלית, אבל חוסם את שרת הענן של Supabase (HTTP 403 לכל בקשה מאזור השרת). לא נעקף. ניתן להפעיל רק מתחנה בישראל – בהחלטת בעל המערכת.'
 WHERE key = 'enr:taasuka_jobs';

CREATE OR REPLACE FUNCTION public.nr_enrich_has_work() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT enrich_running FROM public.nr_control WHERE id = 1), false) AND (
       EXISTS (SELECT 1 FROM public.nr_sources WHERE key LIKE 'enr:%' AND kind LIKE 'enrich%' AND status IN ('pending','collecting') AND key <> 'enr:news_rss')
    OR EXISTS (SELECT 1 FROM public.nr_jobs j JOIN public.nr_sources s ON s.key = j.source_key AND s.status NOT IN ('blocked','unsupported') WHERE j.status = 'queued')
    OR EXISTS (SELECT 1 FROM public.nr_domain_queue WHERE status = 'queued')
    OR EXISTS (SELECT 1 FROM public.nr_businesses WHERE website IS NOT NULL AND enr_site_checked_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.nr_sources WHERE key = 'enr:taasuka_jobs' AND status NOT IN ('blocked','unsupported')
                AND coalesce((config->>'sitemap_loaded_at')::timestamptz, 'epoch') < now() - interval '24 hours')
    OR EXISTS (SELECT 1 FROM public.nr_sources WHERE key = 'enr:news_rss' AND status NOT IN ('blocked','unsupported') AND (last_run_at IS NULL OR last_run_at < now() - interval '3 hours')));
$$;
REVOKE ALL ON FUNCTION public.nr_enrich_has_work() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('nr-enrich-tick','nr-enrich-flags','nr-enrich-weekly'); END $$;
SELECT cron.schedule('nr-enrich-tick', '1-59/2 * * * *', $cmd$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 150000)
  where public.nr_enrich_has_work()
$cmd$);
SELECT cron.schedule('nr-enrich-flags', '*/5 * * * *', $cmd$ select public.nr_refresh_enrich_recent(7) $cmd$);
SELECT cron.schedule('nr-enrich-weekly', '45 3 * * 1', $cmd$ select public.nr_requeue_jobs(), public.nr_fill_domain_queue() $cmd$);
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'nr-enrich%';
