-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Continuous growth without manual starts:
--  * link discovery: Israeli business domains linked from every site the engine reads join the identify queue (priority 90)
--  * hourly feeder: when fewer than 5,000 sites are queued, the next Common Crawl quarterly graph is read automatically;
--    unreachable sites get another try after 30 days (at most 5,000 per hour)
--  * report: engine health – failed server calls in the last hour with the latest error, link-discovered domains
INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config) VALUES
  ('enr:link_discovery', 'E32', 'גילוי אתרים ישראליים מקישורים באתרים שנסרקו', NULL, 'אתרי העסקים עצמם', 'enrich_link_discovery',
    ARRAY['website','new_business'], 'שמות מתחם ישראליים עסקיים (.co.il / .org.il / .net.il) שמקושרים מאתרים שהמנוע כבר קרא בהיתר; robots.txt נבדק לכל אתר בזיהוי',
    'collecting', 'מקור מתחדש: כל אתר שנקרא מזין דומיינים חדשים לתור', 7, '{}')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, terms = EXCLUDED.terms, kind = EXCLUDED.kind, status_reason = EXCLUDED.status_reason, updated_at = now();

CREATE OR REPLACE FUNCTION public.nr_requeue_unreachable(p_days int, p_limit int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.nr_site_queue z SET status = 'queued', note = 'בדיקה חוזרת אחרי ' || p_days || ' יום', priority = 150
   WHERE z.domain IN (SELECT x.domain FROM public.nr_site_queue x WHERE x.status = 'unreachable' AND x.checked_at < now() - make_interval(days => p_days)
                       ORDER BY x.checked_at LIMIT p_limit);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_requeue_unreachable(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_requeue_unreachable(int, int) TO service_role;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-feeder'; END $$;
SELECT cron.schedule('nr-feeder', '17 * * * *', $cmd$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"feeder"}'::jsonb,
    timeout_milliseconds := 150000)
  where (select enrich_running from public.nr_control where id = 1)
$cmd$);

-- engine health for the report (pg_net keeps the server's answer to each scheduled call)
CREATE OR REPLACE FUNCTION public.nr_engine_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, net AS $$
  SELECT jsonb_build_object(
    'calls_last_hour', count(*),
    'ok_last_hour', count(*) FILTER (WHERE status_code = 200),
    'failed_last_hour', count(*) FILTER (WHERE coalesce(status_code, 0) <> 200),
    'cpu_limit_last_hour', count(*) FILTER (WHERE status_code = 546),
    'last_error', (SELECT left(coalesce(error_msg, content::text), 200) FROM net._http_response
                    WHERE created > now() - interval '1 hour' AND coalesce(status_code, 0) NOT IN (200, 546) ORDER BY id DESC LIMIT 1),
    'link_discovered_queued', (SELECT count(*) FROM public.nr_site_queue WHERE source = 'enr:link_discovery'))
  FROM net._http_response WHERE created > now() - interval '1 hour';
$$;
REVOKE ALL ON FUNCTION public.nr_engine_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_engine_health() TO authenticated, service_role;
SELECT public.nr_engine_health();
