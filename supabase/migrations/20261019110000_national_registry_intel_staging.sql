-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry – business intelligence layer, on the SAME nr_businesses records (no new company table):
--  * nr_relations          company ↔ company links: verified (structured source) / stated (company's own clients-partners-
--                          suppliers page) / mention (link only). A social "follow" is never treated as a business relation.
--  * nr_rel_domain_queue   company → company expansion: related sites are read for a valid ח.פ.; depth ≤ 2, rate-limited
--  * nr_watch              per-company tracking (daily / weekly), run by the server
--  * flags for TikTok / YouTube / WhatsApp / X, relations, partners, watched; filters, card data, report
-- Backup before this migration: schema nr_backup_20261019b. The 7 lead rules are not touched. Nothing is deleted.

-- ── 1. sources: status for "awaiting permission" ──
ALTER TABLE public.nr_sources DROP CONSTRAINT IF EXISTS nr_sources_status_check;
ALTER TABLE public.nr_sources ADD CONSTRAINT nr_sources_status_check
  CHECK (status IN ('pending','collecting','completed','partial','blocked','unsupported','error','awaiting_permission'));

INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config) VALUES
  ('enr:wikidata', 'E20', 'Wikidata – חשבונות רשמיים ברשתות, חברות אם ובנות, מנכ"ל, מספר עובדים', 'https://query.wikidata.org', 'Wikimedia (CC0)', 'enrich_wikidata',
    ARRAY['social','relations','people','employees'], 'רישיון CC0, ממשק שאילתות רשמי (SPARQL) עם הגבלת קצב; שיוך לעסק רק לפי דומיין האתר או שם רשום מלא ויחיד',
    'pending', NULL, 25, '{}'),
  ('enr:site_relations', 'E21', 'קשרים עסקיים מאתרי החברות (לקוחות, שותפים, ספקים)', NULL, 'אתרי העסקים עצמם', 'enrich_relations',
    ARRAY['relations'], 'עמוד "לקוחות / שותפים / ספקים" באתר החברה = קשר מוצהר; קישור בלבד = אזכור. robots.txt מכובד', 'collecting',
    'נאסף כחלק מסריקת העומק באתרי החברות', 41, '{}'),
  ('enr:rel_discovery', 'E22', 'גילוי חברות מחברה לחברה (דרך אתרים קשורים)', NULL, 'אתרי העסקים עצמם', 'enrich_rel_discovery',
    ARRAY['website','new_business','relations'], 'אתר קשור נקרא רק כשמותר ב-robots; חברה מזוהה רק לפי ח.פ. תקין שמופיע באתר; עומק עד 2; מנות קטנות', 'pending', NULL, 45, '{}'),
  ('enr:watch', 'E23', 'מעקב אחר חברות נבחרות (יומי / שבועי)', NULL, 'אתר החברה, Wikidata, מקורות ממשלתיים', 'enrich_watch',
    ARRAY['updates'], 'בדיקה חוזרת של מקורות מותרים בלבד', 'collecting', 'פועל לחברות שסימנת למעקב', 15, '{}'),
  ('enr:meta_api', 'E24', 'פייסבוק ואינסטגרם – Graph API וספריית המודעות של Meta', 'https://developers.facebook.com/docs/graph-api', 'Meta', 'manual',
    ARRAY['social','ads'], 'robots.txt של פייסבוק: "Collection of data on Facebook through automated means is prohibited unless you have express written permission"; אינסטגרם חוסם הכול ב-robots', 'awaiting_permission',
    'נבדק 19.10.2026: איסוף אוטומטי מהאתרים אסור. גישה מותרת רק דרך Graph API (דורש אפליקציית מפתחים מאומתת והרשאת Page Public Content Access) או Ad Library API (דורש אימות זהות). אין הרשאה כרגע – הקישורים לעמודים נאספים מאתרי החברות ומ-Wikidata.', 900, '{}'),
  ('enr:linkedin_api', 'E25', 'לינקדאין – דפי חברות, מנהלים, גיוס', 'https://learn.microsoft.com/linkedin/', 'LinkedIn', 'manual',
    ARRAY['social','people','hiring'], 'תנאי השימוש אוסרים איסוף אוטומטי; ה-API פתוח רק לשותפים מאושרים', 'awaiting_permission',
    'נבדק 19.10.2026: אין גישה מותרת בלי תוכנית שותפים של לינקדאין. קישורי דפי החברה נאספים מאתרי החברות ומ-Wikidata.', 900, '{}'),
  ('enr:youtube_api', 'E26', 'יוטיוב – ערוצי חברות וסרטונים (YouTube Data API)', 'https://developers.google.com/youtube/v3', 'Google', 'manual',
    ARRAY['social','videos'], 'מותר דרך YouTube Data API בלבד (מכסה חינמית יומית); robots חוסם /feeds ו-/api', 'awaiting_permission',
    'נבדק 19.10.2026: דורש מפתח API ייעודי של Google Cloud עם YouTube Data API מופעל – לא קיים במערכת. ללא עלות במכסה החינמית; ממתין לאישורך ליצירת מפתח.', 900, '{}'),
  ('enr:tiktok_api', 'E27', 'טיקטוק – חשבונות וסרטונים עסקיים', 'https://developers.tiktok.com/products/research-api/', 'TikTok', 'manual',
    ARRAY['social'], 'תנאי השימוש אוסרים איסוף; Research API פתוח לחוקרים אקדמיים בלבד', 'blocked',
    'נבדק 19.10.2026: אין דרך מותרת לגישה מסחרית. קישורי חשבונות נאספים מאתרי החברות ומ-Wikidata.', 900, '{}'),
  ('enr:search_engines', 'E28', 'גוגל ומנועי חיפוש', 'https://developers.google.com/custom-search', 'Google / Bing', 'manual',
    ARRAY['discovery'], 'תנאי השימוש אוסרים שאילתות אוטומטיות; Custom Search API בתשלום מעל 100 שאילתות ביום ו-Bing API בתשלום', 'awaiting_permission',
    'נבדק 19.10.2026: חיפוש אוטומטי מותר רק דרך API בתשלום – לא הופעל (דורש אישור עלות). SearXNG נבדק ונדחה: הוא שואב תוצאות ממנועי החיפוש בניגוד לתנאיהם.', 900, '{}'),
  ('enr:groups_forums', 'E29', 'קבוצות עסקיות, פורומים וקהילות', NULL, 'פייסבוק / לינקדאין / פורומים', 'manual',
    ARRAY['relations'], 'קבוצות ברשתות דורשות התחברות; חברות בקבוצה אינה קשר עסקי', 'unsupported',
    'נבדק 19.10.2026: קבוצות פייסבוק ולינקדאין מאחורי התחברות ואסורות לאיסוף; רשימות חברים לא נאספות לפי ההנחיה (מידע אישי).', 900, '{}')
ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, status_reason = EXCLUDED.status_reason, name = EXCLUDED.name, url = EXCLUDED.url,
  terms = EXCLUDED.terms, kind = EXCLUDED.kind, updated_at = now();

-- ── 2. flags on the business record ──
ALTER TABLE public.nr_businesses
  ADD COLUMN IF NOT EXISTS has_tiktok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_youtube boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_twitter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rel_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rel_verified int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_partners boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wd_id text,
  ADD COLUMN IF NOT EXISTS enr_rel_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS nr_b_watched ON public.nr_businesses (id) WHERE watched;
CREATE INDEX IF NOT EXISTS nr_b_rel ON public.nr_businesses (id) WHERE rel_count > 0;
CREATE INDEX IF NOT EXISTS nr_b_tiktok ON public.nr_businesses (id) WHERE has_tiktok;
CREATE INDEX IF NOT EXISTS nr_b_youtube ON public.nr_businesses (id) WHERE has_youtube;
CREATE INDEX IF NOT EXISTS nr_b_whatsapp ON public.nr_businesses (id) WHERE has_whatsapp;
CREATE INDEX IF NOT EXISTS nr_b_enr_last_found ON public.nr_businesses (enr_last_found_at) WHERE enr_last_found_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS nr_cp_value_idx ON public.nr_contact_points (kind, value);

CREATE OR REPLACE FUNCTION public.nr_refresh_flags(p_since timestamptz DEFAULT NULL, p_lo bigint DEFAULT NULL, p_hi bigint DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH t AS (
    SELECT b.id FROM public.nr_businesses b
     WHERE (p_since IS NULL OR b.updated_at >= p_since)
       AND (p_lo IS NULL OR b.id >= p_lo) AND (p_hi IS NULL OR b.id < p_hi)
  ), cp AS (
    SELECT c.business_id,
           bool_or(c.kind = 'phone') ph,
           bool_or(c.kind = 'phone' AND c.verified) vph,
           count(*) FILTER (WHERE c.kind = 'phone' AND c.subkind = 'branch') bph,
           bool_or(c.kind = 'email') em,
           bool_or(c.kind = 'website') web,
           bool_or(c.kind = 'social' AND c.subkind = 'facebook') fb,
           bool_or(c.kind = 'social' AND c.subkind = 'instagram') ig,
           bool_or(c.kind = 'social' AND c.subkind = 'linkedin') li,
           bool_or(c.kind = 'social' AND c.subkind = 'tiktok') tt,
           bool_or(c.kind = 'social' AND c.subkind = 'youtube') yt,
           bool_or(c.kind = 'social' AND c.subkind = 'twitter') tw,
           bool_or(c.kind = 'whatsapp' OR (c.kind = 'social' AND c.subkind = 'whatsapp')) wa,
           count(*) FILTER (WHERE c.verified) ver
      FROM public.nr_contact_points c JOIN t ON t.id = c.business_id GROUP BY c.business_id
  ), pp AS (
    SELECT p.business_id, array_agg(DISTINCT public.nr_role_category(p.role)) roles
      FROM public.nr_people p JOIN t ON t.id = p.business_id GROUP BY p.business_id
  )
  UPDATE public.nr_businesses b SET
    district = coalesce((SELECT l.district FROM public.nr_localities l WHERE l.city_norm = b.city_norm), b.district),
    has_phone = coalesce(cp.ph, false) OR b.phone_main IS NOT NULL,
    has_verified_phone = coalesce(cp.vph, false),
    has_branch_phone = coalesce(cp.bph, 0) > 0,
    branch_phones = coalesce(cp.bph, 0)::int,
    has_email = coalesce(cp.em, false) OR b.email_main IS NOT NULL,
    has_website = coalesce(cp.web, false) OR b.website IS NOT NULL,
    has_facebook = coalesce(cp.fb, false) OR b.socials ? 'facebook',
    has_instagram = coalesce(cp.ig, false) OR b.socials ? 'instagram',
    has_linkedin = coalesce(cp.li, false) OR b.socials ? 'linkedin',
    has_tiktok = coalesce(cp.tt, false) OR b.socials ? 'tiktok',
    has_youtube = coalesce(cp.yt, false) OR b.socials ? 'youtube',
    has_twitter = coalesce(cp.tw, false) OR b.socials ? 'twitter',
    has_whatsapp = coalesce(cp.wa, false) OR b.whatsapp IS NOT NULL OR b.socials ? 'whatsapp',
    has_people = pp.business_id IS NOT NULL,
    people_roles = coalesce(pp.roles, '{}'),
    source_count = cardinality(b.sources),
    verified_points = coalesce(cp.ver, 0)::int,
    employees_basis = CASE WHEN b.employees_count IS NOT NULL THEN 'published'
                           WHEN b.employees_estimate IS NOT NULL THEN 'estimated' END,
    employees_band = public.nr_employees_band(b.employees_count),
    activity_text = public.nr_activity_text(b.main_activity, b.sector, b.activities),
    flags_at = now()
  FROM t
  LEFT JOIN cp ON cp.business_id = t.id
  LEFT JOIN pp ON pp.business_id = t.id
  WHERE b.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_refresh_flags(timestamptz, bigint, bigint) FROM PUBLIC, anon, authenticated;

-- ── 3. relations ──
CREATE TABLE IF NOT EXISTS public.nr_relations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  to_business_id bigint REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  to_name text,
  to_domain text,
  relation text NOT NULL CHECK (relation IN ('parent','subsidiary','owner','brand','client','partner','supplier','mention')),
  level text NOT NULL CHECK (level IN ('verified','stated','mention')),
  source_key text NOT NULL,
  source_url text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dedup_key text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS nr_rel_from_idx ON public.nr_relations (from_business_id);
CREATE INDEX IF NOT EXISTS nr_rel_to_idx ON public.nr_relations (to_business_id) WHERE to_business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nr_rel_domain_idx ON public.nr_relations (to_domain) WHERE to_business_id IS NULL;

CREATE TABLE IF NOT EXISTS public.nr_rel_domain_queue (
  domain text PRIMARY KEY,
  from_business_id bigint REFERENCES public.nr_businesses(id) ON DELETE SET NULL,
  depth int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','matched','created','no_id','robots','error','skipped')),
  found_business_id bigint REFERENCES public.nr_businesses(id) ON DELETE SET NULL,
  note text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz
);
CREATE INDEX IF NOT EXISTS nr_rdq_todo ON public.nr_rel_domain_queue (depth, queued_at) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS public.nr_watch (
  business_id bigint PRIMARY KEY REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  next_due_at timestamptz NOT NULL DEFAULT now(),
  checks int NOT NULL DEFAULT 0,
  last_result text
);
CREATE INDEX IF NOT EXISTS nr_watch_due ON public.nr_watch (next_due_at) WHERE active;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nr_relations','nr_rel_domain_queue','nr_watch'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.nr_can_read())', t || '_select', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Israeli company / association number check digit (same algorithm as ת.ז.)
CREATE OR REPLACE FUNCTION public.nr_valid_il_id(p text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int := 0; i int; x int;
BEGIN
  IF length(d) <> 9 OR d !~ '^5' THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP
    x := substr(d, i, 1)::int * CASE WHEN i % 2 = 1 THEN 1 ELSE 2 END;
    s := s + CASE WHEN x > 9 THEN x - 9 ELSE x END;
  END LOOP;
  RETURN s % 10 = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(lower(coalesce(u, '')), '^(https?://)?(www\.)?([^/:?#]+).*$', '\3'), '');
$$;

-- which business owns this domain? (website host unique in the registry, else business e-mail domain unique)
CREATE OR REPLACE FUNCTION public.nr_business_by_domain(p_domain text) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint[]; d text := public.nr_host(p_domain);
BEGIN
  IF d IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(id) INTO v FROM (SELECT id FROM public.nr_businesses
    WHERE website IS NOT NULL AND regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = d LIMIT 3) x;
  IF cardinality(v) = 1 THEN RETURN v[1]; END IF;
  IF v IS NOT NULL THEN RETURN NULL; END IF;
  SELECT array_agg(DISTINCT business_id) INTO v FROM (SELECT business_id FROM public.nr_contact_points WHERE kind = 'email' AND value LIKE '%@' || d LIMIT 5) x;
  RETURN CASE WHEN cardinality(v) = 1 THEN v[1] END;
END;
$$;

-- relations ingest. row: {from_business_id, relation, level, to_business_id?, to_reg_id?, to_domain?, to_name?, url, detail, depth}
CREATE OR REPLACE FUNCTION public.nr_ingest_relations(p_source text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r jsonb; v_to bigint; v_from bigint; m jsonb; v_dom text; v_new int := 0; v_resolved int := 0; v_queued int := 0; v_id bigint; v_name text; v_key text;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_from := (r->>'from_business_id')::bigint;
    v_dom := public.nr_host(r->>'to_domain');
    v_to := nullif(r->>'to_business_id', '')::bigint;
    IF v_to IS NULL AND coalesce(r->>'to_reg_id', '') <> '' THEN
      SELECT id INTO v_to FROM public.nr_businesses WHERE reg_id = regexp_replace(r->>'to_reg_id', '\D', '', 'g');
    END IF;
    IF v_to IS NULL AND v_dom IS NOT NULL THEN v_to := public.nr_business_by_domain(v_dom); END IF;
    IF v_to IS NULL AND coalesce(r->>'to_name', '') <> '' THEN
      m := public.nr_match_business(r->>'to_name', NULL, NULL);
      IF m->>'status' = 'matched' THEN v_to := (m->>'id')::bigint; END IF;
    END IF;
    CONTINUE WHEN v_to = v_from OR (v_to IS NULL AND v_dom IS NULL AND coalesce(r->>'to_name', '') = '');
    v_key := v_from || ':' || coalesce(v_to::text, v_dom, public.nr_norm_name(r->>'to_name')) || ':' || (r->>'relation');
    INSERT INTO public.nr_relations AS x (from_business_id, to_business_id, to_name, to_domain, relation, level, source_key, source_url, detail, dedup_key)
    VALUES (v_from, v_to, nullif(r->>'to_name', ''), v_dom, r->>'relation', r->>'level', p_source, r->>'url', coalesce(r->'detail', '{}'), v_key)
    ON CONFLICT (dedup_key) DO UPDATE SET
      level = CASE WHEN x.level = 'verified' OR EXCLUDED.level = 'verified' OR (x.source_key <> EXCLUDED.source_key) THEN 'verified'
                   WHEN x.level = 'stated' OR EXCLUDED.level = 'stated' THEN 'stated' ELSE 'mention' END,
      to_business_id = coalesce(x.to_business_id, EXCLUDED.to_business_id), updated_at = now(),
      detail = x.detail || jsonb_build_object('also_from', EXCLUDED.source_key)
    RETURNING id INTO v_id;
    IF v_to IS NOT NULL THEN v_resolved := v_resolved + 1; END IF;
    -- unknown related site: queue it for company → company expansion (depth-limited)
    IF v_to IS NULL AND v_dom IS NOT NULL AND coalesce((r->>'depth')::int, 1) <= 2 AND r->>'level' IN ('stated','verified') THEN
      INSERT INTO public.nr_rel_domain_queue (domain, from_business_id, depth) VALUES (v_dom, v_from, coalesce((r->>'depth')::int, 1))
      ON CONFLICT (domain) DO NOTHING;
      IF FOUND THEN v_queued := v_queued + 1; END IF;
    END IF;
    -- a stated / verified relation to a known company is a finding on the company card (mentions stay in the relations list only)
    IF r->>'level' IN ('verified','stated') THEN
      SELECT name INTO v_name FROM public.nr_businesses WHERE id = v_to;
      PERFORM public.nr_put_finding(jsonb_build_object('business_id', v_from, 'source_key', p_source, 'source_url', r->>'url', 'category', 'relation',
        'importance', 'normal', 'fact_kind', CASE WHEN r->>'level' = 'verified' THEN 'fact' ELSE 'fact' END,
        'verification', CASE WHEN r->>'level' = 'verified' THEN 'verified' ELSE 'unverified' END, 'match_method', 'existing_business',
        'title', CASE r->>'relation' WHEN 'client' THEN 'לקוח עסקי' WHEN 'partner' THEN 'שותף עסקי' WHEN 'supplier' THEN 'ספק'
                   WHEN 'parent' THEN 'חברת אם' WHEN 'subsidiary' THEN 'חברה בת' WHEN 'owner' THEN 'בעלים' WHEN 'brand' THEN 'מותג קשור' ELSE 'קשר' END
                 || ': ' || coalesce(v_name, r->>'to_name', v_dom) || CASE WHEN r->>'level' = 'stated' THEN ' (לפי אתר החברה)' ELSE ' (מקור מובנה)' END,
        'detail', jsonb_build_object('relation_id', v_id, 'to_business_id', v_to, 'to_domain', v_dom),
        'dedup_key', 'rel:' || v_key));
    END IF;
    v_new := v_new + 1;
  END LOOP;
  RETURN jsonb_build_object('relations', v_new, 'resolved', v_resolved, 'queued', v_queued);
END;
$$;

-- a related site was identified as belonging to a business: resolve every relation that points at that domain
CREATE OR REPLACE FUNCTION public.nr_resolve_domain(p_domain text, p_business bigint) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.nr_relations SET to_business_id = p_business, updated_at = now()
   WHERE to_business_id IS NULL AND to_domain = public.nr_host(p_domain) AND from_business_id <> p_business;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_claim_rel_domains(p_limit int)
RETURNS TABLE(domain text, from_business_id bigint, depth int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_rel_domain_queue q SET status = 'error', note = 'claimed', checked_at = now()
   WHERE q.domain IN (SELECT x.domain FROM public.nr_rel_domain_queue x WHERE x.status = 'queued' ORDER BY x.depth, x.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.from_business_id, q.depth;
$$;

-- ── 4. watch ──
CREATE OR REPLACE FUNCTION public.nr_watch_set(p_business bigint, p_frequency text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_frequency IS NULL OR p_frequency = '' THEN
    UPDATE public.nr_watch SET active = false WHERE business_id = p_business;
    UPDATE public.nr_businesses SET watched = false WHERE id = p_business;
    RETURN jsonb_build_object('watched', false);
  END IF;
  IF p_frequency NOT IN ('daily','weekly') THEN RAISE EXCEPTION 'bad frequency'; END IF;
  INSERT INTO public.nr_watch (business_id, frequency, created_by, next_due_at) VALUES (p_business, p_frequency, auth.uid(), now())
  ON CONFLICT (business_id) DO UPDATE SET frequency = EXCLUDED.frequency, active = true, next_due_at = least(public.nr_watch.next_due_at, now() + interval '1 hour');
  UPDATE public.nr_businesses SET watched = true WHERE id = p_business;
  RETURN jsonb_build_object('watched', true, 'frequency', p_frequency);
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_claim_watch(p_limit int)
RETURNS TABLE(id bigint, name text, name_en text, reg_id_type text, website text, phones text[], emails text[], city text, shared_by int, wd_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (
    UPDATE public.nr_watch w SET last_checked_at = now(), checks = w.checks + 1,
           next_due_at = now() + CASE w.frequency WHEN 'daily' THEN interval '1 day' ELSE interval '7 days' END
     WHERE w.business_id IN (SELECT x.business_id FROM public.nr_watch x WHERE x.active AND x.next_due_at <= now() ORDER BY x.next_due_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING w.business_id)
  SELECT b.id, b.name, b.name_en, b.reg_id_type, b.website,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = b.id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = b.id AND p.kind = 'email'), b.city,
         (SELECT count(*)::int FROM public.nr_businesses o WHERE b.website IS NOT NULL AND public.nr_host(o.website) = public.nr_host(b.website)), b.wd_id
    FROM w JOIN public.nr_businesses b ON b.id = w.business_id;
$$;

CREATE OR REPLACE FUNCTION public.nr_watch_updates(p_limit int DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'watched', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'city', b.city, 'frequency', w.frequency, 'last_checked_at', w.last_checked_at,
                  'next_due_at', w.next_due_at, 'checks', w.checks, 'last_result', w.last_result) ORDER BY w.created_at DESC), '[]')
                  FROM public.nr_watch w JOIN public.nr_businesses b ON b.id = w.business_id WHERE w.active),
    'updates', (SELECT coalesce(jsonb_agg(x ORDER BY x.discovered_at DESC), '[]') FROM (
       SELECT f.business_id, b.name, f.category, f.title, f.importance, f.verification, f.fact_kind, f.source_url, s.name source_name, f.discovered_at, f.published_at
         FROM public.nr_findings f JOIN public.nr_watch w ON w.business_id = f.business_id AND w.active
         JOIN public.nr_businesses b ON b.id = f.business_id LEFT JOIN public.nr_sources s ON s.key = f.source_key
        WHERE f.match_status = 'matched' AND f.discovered_at >= w.created_at - interval '1 minute'
        ORDER BY f.discovered_at DESC LIMIT least(greatest(p_limit, 1), 500)) x));
END;
$$;

-- ── 5. relation flags (refreshed with the enrichment flags) ──
CREATE OR REPLACE FUNCTION public.nr_refresh_relations(p_ids bigint[]) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH ids AS (SELECT DISTINCT unnest(p_ids) id),
  r AS (SELECT ids.id,
               count(x.id)::int n, (count(x.id) FILTER (WHERE x.level = 'verified'))::int v,
               coalesce(bool_or(x.relation IN ('client','partner','supplier') AND x.level IN ('stated','verified')), false) p
          FROM ids LEFT JOIN public.nr_relations x ON (x.from_business_id = ids.id OR x.to_business_id = ids.id) GROUP BY ids.id)
  UPDATE public.nr_businesses b SET rel_count = r.n, rel_verified = r.v, has_partners = r.p
    FROM r WHERE b.id = r.id AND (b.rel_count, b.rel_verified, b.has_partners) IS DISTINCT FROM (r.n, r.v, r.p);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
CREATE OR REPLACE FUNCTION public.nr_refresh_enrich_recent(p_minutes int DEFAULT 6) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint[];
BEGIN
  SELECT array_agg(DISTINCT x) INTO v FROM (
    SELECT business_id x FROM public.nr_findings WHERE updated_at > now() - make_interval(mins => p_minutes) AND business_id IS NOT NULL
    UNION SELECT unnest(candidate_ids) FROM public.nr_findings WHERE updated_at > now() - make_interval(mins => p_minutes) AND match_status = 'pending_review'
    UNION SELECT business_id FROM public.nr_jobs WHERE fetched_at > now() - make_interval(mins => p_minutes) AND business_id IS NOT NULL
    UNION SELECT from_business_id FROM public.nr_relations WHERE updated_at > now() - make_interval(mins => p_minutes)
    UNION SELECT to_business_id FROM public.nr_relations WHERE updated_at > now() - make_interval(mins => p_minutes) AND to_business_id IS NOT NULL) q;
  IF v IS NULL THEN RETURN 0; END IF;
  PERFORM public.nr_refresh_relations(v);
  RETURN public.nr_refresh_enrich(v);
END;
$$;

REVOKE ALL ON FUNCTION public.nr_valid_il_id(text), public.nr_business_by_domain(text), public.nr_ingest_relations(text, jsonb), public.nr_resolve_domain(text, bigint),
  public.nr_claim_rel_domains(int), public.nr_claim_watch(int), public.nr_refresh_relations(bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_valid_il_id(text), public.nr_business_by_domain(text), public.nr_ingest_relations(text, jsonb), public.nr_resolve_domain(text, bigint),
  public.nr_claim_rel_domains(int), public.nr_claim_watch(int), public.nr_refresh_relations(bigint[]) TO service_role;
REVOKE ALL ON FUNCTION public.nr_watch_set(bigint, text), public.nr_watch_updates(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_watch_set(bigint, text), public.nr_watch_updates(int) TO authenticated, service_role;

-- new social flags for every business that has a social link / WhatsApp today
SELECT count(public.nr_refresh_flags(NULL, id, id + 1)) FROM (SELECT DISTINCT business_id id FROM public.nr_contact_points WHERE kind IN ('social','whatsapp')) x;
