-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Database load relief (audit 19.10.2026): the database (Micro compute, 3.1 GB vs 1 GB RAM) was saturated on disk reads;
-- the lead stream timed out on every run from 19:16. Measured top readers (pg_stat_statements): the classifier
-- (21.8M blocks – full-table scan every minute), the name match of site identification (10M blocks), the caches and the
-- hourly fleet refresh. Changes – behaviour and results stay the same, only the work done to get them shrinks:
--  * classifier: a trigger marks a business to-do only when its name / activity fields change; the classifier reads only
--    the to-do index (no more full scans, no re-classifying rows other processes touch)
--  * name match: pg_trgm threshold 0.55 inside the function (same results – the function already filtered at 0.55 – but
--    the index prunes the candidates instead of reading them from disk)
--  * fleet refresh: incremental (businesses updated / with new findings in the last 2 hours), full pass weekly;
--    changed evidence puts the company back in the lead queue
--  * lead candidates: only the never-evaluated partial index, at most 80 per call
--  * bulk writers (classifier, fleet refresh, flags) share one advisory lock, so they no longer deadlock each other
--  * caches: industry summary hourly (was every 10 min), lead stats every 15 min (was 5)
-- Nothing is deleted; no cost.

-- classification to-do marker
CREATE OR REPLACE FUNCTION public.nr_ind_dirty() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.name, NEW.sector, NEW.main_activity, NEW.activity_text, NEW.activities, NEW.corp_type)
     IS DISTINCT FROM (OLD.name, OLD.sector, OLD.main_activity, OLD.activity_text, OLD.activities, OLD.corp_type) THEN
    NEW.ind_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nr_ind_dirty ON public.nr_businesses;
CREATE TRIGGER nr_ind_dirty BEFORE UPDATE OF name, sector, main_activity, activity_text, activities, corp_type ON public.nr_businesses
  FOR EACH ROW EXECUTE FUNCTION public.nr_ind_dirty();

CREATE OR REPLACE FUNCTION public.nr_classify_batch(p_limit int DEFAULT 20000) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '280s' AS $$
DECLARE v int; r record;
BEGIN
  -- one run at a time (cron starts a run every minute; a long run must not be classified twice)
  IF NOT pg_try_advisory_xact_lock(hashtext('nr_bulk_writer')) THEN RETURN jsonb_build_object('skipped', 'running'); END IF;
  -- txt = the business's own sector / main activity; act = additional activities (licence records, OSM tags, site text)
  CREATE TEMP TABLE IF NOT EXISTS _cls (id bigint PRIMARY KEY, nm text, txt text, act text, corp text) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _hits (id bigint, code text, main_code text, by_ text, hit text) ON COMMIT DROP;
  TRUNCATE _cls; TRUNCATE _hits;
  INSERT INTO _cls
  SELECT b.id, lower(b.name), lower(concat_ws(' | ', b.sector, b.main_activity)), lower(concat_ws(' | ', b.activity_text, array_to_string(b.activities, ' | '))), b.corp_type
    FROM public.nr_businesses b
   -- only businesses marked to-do: new ones, or ones whose name / activity fields changed (trigger nr_ind_dirty).
   -- (The former "ind_at < updated_at" test forced a full-table scan every minute and re-classified any row another
   -- process touched – the main disk-read load of the database.)
   WHERE b.ind_at IS NULL
   ORDER BY b.id
   LIMIT p_limit;
  FOR r IN SELECT code, main_code, public.nr_ind_rx(pat) rx, public.nr_ind_rx(name_pat) nrx FROM public.nr_industries LOOP
    IF r.rx IS NOT NULL THEN
      INSERT INTO _hits SELECT c.id, r.code, r.main_code, 'sector', substring(c.txt from r.rx) FROM _cls c WHERE c.txt <> '' AND c.txt ~* r.rx;
      INSERT INTO _hits SELECT c.id, r.code, r.main_code, 'activity', substring(c.act from r.rx) FROM _cls c WHERE c.act <> '' AND c.act ~* r.rx;
    END IF;
    IF r.nrx IS NOT NULL THEN
      INSERT INTO _hits SELECT c.id, r.code, r.main_code, 'name', substring(c.nm from r.nrx) FROM _cls c WHERE c.nm ~* r.nrx;
    END IF;
  END LOOP;
  INSERT INTO _hits SELECT c.id, 'n_assoc', 'nonprofit', 'corp', c.corp FROM _cls c WHERE c.corp IN ('עמותה', 'חברה לתועלת הציבור');
  INSERT INTO _hits SELECT c.id, 'a_coop', 'agriculture', 'corp', c.corp FROM _cls c WHERE c.corp = 'אגודה שיתופית' AND (c.txt || ' ' || c.act) ~ 'חקלא';
  -- primary = the business's own sector / main activity, legal form, or a profession word in its name;
  -- additional activities (e.g. licence records attached to a large company) are secondary, unless they are all we know
  WITH agg AS (
    SELECT c.id,
           array_agg(DISTINCT h.code) FILTER (WHERE h.by_ <> 'activity') p_codes, array_agg(DISTINCT h.main_code) FILTER (WHERE h.by_ <> 'activity') p_mains,
           array_agg(DISTINCT h.code) FILTER (WHERE h.by_ = 'activity') a_codes, array_agg(DISTINCT h.main_code) FILTER (WHERE h.by_ = 'activity') a_mains,
           jsonb_agg(DISTINCT jsonb_build_object('code', h.code, 'by', h.by_, 'hit', left(btrim(h.hit, ' |'), 60))) FILTER (WHERE h.code IS NOT NULL) basis
      FROM _cls c LEFT JOIN _hits h ON h.id = c.id GROUP BY c.id
  )
  UPDATE public.nr_businesses b
     SET ind_codes = coalesce(a.p_codes, a.a_codes, '{unclassified}'),
         ind_main = coalesce(a.p_mains, a.a_mains, '{unclassified}'),
         ind_secondary = CASE WHEN a.p_codes IS NOT NULL THEN (SELECT array_agg(x) FROM unnest(a.a_codes) x WHERE x <> ALL(a.p_codes)) END,
         ind_basis = a.basis, ind_at = now()
    FROM agg a WHERE b.id = a.id;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN jsonb_build_object('classified', v, 'left', (SELECT count(*) FROM public.nr_businesses WHERE ind_at IS NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_identify_name(p_name text, p_city text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE m jsonb; v_norm text := public.nr_norm_name(p_name); v_city text := public.nr_norm_city(p_city); v_sim bigint[];
BEGIN
  -- the trigram index prunes at this threshold (local to this call's transaction; the extension must be loaded first)
  PERFORM similarity('a', 'a');
  PERFORM set_config('pg_trgm.similarity_threshold', '0.55', true);
  m := public.nr_match_business(p_name, p_city, NULL);
  IF length(v_norm) >= 4 THEN
    SELECT array_agg(id) INTO v_sim FROM (
      SELECT id FROM public.nr_businesses WHERE name_norm % v_norm AND similarity(name_norm, v_norm) >= 0.55
         AND (v_city IS NULL OR city_norm IS NULL OR city_norm = v_city)
       ORDER BY similarity(name_norm, v_norm) DESC LIMIT 3) x;
  END IF;
  RETURN m || jsonb_build_object('similar', to_jsonb(coalesce(v_sim, '{}')));
END;
$$;

DROP FUNCTION IF EXISTS public.nr_fleet_refresh();
CREATE OR REPLACE FUNCTION public.nr_fleet_refresh(p_full boolean DEFAULT false, p_window interval DEFAULT '2 hours') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '600s' AS $$
DECLARE v_set int; v_clear int; v_since timestamptz := now() - p_window;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('nr_bulk_writer')) THEN RETURN jsonb_build_object('skipped', 'another bulk writer is running'); END IF;
  -- incremental: only businesses changed in the window (updated card or a new / reviewed finding); p_full = all candidates
  CREATE TEMP TABLE IF NOT EXISTS _touched (id bigint PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _touched;
  IF NOT p_full THEN
    INSERT INTO _touched SELECT id FROM public.nr_businesses WHERE updated_at > v_since ON CONFLICT DO NOTHING;
    INSERT INTO _touched SELECT business_id FROM public.nr_findings WHERE updated_at > v_since AND business_id IS NOT NULL ON CONFLICT DO NOTHING;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _fleet (id bigint PRIMARY KEY, lv text, items jsonb, mn int, rc text) ON COMMIT DROP;
  TRUNCATE _fleet;
  INSERT INTO _fleet (id, lv, items, mn, rc)
  WITH shared AS (
    -- a website attached to two companies: what it says about a fleet cannot be credited to either without review
    SELECT dom FROM (SELECT regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') dom FROM public.nr_businesses WHERE website IS NOT NULL) x
     GROUP BY dom HAVING count(*) > 1
  ), cand AS (
    SELECT b.* FROM public.nr_businesses b
     WHERE (p_full OR b.id IN (SELECT id FROM _touched)) AND coalesce(b.status, '') <> 'inactive'
       AND (b.fleet_known OR coalesce(b.fleet_vehicles, 0) > 0 OR b.enr_fleet OR b.enr_hiring_drivers OR b.enr_hiring_logistics
            OR cardinality(b.logistics_indicators) > 0
            OR b.sector IN ('בנייה וקבלנות', 'שליחויות ודואר', 'דלק ותחנות תדלוק', 'פסולת ושפכים', 'תעשייה', 'תעשייה ומשרדים', 'תעשייה כימית',
                            'תעשיית מזון ומשקאות', 'יצרנות', 'מתכות', 'הנדסת סביבה ואסבסט', 'חקלאית', 'חקלאות', 'בתי ספר לנהיגה')
            OR coalesce(b.employees_count, 0) >= 20 OR coalesce(b.branch_phones, 0) >= 5 OR b.sector = 'כוח אדם, שמירה וניקיון'
            OR b.id IN (SELECT j.business_id FROM public.nr_jobs j WHERE j.is_driver))
  ), ev AS (
    SELECT c.id, e.items FROM cand c CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_agg(x ORDER BY (x->>'rank')::int, x->>'t'), '[]') items FROM (
        -- documented: official register count
        SELECT jsonb_build_object('lvl', 'documented', 'rank', 1, 'kind', 'fact', 'n', c.fleet_vehicles,
                 't', c.fleet_vehicles || ' כלי רכב בצי המפעיל לפי משרד התחבורה' || coalesce(' (' || nullif(array_to_string(c.fleet_types[1:3], ', '), '') || ')', ''),
                 'src', 'משרד התחבורה – מאגר צי האוטובוסים לפי מפעיל') x
         WHERE coalesce(c.fleet_vehicles, 0) >= 5 AND 'dgov:bus_fleet' = ANY(c.sources)
        -- documented / strong: what the company publishes on its own site
        UNION ALL
        SELECT jsonb_build_object('lvl', CASE WHEN coalesce((f.detail->>'vehicles')::int, 0) >= 5 AND NOT sh.is_shared THEN 'documented' ELSE 'strong' END,
                 'rank', CASE WHEN coalesce((f.detail->>'vehicles')::int, 0) >= 5 AND NOT sh.is_shared THEN 1 ELSE 2 END,
                 'note', CASE WHEN sh.is_shared THEN 'האתר משויך גם לעסק אחר במאגר – יש לוודא לאיזו חברה הוא שייך' END,
                 'kind', CASE WHEN coalesce((f.detail->>'vehicles')::int, 0) >= 5 THEN 'fact' ELSE 'indication' END,
                 'n', nullif((f.detail->>'vehicles')::int, 0),
                 't', CASE WHEN coalesce((f.detail->>'vehicles')::int, 0) >= 5
                           THEN 'החברה מציינת באתרה ' || (f.detail->>'vehicles') || ' ' || coalesce(f.detail->>'type', 'כלי רכב') || ': "' || left(f.detail->>'quote', 120) || '"'
                           ELSE 'החברה מזכירה צי רכב באתרה: "' || left(f.detail->>'quote', 120) || '"' END,
                 'src', 'אתר החברה', 'url', f.source_url, 'date', coalesce(f.published_at, f.discovered_at::date))
          FROM public.nr_findings f
          CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM shared WHERE shared.dom = regexp_replace(lower(coalesce(c.website, '')), '^https?://(www\.)?([^/]+).*$', '\2')) is_shared) sh
         WHERE f.business_id = c.id AND f.match_status = 'matched' AND f.category = 'fleet'
           AND (coalesce((f.detail->>'vehicles')::int, 0) >= 5 OR (f.detail->>'vehicles') IS NULL)
        -- strong: recruiting drivers (careers page / job boards)
        UNION ALL
        SELECT jsonb_build_object('lvl', 'strong', 'rank', 2, 'kind', 'indication', 't', 'החברה מגייסת נהגים / מפעילי רכב: ' || left(f.title, 140),
                 'src', 'אתר החברה – עמוד קריירה', 'url', f.source_url, 'date', coalesce(f.published_at, f.discovered_at::date))
          FROM public.nr_findings f WHERE f.business_id = c.id AND f.match_status = 'matched' AND f.category = 'hiring_drivers'
        UNION ALL
        SELECT jsonb_build_object('lvl', 'strong', 'rank', 2, 'kind', 'fact', 't', count(*) || ' מודעות דרושים לנהגים', 'src', 'מודעות דרושים', 'n', NULL)
          FROM public.nr_jobs j WHERE j.business_id = c.id AND j.is_driver HAVING count(*) > 0
        -- strong: licensed operators
        UNION ALL
        SELECT jsonb_build_object('lvl', 'strong', 'rank', 2, 'kind', 'fact', 't', 'מפעיל מורשה: ' || x, 'src', 'רישיון / היתר רשמי')
          FROM unnest(c.logistics_indicators) x WHERE x IN ('הסעת נוסעים / תחבורה ציבורית', 'שליחויות / חלוקת דואר')
        -- strong / possible: contractor classification (financial scope, official register)
        UNION ALL
        SELECT jsonb_build_object('lvl', CASE WHEN substring(a from 'סיווג [א-ת](\d)\)')::int >= 3 THEN 'strong' ELSE 'possible' END,
                 'rank', CASE WHEN substring(a from 'סיווג [א-ת](\d)\)')::int >= 3 THEN 3 ELSE 6 END, 'kind', 'indication',
                 't', 'קבלן רשום בסיווג ' || substring(a from 'סיווג ([א-ת]\d)\)') || ' (' || split_part(a, ' (', 1) || ') – היקף כספי ' ||
                      CASE WHEN substring(a from 'סיווג [א-ת](\d)\)')::int >= 3 THEN 'גבוה' ELSE 'מוגבל' END || ', לא ספירת רכבים',
                 'src', 'פנקס הקבלנים – משרד הבינוי והשיכון')
          FROM (SELECT a FROM unnest(c.activities) a WHERE a ~ 'סיווג [א-ת]\d\)'
                 ORDER BY substring(a from 'סיווג [א-ת](\d)\)')::int DESC LIMIT 1) q
        -- strong: 5+ stations / branches
        UNION ALL
        SELECT jsonb_build_object('lvl', CASE WHEN c.sector IN ('דלק ותחנות תדלוק', 'פסולת ושפכים', 'כוח אדם, שמירה וניקיון', 'שליחויות ודואר') THEN 'strong' ELSE 'possible' END,
                 'rank', 3, 'kind', 'fact', 't', c.branch_phones || CASE WHEN c.sector = 'דלק ותחנות תדלוק' THEN ' תחנות דלק רשומות' ELSE ' סניפים רשומים' END,
                 'src', 'מאגרים רשמיים')
         WHERE coalesce(c.branch_phones, 0) >= 5
        -- possible: size and sector indications
        UNION ALL
        SELECT jsonb_build_object('lvl', CASE WHEN c.employees_count >= 50 AND c.sector IN ('בנייה וקבלנות', 'שליחויות ודואר', 'דלק ותחנות תדלוק', 'פסולת ושפכים',
                   'תעשייה', 'תעשייה ומשרדים', 'תעשייה כימית', 'תעשיית מזון ומשקאות', 'יצרנות', 'מתכות', 'הנדסת סביבה ואסבסט', 'חקלאית', 'חקלאות',
                   'כוח אדם, שמירה וניקיון', 'מסחר') THEN 'strong' ELSE 'possible' END, 'rank', 4, 'kind', 'fact',
                 't', c.employees_count || ' עובדים' || coalesce(' (' || c.employees_basis || ')', ''), 'src', 'מספר עובדים שפורסם')
         WHERE coalesce(c.employees_count, 0) >= 20
        UNION ALL
        SELECT jsonb_build_object('lvl', 'possible', 'rank', 5, 'kind', 'indication', 't', 'גיוס לתפקידי לוגיסטיקה / תפעול', 'src', 'אתר החברה')
         WHERE c.enr_hiring_logistics
        UNION ALL
        SELECT jsonb_build_object('lvl', 'possible', 'rank', 7, 'kind', 'indication', 't', 'ענף: ' || c.sector, 'src', 'ענף רשמי')
         WHERE c.sector IN ('שליחויות ודואר', 'דלק ותחנות תדלוק', 'פסולת ושפכים', 'תעשייה', 'תעשייה ומשרדים', 'תעשייה כימית', 'תעשיית מזון ומשקאות',
                            'יצרנות', 'מתכות', 'הנדסת סביבה ואסבסט', 'חקלאית', 'חקלאות', 'בתי ספר לנהיגה')
      ) z
    ) e
  ), lvl AS (
    SELECT ev.id, ev.items,
      CASE WHEN ev.items @> '[{"lvl":"documented"}]' THEN 'documented' WHEN ev.items @> '[{"lvl":"strong"}]' THEN 'strong'
           WHEN jsonb_array_length(ev.items) > 0 THEN 'possible' END lv,
      (SELECT max((x->>'n')::int) FROM jsonb_array_elements(ev.items) x WHERE x->>'lvl' = 'documented') mn,
      (SELECT string_agg(DISTINCT public.nr_role_cat(p.role), ',') FROM public.nr_people p WHERE p.business_id = ev.id AND public.nr_role_cat(p.role) IS NOT NULL) rc
      FROM ev
  )
  SELECT l.id, l.lv, l.items, l.mn, l.rc FROM lvl l;

  -- changed evidence also asks the lead stream to look at the company again (lead_checked_at)
  UPDATE public.nr_businesses b SET fleet_level = f.lv, fleet_evidence = f.items, fleet_min = f.mn, fleet_contact = f.rc, fleet_at = now(),
    lead_checked_at = CASE WHEN b.fleet_evidence IS DISTINCT FROM f.items THEN NULL ELSE b.lead_checked_at END,
    fleet_score = CASE f.lv WHEN 'documented' THEN 1000 + least(coalesce(f.mn, 0), 999) WHEN 'strong' THEN 500 + jsonb_array_length(f.items) * 10
                            WHEN 'possible' THEN 100 + jsonb_array_length(f.items) END
                  + CASE WHEN f.rc LIKE '%fleet%' THEN 60 WHEN f.rc LIKE '%ops%' THEN 40 WHEN f.rc LIKE '%owner%' THEN 20 ELSE 0 END
   FROM _fleet f WHERE b.id = f.id
     AND (b.fleet_level IS DISTINCT FROM f.lv OR b.fleet_evidence IS DISTINCT FROM f.items OR b.fleet_contact IS DISTINCT FROM f.rc);
  GET DIAGNOSTICS v_set = ROW_COUNT;
  -- companies that are no longer candidates (inactive, a finding rejected in review …) lose their level
  UPDATE public.nr_businesses b SET fleet_level = NULL, fleet_evidence = NULL, fleet_min = NULL, fleet_score = NULL, fleet_contact = NULL, fleet_at = now()
   WHERE b.fleet_level IS NOT NULL AND (p_full OR b.id IN (SELECT id FROM _touched))
     AND NOT EXISTS (SELECT 1 FROM _fleet f WHERE f.id = b.id AND f.lv IS NOT NULL);
  GET DIAGNOSTICS v_clear = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_set, 'cleared', v_clear,
    'levels', (SELECT jsonb_object_agg(coalesce(fleet_level, '-'), c) FROM (SELECT fleet_level, count(*) c FROM public.nr_businesses WHERE fleet_level IS NOT NULL GROUP BY 1) q));
END;
$$;
REVOKE ALL ON FUNCTION public.nr_fleet_refresh(boolean, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_fleet_refresh(boolean, interval) TO service_role;

CREATE OR REPLACE FUNCTION public.nr_lead_candidates(p_limit int DEFAULT 80) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
  -- never evaluated (partial index, strongest fleet evidence first); a company whose fleet evidence changes is put back
  -- (lead_checked_at = NULL) by nr_fleet_refresh, so no scan over all evaluated companies is needed here
  WITH fresh AS (
    SELECT b.id FROM public.nr_businesses b
     WHERE b.fleet_level IS NOT NULL AND b.lead_checked_at IS NULL AND b.reg_id ~ '^5[0-9]{8}$' AND coalesce(b.status, '') <> 'inactive'
       AND NOT EXISTS (SELECT 1 FROM public.prospect_leads l WHERE l.company_hp = b.reg_id)
       AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN ('irrelevant', 'archived'))
     ORDER BY b.fleet_score DESC NULLS LAST, b.id
     LIMIT least(p_limit, 80)
     FOR UPDATE OF b SKIP LOCKED
  ), pick AS (SELECT id FROM fresh), upd AS (
    UPDATE public.nr_businesses b SET lead_checked_at = now() FROM pick WHERE b.id = pick.id RETURNING b.*
  ), cp AS (
    SELECT c.business_id, c.kind, c.subkind, coalesce(c.display, c.value) v, c.src_official, c.src_own_site, c.src_other, c.src_groups,
           array_remove(ARRAY[
             CASE WHEN c.src_official THEN 'מאגר רשמי: ' || coalesce((SELECT s.name FROM public.nr_sources s WHERE s.key = ANY(c.sources) AND s.kind IN ('ckan', 'arcgis', 'fleet_ckan') LIMIT 1), 'מאגר ממשלתי') END,
             CASE WHEN c.src_own_site THEN 'אתר החברה' END,
             CASE WHEN c.src_other THEN 'מקור אחר: ' || coalesce((SELECT s.name FROM public.nr_sources s WHERE s.key = ANY(c.sources) AND s.kind NOT IN ('ckan', 'arcgis', 'fleet_ckan', 'website', 'enrich_web_deep', 'enrich_site_identify', 'enrich_web_discovery', 'enrich_watch') LIMIT 1), 'מקור נוסף') END], NULL) groups,
           row_number() OVER (PARTITION BY c.business_id, c.kind, (c.subkind = 'mobile')
                              ORDER BY c.src_groups DESC, c.src_official DESC, (c.subkind = 'main') DESC, c.id) rk
      FROM public.nr_contact_points c JOIN upd ON upd.id = c.business_id WHERE c.kind IN ('phone', 'email')
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registry_id', u.id,
    'company_name', u.name,
    'company_hp', u.reg_id,
    'status', CASE WHEN u.status = 'active' THEN 'פעילה' ELSE '' END,
    'company_active_status', CASE WHEN u.status = 'active' THEN 'פעילה' ELSE NULL END,
    'industry', concat_ws(' | ', u.sector, u.main_activity, nullif(u.activity_text, ''), array_to_string(u.activities, ' | ')),
    'industry_name', concat_ws(' | ', u.sector, u.main_activity),
    'city', coalesce(u.city, ''), 'region', coalesce(u.district, ''), 'address', coalesce(u.address, u.city, ''),
    'website', coalesce(u.website, ''),
    'phone', (SELECT v FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone' AND cp.subkind IS DISTINCT FROM 'mobile' AND rk = 1),
    'mobile_phone', (SELECT v FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone' AND cp.subkind = 'mobile' AND rk = 1),
    'phone_sources', coalesce((SELECT to_jsonb(groups) FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone' AND rk = 1
                                ORDER BY src_groups DESC, (subkind IS DISTINCT FROM 'mobile') DESC LIMIT 1), '[]'),
    'email', (SELECT v FROM cp WHERE cp.business_id = u.id AND cp.kind = 'email' AND rk = 1 ORDER BY src_groups DESC LIMIT 1),
    'email_sources', coalesce((SELECT to_jsonb(groups) FROM cp WHERE cp.business_id = u.id AND cp.kind = 'email' AND rk = 1 ORDER BY src_groups DESC LIMIT 1), '[]'),
    'all_phones', (SELECT coalesce(jsonb_agg(jsonb_build_object('v', v, 'sub', subkind, 'groups', groups) ORDER BY src_groups DESC), '[]') FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone'),
    'all_emails', (SELECT coalesce(jsonb_agg(jsonb_build_object('v', v, 'groups', groups) ORDER BY src_groups DESC), '[]') FROM cp WHERE cp.business_id = u.id AND cp.kind = 'email'),
    'source', CASE WHEN 'cat:61' = ANY(u.sources) THEN 'contractors' ELSE 'companies' END,
    'source_list', (SELECT coalesce(jsonb_agg(s.name), '[]') FROM public.nr_sources s WHERE s.key = ANY(u.sources)),
    'employee_count', u.employees_count, 'verified_employee_count', u.employees_count, 'employee_source', u.employees_basis,
    'fleet_level', u.fleet_level, 'fleet_min', u.fleet_min, 'fleet_evidence', u.fleet_evidence,
    'fleet_size', CASE WHEN u.fleet_level = 'documented' THEN u.fleet_min END,
    'fleetIsFact', u.fleet_level = 'documented',
    'fleet_exists', CASE WHEN u.fleet_level = 'documented' THEN true END,
    'fleet_source', (SELECT x->>'src' FROM jsonb_array_elements(u.fleet_evidence) x WHERE x->>'lvl' = 'documented' LIMIT 1),
    'fleet_types', u.fleet_types,
    'industry_fleet_basis', (SELECT x->>'t' FROM jsonb_array_elements(u.fleet_evidence) x WHERE x->>'lvl' = 'strong' ORDER BY (x->>'rank')::int LIMIT 1),
    'people', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role, 'cat', public.nr_role_cat(p.role), 'phone', p.phone, 'email', p.email, 'source', p.source_key, 'url', p.source_url)
                ORDER BY CASE public.nr_role_cat(p.role) WHEN 'fleet' THEN 0 WHEN 'ops' THEN 1 WHEN 'owner' THEN 2 ELSE 3 END), '[]')
                FROM public.nr_people p WHERE p.business_id = u.id),
    'socials', u.socials, 'whatsapp', u.whatsapp, 'ind_codes', u.ind_codes,
    'registry_check', jsonb_build_object(
       'checked_at', now(),
       'companies', jsonb_build_object('found', 'cat:54' = ANY(u.sources) OR u.reg_id_type = 'company', 'status', CASE WHEN u.status = 'active' THEN 'פעילה' ELSE NULL END),
       'contractors', jsonb_build_object('found', 'cat:61' = ANY(u.sources),
          'records', (SELECT coalesce(jsonb_agg(jsonb_build_object('anaf', split_part(a, ' (', 1), 'sivug', substring(a from 'סיווג ([א-ת]?\d)\)'))), '[]')
                        FROM unnest(u.activities) a WHERE 'cat:61' = ANY(u.sources) AND a ~ 'סיווג')))
  )), '[]') INTO v_out FROM upd u;
  RETURN v_out;
END;
$$;

-- flag refreshers take the same bulk-writer lock (they deadlocked with each other and with the classifier)
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('nr-refresh-flags', 'nr-enrich-flags', 'nr-industry-summary', 'nr-leads-cache', 'nr-fleet-refresh', 'nr-fleet-refresh-full'); END $$;
SELECT cron.schedule('nr-refresh-flags', '*/10 * * * *', $cmd$ select case when pg_try_advisory_xact_lock(hashtext('nr_bulk_writer')) then public.nr_refresh_flags(now() - interval '11 minutes') end $cmd$);
SELECT cron.schedule('nr-enrich-flags', '3-58/5 * * * *', $cmd$ select case when pg_try_advisory_xact_lock(hashtext('nr_bulk_writer')) then public.nr_refresh_enrich_recent(7) end $cmd$);
SELECT cron.schedule('nr-fleet-refresh', '41 * * * *', $cmd$ select public.nr_fleet_refresh(false, interval '2 hours'); select public.nr_outreach_cache_refresh() $cmd$);
SELECT cron.schedule('nr-fleet-refresh-full', '41 4 * * 0', $cmd$ select public.nr_fleet_refresh(true) $cmd$);
SELECT cron.schedule('nr-industry-summary', '23 * * * *', $cmd$ select public.nr_industry_cache_refresh() $cmd$);
SELECT cron.schedule('nr-leads-cache', '*/15 * * * *', $cmd$ select public.nr_leads_cache_refresh() $cmd$);

-- companies that can never become a stream lead (already a lead, no valid company number, inactive) left the lead queue
-- only when evaluated; they sat at the top of the to-do index and were re-read on every call. They are marked with the
-- reason (nothing deleted), and the candidate function keeps marking such rows as they appear.
CREATE OR REPLACE FUNCTION public.nr_lead_queue_tidy(p_limit int DEFAULT 2000) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH x AS (
    SELECT b.id, CASE WHEN coalesce(b.status, '') = 'inactive' THEN 'לא נבדק: חברה לא פעילה'
                      WHEN b.reg_id IS NULL OR b.reg_id !~ '^5[0-9]{8}$' THEN 'לא נבדק: אין ח.פ. של חברה'
                      ELSE 'כבר ליד בטבלת הלידים' END why
      FROM public.nr_businesses b
     WHERE b.fleet_level IS NOT NULL AND b.lead_checked_at IS NULL
       AND (coalesce(b.status, '') = 'inactive' OR b.reg_id IS NULL OR b.reg_id !~ '^5[0-9]{8}$'
            OR EXISTS (SELECT 1 FROM public.prospect_leads l WHERE l.company_hp = b.reg_id))
     LIMIT p_limit
     FOR UPDATE OF b SKIP LOCKED   -- never wait for a bulk writer (the stream runs under the API statement timeout)
  ), u AS (
    UPDATE public.nr_businesses b SET lead_checked_at = now(), lead_result = x.why FROM x WHERE b.id = x.id RETURNING 1
  ) SELECT count(*)::int FROM u;
$$;
REVOKE ALL ON FUNCTION public.nr_lead_queue_tidy(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_lead_queue_tidy(int) TO service_role;
SELECT public.nr_lead_queue_tidy(500) tidied;  -- the rest in batches / by the candidate function

-- the tidy pass walks the to-do index; it runs in the background (not inside the API-timed lead call)
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-lead-tidy'; END $$;
SELECT cron.schedule('nr-lead-tidy', '7,37 * * * *', $cmd$ select public.nr_lead_queue_tidy(3000) $cmd$);

-- lead stats: rows claimed but not yet evaluated have no reason yet (jsonb_object_agg rejects a null key)
CREATE OR REPLACE FUNCTION public.nr_leads_cache_refresh() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.nr_leads_cache (id, data, at)
  SELECT 1, jsonb_build_object(
    'evaluated', (SELECT count(*) FROM public.nr_businesses WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL),
    'waiting', (SELECT count(*) FROM public.nr_businesses b WHERE b.fleet_level IS NOT NULL AND b.reg_id ~ '^5[0-9]{8}$' AND coalesce(b.status, '') <> 'inactive'
                 AND (b.lead_checked_at IS NULL OR b.lead_checked_at < b.fleet_at)
                 AND NOT EXISTS (SELECT 1 FROM public.prospect_leads l WHERE l.company_hp = b.reg_id)),
    'rejected_reasons', (SELECT coalesce(jsonb_object_agg(lead_result, c), '{}') FROM (SELECT lead_result, count(*) c FROM public.nr_businesses
                          WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL AND lead_grade IS NULL AND lead_result IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6) x),
    'last_run', (SELECT max(lead_checked_at) FROM public.nr_businesses WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL)), now()
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, at = EXCLUDED.at
  RETURNING data;
$$;
