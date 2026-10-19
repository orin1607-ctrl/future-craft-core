-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Marketing work lists over the existing national registry (no separate company table, nothing is sent to anyone).
--  * every phone / e-mail carries its level: "מאומת" (2+ independent sources) or "מקור יחיד"; facts still waiting for
--    review are only counted ("טרם אומת") and never shown as contact details
--  * segments come from recorded fields only; each signal says whether it is a documented fact or an indication
--  * inactive companies and cards marked "לא רלוונטי" / "בארכיון" are left out by default

-- segments a business belongs to (several are possible)
CREATE OR REPLACE FUNCTION public.nr_outreach_segments(b public.nr_businesses) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN coalesce(b.fleet_known, false) OR coalesce(b.fleet_vehicles, 0) > 0 OR coalesce(b.enr_fleet, false)
              OR coalesce(b.enr_hiring_drivers, false) OR coalesce(b.enr_hiring_logistics, false)
              OR b.logistics_indicators && ARRAY['הסעת נוסעים / תחבורה ציבורית', 'שליחויות / חלוקת דואר']
              OR b.sector = 'שליחויות ודואר' THEN 'fleet' END,
    CASE WHEN b.sector = 'רכב – מוסכים ומכוני רישוי' OR 'שירותי רכב' = ANY(b.logistics_indicators) THEN 'garages' END,
    CASE WHEN b.sector = 'רכב – סחר, יבוא וייצור מוצרי תעבורה' THEN 'vehicle_trade' END,
    CASE WHEN b.sector = 'דלק ותחנות תדלוק' OR 'תחנות דלק' = ANY(b.logistics_indicators) THEN 'fuel' END,
    CASE WHEN b.sector = 'בנייה וקבלנות' THEN 'construction' END,
    CASE WHEN b.sector IN ('תעשייה', 'תעשייה ומשרדים', 'תעשייה כימית', 'תעשיית מזון ומשקאות', 'יצרנות', 'מתכות', 'פסולת ושפכים', 'הנדסת סביבה ואסבסט')
         THEN 'industry' END], NULL);
$$;

-- signals behind the segments, each labelled fact / indication
CREATE OR REPLACE FUNCTION public.nr_outreach_signals(b public.nr_businesses) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(s), '[]') FROM (
    SELECT jsonb_build_object('kind', 'fact', 't', b.fleet_vehicles || ' רכבים מתועדים במקור רשמי') s WHERE coalesce(b.fleet_vehicles, 0) > 0
    -- hiring / fleet findings keep their own fact-or-indication label, title and source page
    UNION ALL SELECT jsonb_build_object('kind', f.fact_kind, 't', f.title, 'url', f.source_url, 'date', f.published_at)
      FROM (SELECT DISTINCT ON (f.category) f.* FROM public.nr_findings f
             WHERE f.business_id = b.id AND f.match_status = 'matched' AND f.category IN ('fleet', 'hiring_drivers', 'hiring_logistics')
             ORDER BY f.category, f.discovered_at DESC) f
    UNION ALL SELECT jsonb_build_object('kind', 'indication', 't', 'תחום: ' || x) FROM unnest(b.logistics_indicators) x
    UNION ALL SELECT jsonb_build_object('kind', 'indication', 't', 'ענף: ' || b.sector) WHERE b.sector IS NOT NULL
  ) q;
$$;

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
  IF p->>'level' = 'verified' THEN w := w || ' AND EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN (''phone'',''email'') AND c.verified)';
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

CREATE OR REPLACE FUNCTION public.nr_outreach_page(p_filters jsonb, p_after bigint DEFAULT 0, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY r.id), '[]') FROM (
      SELECT b.id, b.name, b.reg_id, b.corp_type, b.status, coalesce(b.main_activity, b.activity_text, b.sector) activity, b.sector, b.city, b.district, b.website,
        public.nr_outreach_segments(b) segments, public.nr_outreach_signals(b) signals,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('v', coalesce(c.display, c.value), 'kind', c.kind, 'sub', c.subkind, 'branch', c.branch_name,
                   'level', CASE WHEN c.verified THEN 'verified' ELSE 'single' END,
                   'sources', (SELECT coalesce(jsonb_agg(coalesce(s.name, k)), '[]') FROM unnest(c.sources) k LEFT JOIN public.nr_sources s ON s.key = k))
                 ORDER BY c.verified DESC, c.kind DESC, (c.subkind = 'main') DESC, c.id), '[]')
           FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind IN ('phone', 'email')) contacts,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role, 'source', coalesce(s.name, p.source_key), 'url', p.source_url) ORDER BY p.id), '[]')
           FROM (SELECT * FROM public.nr_people p WHERE p.business_id = b.id ORDER BY p.id LIMIT 6) p LEFT JOIN public.nr_sources s ON s.key = p.source_key) people,
        (SELECT count(*) FROM public.nr_findings f WHERE f.match_status = 'pending_review' AND (f.business_id = b.id OR b.id = ANY(f.candidate_ids))) pending_review
        FROM public.nr_businesses b WHERE %s AND b.id > %s ORDER BY b.id LIMIT %s) r$q$,
    public.nr_outreach_where(coalesce(p_filters, '{}')), coalesce(p_after, 0), least(greatest(coalesce(p_limit, 50), 1), 2000))
  INTO v;
  RETURN v;
END;
$$;

-- readiness numbers for the screen and the report (one pass over businesses that have any contact)
CREATE OR REPLACE FUNCTION public.nr_outreach_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH vp AS (SELECT DISTINCT business_id, kind FROM public.nr_contact_points WHERE kind IN ('phone', 'email') AND verified),
  base AS (
    SELECT b.id, b.has_phone, b.has_email, b.has_website, b.has_people, public.nr_outreach_segments(b) seg,
           EXISTS (SELECT 1 FROM vp WHERE vp.business_id = b.id AND vp.kind = 'phone') v_phone,
           EXISTS (SELECT 1 FROM vp WHERE vp.business_id = b.id AND vp.kind = 'email') v_email
      FROM public.nr_businesses b
     WHERE (b.has_phone OR b.has_email) AND coalesce(b.status, '') <> 'inactive'
       AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN ('irrelevant', 'archived'))),
  segs AS (SELECT s, count(*) total, count(*) FILTER (WHERE v_phone OR v_email) verified, count(*) FILTER (WHERE has_phone) phone,
                  count(*) FILTER (WHERE has_phone AND has_email) phone_email, count(*) FILTER (WHERE has_people) people
             FROM base, unnest(seg) s GROUP BY s)
  SELECT jsonb_build_object(
    'registry_total', (SELECT count(*) FROM public.nr_businesses),
    'with_contact', (SELECT count(*) FROM base),
    'with_phone', (SELECT count(*) FROM base WHERE has_phone),
    'with_email', (SELECT count(*) FROM base WHERE has_email),
    'with_phone_and_email', (SELECT count(*) FROM base WHERE has_phone AND has_email),
    'verified_phone', (SELECT count(*) FROM base WHERE v_phone),
    'verified_email', (SELECT count(*) FROM base WHERE v_email),
    'verified_any', (SELECT count(*) FROM base WHERE v_phone OR v_email),
    'with_people', (SELECT count(*) FROM base WHERE has_people),
    'with_website', (SELECT count(*) FROM base WHERE has_website),
    'dalia', (SELECT jsonb_build_object('total', count(*), 'verified', count(*) FILTER (WHERE v_phone OR v_email), 'phone', count(*) FILTER (WHERE has_phone))
                FROM base WHERE seg && ARRAY['fleet', 'garages', 'vehicle_trade', 'fuel']),
    'dalia_wide', (SELECT jsonb_build_object('total', count(*), 'verified', count(*) FILTER (WHERE v_phone OR v_email), 'phone', count(*) FILTER (WHERE has_phone))
                FROM base WHERE seg && ARRAY['fleet', 'garages', 'vehicle_trade', 'fuel', 'construction', 'industry']),
    'segments', (SELECT coalesce(jsonb_object_agg(s, jsonb_build_object('total', total, 'verified', verified, 'phone', phone, 'phone_email', phone_email, 'people', people)), '{}') FROM segs),
    'at', now())
  WHERE public.nr_can_read();
$$;

REVOKE ALL ON FUNCTION public.nr_outreach_page(jsonb, bigint, int), public.nr_outreach_summary(), public.nr_outreach_signals(public.nr_businesses) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_outreach_page(jsonb, bigint, int), public.nr_outreach_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nr_outreach_segments(public.nr_businesses), public.nr_outreach_where(jsonb), public.nr_outreach_signals(public.nr_businesses) TO authenticated, service_role;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.nr_outreach_summary() summary, jsonb_array_length(public.nr_outreach_page('{"segment":"dalia","level":"verified"}', 0, 50)) page_rows;
