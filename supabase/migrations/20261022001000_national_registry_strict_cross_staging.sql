-- Staging ONLY. Refuses to run unless the staging social cron (usfeoerkpcafxxlyuldl) is already installed.
-- Does not copy business rows, does not delete businesses, does not touch Production.
-- New engines osm_cross and wd_bulk default OFF (including after "start all"), so nothing new is collected
-- until a person switches them on after a verified database backup and a deploy of the matching edge functions.
-- Matching for these two sources is stricter than nr_match_business: a company number or a domain is not enough
-- when the organisation name contradicts. Uncertain rows go to review. Nothing is marked scanned unless it was.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'nr-social-auto' AND command LIKE '%usfeoerkpcafxxlyuldl%'
  ) THEN
    RAISE EXCEPTION 'refusing strict-cross migration: staging job nr-social-auto was not found';
  END IF;
END
$guard$;

-- ── name agreement (two known strings only; never a scan of the registry) ──
CREATE OR REPLACE FUNCTION public.nr_names_agree(p_a text, p_b text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  WITH n AS (SELECT public.nr_norm_name(p_a) a, public.nr_norm_name(p_b) b)
  SELECT CASE
    WHEN length(a) < 3 OR length(b) < 3 THEN false
    WHEN a = b THEN true
    WHEN least(length(a), length(b)) >= 5 AND (position(b in a) > 0 OR position(a in b) > 0) THEN true
    WHEN similarity(a, b) >= 0.72 THEN true
    ELSE false
  END FROM n;
$$;

-- Strict attach. status matched only when one signal and the names agree.
-- reg_id / domain / phone with a contradictory name, or with no name at all, stays pending_review.
-- Two signals that point at different companies stay pending_review. No new business is created here.
CREATE OR REPLACE FUNCTION public.nr_match_strict(
  p_name text, p_name_en text DEFAULT NULL, p_city text DEFAULT NULL,
  p_reg text DEFAULT NULL, p_domain text DEFAULT NULL, p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_reg text := nullif(regexp_replace(coalesce(p_reg, ''), '\D', '', 'g'), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_city text := public.nr_norm_city(p_city);
  v_norm text := public.nr_norm_name(coalesce(nullif(p_name, ''), p_name_en));
  v_id bigint; v_phone_id bigint; v_dom bigint; v_name_id bigint;
  v_ids bigint[] := '{}'; v_b public.nr_businesses; v_agree boolean; v_named boolean;
  v_cands bigint[];
BEGIN
  IF v_reg IS NOT NULL AND length(v_reg) >= 8 THEN
    SELECT id INTO v_id FROM public.nr_businesses WHERE reg_id = v_reg;
  END IF;
  IF v_phone LIKE '972%' THEN v_phone := '0' || substring(v_phone FROM 4); END IF;
  IF v_phone ~ '^0(5[0-9]|7[0-9]|[23489])[0-9]{7}$' OR v_phone ~ '^1(700|800|599)[0-9]{6}$' THEN
    SELECT CASE WHEN count(DISTINCT business_id) = 1 THEN min(business_id) END INTO v_phone_id
      FROM public.nr_contact_points
     WHERE kind = 'phone' AND value IN (v_phone, '972' || substring(v_phone FROM 2));
  ELSE
    v_phone := NULL;
  END IF;
  IF coalesce(p_domain, '') <> '' THEN
    v_dom := public.nr_business_by_domain(p_domain);
  END IF;
  IF v_id IS NOT NULL THEN v_ids := v_ids || v_id; END IF;
  IF v_phone_id IS NOT NULL THEN v_ids := v_ids || v_phone_id; END IF;
  IF v_dom IS NOT NULL THEN v_ids := v_ids || v_dom; END IF;
  SELECT array_agg(DISTINCT x) INTO v_cands FROM unnest(v_ids) x;

  v_named := length(public.nr_norm_name(p_name)) >= 3 OR length(public.nr_norm_name(p_name_en)) >= 3;

  IF v_cands IS NOT NULL AND cardinality(v_cands) > 1 THEN
    RETURN jsonb_build_object('status', 'pending_review', 'method', 'signals_disagree', 'candidates', to_jsonb(v_cands));
  END IF;
  IF v_cands IS NOT NULL AND cardinality(v_cands) = 1 THEN
    SELECT * INTO v_b FROM public.nr_businesses WHERE id = v_cands[1];
    v_agree := public.nr_names_agree(p_name, v_b.name) OR public.nr_names_agree(p_name, v_b.name_en)
            OR public.nr_names_agree(p_name_en, v_b.name) OR public.nr_names_agree(p_name_en, v_b.name_en);
    IF NOT v_named THEN
      RETURN jsonb_build_object('status', 'pending_review', 'method', 'missing_name', 'id', v_b.id, 'candidates', to_jsonb(v_cands));
    END IF;
    IF NOT v_agree THEN
      RETURN jsonb_build_object('status', 'pending_review', 'method', 'name_contradiction', 'id', v_b.id, 'candidates', to_jsonb(v_cands));
    END IF;
    RETURN jsonb_build_object('status', 'matched', 'id', v_b.id,
      'method', CASE WHEN v_id IS NOT NULL THEN 'reg_id+name' WHEN v_phone_id IS NOT NULL THEN 'phone+name' ELSE 'domain+name' END,
      'candidates', to_jsonb(v_cands));
  END IF;

  -- exact registered name in one city, and only one such company. Not a company-number or domain guess.
  IF v_city IS NOT NULL AND length(v_norm) >= 4 THEN
    SELECT count(*)::bigint, min(id) INTO v_id, v_name_id
      FROM (SELECT id FROM public.nr_businesses WHERE name_norm = v_norm AND city_norm = v_city LIMIT 3) q;
    IF v_id = 1 THEN
      RETURN jsonb_build_object('status', 'matched', 'id', v_name_id, 'method', 'name+city', 'candidates', jsonb_build_array(v_name_id));
    END IF;
    IF v_id > 1 THEN
      SELECT array_agg(id) INTO v_cands FROM (
        SELECT id FROM public.nr_businesses WHERE name_norm = v_norm AND city_norm = v_city LIMIT 3) q;
      RETURN jsonb_build_object('status', 'pending_review', 'method', 'several_same_name', 'candidates', to_jsonb(v_cands));
    END IF;
  END IF;
  RETURN jsonb_build_object('status', 'unmatched', 'method', 'no_strict_match', 'candidates', '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_match_strict(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_match_strict(text, text, text, text, text, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.nr_cross_seen (
  source text NOT NULL,
  rid text NOT NULL,
  result text NOT NULL CHECK (result IN ('matched', 'review', 'unmatched')),
  business_id bigint,
  method text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, rid)
);
ALTER TABLE public.nr_cross_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_cross_seen FROM anon, authenticated;

-- Apply one page. Creates no businesses. Does not write a company number onto a card.
-- A row already in nr_cross_seen is skipped, so a crash resumes without a second save.
CREATE OR REPLACE FUNCTION public.nr_apply_cross_rows(p_source text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  r jsonb; m jsonb; v_row jsonb; v_saved jsonb;
  v_matched int := 0; v_review int := 0; v_unmatched int := 0; v_skip int := 0;
  v_phone text;
BEGIN
  IF p_source NOT IN ('osm:tiles', 'enr:wikidata_bulk') THEN
    RAISE EXCEPTION 'source not allowed for strict cross apply: %', p_source;
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    IF coalesce(r->>'rid', '') = '' THEN v_skip := v_skip + 1; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.nr_cross_seen s WHERE s.source = p_source AND s.rid = r->>'rid') THEN
      v_skip := v_skip + 1; CONTINUE;
    END IF;
    v_phone := NULL;
    IF jsonb_typeof(r->'phones') = 'array' THEN
      SELECT p->>'v' INTO v_phone FROM jsonb_array_elements(r->'phones') p WHERE coalesce(p->>'v', '') <> '' LIMIT 1;
    END IF;
    m := public.nr_match_strict(r->>'name', r->>'name_en', r->>'city', r->>'reg_id', r->>'domain', v_phone);
    IF m->>'status' = 'matched' AND nullif(m->>'id', '') IS NOT NULL THEN
      v_row := (r - 'reg_id') || jsonb_build_object('business_id', (m->>'id')::bigint, 'create', false);
      v_saved := public.nr_ingest(p_source, jsonb_build_array(v_row));
      INSERT INTO public.nr_cross_seen (source, rid, result, business_id, method)
      VALUES (p_source, r->>'rid', 'matched', (m->>'id')::bigint, m->>'method');
      v_matched := v_matched + 1;
    ELSIF m->>'status' = 'pending_review' THEN
      PERFORM public.nr_put_finding(jsonb_build_object(
        'candidates', coalesce(m->'candidates', '[]'::jsonb),
        'subject_name', coalesce(nullif(r->>'name', ''), r->>'name_en'),
        'subject_city', r->>'city',
        'source_key', p_source,
        'source_url', r->>'url',
        'category', 'cross_match',
        'title', left(coalesce(nullif(r->>'name', ''), r->>'name_en', r->>'rid') || ' – התאמה לא ודאית (' || coalesce(m->>'method', '') || ')', 300),
        'detail', jsonb_build_object('method', m->>'method', 'rid', r->>'rid', 'domain', r->>'domain'),
        'importance', 'normal', 'fact_kind', 'indication', 'verification', 'unverified',
        'match_status', 'pending_review', 'match_method', m->>'method',
        'dedup_key', p_source || ':' || (r->>'rid')));
      INSERT INTO public.nr_cross_seen (source, rid, result, business_id, method)
      VALUES (p_source, r->>'rid', 'review', nullif(m->>'id', '')::bigint, m->>'method');
      v_review := v_review + 1;
    ELSE
      INSERT INTO public.nr_cross_seen (source, rid, result, method)
      VALUES (p_source, r->>'rid', 'unmatched', m->>'method');
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('matched', v_matched, 'review', v_review, 'unmatched', v_unmatched, 'skipped', v_skip, 'ingest', v_saved);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_apply_cross_rows(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_apply_cross_rows(text, jsonb) TO service_role;

-- Undo one import source. Deletes only rows that source alone added. A reviewer's decision is kept.
-- Other sources on the same contact stay. Businesses are not deleted.
CREATE OR REPLACE FUNCTION public.nr_revert_source(p_source text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cp int := 0; v_find int := 0; v_people int := 0; v_seen int := 0; v_since timestamptz := now();
  v_ids bigint[];
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_source IS NULL OR p_source !~ '^[a-z0-9_.:-]{3,80}$' THEN RAISE EXCEPTION 'bad source'; END IF;
  SELECT coalesce(array_agg(DISTINCT business_id), '{}') INTO v_ids
    FROM public.nr_cross_seen WHERE source = p_source AND business_id IS NOT NULL;

  DELETE FROM public.nr_contact_points WHERE sources = ARRAY[p_source];
  GET DIAGNOSTICS v_cp = ROW_COUNT;
  UPDATE public.nr_contact_points SET sources = array_remove(sources, p_source)
   WHERE p_source = ANY(sources) AND sources <> ARRAY[p_source];

  DELETE FROM public.nr_findings WHERE source_key = p_source AND reviewed_at IS NULL;
  GET DIAGNOSTICS v_find = ROW_COUNT;
  DELETE FROM public.nr_people WHERE source_key = p_source;
  GET DIAGNOSTICS v_people = ROW_COUNT;
  DELETE FROM public.nr_cross_seen WHERE source = p_source;
  GET DIAGNOSTICS v_seen = ROW_COUNT;

  UPDATE public.nr_businesses b SET
    sources = array_remove(b.sources, p_source),
    socials = (
      SELECT coalesce(jsonb_object_agg(k, b.socials -> k), '{}'::jsonb)
        FROM jsonb_object_keys(coalesce(b.socials, '{}'::jsonb)) k
       WHERE k NOT IN ('facebook', 'instagram', 'linkedin')
          OR EXISTS (SELECT 1 FROM public.nr_contact_points c
                      WHERE c.business_id = b.id AND c.kind = 'social' AND c.subkind = k)),
    updated_at = now()
   WHERE p_source = ANY(b.sources) OR b.id = ANY(v_ids);

  UPDATE public.nr_businesses b SET
    phone_main = CASE WHEN NOT EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'phone') THEN NULL ELSE b.phone_main END,
    email_main = CASE WHEN NOT EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'email') THEN NULL ELSE b.email_main END,
    website = CASE WHEN b.website IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'website') THEN NULL ELSE b.website END
   WHERE b.updated_at >= v_since;

  PERFORM public.nr_refresh_flags(v_since);
  INSERT INTO public.nr_events (level, source_key, message, data)
  VALUES ('warn', p_source, 'בוטל יבוא לפי מקור. רשומות עסקים לא נמחקו.',
          jsonb_build_object('contact_points_removed', v_cp, 'findings_removed', v_find, 'people_removed', v_people, 'seen_removed', v_seen));
  RETURN jsonb_build_object('contact_points_removed', v_cp, 'findings_removed', v_find, 'people_removed', v_people, 'seen_removed', v_seen);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_revert_source(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_revert_source(text) TO authenticated, service_role;

-- Live cohort sizes. A company is counted only from flags already stored. Nothing is marked as scanned.
CREATE OR REPLACE FUNCTION public.nr_cohort_counts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '180s' AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'with_website', count(*) FILTER (WHERE has_website),
    'with_phone', count(*) FILTER (WHERE has_phone),
    'with_email', count(*) FILTER (WHERE has_email),
    'with_facebook', count(*) FILTER (WHERE has_facebook),
    'with_instagram', count(*) FILTER (WHERE has_instagram),
    'with_linkedin', count(*) FILTER (WHERE has_linkedin),
    'website_no_social', count(*) FILTER (WHERE has_website AND NOT has_facebook AND NOT has_instagram AND NOT coalesce(has_linkedin, false)),
    'email_no_website', count(*) FILTER (WHERE has_email AND NOT has_website),
    'phone_no_website_no_social', count(*) FILTER (WHERE has_phone AND NOT has_website AND NOT has_facebook AND NOT has_instagram),
    'name_and_reg_only', count(*) FILTER (WHERE reg_id IS NOT NULL AND NOT has_phone AND NOT has_email AND NOT has_website AND NOT has_facebook AND NOT has_instagram),
    'needs_review', count(*) FILTER (WHERE enr_needs_review),
    'at', now()
  ) FROM public.nr_businesses;
$$;
REVOKE ALL ON FUNCTION public.nr_cohort_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_cohort_counts() TO authenticated, service_role;

-- Dalia / Yoni segments. Existing segment codes are unchanged. New codes are estimates unless the label says otherwise.
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
         THEN 'industry' END,
    CASE WHEN b.fleet_level = 'documented' OR coalesce(b.fleet_min, 0) >= 5 OR coalesce(b.fleet_vehicles, 0) >= 5 THEN 'vehicles_5' END,
    CASE WHEN coalesce(b.fleet_contact, '') LIKE '%fleet%' THEN 'fleet_officer' END,
    CASE WHEN coalesce(b.ind_codes, '{}') && ARRAY['tr_haul', 'tr_logi'] THEN 'logistics' END,
    CASE WHEN coalesce(b.ind_codes, '{}') && ARRAY['tr_courier'] OR b.sector = 'שליחויות ודואר'
              OR 'שליחויות / חלוקת דואר' = ANY(b.logistics_indicators) THEN 'courier' END,
    CASE WHEN coalesce(b.ind_codes, '{}') && ARRAY['auto_rental'] THEN 'rental' END,
    CASE WHEN coalesce(b.fleet_min, 0) >= 20 OR coalesce(b.fleet_vehicles, 0) >= 20 THEN 'large_fleet' END,
    CASE WHEN coalesce(b.ind_codes, '{}') && ARRAY['con_build', 'con_infra', 'con_trades', 'en_env']
              OR b.sector IN ('בנייה וקבלנות', 'כוח אדם, שמירה וניקיון', 'פסולת ושפכים') THEN 'service_vehicles' END,
    CASE WHEN b.fleet_level IN ('documented', 'strong')
              OR coalesce(b.fleet_contact, '') LIKE '%fleet%'
              OR coalesce(b.ind_codes, '{}') && ARRAY['tr_haul', 'tr_logi', 'tr_courier', 'tr_pass', 'auto_rental', 'auto_trade', 'auto_driving', 'con_build', 'con_trades']
              OR b.sector IN ('שליחויות ודואר', 'רכב – סחר, יבוא וייצור מוצרי תעבורה', 'בתי ספר לנהיגה', 'בנייה וקבלנות')
         THEN 'yoni_body' END
  ], NULL);
$$;

-- Work-list page: same rows as before, plus the social addresses already stored (so the list can open Facebook / Instagram).
CREATE OR REPLACE FUNCTION public.nr_outreach_page(p_filters jsonb, p_after bigint DEFAULT 0, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; f jsonb := coalesce(p_filters, '{}'); by_fleet boolean := coalesce(p_filters->>'sort', '') = 'fleet';
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY r.ord), '[]') FROM (
      SELECT row_number() OVER (ORDER BY %s) ord, b.id, b.name, b.reg_id, b.corp_type, b.status, coalesce(b.main_activity, b.activity_text, b.sector) activity, b.sector, b.city, b.district, b.website,
        b.fleet_level, b.fleet_min, b.fleet_evidence, b.fleet_contact, b.employees_count, b.ind_codes,
        public.nr_outreach_segments(b) segments, public.nr_outreach_signals(b) signals,
        (SELECT coalesce(jsonb_object_agg(s.sub, s.value), '{}'::jsonb) FROM (
            SELECT DISTINCT ON (c.subkind) c.subkind AS sub, c.value
              FROM public.nr_contact_points c
             WHERE c.business_id = b.id AND c.kind = 'social'
             ORDER BY c.subkind, c.id) s) socials,
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

-- New engines default OFF. "Start all" clears switches, and these two stay off until set explicitly.
CREATE OR REPLACE FUNCTION public.nr_engine_on(p_engine text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((engines->>'all')::boolean, true)
     AND CASE WHEN p_engine IN ('osm_cross', 'wd_bulk')
              THEN coalesce((engines->>p_engine)::boolean, false)
              ELSE coalesce((engines->>p_engine)::boolean, true) END
    FROM public.nr_control WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.nr_engine_list() RETURNS TABLE(engine text, label text, covers text, sort int)
LANGUAGE sql IMMUTABLE AS $$
  VALUES ('collector', 'איסוף ממאגרים רשמיים', 'data.gov.il, GIS עירוני, OpenStreetMap (nr-collector-tick)', 10),
         ('identify', 'זיהוי אתרים ועסקים חדשים', '10 עובדי זיהוי + מזין התור מ-Common Crawl (nr-identify-1..10, nr-feeder)', 20),
         ('deep', 'סריקת עומק באתרי החברות', 'פרטי קשר, אנשי קשר, צי רכב, גיוס וקשרים (nr-deep-2 ובתוך ההעשרה)', 30),
         ('enrich', 'העשרה', 'Wikidata, אתר מדומיין אימייל, RSS, מכרזים והתקשרויות (nr-enrich-tick)', 40),
         ('watch', 'מעקב אחר חברות', 'בדיקת חברות שסומנו למעקב (בתוך ההעשרה)', 50),
         ('classify', 'סיווג ענפים ומקצועות', 'nr-classify', 60),
         ('fleet', 'פוטנציאל צי רכב', 'nr-fleet-refresh, nr-fleet-refresh-full', 70),
         ('leads', 'סינון 7 הכללים והזרמת לידים', 'nr-leads, nr-lead-tidy', 80),
         ('caches', 'דוחות, מטמונים ודגלי סינון', 'nr-industry-summary, nr-leads-cache, nr-refresh-facets, nr-refresh-flags, nr-enrich-flags', 90),
         ('maintenance', 'תחזוקה יומית ושבועית', 'nr-enrich-weekly, nr-osm-daily-retry, nr-source-discovery, nr-cron-log-cleanup', 100),
         ('osm_cross', 'הצלבת OpenStreetMap באריחים', 'nr-osm-tiles. כבוי כברירת מחדל. לא יוצר חברות. ממתין אם cat:27 באמצע איסוף', 120),
         ('wd_bulk', 'Wikidata המוני מחמיר', 'nr-wikidata-bulk. כבוי כברירת מחדל. מספר חברה או דומיין עם שם סותר הולכים לבדיקה', 130);
$$;

INSERT INTO public.nr_sources (key, name, url, provider, kind, data_types, terms, status, status_reason, priority, config)
VALUES
  ('osm:tiles', 'OpenStreetMap – הצלבה לפי אריחים', 'https://www.openstreetmap.org', 'OpenStreetMap contributors', 'osm_tiles',
   ARRAY['טלפון','אתר','פייסבוק','אינסטגרם','לינקדאין']::text[],
   'ODbL 1.0. חובת ייחוס © OpenStreetMap contributors. שימוש מסחרי מותר עם ייחוס. לא יוצר חברות חדשות.',
   'pending', 'המנוע osm_cross כבוי. לא נאסף דבר עד שמפעילים אותו אחרי גיבוי.', 96,
   '{"south":29.45,"north":33.40,"west":34.22,"east":35.92,"dlat":0.18,"dlon":0.18}'::jsonb),
  ('enr:wikidata_bulk', 'Wikidata – יבוא המוני מחמיר', 'https://query.wikidata.org', 'Wikimedia (CC0)', 'enrich_wikidata_bulk',
   ARRAY['רשת חברתית','אתר','מספר חברה']::text[],
   'Wikidata CC0. לא סומכים על מספר חברה או דומיין כשיש סתירה בשם.',
   'pending', 'המנוע wd_bulk כבוי. לא נאסף דבר עד שמפעילים אותו אחרי גיבוי.', 97,
   '{"phase":"items"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

UPDATE public.nr_control
   SET engines = engines || jsonb_build_object('osm_cross', false, 'wd_bulk', false)
 WHERE id = 1;

-- Schedules exist so a later switch-on continues without a chat. They call nothing while the switch is off.
-- They do not reschedule identify, social, or the existing collector.
SELECT cron.unschedule('nr-osm-tiles') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nr-osm-tiles');
SELECT cron.schedule('nr-osm-tiles', '1-59/4 * * * *', $job$
  SELECT net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/national-registry-collector',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"osm_tiles"}'::jsonb,
    timeout_milliseconds := 150000)
   WHERE public.nr_engine_on('osm_cross')
     AND NOT EXISTS (
       SELECT 1 FROM public.nr_sources
        WHERE key = 'cat:27' AND status = 'collecting' AND updated_at > now() - interval '2 minutes')
$job$);

SELECT cron.unschedule('nr-wikidata-bulk') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nr-wikidata-bulk');
SELECT cron.schedule('nr-wikidata-bulk', '3-59/4 * * * *', $job$
  SELECT net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"wikidata_bulk"}'::jsonb,
    timeout_milliseconds := 150000)
   WHERE public.nr_engine_on('wd_bulk')
$job$);

-- Status row for the two new engines. They are off by default, so the watchdog does not treat them as stalled.
CREATE OR REPLACE FUNCTION public.nr_engine_status() RETURNS TABLE(engine text, label text, covers text, sort int, enabled boolean, legacy_on boolean,
  has_work boolean, last_ok timestamptz, last_err timestamptz, last_err_msg text, stale_after interval)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE c public.nr_control;
BEGIN
  SELECT * INTO c FROM public.nr_control WHERE id = 1;
  RETURN QUERY
  SELECT e.engine, e.label, e.covers, e.sort, public.nr_engine_on(e.engine),
         CASE WHEN e.engine = 'collector' THEN c.running
              WHEN e.engine IN ('identify', 'deep', 'enrich', 'watch', 'leads') THEN c.enrich_running
              WHEN e.engine IN ('osm_cross', 'wd_bulk') THEN public.nr_engine_on(e.engine)
              ELSE true END,
         CASE e.engine
           WHEN 'collector' THEN public.nr_has_work()
           WHEN 'identify' THEN EXISTS (SELECT 1 FROM public.nr_site_queue q WHERE q.status = 'queued')
           WHEN 'deep' THEN EXISTS (SELECT 1 FROM public.nr_businesses b WHERE b.website IS NOT NULL AND b.enr_site_checked_at IS NULL)
           WHEN 'enrich' THEN public.nr_enrich_has_work()
           WHEN 'leads' THEN EXISTS (SELECT 1 FROM public.nr_businesses b WHERE b.fleet_level IS NOT NULL AND b.lead_checked_at IS NULL)
           WHEN 'watch' THEN EXISTS (SELECT 1 FROM public.nr_watch)
           WHEN 'osm_cross' THEN EXISTS (SELECT 1 FROM public.nr_sources s WHERE s.key = 'osm:tiles' AND s.status IN ('pending', 'collecting'))
           WHEN 'wd_bulk' THEN EXISTS (SELECT 1 FROM public.nr_sources s WHERE s.key = 'enr:wikidata_bulk' AND s.status IN ('pending', 'collecting') AND coalesce(s.config->>'done', '') <> 'true')
           ELSE true END,
         CASE WHEN e.engine IN ('identify', 'deep', 'enrich', 'leads', 'watch', 'osm_cross', 'wd_bulk') THEN bt.last_ok
              WHEN e.engine = 'collector' THEN (SELECT max(r.finished_at) FROM public.nr_runs r WHERE r.ok AND r.source_key NOT LIKE 'enr:%' AND r.started_at > now() - interval '2 days')
              WHEN e.engine = 'classify' THEN public.nr_job_last_ok(ARRAY['nr-classify'])
              WHEN e.engine = 'fleet' THEN public.nr_job_last_ok(ARRAY['nr-fleet-refresh', 'nr-fleet-refresh-full'])
              WHEN e.engine = 'caches' THEN public.nr_job_last_ok(ARRAY['nr-industry-summary', 'nr-leads-cache', 'nr-refresh-facets'])
              ELSE public.nr_job_last_ok(ARRAY['nr-enrich-weekly', 'nr-osm-daily-retry', 'nr-source-discovery', 'nr-cron-log-cleanup']) END,
         bt.last_err, bt.last_err_msg,
         CASE e.engine WHEN 'fleet' THEN interval '75 minutes' WHEN 'caches' THEN interval '75 minutes' WHEN 'watch' THEN interval '30 hours'
                       WHEN 'maintenance' THEN interval '8 days'
                       WHEN 'osm_cross' THEN interval '20 minutes' WHEN 'wd_bulk' THEN interval '20 minutes'
                       ELSE interval '15 minutes' END
    FROM public.nr_engine_list() e LEFT JOIN public.nr_engine_beats bt ON bt.engine = e.engine;
END;
$$;
