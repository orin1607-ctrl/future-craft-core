-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Identify workers: mixed processing order (not alphabetical), all localities named in a text (city accepted only when exactly
-- one appears), and the cron entries for up to 4 parallel workers – each one runs only while nr_control.identify_workers allows it.
CREATE OR REPLACE FUNCTION public.nr_claim_site_queue(p_limit int) RETURNS TABLE(domain text, attempts int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_site_queue q SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   WHERE q.domain IN (SELECT x.domain FROM public.nr_site_queue x
                       WHERE x.status = 'queued' OR (x.status = 'claimed' AND x.claimed_at < now() - interval '10 minutes' AND x.attempts < 3)
                       ORDER BY x.priority, md5(x.domain) LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.attempts;
$$;
CREATE INDEX IF NOT EXISTS nr_site_queue_mix ON public.nr_site_queue (priority, md5(domain)) WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.nr_cities_in_text(p_text text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT l.city), '{}') FROM public.nr_localities l
   WHERE length(l.city) >= 3 AND (' ' || regexp_replace(coalesce(p_text, ''), '[,.()\n:|]', ' ', 'g') || ' ') LIKE '% ' || l.city || ' %';
$$;
REVOKE ALL ON FUNCTION public.nr_claim_site_queue(int), public.nr_cities_in_text(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_site_queue(int), public.nr_cities_in_text(text) TO service_role;

UPDATE public.nr_control SET identify_workers = 2, identify_batch = 96 WHERE id = 1;
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'nr-identify-%'; END $$;
DO $$
DECLARE w int;
BEGIN
  FOR w IN 1..4 LOOP
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
SELECT jobname, active FROM cron.job WHERE jobname LIKE 'nr-identify-%' ORDER BY 1;
