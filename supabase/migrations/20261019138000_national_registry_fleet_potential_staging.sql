-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Fleet potential for Dalia marketing, on the existing national registry (no new company table, nothing is sent).
--  * every company with a fleet-related signal gets an evidence list; each item says what was found, where, and how
--    strong it is:
--      documented – a vehicle count of 5+ from an official register, or a count the company itself publishes on its site
--      strong     – business evidence of an operating fleet without a count (recruiting drivers, a fleet mentioned on its
--                   own site, a licensed passenger / courier operator, a high contractor classification, 5+ stations / branches)
--      possible   – indications only (sector, size, logistics recruiting)
--    garages and vehicle dealers are not counted as fleet owners (they are separate segments)
--  * relevant contacts (fleet / safety officer, operations / logistics, owner / CEO) are classified per person
--  * contact reliability by source GROUP: official register / the company's own website / other. Two crawls of the same
--    website are one source; nothing is ever labelled "active" – that needs a call
ALTER TABLE public.nr_businesses
  ADD COLUMN IF NOT EXISTS fleet_level text,
  ADD COLUMN IF NOT EXISTS fleet_min int,
  ADD COLUMN IF NOT EXISTS fleet_evidence jsonb,
  ADD COLUMN IF NOT EXISTS fleet_score int,
  ADD COLUMN IF NOT EXISTS fleet_contact text,
  ADD COLUMN IF NOT EXISTS fleet_at timestamptz;
CREATE INDEX IF NOT EXISTS nr_b_fleet_level ON public.nr_businesses (fleet_level, id) WHERE fleet_level IS NOT NULL;

-- localities that are also everyday words are never read from free text ("אזור" = area, "מגדל" = tower …)
CREATE OR REPLACE FUNCTION public.nr_cities_in_text(p_text text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT l.city), '{}') FROM public.nr_localities l
   WHERE length(l.city) >= 3 AND l.city NOT IN ('רחוב', 'אזור', 'מגדל', 'כרמל', 'ורדון', 'עומר', 'שדה', 'גבעה', 'נווה')
     AND (' ' || regexp_replace(public.nr_strip_street_words(p_text), '[,.()\n:|]', ' ', 'g') || ' ') LIKE '% ' || l.city || ' %';
$$;
CREATE OR REPLACE FUNCTION public.nr_city_in_text(p_text text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.city FROM public.nr_localities l
   WHERE length(l.city) >= 3 AND l.city NOT IN ('רחוב', 'אזור', 'מגדל', 'כרמל', 'ורדון', 'עומר', 'שדה', 'גבעה', 'נווה')
     AND (' ' || regexp_replace(public.nr_strip_street_words(p_text), '[,.()]', ' ', 'g') || ' ') LIKE '% ' || l.city || ' %'
   ORDER BY length(l.city) DESC LIMIT 1;
$$;

-- source group of a contact point: official register / the company's own website / other
CREATE OR REPLACE FUNCTION public.nr_source_group(p_key text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN s.kind IN ('ckan', 'arcgis', 'fleet_ckan') THEN 'official'
              WHEN s.kind IN ('website', 'enrich_web_deep', 'enrich_site_identify', 'enrich_web_discovery', 'enrich_watch') THEN 'own_site'
              ELSE 'other' END
    FROM public.nr_sources s WHERE s.key = p_key;
$$;
CREATE OR REPLACE FUNCTION public.nr_contact_reliability(p_sources text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'official', bool_or(g = 'official'), 'own_site', bool_or(g = 'own_site'), 'other', bool_or(g = 'other'),
    'groups', count(DISTINCT g), 'sources', count(*))
    FROM (SELECT public.nr_source_group(k) g FROM unnest(p_sources) k) x;
$$;

-- role category of a person: fleet / ops / owner (null = not relevant for fleet marketing)
CREATE OR REPLACE FUNCTION public.nr_role_cat(p_role text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_role ~ 'קצין(ת)? (רכב|בטיחות)|צי(\s|-)?(ה)?רכב|מנהל(ת)? צי|רכז(ת)? (רכב|תחבורה)|אחראי(ת)? (רכב|צי)|תחבורה|סדרן' THEN 'fleet'
    WHEN p_role ~ 'תפעול|לוגיסט|הפצה|מחסן|אחזקה|רכש|שינוע|הובלה' THEN 'ops'
    WHEN p_role ~ 'מנכ|מנהל(ת)? כללי|בעלים|מייסד|יו"ר|יו״ר|שותף מנהל|מנהל בית הספר|מנהל/ת המוזאון' AND p_role !~ 'פנקס הקבלנים|מנהל מקצועי' THEN 'owner'
  END;
$$;

CREATE OR REPLACE FUNCTION public.nr_fleet_refresh() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '600s' AS $$
DECLARE v_set int; v_clear int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _fleet (id bigint PRIMARY KEY, lv text, items jsonb, mn int, rc text) ON COMMIT DROP;
  TRUNCATE _fleet;
  INSERT INTO _fleet (id, lv, items, mn, rc)
  WITH shared AS (
    -- a website attached to two companies: what it says about a fleet cannot be credited to either without review
    SELECT dom FROM (SELECT regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') dom FROM public.nr_businesses WHERE website IS NOT NULL) x
     GROUP BY dom HAVING count(*) > 1
  ), cand AS (
    SELECT b.* FROM public.nr_businesses b
     WHERE coalesce(b.status, '') <> 'inactive'
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

  UPDATE public.nr_businesses b SET fleet_level = f.lv, fleet_evidence = f.items, fleet_min = f.mn, fleet_contact = f.rc, fleet_at = now(),
    fleet_score = CASE f.lv WHEN 'documented' THEN 1000 + least(coalesce(f.mn, 0), 999) WHEN 'strong' THEN 500 + jsonb_array_length(f.items) * 10
                            WHEN 'possible' THEN 100 + jsonb_array_length(f.items) END
                  + CASE WHEN f.rc LIKE '%fleet%' THEN 60 WHEN f.rc LIKE '%ops%' THEN 40 WHEN f.rc LIKE '%owner%' THEN 20 ELSE 0 END
   FROM _fleet f WHERE b.id = f.id
     AND (b.fleet_level IS DISTINCT FROM f.lv OR b.fleet_evidence IS DISTINCT FROM f.items OR b.fleet_contact IS DISTINCT FROM f.rc);
  GET DIAGNOSTICS v_set = ROW_COUNT;
  -- companies that are no longer candidates (inactive, a finding rejected in review …) lose their level
  UPDATE public.nr_businesses b SET fleet_level = NULL, fleet_evidence = NULL, fleet_min = NULL, fleet_score = NULL, fleet_contact = NULL, fleet_at = now()
   WHERE b.fleet_level IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _fleet f WHERE f.id = b.id AND f.lv IS NOT NULL);
  GET DIAGNOSTICS v_clear = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_set, 'cleared', v_clear,
    'levels', (SELECT jsonb_object_agg(coalesce(fleet_level, '-'), c) FROM (SELECT fleet_level, count(*) c FROM public.nr_businesses WHERE fleet_level IS NOT NULL GROUP BY 1) q));
END;
$$;
REVOKE ALL ON FUNCTION public.nr_fleet_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_fleet_refresh() TO service_role;
GRANT EXECUTE ON FUNCTION public.nr_source_group(text), public.nr_contact_reliability(text[]), public.nr_role_cat(text) TO authenticated, service_role;

-- hourly, after new findings land
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-fleet-refresh'; END $$;
SELECT cron.schedule('nr-fleet-refresh', '41 * * * *', $cmd$ select public.nr_fleet_refresh() $cmd$);
