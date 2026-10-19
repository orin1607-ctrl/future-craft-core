-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Contact reliability stored on the contact point (kept current by a trigger whenever its sources change), so the work
-- list summary and filters read columns instead of resolving every source on every request.
ALTER TABLE public.nr_contact_points
  ADD COLUMN IF NOT EXISTS src_official boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS src_own_site boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS src_other boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS src_groups smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.nr_cp_reliability_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  r := public.nr_contact_reliability(NEW.sources);
  NEW.src_official := coalesce((r->>'official')::boolean, false);
  NEW.src_own_site := coalesce((r->>'own_site')::boolean, false);
  NEW.src_other := coalesce((r->>'other')::boolean, false);
  NEW.src_groups := coalesce((r->>'groups')::int, 0);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nr_cp_reliability ON public.nr_contact_points;
CREATE TRIGGER nr_cp_reliability BEFORE INSERT OR UPDATE OF sources ON public.nr_contact_points
  FOR EACH ROW EXECUTE FUNCTION public.nr_cp_reliability_trg();

-- backfill (one pass over the source keys, not one function call per row)
WITH g AS (
  SELECT c.id,
         bool_or(s.kind IN ('ckan', 'arcgis', 'fleet_ckan')) off,
         bool_or(s.kind IN ('website', 'enrich_web_deep', 'enrich_site_identify', 'enrich_web_discovery', 'enrich_watch')) site,
         bool_or(s.kind IS NULL OR s.kind NOT IN ('ckan', 'arcgis', 'fleet_ckan', 'website', 'enrich_web_deep', 'enrich_site_identify', 'enrich_web_discovery', 'enrich_watch')) oth
    FROM public.nr_contact_points c CROSS JOIN LATERAL unnest(c.sources) k LEFT JOIN public.nr_sources s ON s.key = k
   GROUP BY c.id)
UPDATE public.nr_contact_points c SET src_official = g.off, src_own_site = g.site, src_other = g.oth,
  src_groups = (g.off::int + g.site::int + g.oth::int)
  FROM g WHERE c.id = g.id;
CREATE INDEX IF NOT EXISTS nr_cp_rel_idx ON public.nr_contact_points (business_id) WHERE src_official OR src_groups >= 2;

CREATE OR REPLACE FUNCTION public.nr_outreach_where(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text := CASE WHEN coalesce((p->>'include_no_contact')::boolean, false) THEN 'true' ELSE '(b.has_phone OR b.has_email)' END;
BEGIN
  IF NOT coalesce((p->>'include_inactive')::boolean, false) THEN w := w || ' AND coalesce(b.status, '''') <> ''inactive'''; END IF;
  w := w || ' AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN (''irrelevant'', ''archived''))';
  IF p->>'segment' = 'dalia' THEN w := w || ' AND public.nr_outreach_segments(b) && ARRAY[''fleet'',''garages'',''vehicle_trade'',''fuel'']';
  ELSIF p->>'segment' = 'dalia_wide' THEN w := w || ' AND public.nr_outreach_segments(b) && ARRAY[''fleet'',''garages'',''vehicle_trade'',''fuel'',''construction'',''industry'']';
  ELSIF coalesce(p->>'segment', '') NOT IN ('', 'all') THEN w := w || format(' AND %L = ANY(public.nr_outreach_segments(b))', p->>'segment');
  END IF;
  IF p->>'fleet' = 'documented' THEN w := w || ' AND b.fleet_level = ''documented''';
  ELSIF p->>'fleet' = 'strong' THEN w := w || ' AND b.fleet_level IN (''documented'', ''strong'')';
  ELSIF p->>'fleet' = 'any' THEN w := w || ' AND b.fleet_level IS NOT NULL';
  END IF;
  IF coalesce(p->>'fleet_min', '') ~ '^\d+$' THEN w := w || format(' AND b.fleet_min >= %s', (p->>'fleet_min')::int); END IF;
  IF p->>'contact_role' = 'fleet' THEN w := w || ' AND b.fleet_contact LIKE ''%fleet%''';
  ELSIF p->>'contact_role' = 'ops' THEN w := w || ' AND (b.fleet_contact LIKE ''%fleet%'' OR b.fleet_contact LIKE ''%ops%'')';
  ELSIF p->>'contact_role' = 'any' THEN w := w || ' AND b.fleet_contact IS NOT NULL';
  END IF;
  IF p->>'level' IN ('verified', 'two_groups') THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.src_groups >= 2)';
  ELSIF p->>'level' = 'official' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.src_official)';
  ELSIF p->>'level' = 'own_site' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.src_own_site)';
  ELSIF p->>'level' = 'phone' THEN w := w || ' AND b.has_phone';
  ELSIF p->>'level' = 'phone_email' THEN w := w || ' AND b.has_phone AND b.has_email';
  END IF;
  IF coalesce((p->>'has_people')::boolean, false) THEN w := w || ' AND b.has_people'; END IF;
  IF coalesce((p->>'has_website')::boolean, false) THEN w := w || ' AND b.has_website'; END IF;
  IF coalesce(p->>'district', '') <> '' THEN w := w || format(' AND b.district = %L', p->>'district'); END IF;
  IF coalesce(p->>'city', '') <> '' THEN w := w || format(' AND b.city = %L', p->>'city'); END IF;
  IF coalesce(p->>'q', '') <> '' THEN w := w || format(' AND b.name ILIKE %L', '%' || (p->>'q') || '%'); END IF;
  RETURN w;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_outreach_summary_compute() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cp AS (
    SELECT c.business_id,
           bool_or(c.kind = 'phone' AND c.src_groups >= 2) p2, bool_or(c.kind = 'email' AND c.src_groups >= 2) e2,
           bool_or(c.kind = 'phone' AND c.src_official) p_off, bool_or(c.kind = 'phone' AND c.src_own_site) p_site
      FROM public.nr_contact_points c WHERE c.kind IN ('phone', 'email') AND (c.src_groups >= 2 OR c.src_official OR c.src_own_site) GROUP BY c.business_id),
  base AS (
    SELECT b.id, b.has_phone, b.has_email, b.has_website, b.has_people, public.nr_outreach_segments(b) seg,
           b.fleet_level, b.fleet_min, b.fleet_contact,
           coalesce(cp.p2, false) v_phone, coalesce(cp.e2, false) v_email, coalesce(cp.p_off, false) p_off, coalesce(cp.p_site, false) p_site
      FROM public.nr_businesses b LEFT JOIN cp ON cp.business_id = b.id
     WHERE (b.has_phone OR b.has_email) AND coalesce(b.status, '') <> 'inactive'
       AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN ('irrelevant', 'archived'))),
  segs AS (SELECT s, count(*) total, count(*) FILTER (WHERE v_phone OR v_email) verified, count(*) FILTER (WHERE has_phone) phone,
                  count(*) FILTER (WHERE has_phone AND has_email) phone_email, count(*) FILTER (WHERE has_people) people
             FROM base, unnest(seg) s GROUP BY s),
  fl AS (SELECT b.fleet_level, b.fleet_contact, b.fleet_min, (b.has_phone OR b.has_email) usable, b.has_phone, b.has_email
           FROM public.nr_businesses b WHERE b.fleet_level IS NOT NULL AND coalesce(b.status, '') <> 'inactive'
            AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN ('irrelevant', 'archived')))
  SELECT jsonb_build_object(
    'registry_total', (SELECT count(*) FROM public.nr_businesses),
    'with_contact', (SELECT count(*) FROM base),
    'with_phone', (SELECT count(*) FROM base WHERE has_phone),
    'with_email', (SELECT count(*) FROM base WHERE has_email),
    'with_phone_and_email', (SELECT count(*) FROM base WHERE has_phone AND has_email),
    'verified_phone', (SELECT count(*) FROM base WHERE v_phone),
    'verified_email', (SELECT count(*) FROM base WHERE v_email),
    'verified_any', (SELECT count(*) FROM base WHERE v_phone OR v_email),
    'phone_official', (SELECT count(*) FROM base WHERE p_off),
    'phone_own_site', (SELECT count(*) FROM base WHERE p_site),
    'with_people', (SELECT count(*) FROM base WHERE has_people),
    'with_website', (SELECT count(*) FROM base WHERE has_website),
    'dalia', (SELECT jsonb_build_object('total', count(*), 'verified', count(*) FILTER (WHERE v_phone OR v_email), 'phone', count(*) FILTER (WHERE has_phone))
                FROM base WHERE seg && ARRAY['fleet', 'garages', 'vehicle_trade', 'fuel']),
    'dalia_wide', (SELECT jsonb_build_object('total', count(*), 'verified', count(*) FILTER (WHERE v_phone OR v_email), 'phone', count(*) FILTER (WHERE has_phone))
                FROM base WHERE seg && ARRAY['fleet', 'garages', 'vehicle_trade', 'fuel', 'construction', 'industry']),
    'fleet', (SELECT jsonb_build_object(
        'total', count(*), 'usable', count(*) FILTER (WHERE usable), 'phone_email', count(*) FILTER (WHERE has_phone AND has_email),
        'documented', count(*) FILTER (WHERE fleet_level = 'documented'), 'documented_usable', count(*) FILTER (WHERE fleet_level = 'documented' AND usable),
        'strong', count(*) FILTER (WHERE fleet_level = 'strong'), 'strong_usable', count(*) FILTER (WHERE fleet_level = 'strong' AND usable),
        'possible', count(*) FILTER (WHERE fleet_level = 'possible'), 'possible_usable', count(*) FILTER (WHERE fleet_level = 'possible' AND usable),
        'contact_fleet', count(*) FILTER (WHERE fleet_contact LIKE '%fleet%'), 'contact_ops', count(*) FILTER (WHERE fleet_contact LIKE '%ops%'),
        'contact_owner', count(*) FILTER (WHERE fleet_contact LIKE '%owner%'), 'contact_any', count(*) FILTER (WHERE fleet_contact IS NOT NULL),
        'min_5', count(*) FILTER (WHERE fleet_min >= 5), 'min_20', count(*) FILTER (WHERE fleet_min >= 20), 'min_100', count(*) FILTER (WHERE fleet_min >= 100)) FROM fl),
    'segments', (SELECT coalesce(jsonb_object_agg(s, jsonb_build_object('total', total, 'verified', verified, 'phone', phone, 'phone_email', phone_email, 'people', people)), '{}') FROM segs),
    'at', now());
$$;
REVOKE ALL ON FUNCTION public.nr_outreach_summary_compute() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_outreach_summary_compute() TO service_role;

-- the screen reads a copy refreshed hourly with the fleet levels (the full count takes ~5 s); a stale or missing copy is recomputed
CREATE TABLE IF NOT EXISTS public.nr_outreach_cache (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), data jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.nr_outreach_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_outreach_cache FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.nr_outreach_cache_refresh() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.nr_outreach_cache (id, data, at) VALUES (1, public.nr_outreach_summary_compute(), now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at
  RETURNING data;
$$;
REVOKE ALL ON FUNCTION public.nr_outreach_cache_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_outreach_cache_refresh() TO service_role;
CREATE OR REPLACE FUNCTION public.nr_outreach_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT data INTO v FROM public.nr_outreach_cache WHERE id = 1 AND at > now() - interval '2 hours';
  IF v IS NULL THEN v := public.nr_outreach_cache_refresh(); END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_outreach_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_outreach_summary() TO authenticated, service_role;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-fleet-refresh'; END $$;
SELECT cron.schedule('nr-fleet-refresh', '41 * * * *', $cmd$ select public.nr_fleet_refresh(); select public.nr_outreach_cache_refresh() $cmd$);
SELECT (public.nr_outreach_cache_refresh())->'fleet' fleet;

