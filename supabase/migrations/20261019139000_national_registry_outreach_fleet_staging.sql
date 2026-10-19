-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Work lists, round 2: fleet potential filters, relevant contacts, contact reliability by source group, sort by fleet score.
-- Reliability is about WHERE a detail was found (official register / the company's own site / other), never whether a
-- number is active – that is only known after a call.
CREATE OR REPLACE FUNCTION public.nr_outreach_where(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text := '(b.has_phone OR b.has_email)';
BEGIN
  IF NOT coalesce((p->>'include_inactive')::boolean, false) THEN w := w || ' AND coalesce(b.status, '''') <> ''inactive'''; END IF;
  w := w || ' AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN (''irrelevant'', ''archived''))';
  IF p->>'segment' = 'dalia' THEN w := w || ' AND public.nr_outreach_segments(b) && ARRAY[''fleet'',''garages'',''vehicle_trade'',''fuel'']';
  ELSIF p->>'segment' = 'dalia_wide' THEN w := w || ' AND public.nr_outreach_segments(b) && ARRAY[''fleet'',''garages'',''vehicle_trade'',''fuel'',''construction'',''industry'']';
  ELSIF coalesce(p->>'segment', '') NOT IN ('', 'all') THEN w := w || format(' AND %L = ANY(public.nr_outreach_segments(b))', p->>'segment');
  END IF;
  -- fleet potential
  IF p->>'fleet' = 'documented' THEN w := w || ' AND b.fleet_level = ''documented''';
  ELSIF p->>'fleet' = 'strong' THEN w := w || ' AND b.fleet_level IN (''documented'', ''strong'')';
  ELSIF p->>'fleet' = 'any' THEN w := w || ' AND b.fleet_level IS NOT NULL';
  END IF;
  IF coalesce(p->>'fleet_min', '') ~ '^\d+$' THEN w := w || format(' AND b.fleet_min >= %s', (p->>'fleet_min')::int); END IF;
  IF p->>'contact_role' = 'fleet' THEN w := w || ' AND b.fleet_contact LIKE ''%fleet%''';
  ELSIF p->>'contact_role' = 'ops' THEN w := w || ' AND (b.fleet_contact LIKE ''%fleet%'' OR b.fleet_contact LIKE ''%ops%'')';
  ELSIF p->>'contact_role' = 'any' THEN w := w || ' AND b.fleet_contact IS NOT NULL';
  END IF;
  -- contact details and where they were found
  IF p->>'level' IN ('verified', 'two_groups') THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND cardinality(c.sources) > 1 AND (public.nr_contact_reliability(c.sources)->>''groups'')::int >= 2)';
  ELSIF p->>'level' = 'official' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND (public.nr_contact_reliability(c.sources)->>''official'')::boolean)';
  ELSIF p->>'level' = 'own_site' THEN
    w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND (public.nr_contact_reliability(c.sources)->>''own_site'')::boolean)';
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

-- p_after: last id (sort by id) or the row offset (sort = 'fleet', strongest evidence first)
CREATE OR REPLACE FUNCTION public.nr_outreach_page(p_filters jsonb, p_after bigint DEFAULT 0, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; f jsonb := coalesce(p_filters, '{}'); by_fleet boolean := coalesce(p_filters->>'sort', '') = 'fleet';
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY r.ord), '[]') FROM (
      SELECT row_number() OVER (ORDER BY %s) ord, b.id, b.name, b.reg_id, b.corp_type, b.status, coalesce(b.main_activity, b.activity_text, b.sector) activity, b.sector, b.city, b.district, b.website,
        b.fleet_level, b.fleet_min, b.fleet_evidence, b.fleet_contact, b.employees_count,
        public.nr_outreach_segments(b) segments, public.nr_outreach_signals(b) signals,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('v', coalesce(c.display, c.value), 'kind', c.kind, 'sub', c.subkind, 'branch', c.branch_name,
                   'rel', public.nr_contact_reliability(c.sources),
                   'sources', (SELECT coalesce(jsonb_agg(coalesce(s.name, k)), '[]') FROM unnest(c.sources) k LEFT JOIN public.nr_sources s ON s.key = k))
                 ORDER BY (public.nr_contact_reliability(c.sources)->>'groups')::int DESC, c.kind DESC, (c.subkind = 'main') DESC, c.id), '[]')
           FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN ('phone', 'email')) contacts,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role, 'cat', p.cat, 'phone', p.phone, 'email', p.email,
                   'source', coalesce(s.name, p.source_key), 'url', p.source_url)
                 ORDER BY CASE p.cat WHEN 'fleet' THEN 0 WHEN 'ops' THEN 1 WHEN 'owner' THEN 2 ELSE 3 END, p.id), '[]')
           FROM (SELECT p.*, public.nr_role_cat(p.role) cat FROM public.nr_people p WHERE p.business_id = b.id
                  ORDER BY CASE public.nr_role_cat(p.role) WHEN 'fleet' THEN 0 WHEN 'ops' THEN 1 WHEN 'owner' THEN 2 ELSE 3 END, p.id LIMIT 6) p
           LEFT JOIN public.nr_sources s ON s.key = p.source_key) people,
        (SELECT count(*) FROM public.nr_findings fd WHERE fd.match_status = 'pending_review' AND (fd.business_id = b.id OR b.id = ANY(fd.candidate_ids))) pending_review
        FROM public.nr_businesses b WHERE %s %s ORDER BY %s LIMIT %s %s) r$q$,
    CASE WHEN by_fleet THEN 'b.fleet_score DESC NULLS LAST, b.id' ELSE 'b.id' END,
    public.nr_outreach_where(f),
    CASE WHEN by_fleet THEN '' ELSE format('AND b.id > %s', coalesce(p_after, 0)) END,
    CASE WHEN by_fleet THEN 'b.fleet_score DESC NULLS LAST, b.id' ELSE 'b.id' END,
    least(greatest(coalesce(p_limit, 50), 1), 2000),
    CASE WHEN by_fleet THEN format('OFFSET %s', greatest(coalesce(p_after, 0), 0)) ELSE '' END)
  INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_outreach_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cp AS (
    SELECT c.business_id,
           bool_or(c.kind = 'phone' AND (public.nr_contact_reliability(c.sources)->>'groups')::int >= 2) p2,
           bool_or(c.kind = 'email' AND (public.nr_contact_reliability(c.sources)->>'groups')::int >= 2) e2,
           bool_or(c.kind = 'phone' AND (public.nr_contact_reliability(c.sources)->>'official')::boolean) p_off,
           bool_or(c.kind = 'phone' AND (public.nr_contact_reliability(c.sources)->>'own_site')::boolean) p_site
      FROM public.nr_contact_points c WHERE c.kind IN ('phone', 'email') GROUP BY c.business_id),
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
    'at', now())
  WHERE public.nr_can_read();
$$;
REVOKE ALL ON FUNCTION public.nr_outreach_page(jsonb, bigint, int), public.nr_outreach_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_outreach_page(jsonb, bigint, int), public.nr_outreach_summary() TO authenticated, service_role;
