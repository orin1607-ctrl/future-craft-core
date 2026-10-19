-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Lead stream stats: the registry-wide counts (evaluated / waiting / rejection reasons) scan ~45k rows, so they are cached
-- every 5 minutes; the lead counts themselves (prospect_leads, a few thousand rows) stay live.
CREATE TABLE IF NOT EXISTS public.nr_leads_cache (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), data jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.nr_leads_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_leads_cache FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.nr_leads_cache_refresh() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.nr_leads_cache (id, data, at)
  SELECT 1, jsonb_build_object(
    'evaluated', (SELECT count(*) FROM public.nr_businesses WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL),
    'waiting', (SELECT count(*) FROM public.nr_businesses b WHERE b.fleet_level IS NOT NULL AND b.reg_id ~ '^5[0-9]{8}$' AND coalesce(b.status, '') <> 'inactive'
                 AND (b.lead_checked_at IS NULL OR b.lead_checked_at < b.fleet_at)
                 AND NOT EXISTS (SELECT 1 FROM public.prospect_leads l WHERE l.company_hp = b.reg_id)),
    'rejected_reasons', (SELECT coalesce(jsonb_object_agg(lead_result, c), '{}') FROM (SELECT lead_result, count(*) c FROM public.nr_businesses
                          WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL AND lead_grade IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6) x),
    'last_run', (SELECT max(lead_checked_at) FROM public.nr_businesses WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL)), now()
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at
  RETURNING data;
$$;
REVOKE ALL ON FUNCTION public.nr_leads_cache_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_leads_cache_refresh() TO service_role;

CREATE OR REPLACE FUNCTION public.nr_leads_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT data || jsonb_build_object('cache_at', at) INTO c FROM public.nr_leads_cache WHERE id = 1;
  RETURN coalesce(c, '{}') || jsonb_build_object(
    'total', (SELECT count(*) FROM public.prospect_leads WHERE source_keyword = 'national_registry'),
    'today', (SELECT count(*) FROM public.prospect_leads WHERE source_keyword = 'national_registry' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem'),
    'last_hour', (SELECT count(*) FROM public.prospect_leads WHERE source_keyword = 'national_registry' AND created_at > now() - interval '1 hour'),
    'by_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) n FROM public.prospect_leads WHERE source_keyword = 'national_registry' GROUP BY 1) x),
    'by_tier', (SELECT coalesce(jsonb_object_agg(coalesce(tier, '-'), n), '{}') FROM (SELECT tier, count(*) n FROM public.prospect_leads WHERE source_keyword = 'national_registry' GROUP BY 1) x),
    'last_lead', (SELECT max(created_at) FROM public.prospect_leads WHERE source_keyword = 'national_registry'));
END;
$$;
REVOKE ALL ON FUNCTION public.nr_leads_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_leads_stats() TO authenticated, service_role;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-leads-cache'; END $$;
SELECT cron.schedule('nr-leads-cache', '*/5 * * * *', $cmd$ select public.nr_leads_cache_refresh() $cmd$);
SELECT public.nr_leads_cache_refresh() IS NOT NULL ok;
