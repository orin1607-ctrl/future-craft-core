-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- 1. Catalog source 62 (Beer Sheva licensing) was read twice (second pass after the city / 08-prefix fix):
--    the source counters show both passes together; records_read stays the number of records in the source.
UPDATE public.nr_sources SET
  businesses_new = businesses_new + coalesce((config->'first_pass'->>'businesses_new')::int, 0),
  businesses_enriched = businesses_enriched + coalesce((config->'first_pass'->>'businesses_enriched')::int, 0),
  businesses_merged = businesses_merged + coalesce((config->'first_pass'->>'businesses_merged')::int, 0),
  details_added = details_added + coalesce((config->'first_pass'->>'details_added')::int, 0),
  duration_ms = duration_ms + coalesce((config->'first_pass'->>'duration_ms')::bigint, 0),
  config = (config - 'first_pass') || jsonb_build_object('passes', 2, 'first_pass_kept_in_totals', config->'first_pass'),
  status_reason = 'הושלם בשני מעברים (השני אחרי תיקון העיר וקידומת 08); המונים כוללים את שני המעברים'
 WHERE key = 'cat:62' AND config ? 'first_pass' AND status = 'completed';

-- 2. Idle guard: the 2-minute scheduler only calls the collector when there is work (a source waiting or being
--    collected, or a business website not yet visited). With everything collected it costs one indexed lookup.
CREATE OR REPLACE FUNCTION public.nr_has_work() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.nr_control WHERE id = 1 AND running)
     AND (EXISTS (SELECT 1 FROM public.nr_sources WHERE status IN ('pending', 'collecting') AND kind IN ('ckan', 'arcgis', 'fleet_ckan', 'overpass'))
          OR EXISTS (SELECT 1 FROM public.nr_businesses WHERE website IS NOT NULL AND website_checked_at IS NULL));
$$;
REVOKE ALL ON FUNCTION public.nr_has_work() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-collector-tick';
END $$;
SELECT cron.schedule('nr-collector-tick', '*/2 * * * *', $cmd$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/national-registry-collector',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 150000)
  where public.nr_has_work()
$cmd$);
