-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Industry filters and counts for the national registry screen and the marketing work lists.
--  * nr_filter_sql (registry browse / export) keeps every existing filter; new ones are appended:
--      ind          – one or more industries (main or sub codes, or 'unclassified'), any of them matches
--      fleet_level  – documented / strong / any fleet potential;  fleet_min – known vehicles at least N
--      contact_level – official / own_site / two_groups (where a phone / e-mail was found)
--  * nr_outreach_where (work lists) gets the same industry filter
--  * nr_industry_summary(): per main and sub industry – businesses, with phone, e-mail, any contact, a named person,
--    fleet potential; cached and refreshed every 10 minutes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'nr_filter_sql_base') THEN
    ALTER FUNCTION public.nr_filter_sql(jsonb) RENAME TO nr_filter_sql_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nr_filter_sql(f jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text := public.nr_filter_sql_base(f);
BEGIN
  f := coalesce(f, '{}'::jsonb);
  IF jsonb_typeof(f->'ind') = 'array' AND jsonb_array_length(f->'ind') > 0 THEN
    IF (f->>'ind_any')::boolean IS TRUE THEN
      -- also businesses where the industry appears only among additional activities (e.g. a licence record)
      w := w || $w$ AND (b.ind_main && ARRAY(SELECT jsonb_array_elements_text($1->'ind')) OR b.ind_codes && ARRAY(SELECT jsonb_array_elements_text($1->'ind'))
                         OR b.ind_secondary && ARRAY(SELECT jsonb_array_elements_text($1->'ind'))
                         OR b.ind_secondary && ARRAY(SELECT i.code FROM public.nr_industries i WHERE i.main_code IN (SELECT jsonb_array_elements_text($1->'ind'))))$w$;
    ELSE
      w := w || $w$ AND (b.ind_main && ARRAY(SELECT jsonb_array_elements_text($1->'ind')) OR b.ind_codes && ARRAY(SELECT jsonb_array_elements_text($1->'ind')))$w$;
    END IF;
  END IF;
  IF f->>'fleet_level' = 'documented' THEN w := w || $w$ AND b.fleet_level = 'documented'$w$;
  ELSIF f->>'fleet_level' = 'strong' THEN w := w || $w$ AND b.fleet_level IN ('documented', 'strong')$w$;
  ELSIF f->>'fleet_level' = 'any' THEN w := w || ' AND b.fleet_level IS NOT NULL';
  END IF;
  IF coalesce(f->>'fleet_min', '') ~ '^\d+$' THEN w := w || $w$ AND b.fleet_min >= ($1->>'fleet_min')::int$w$; END IF;
  IF f->>'contact_level' = 'official' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.src_official)';
  ELSIF f->>'contact_level' = 'own_site' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.src_own_site)';
  ELSIF f->>'contact_level' = 'two_groups' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.src_groups >= 2)';
  END IF;
  RETURN w;
END;
$$;
GRANT EXECUTE ON FUNCTION public.nr_filter_sql(jsonb), public.nr_filter_sql_base(jsonb) TO authenticated, service_role;

-- work lists: same industry filter (literal values, this builder does not use $1)
CREATE OR REPLACE FUNCTION public.nr_outreach_ind_sql(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p->'ind') = 'array' AND jsonb_array_length(p->'ind') > 0
    THEN format(' AND (b.ind_main && %1$L::text[] OR b.ind_codes && %1$L::text[])', ARRAY(SELECT jsonb_array_elements_text(p->'ind')))
    ELSE '' END;
$$;
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.nr_outreach_where(jsonb)'::regprocedure);
  IF position('nr_outreach_ind_sql' IN d) = 0 THEN
    -- (stored text may carry CRLF line ends)
    d := regexp_replace(d, 'RETURN w;(\s*)END;', 'w := w || public.nr_outreach_ind_sql(p);\1RETURN w;\1END;');
    EXECUTE d;
  END IF;
END $$;

-- per-industry readiness counts (cached; the full pass over the registry takes a few seconds)
CREATE TABLE IF NOT EXISTS public.nr_industry_cache (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), data jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.nr_industry_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_industry_cache FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.nr_industry_cache_refresh() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public SET statement_timeout = '120s' AS $$
  WITH b AS (
    SELECT ind_main, ind_codes, has_phone, has_email, has_people, fleet_level FROM public.nr_businesses WHERE ind_at IS NOT NULL
  ), mains AS (
    SELECT m code, count(*) total, count(*) FILTER (WHERE has_phone) phone, count(*) FILTER (WHERE has_email) email,
           count(*) FILTER (WHERE has_phone OR has_email) contact, count(*) FILTER (WHERE has_people) people,
           count(*) FILTER (WHERE fleet_level IS NOT NULL) fleet, count(*) FILTER (WHERE fleet_level IN ('documented', 'strong')) fleet_strong
      FROM b, unnest(ind_main) m GROUP BY m
  ), subs AS (
    SELECT s code, count(*) total, count(*) FILTER (WHERE has_phone) phone, count(*) FILTER (WHERE has_email) email,
           count(*) FILTER (WHERE has_phone OR has_email) contact, count(*) FILTER (WHERE has_people) people,
           count(*) FILTER (WHERE fleet_level IS NOT NULL) fleet, count(*) FILTER (WHERE fleet_level IN ('documented', 'strong')) fleet_strong
      FROM b, unnest(ind_codes) s GROUP BY s
  ), d AS (
    SELECT jsonb_build_object(
      'classified', (SELECT count(*) FROM b),
      'total', (SELECT count(*) FROM public.nr_businesses),
      'unclassified', (SELECT count(*) FROM b WHERE ind_main = '{unclassified}'),
      'multi', (SELECT count(*) FROM b WHERE cardinality(ind_main) > 1),
      'mains', (SELECT jsonb_object_agg(code, to_jsonb(mains) - 'code') FROM mains),
      'subs', (SELECT jsonb_object_agg(code, to_jsonb(subs) - 'code') FROM subs),
      'taxonomy', (SELECT jsonb_agg(jsonb_build_object('code', code, 'main', main_code, 'main_label', main_label, 'sub', sub_label, 'profession', profession) ORDER BY sort)
                     FROM public.nr_industries)) data
  )
  INSERT INTO public.nr_industry_cache (id, data, at) SELECT 1, d.data, now() FROM d
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at
  RETURNING data;
$$;
REVOKE ALL ON FUNCTION public.nr_industry_cache_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_industry_cache_refresh() TO service_role;
CREATE OR REPLACE FUNCTION public.nr_industry_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT data || jsonb_build_object('at', at) INTO v FROM public.nr_industry_cache WHERE id = 1;
  IF v IS NULL THEN v := public.nr_industry_cache_refresh() || jsonb_build_object('at', now()); END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_industry_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_industry_summary() TO authenticated, service_role;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-industry-summary'; END $$;
SELECT cron.schedule('nr-industry-summary', '*/10 * * * *', $cmd$ select public.nr_industry_cache_refresh() $cmd$);
SELECT (public.nr_industry_cache_refresh())->'classified' classified;
