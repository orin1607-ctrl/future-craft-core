-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry – enrichment ENGINE support (runs in the nr-enrichment edge function from pg_cron):
--  * the 29 sources Dalia asked to check + the lawful sources found while checking, registered in nr_sources with the
--    real result of the check (robots.txt, terms of use, Cloudflare challenge, paid) – catalog rows are updated, not duplicated
--  * work queues: corporate e-mail domains → website discovery; business websites → deep crawl
--  * government contracts with amounts, attached through the evidence that already ties each record to its business
--  * schedule: nr-enrich-tick every 2 minutes (only when there is work), flags every 5 minutes, re-checks weekly

-- ── 1. sources ──
-- existing catalog rows (job boards, paid directories, portals): exact reason from this check
UPDATE public.nr_sources SET status = v.status, status_reason = v.reason, url = coalesce(public.nr_sources.url, v.url),
       config = public.nr_sources.config || jsonb_build_object('enrichment_check', '2026-10-19'), updated_at = now()
  FROM (VALUES
    ('cat:103', 'unsupported', 'https://www.alljobs.co.il', 'נבדק 19.10.2026: תנאי השימוש אוסרים להעתיק או לפרסם את התוכן ללא אישור מראש ובכתב – לא נאסף. מידע גיוס נאסף משירות התעסוקה הממשלתי.'),
    ('cat:104', 'unsupported', 'https://www.jobmaster.co.il', 'נבדק 19.10.2026: התקנון אוסר העתקה ושימוש מסחרי במידע ללא הסכמה בכתב; אין מפת אתר או API ציבורי – לא נאסף.'),
    ('cat:105', 'unsupported', 'https://www.drushim.co.il', 'נבדק 19.10.2026: התקנון אוסר במפורש "ללקט מידע באמצעות תוכנות אוטומטיות" – לא נאסף.'),
    ('cat:106', 'unsupported', 'https://www.jobnet.co.il/companies', 'נבדק 19.10.2026: רשימת החברות נטענת דינמית דרך ממשק פנימי, ללא API או קובץ ציבורי, ודף התקנון אינו זמין (HTTP 410) – לא נאסף.'),
    ('cat:112', 'unsupported', 'https://www.nisha.co.il', 'נבדק 19.10.2026: התקנון אוסר להעתיק, לשכפל או להפיץ מידע מהאתר ללא רשות מפורשת; שם המעסיק לרוב אינו מוצג (חברת השמה) – לא נאסף.'),
    ('cat:121', 'blocked', 'https://finder.startupnationcentral.org', 'נבדק 19.10.2026: האתר מחזיר אתגר Cloudflare (HTTP 403) לכל בקשה אוטומטית; אין לעקוף – לא נאסף.'),
    ('cat:122', 'blocked', 'https://www.ivc-online.com', 'נבדק 19.10.2026: מאגר IVC מבוסס מנוי בתשלום; אין גישה מורשית – לא נאסף ולא נרכש.'),
    ('cat:34', 'blocked', 'https://www.dunsguide.co.il/he', 'נבדק 19.10.2026: האתר חסום באתגר Cloudflare (HTTP 403) לבקשות אוטומטיות; המידע המלא בתשלום – לא נאסף.'),
    ('cat:36', 'blocked', 'https://www.bdicoface.co.il', 'נבדק 19.10.2026: דוחות החברות של CofaceBDI בתשלום; האתר הציבורי שיווקי בלבד – לא נאסף ולא נרכש.'),
    ('cat:75', 'unsupported', 'https://maya.tase.co.il/he', 'נבדק 19.10.2026: מדיניות האתר: "Systematic scraping, bulk extraction … require explicit authorization" ו-/api/ חסום ב-robots – לא נאסף.'),
    ('cat:66', 'unsupported', 'https://mr.gov.il/ilgstorefront/he/supplier', 'נבדק 19.10.2026: עמוד מאגרי הספקים הוא רשימת קישורים למאגרים נפרדים של משרדים (יועצים, מתכננים, רואי חשבון) ללא קובץ נתונים אחיד. ספקי הממשלה נאספים ממאגר ההתקשרויות (מקור 65) כולל היקף כספי.'),
    ('cat:67', 'unsupported', 'https://www.gov.il/he/departments/topics/support_and_logistics_division', 'נבדק 19.10.2026: אתר gov.il חסום באתגר Cloudflare לבקשות אוטומטיות. זוכים במכרזים נאספים מדוח המכרזים ומאגר ההתקשרויות ב-data.gov.il.'),
    ('cat:74', 'unsupported', 'https://www.gov.il/he/service/company_extract', 'נבדק 19.10.2026: נסח חברה הוא שירות בתשלום לכל חברה ו-gov.il חסום לבקשות אוטומטיות – לא נרכש. נתוני רשם החברות נאספו מ-data.gov.il (מקור 54).')
  ) AS v(key, status, url, reason)
 WHERE public.nr_sources.key = v.key;

-- sources that were not in the catalog yet
INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config) VALUES
  ('enr:taasuka_jobs', 'E1', 'שירות התעסוקה – משרות פתוחות (מעסיקים מגייסים)', 'https://www.taasuka.gov.il/applicants/jobs/', 'שירות התעסוקה הישראלי (ממשלתי)', 'enrich_jobs_gov',
    ARRAY['hiring','drivers','logistics','city','date'], 'אתר ממשלתי; robots.txt מתיר הכול; תנאי השימוש אינם אוסרים קריאה אוטומטית. נשמרים רק שם המעסיק, המשרה, העיר, התאריך והקישור – ללא פרטי אנשים.',
    'pending', NULL, 10, jsonb_build_object('sitemap', 'https://www.taasuka.gov.il/sitemap-he-il.xml')),
  ('enr:gov_contracts', 'E2', 'התקשרויות ממשלה – היקף כספי וסוג הליך (העשרה)', 'https://data.gov.il/dataset/exemption_tenders', 'data.gov.il – מינהל הרכש', 'enrich_gov_contracts',
    ARRAY['tender','contract','amount'], 'data.gov.il – מידע ציבורי פתוח', 'pending', NULL, 20,
    jsonb_build_object('rid', '65c8fced-c50c-400e-94fb-ef1a208c43e5', 'evidence_source', 'cat:65')),
  ('enr:gov_tenders', 'E3', 'דוח מכרזים – ספקים זוכים (העשרה)', 'https://data.gov.il/api/3/action/datastore_search?resource_id=7038b3e6-a74d-442e-b16b-466c8196124a', 'data.gov.il', 'enrich_gov_contracts',
    ARRAY['tender','amount'], 'data.gov.il – מידע ציבורי פתוח', 'pending', NULL, 21,
    jsonb_build_object('rid', '7038b3e6-a74d-442e-b16b-466c8196124a', 'evidence_source', 'dgov:tenders', 'tender', true)),
  ('enr:web_discovery', 'E4', 'גילוי אתרי חברות מדומיין האימייל העסקי', NULL, 'אתרי העסקים עצמם', 'enrich_web_discovery',
    ARRAY['website'], 'רק דומיין של אימייל עסקי שפורסם במקור רשמי; robots.txt נבדק; האתר נשמר רק כשהדף נטען ואינו דומיין חונה', 'pending', NULL, 30, '{}'),
  ('enr:web_deep', 'E5', 'סריקת עומק באתרי החברות (צור קשר, אודות, קריירה)', NULL, 'אתרי העסקים עצמם', 'enrich_web_deep',
    ARRAY['phone','email','social','people','hiring','expansion','fleet'], 'אתר העסק עצמו; robots.txt מכובד לכל נתיב; עד 4 דפים לאתר; נשמר רק מידע עסקי שפורסם', 'pending', NULL, 40, '{}'),
  ('enr:news_rss', 'E6', 'כותרות חדשות עסקיות (RSS) – גלובס, אנשים ומחשבים', 'https://www.globes.co.il/news/article.aspx?did=851969', 'גלובס; אנשים ומחשבים', 'enrich_rss',
    ARRAY['expansion','tender','management','funding'], 'פיד RSS ציבורי שהאתר מציע לקריאת כותרות; נשמרים כותרת, תאריך וקישור בלבד (ללא תוכן הכתבה); שיוך לחברה – תמיד לבדיקה ידנית', 'pending', NULL, 50,
    jsonb_build_object('feeds', jsonb_build_array(
      'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585', 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=607',
      'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=821', 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=3220',
      'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=594', 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=829',
      'https://www.pc.co.il/feed/'))),
  ('enr:calcalist', 'E7', 'כלכליסט', 'https://www.calcalist.co.il', 'ידיעות אחרונות', 'manual', ARRAY['news'], NULL, 'blocked',
    'נבדק 19.10.2026: האתר ופיד ה-RSS מחזירים HTTP 403 לבקשות אוטומטיות; אין לעקוף – לא נאסף.', 900, '{}'),
  ('enr:ifat', 'E8', 'יפעת – מכרזים, בקרת פרסום, ויגו', 'https://ifat.co.il', 'קבוצת יפעת', 'paid', ARRAY['tenders','ads','media'], NULL, 'blocked',
    'נבדק 19.10.2026: שירותי מכרזים, בקרת פרסום וניטור מדיה של יפעת ניתנים במנוי בתשלום בלבד – לא נרכש ולא נאסף.', 900, '{}'),
  ('enr:dekel', 'E9', 'דקל מכרזים', 'https://bids.dekel.co.il', 'דקל', 'paid', ARRAY['tenders'], NULL, 'blocked',
    'נבדק 19.10.2026: מאגר המכרזים של דקל זמין במנוי בתשלום בלבד – לא נרכש ולא נאסף.', 900, '{}'),
  ('enr:buzzilla', 'E10', 'באזילה – ניטור רשת', 'https://buzzilla.co.il', 'Buzzilla', 'paid', ARRAY['social','media'], NULL, 'blocked',
    'נבדק 19.10.2026: שירות ניטור בתשלום; אין ממשק ציבורי – לא נרכש ולא נאסף.', 900, '{}'),
  ('enr:similarweb', 'E11', 'Similarweb – תנועה לאתרים', 'https://www.similarweb.com', 'Similarweb', 'paid', ARRAY['traffic'], NULL, 'blocked',
    'נבדק 19.10.2026: נתוני תנועה ומתחרים ב-API בתשלום; תנאי השימוש אוסרים איסוף אוטומטי מהאתר – לא נאסף.', 900, '{}'),
  ('enr:dbisrael', 'E12', 'דן אנד ברדסטריט ישראל', 'https://www.dbisrael.co.il', 'D&B Israel', 'paid', ARRAY['company','people'], NULL, 'blocked',
    'נבדק 19.10.2026: האתר חסום באתגר Cloudflare (HTTP 403) והמידע העסקי בתשלום – לא נאסף ולא נרכש.', 900, '{}'),
  ('enr:duns100', 'E13', 'דנס 100 – דירוגים ענפיים', 'https://www.duns100.co.il', 'D&B Israel', 'blocked', ARRAY['rankings'], NULL, 'blocked',
    'נבדק 19.10.2026: האתר חסום באתגר Cloudflare (HTTP 403) לבקשות אוטומטיות; אין לעקוף – לא נאסף.', 900, '{}'),
  ('enr:trendemon', 'E14', 'TrenDemon – התנהגות מבקרים', 'https://trendemon.com', 'TrenDemon', 'paid', ARRAY['web_behavior'], NULL, 'unsupported',
    'נבדק 19.10.2026: כלי אנליטיקה לאתר שלנו (מבקרים באתר דליה) ולא מקור מידע על חברות; דורש התקנה ומנוי – לא רלוונטי לאיסוף.', 900, '{}'),
  ('enr:jobinfo', 'E15', 'ג׳ובאינפו', 'https://www.jobinfo.co.il', 'JobInfo', 'blocked', ARRAY['hiring'], NULL, 'blocked',
    'נבדק 19.10.2026: האתר חסום באתגר Cloudflare (HTTP 403) לבקשות אוטומטיות – לא נאסף.', 900, '{}'),
  ('enr:port2port', 'E16', 'פורט2פורט – חדשות לוגיסטיקה ושילוח', 'https://www.port2port.co.il', 'Port2Port', 'manual', ARRAY['news','logistics'], NULL, 'unsupported',
    'נבדק 19.10.2026: תנאי השימוש אוסרים "כל שימוש מסחרי או לא מסחרי" בתוכן ללא הסכמה מראש – לא נאסף.', 900, '{}'),
  ('enr:globes_articles', 'E17', 'גלובס – תוכן כתבות', 'https://www.globes.co.il', 'גלובס', 'manual', ARRAY['news'], NULL, 'unsupported',
    'תוכן הכתבות מוגן בזכויות יוצרים ולא נאסף; נאספות רק כותרות מפיד ה-RSS הציבורי (מקור E6) עם קישור לכתבה.', 900, '{}'),
  ('enr:pc_articles', 'E18', 'אנשים ומחשבים – תוכן כתבות', 'https://www.pc.co.il', 'אנשים ומחשבים', 'manual', ARRAY['news'], NULL, 'unsupported',
    'תוכן הכתבות לא נאסף; נאספות רק כותרות מפיד ה-RSS הציבורי (מקור E6) עם קישור לכתבה.', 900, '{}'),
  ('enr:reverse_search', 'E19', 'רשם התאגידים – חיפוש קשרי חברות (reverse search)', 'https://www.gov.il/he/service/reverse-search', 'רשות התאגידים', 'paid', ARRAY['relations','officers'], NULL, 'blocked',
    'נבדק 19.10.2026: שירות בתשלום לכל חיפוש, ו-gov.il חוסם בקשות אוטומטיות (Cloudflare). לפי ההנחיה – נבדק בלבד, לא נרכש.', 900, '{}')
ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, status_reason = coalesce(EXCLUDED.status_reason, public.nr_sources.status_reason),
  config = public.nr_sources.config || EXCLUDED.config, name = EXCLUDED.name, url = EXCLUDED.url, terms = EXCLUDED.terms, updated_at = now();

-- ── 2. queues ──
CREATE TABLE IF NOT EXISTS public.nr_domain_queue (
  business_id bigint PRIMARY KEY REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','found','not_found','parked','robots','error','has_site')),
  note text,
  checked_at timestamptz
);
CREATE INDEX IF NOT EXISTS nr_domain_queue_todo ON public.nr_domain_queue (business_id) WHERE status = 'queued';
ALTER TABLE public.nr_domain_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_domain_queue_select ON public.nr_domain_queue;
CREATE POLICY nr_domain_queue_select ON public.nr_domain_queue FOR SELECT TO authenticated USING (public.nr_can_read());
REVOKE ALL ON public.nr_domain_queue FROM anon;

-- corporate e-mail domains (free mail, ISPs, gov/academic and domains shared by 3+ businesses are skipped)
CREATE OR REPLACE FUNCTION public.nr_fill_domain_queue() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH d AS (
    SELECT c.business_id, lower(split_part(c.value, '@', 2)) dom FROM public.nr_contact_points c WHERE c.kind = 'email'
  ), ok AS (
    SELECT dom FROM d
     WHERE dom ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
       AND dom !~ '(^|\.)(gmail|googlemail|walla|hotmail|yahoo|outlook|live|msn|aol|icloud|me|012|netvision|bezeqint|zahav|smile|actcom|017|inter|nana10|nana|mail|bezeq|013|018|barak|internet-zahav|012mail)\.'
       AND dom !~ '\.(gov\.il|ac\.il|k12\.il|muni\.il|idf\.il)$' AND dom !~ '^(gov|muni|edu)\.'
     GROUP BY dom HAVING count(DISTINCT business_id) <= 2
  )
  INSERT INTO public.nr_domain_queue (business_id, domain)
  SELECT DISTINCT ON (d.business_id) d.business_id, d.dom FROM d JOIN ok ON ok.dom = d.dom
    JOIN public.nr_businesses b ON b.id = d.business_id
   WHERE b.website IS NULL AND NOT EXISTS (SELECT 1 FROM public.nr_contact_points w WHERE w.business_id = d.business_id AND w.kind = 'website')
  ON CONFLICT (business_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
SELECT public.nr_fill_domain_queue();

CREATE OR REPLACE FUNCTION public.nr_claim_domains(p_limit int)
RETURNS TABLE(business_id bigint, domain text, name text, phones text[], emails text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_domain_queue q SET status = 'error', note = 'claimed', checked_at = now()
     WHERE q.business_id IN (SELECT x.business_id FROM public.nr_domain_queue x WHERE x.status = 'queued' ORDER BY x.business_id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING q.business_id, q.domain)
  SELECT c.business_id, c.domain, b.name,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.business_id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.business_id AND p.kind = 'email')
    FROM c JOIN public.nr_businesses b ON b.id = c.business_id;
$$;

CREATE OR REPLACE FUNCTION public.nr_claim_sites(p_limit int)
RETURNS TABLE(id bigint, name text, website text, phones text[], city text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_businesses b SET enr_site_checked_at = now()
     WHERE b.id IN (SELECT x.id FROM public.nr_businesses x WHERE x.website IS NOT NULL AND x.enr_site_checked_at IS NULL ORDER BY x.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.name, b.website, b.city)
  SELECT c.id, c.name, c.website, ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'phone'), c.city FROM c;
$$;

-- a discovered site whose page confirmed the business (its phone / e-mail / name appears there) turns green
CREATE OR REPLACE FUNCTION public.nr_confirm_site(p_business bigint, p_url text, p_evidence jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_findings f SET verification = 'verified', updated_at = now(),
         title = 'נמצא אתר רשמי חדש (אומת מול פרטי החברה): ' || p_url, detail = f.detail || jsonb_build_object('confirmed_by', p_evidence)
   WHERE f.business_id = p_business AND f.category = 'new_website' AND f.detail->>'value' = lower(rtrim(p_url, '/'));
$$;

-- ── 3. government contracts / tenders with amounts, through the evidence that already links record → business ──
-- dd.mm.yyyy from government datasets; anything malformed is NULL instead of an error
CREATE OR REPLACE FUNCTION public.nr_dmy(t text) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN t ~ '^\d{1,2}\.\d{1,2}\.(19|20)\d{2}$' THEN to_date(t, 'DD.MM.YYYY') END;
$$;

-- row: {rid, amount, currency, ministry, kind, procedure, date, end_date, topic, supplier, reg_id, url}
CREATE OR REPLACE FUNCTION public.nr_ingest_gov_contracts(p_source text, p_evidence_source text, p_tender boolean, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_bid bigint; v_cat text; v_key text; v_old jsonb; v_list jsonb; v_total numeric; v_cnt int; v_last jsonb; v_amt numeric;
  v_matched int := 0; v_unmatched int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_bid := NULL;
    SELECT e.business_id INTO v_bid FROM public.nr_evidence e WHERE e.source_key = p_evidence_source AND e.source_record_id = r->>'rid' LIMIT 1;
    IF v_bid IS NULL AND coalesce(r->>'reg_id', '') <> '' THEN
      SELECT id INTO v_bid FROM public.nr_businesses WHERE reg_id = regexp_replace(r->>'reg_id', '\D', '', 'g');
    END IF;
    IF v_bid IS NULL THEN v_unmatched := v_unmatched + 1; CONTINUE; END IF;
    v_cat := CASE WHEN p_tender OR (coalesce(r->>'kind', '') ~ 'מכרז' AND coalesce(r->>'kind', '') !~ 'פטור') THEN 'tender_won' ELSE 'gov_contract' END;
    v_key := 'gov:' || v_cat || ':' || v_bid;
    v_old := NULL;
    SELECT detail INTO v_old FROM public.nr_findings WHERE dedup_key = v_key;
    -- running totals: the finding keeps the 25 latest items, the count and the sum cover every record seen
    IF coalesce(v_old->'rids', '[]'::jsonb) ? (r->>'rid') THEN v_matched := v_matched + 1; CONTINUE; END IF;
    v_amt := coalesce(nullif(regexp_replace(coalesce(r->>'amount', ''), '[^0-9.]', '', 'g'), '')::numeric, 0);
    v_cnt := coalesce((v_old->>'count')::int, 0) + 1;
    v_total := coalesce((v_old->>'total_amount')::numeric, 0) + v_amt;
    SELECT jsonb_agg(x ORDER BY public.nr_dmy(x->>'date') DESC NULLS LAST) INTO v_list
      FROM (SELECT x FROM jsonb_array_elements(coalesce(v_old->'items', '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(r))) x) q;
    v_last := v_list->0;
    PERFORM public.nr_put_finding(jsonb_build_object('business_id', v_bid, 'source_key', p_source, 'source_url', v_last->>'url',
      'category', v_cat, 'match_method', 'evidence_record',
      'importance', CASE WHEN v_total >= 1000000 THEN 'important' ELSE 'normal' END,
      'published_at', to_char(public.nr_dmy(v_last->>'date'), 'YYYY-MM-DD'),
      'title', CASE v_cat WHEN 'tender_won' THEN 'זכייה במכרז ממשלתי' ELSE 'התקשרות עם משרד ממשלתי' END
        || ' (' || CASE WHEN v_cnt > 1 THEN v_cnt || ' התקשרויות' ELSE '' END
        || CASE WHEN v_total > 0 THEN CASE WHEN v_cnt > 1 THEN ', ' ELSE '' END || 'היקף ₪' || to_char(v_total, 'FM999,999,999,990') ELSE '' END || ')'
        || ' – ' || coalesce(v_last->>'ministry', '') || ': ' || left(coalesce(v_last->>'procedure', v_last->>'topic', ''), 90)
        || CASE WHEN v_last->>'date' IS NOT NULL THEN ' (' || (v_last->>'date') || ')' ELSE '' END,
      'detail', jsonb_build_object('count', v_cnt, 'total_amount', v_total,
        'rids', coalesce(v_old->'rids', '[]'::jsonb) || to_jsonb(r->>'rid'),
        'items', (SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(v_list) x LIMIT 25) q)),
      'dedup_key', v_key));
    v_matched := v_matched + 1;
  END LOOP;
  RETURN jsonb_build_object('matched', v_matched, 'unmatched', v_unmatched);
END;
$$;

-- ── 4. headline → companies named in it (exact registered names only; result always goes to review) ──
CREATE OR REPLACE FUNCTION public.nr_headline_candidates(p_text text) RETURNS bigint[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w text[]; i int; k int; g text; v bigint[] := '{}'; c bigint[];
BEGIN
  w := regexp_split_to_array(btrim(regexp_replace(coalesce(p_text, ''), '[^א-תa-zA-Z0-9"״׳'' ]+', ' ', 'g')), '\s+');
  FOR i IN 1 .. coalesce(array_length(w, 1), 0) LOOP
    FOR k IN REVERSE 4 .. 1 LOOP
      CONTINUE WHEN i + k - 1 > array_length(w, 1);
      g := public.nr_norm_name(array_to_string(w[i:i + k - 1], ' '));
      CONTINUE WHEN length(g) < 4 OR (k = 1 AND length(g) < 5);
      c := NULL;
      SELECT array_agg(id) INTO c FROM (SELECT id FROM public.nr_businesses WHERE name_norm = g AND reg_id IS NOT NULL LIMIT 3) x;
      IF cardinality(c) = 1 THEN v := v || c; EXIT; END IF;
    END LOOP;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT unnest(v) LIMIT 4);
END;
$$;

-- ── 5. weekly re-check of open job postings (a closed posting is updated, never deleted) ──
CREATE OR REPLACE FUNCTION public.nr_requeue_jobs() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE public.nr_jobs SET status = 'queued' WHERE status = 'open' AND fetched_at < now() - interval '7 days' RETURNING 1)
  SELECT count(*)::int FROM u;
$$;

-- is there enrichment work right now? (keeps the scheduler idle otherwise)
CREATE OR REPLACE FUNCTION public.nr_enrich_has_work() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT enrich_running FROM public.nr_control WHERE id = 1), false) AND (
       EXISTS (SELECT 1 FROM public.nr_sources WHERE key LIKE 'enr:%' AND status IN ('pending','collecting'))
    OR EXISTS (SELECT 1 FROM public.nr_jobs WHERE status = 'queued')
    OR EXISTS (SELECT 1 FROM public.nr_domain_queue WHERE status = 'queued')
    OR EXISTS (SELECT 1 FROM public.nr_businesses WHERE website IS NOT NULL AND enr_site_checked_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.nr_sources WHERE key = 'enr:news_rss' AND (last_run_at IS NULL OR last_run_at < now() - interval '3 hours')));
$$;

REVOKE ALL ON FUNCTION public.nr_fill_domain_queue(), public.nr_claim_domains(int), public.nr_claim_sites(int), public.nr_confirm_site(bigint, text, jsonb),
  public.nr_ingest_gov_contracts(text, text, boolean, jsonb), public.nr_headline_candidates(text), public.nr_requeue_jobs(), public.nr_enrich_has_work()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_domains(int), public.nr_claim_sites(int), public.nr_confirm_site(bigint, text, jsonb),
  public.nr_ingest_gov_contracts(text, text, boolean, jsonb), public.nr_headline_candidates(text), public.nr_fill_domain_queue() TO service_role;

-- ── 6. schedule: see 20261019103000_national_registry_enrichment_schedule_staging.sql ──

-- evidence lookup by source record (government contracts enrichment)
CREATE INDEX IF NOT EXISTS nr_evidence_src_rec_idx ON public.nr_evidence (source_key, source_record_id);
