-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- nr_stats (the registry's summary strip) counted the whole 1.2 GB businesses table plus contact points, people and
-- evidence on every call: ≈22 s, on every screen open and again every 30 s per open screen. The strip stayed on
-- "loading…" and the scans competed with the filter searches and the collection engines.
-- Now the heavy counts come from a cache refreshed every 5 minutes (engine "caches", same switch as the other caches);
-- the light parts (control, sources, runs, events, sizes) stay live. Same keys as before, plus counts_at.
-- Nothing is deleted. Backup of the previous function: backups/openprospector-filters-fix-2026-10-20/nr_stats.before.sql

CREATE TABLE IF NOT EXISTS public.nr_stats_cache (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nr_stats_cache ENABLE ROW LEVEL SECURITY;   -- read only through nr_stats (security definer)
REVOKE ALL ON public.nr_stats_cache FROM anon, authenticated;

-- the heavy counts (full scans) – only the cache job calls this
CREATE OR REPLACE FUNCTION public.nr_stats_counts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '110s'
AS $$
  SELECT jsonb_build_object(
    'businesses', count(*),
    'with_reg_id', count(*) FILTER (WHERE reg_id IS NOT NULL),
    'active', count(*) FILTER (WHERE status = 'active'),
    'with_phone', count(*) FILTER (WHERE has_phone),
    'with_verified_phone', count(*) FILTER (WHERE has_verified_phone),
    'with_email', count(*) FILTER (WHERE has_email),
    'with_website', count(*) FILTER (WHERE has_website),
    'with_social', count(*) FILTER (WHERE has_facebook OR has_instagram OR has_linkedin OR socials <> '{}'::jsonb),
    'with_people', count(*) FILTER (WHERE has_people),
    'with_employees', count(*) FILTER (WHERE employees_count IS NOT NULL),
    'with_activity', count(*) FILTER (WHERE activity_text IS NOT NULL),
    'with_fleet', count(*) FILTER (WHERE fleet_known),
    'multi_source', count(*) FILTER (WHERE source_count >= 2),
    'conflicts', count(*) FILTER (WHERE has_conflict),
    'phones', (SELECT count(*) FROM public.nr_contact_points WHERE kind = 'phone'),
    'emails', (SELECT count(*) FROM public.nr_contact_points WHERE kind = 'email'),
    'contact_points_verified', (SELECT count(*) FROM public.nr_contact_points WHERE verified),
    'contact_points_unverified', (SELECT count(*) FROM public.nr_contact_points WHERE NOT verified),
    'people', (SELECT count(*) FROM public.nr_people),
    'evidence', (SELECT count(*) FROM public.nr_evidence))
  FROM public.nr_businesses;
$$;
REVOKE ALL ON FUNCTION public.nr_stats_counts() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nr_stats_cache_refresh()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '110s'
AS $$
BEGIN
  INSERT INTO public.nr_stats_cache (id, data, at) VALUES (1, public.nr_stats_counts(), now())
  ON CONFLICT (id) DO UPDATE SET data = excluded.data, at = excluded.at;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_stats_cache_refresh() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nr_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '25s'
AS $$
DECLARE c public.nr_stats_cache;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO c FROM public.nr_stats_cache WHERE id = 1;
  RETURN coalesce(c.data, jsonb_build_object('businesses', (SELECT greatest(reltuples, 0)::bigint FROM pg_class WHERE oid = 'public.nr_businesses'::regclass)))
    || jsonb_build_object(
    'counts_at', c.at,
    'control', (SELECT to_jsonb(x) - 'lock_until' FROM public.nr_control x WHERE id = 1),
    'merged_records', (SELECT coalesce(sum(businesses_merged), 0) FROM public.nr_sources),
    'marks', (SELECT jsonb_object_agg(mark, n) FROM (SELECT mark, count(*) n FROM public.nr_marks GROUP BY 1) m),
    'sources_by_status', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.nr_sources GROUP BY status) s),
    'sources_waiting', (SELECT coalesce(jsonb_agg(name), '[]') FROM public.nr_sources WHERE status IN ('pending','collecting','error') AND kind IN ('ckan','arcgis','fleet_ckan','overpass')),
    'rate_last_hour', (SELECT coalesce(sum(businesses_new), 0) FROM public.nr_runs WHERE started_at > now() - interval '1 hour'),
    'records_last_hour', (SELECT coalesce(sum(records_read), 0) FROM public.nr_runs WHERE started_at > now() - interval '1 hour'),
    'last_run', (SELECT to_jsonb(x) FROM (SELECT * FROM public.nr_runs ORDER BY id DESC LIMIT 1) x),
    'db_mb', (SELECT round(pg_database_size(current_database()) / 1048576.0)),
    'registry_mb', (SELECT round(sum(pg_total_relation_size(k.oid)) / 1048576.0, 1) FROM pg_class k
                    JOIN pg_namespace n ON n.oid = k.relnamespace WHERE n.nspname = 'public' AND k.relkind = 'r' AND k.relname LIKE 'nr\_%'),
    'events', (SELECT coalesce(jsonb_agg(e ORDER BY e.id DESC), '[]') FROM (SELECT id, at, level, source_key, message FROM public.nr_events ORDER BY id DESC LIMIT 30) e),
    'generated_at', now());
END;
$$;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-stats-cache'; END $$;
SELECT cron.schedule('nr-stats-cache', '*/5 * * * *',
  $job$ DO $b$ BEGIN IF public.nr_engine_on('caches') THEN PERFORM public.nr_stats_cache_refresh(); END IF; END $b$ $job$);
