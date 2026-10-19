-- STAGING: engine health for the report – last 15 minutes next to the last hour, and what link discovery saw vs. added
CREATE OR REPLACE FUNCTION public.nr_engine_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, net AS $$
  WITH r AS (SELECT created, coalesce(status_code, 0) sc, coalesce(error_msg, content::text) body
               FROM net._http_response WHERE created > now() - interval '1 hour'),
       runs AS (SELECT error FROM public.nr_runs WHERE source_key = 'enr:site_identify' AND started_at > now() - interval '1 hour' AND error LIKE '{%}')
  SELECT jsonb_build_object(
    'calls_last_hour', (SELECT count(*) FROM r),
    'ok_last_hour', (SELECT count(*) FROM r WHERE sc = 200),
    'failed_last_hour', (SELECT count(*) FROM r WHERE sc <> 200),
    'cpu_limit_last_hour', (SELECT count(*) FROM r WHERE sc = 546),
    'calls_15m', (SELECT count(*) FROM r WHERE created > now() - interval '15 minutes'),
    'ok_15m', (SELECT count(*) FROM r WHERE created > now() - interval '15 minutes' AND sc = 200),
    'cpu_limit_15m', (SELECT count(*) FROM r WHERE created > now() - interval '15 minutes' AND sc = 546),
    'other_errors_15m', (SELECT count(*) FROM r WHERE created > now() - interval '15 minutes' AND sc NOT IN (200, 546)),
    'last_error', (SELECT left(body, 200) FROM r WHERE sc NOT IN (200, 546) ORDER BY created DESC LIMIT 1),
    'last_error_at', (SELECT max(created) FROM r WHERE sc NOT IN (200, 546)),
    'sites_checked_15m', (SELECT count(*) FROM public.nr_site_queue WHERE checked_at > now() - interval '15 minutes'),
    'links_seen_last_hour', (SELECT coalesce(sum((error::jsonb ->> 'links_seen')::int), 0) FROM runs),
    'links_new_last_hour', (SELECT coalesce(sum((error::jsonb ->> 'links_new')::int), 0) FROM runs),
    'link_discovered_queued', (SELECT count(*) FROM public.nr_site_queue WHERE source = 'enr:link_discovery'),
    'cc_graphs_harvested', (SELECT config -> 'harvested' FROM public.nr_sources WHERE key = 'enr:cc_domains'));
$$;
REVOKE ALL ON FUNCTION public.nr_engine_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_engine_health() TO authenticated, service_role;
SELECT public.nr_engine_health();
