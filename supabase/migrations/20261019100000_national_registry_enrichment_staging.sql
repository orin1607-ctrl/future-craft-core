-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry – ENRICHMENT layer on top of the existing nr_* registry (no new business table, no lead table):
--  * nr_findings   every new fact about an existing business: what, when, from which source, link, importance,
--                  fact vs. indication, verified vs. not, matched vs. waiting for review (uncertain matches never attach)
--  * nr_jobs       job postings (government Employment Service, JSON-LD on business sites) tied to the existing business
--  * enr_* columns precomputed flags on nr_businesses for fast server-side filtering
--  * triggers      a new phone / email / website / social link / business person added to an EXISTING business
--                  becomes a finding automatically, whichever collector added it; nothing is overwritten
--  * matching      official id → exact registered name (unique) → exact name + city; anything else waits for review
-- Backup before this migration: schema nr_backup_20261019 (businesses, contact points, people, sources, marks, groups).
-- The 7 lead rules are NOT applied. Nothing is deleted.

-- ── 1. control: separate lock + switch for the enrichment engine ──
ALTER TABLE public.nr_control
  ADD COLUMN IF NOT EXISTS enrich_running boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrich_lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_current text;

CREATE OR REPLACE FUNCTION public.nr_enrich_try_lock(p_seconds int) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_control SET enrich_lock_until = now() + make_interval(secs => p_seconds)
   WHERE id = 1 AND (enrich_lock_until IS NULL OR enrich_lock_until < now())
  RETURNING true;
$$;
CREATE OR REPLACE FUNCTION public.nr_enrich_unlock() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_control SET enrich_lock_until = NULL WHERE id = 1;
$$;

-- ── 2. findings ──
CREATE TABLE IF NOT EXISTS public.nr_findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id bigint REFERENCES public.nr_businesses(id) ON DELETE CASCADE,   -- NULL while the match waits for review
  candidate_ids bigint[] NOT NULL DEFAULT '{}',
  subject_name text,                          -- the name as the source wrote it
  subject_city text,
  source_key text NOT NULL,
  source_url text,
  category text NOT NULL,                     -- hiring | hiring_drivers | hiring_logistics | hiring_operations | new_phone | new_email
                                              -- new_website | new_social | person | ceo | operations_manager | expansion | branch_opened
                                              -- tender_won | gov_contract | fleet | news
  title text NOT NULL,                        -- short Hebrew sentence shown next to the colour mark
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  importance text NOT NULL DEFAULT 'normal' CHECK (importance IN ('important','normal')),
  fact_kind text NOT NULL DEFAULT 'fact' CHECK (fact_kind IN ('fact','indication')),
  verification text NOT NULL DEFAULT 'unverified' CHECK (verification IN ('verified','unverified')),
  match_status text NOT NULL DEFAULT 'matched' CHECK (match_status IN ('matched','pending_review','rejected','unmatched')),
  match_method text,
  published_at date,                          -- date the source published / updated it (when known)
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  dedup_key text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS nr_findings_biz_idx ON public.nr_findings (business_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS nr_findings_pending_idx ON public.nr_findings (discovered_at DESC) WHERE match_status = 'pending_review';
CREATE INDEX IF NOT EXISTS nr_findings_cat_idx ON public.nr_findings (category, match_status);
CREATE INDEX IF NOT EXISTS nr_findings_updated_idx ON public.nr_findings (updated_at);
CREATE INDEX IF NOT EXISTS nr_findings_cands_idx ON public.nr_findings USING gin (candidate_ids);

-- ── 3. job postings ──
CREATE TABLE IF NOT EXISTS public.nr_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_key text NOT NULL,
  url text NOT NULL UNIQUE,
  ext_id text,
  business_id bigint REFERENCES public.nr_businesses(id) ON DELETE SET NULL,
  candidate_ids bigint[] NOT NULL DEFAULT '{}',
  employer_name text,
  employer_norm text,
  title text,
  occupation text,
  field text,
  city text,
  license text,
  posted_date date,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','open','closed','unknown','no_employer','gone','error')),
  is_driver boolean NOT NULL DEFAULT false,
  is_logistics boolean NOT NULL DEFAULT false,
  is_operations boolean NOT NULL DEFAULT false,
  match_status text CHECK (match_status IN ('matched','pending_review','unmatched','rejected')),
  match_method text,
  lastmod text,
  attempts int NOT NULL DEFAULT 0,
  fetched_at timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nr_jobs_queue_idx ON public.nr_jobs (source_key, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS nr_jobs_biz_idx ON public.nr_jobs (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nr_jobs_emp_idx ON public.nr_jobs (employer_norm);

-- ── 4. filter columns on the existing business record ──
ALTER TABLE public.nr_businesses
  ADD COLUMN IF NOT EXISTS enr_hiring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_hiring_drivers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_hiring_logistics boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_jobs_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enr_jobs_open int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enr_last_job_date date,
  ADD COLUMN IF NOT EXISTS enr_expansion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_branch_opened boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_tender_won boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_gov_contract boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_fleet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_corp_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_new_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_new_website boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_important boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enr_findings int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enr_last_found_at timestamptz,
  ADD COLUMN IF NOT EXISTS enr_sources text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enr_headline text,             -- most important recent finding, for the table row
  ADD COLUMN IF NOT EXISTS enr_site_checked_at timestamptz; -- deep crawl of the business website (separate from the first crawl)

CREATE INDEX IF NOT EXISTS nr_b_enr_hiring ON public.nr_businesses (id) WHERE enr_hiring;
CREATE INDEX IF NOT EXISTS nr_b_enr_drivers ON public.nr_businesses (id) WHERE enr_hiring_drivers;
CREATE INDEX IF NOT EXISTS nr_b_enr_important ON public.nr_businesses (enr_last_found_at DESC) WHERE enr_important;
CREATE INDEX IF NOT EXISTS nr_b_enr_found ON public.nr_businesses (enr_last_found_at DESC NULLS LAST, id) WHERE enr_findings > 0;
CREATE INDEX IF NOT EXISTS nr_b_enr_review ON public.nr_businesses (id) WHERE enr_needs_review;
CREATE INDEX IF NOT EXISTS nr_b_enr_sources ON public.nr_businesses USING gin (enr_sources);
CREATE INDEX IF NOT EXISTS nr_b_site_todo ON public.nr_businesses (id) WHERE website IS NOT NULL AND enr_site_checked_at IS NULL;

-- ── 5. matching: who does this name belong to? ──
-- Returns {id, status, method, candidates}. Only certain matches return status 'matched'.
CREATE OR REPLACE FUNCTION public.nr_match_business(p_name text, p_city text DEFAULT NULL, p_reg text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_norm text := public.nr_norm_name(p_name);
  v_city text := public.nr_norm_city(p_city);
  v_reg text := nullif(regexp_replace(coalesce(p_reg, ''), '\D', '', 'g'), '');
  v_id bigint; v_cands bigint[]; v_city_ids bigint[];
  v_legal boolean := coalesce(p_name, '') ~* '(בע["״׳''~]?מ|שותפות|עמותה|חל["״]צ|אגודה שיתופית|\mltd\M|\mlimited\M|\minc\M)';
  r record;
BEGIN
  IF v_reg IS NOT NULL AND length(v_reg) >= 8 THEN
    SELECT id INTO v_id FROM public.nr_businesses WHERE reg_id = v_reg;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_id, 'status', 'matched', 'method', 'reg_id', 'candidates', jsonb_build_array(v_id)); END IF;
  END IF;
  IF length(v_norm) < 3 THEN RETURN jsonb_build_object('status', 'unmatched', 'method', 'name_too_short', 'candidates', '[]'::jsonb); END IF;
  SELECT array_agg(id ORDER BY id) INTO v_cands FROM (SELECT id FROM public.nr_businesses WHERE name_norm = v_norm LIMIT 8) x;
  IF v_cands IS NULL THEN
    -- no exact name: offer close names to the reviewer only (never attached automatically)
    SELECT array_agg(id) INTO v_cands FROM (
      SELECT id FROM public.nr_businesses WHERE name_norm % v_norm AND similarity(name_norm, v_norm) >= 0.6
       ORDER BY similarity(name_norm, v_norm) DESC LIMIT 3) x;
    RETURN jsonb_build_object('status', CASE WHEN v_cands IS NULL THEN 'unmatched' ELSE 'pending_review' END,
      'method', CASE WHEN v_cands IS NULL THEN 'no_match' ELSE 'similar_name' END, 'candidates', to_jsonb(coalesce(v_cands, '{}')));
  END IF;
  IF v_city IS NOT NULL THEN
    SELECT array_agg(id) INTO v_city_ids FROM public.nr_businesses WHERE id = ANY(v_cands) AND city_norm = v_city;
  END IF;
  IF cardinality(v_city_ids) = 1 THEN
    RETURN jsonb_build_object('id', v_city_ids[1], 'status', 'matched', 'method', 'name+city', 'candidates', to_jsonb(v_cands));
  END IF;
  IF cardinality(v_cands) = 1 THEN
    SELECT id, reg_id, reg_id_type INTO r FROM public.nr_businesses WHERE id = v_cands[1];
    -- a registered company name is unique by law: the full registered name (with its legal suffix, or long enough to be
    -- distinctive) that exists exactly once in the national registry identifies that company
    IF r.reg_id IS NOT NULL AND (v_legal OR length(v_norm) >= 10) THEN
      RETURN jsonb_build_object('id', r.id, 'status', 'matched', 'method', 'registered_name', 'candidates', to_jsonb(v_cands));
    END IF;
  END IF;
  RETURN jsonb_build_object('status', 'pending_review', 'method', CASE WHEN cardinality(v_cands) > 1 THEN 'several_same_name' ELSE 'name_only' END,
    'candidates', to_jsonb(v_cands));
END;
$$;

-- ── 6. one finding (idempotent by dedup_key; a repeated finding updates, never duplicates) ──
CREATE OR REPLACE FUNCTION public.nr_put_finding(f jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO public.nr_findings AS x (business_id, candidate_ids, subject_name, subject_city, source_key, source_url, category, title, detail,
    importance, fact_kind, verification, match_status, match_method, published_at, dedup_key)
  VALUES ((f->>'business_id')::bigint, coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(f->'candidates', '[]')))::bigint[], '{}'),
    f->>'subject_name', f->>'subject_city', f->>'source_key', f->>'source_url', f->>'category', left(f->>'title', 300),
    coalesce(f->'detail', '{}'), coalesce(f->>'importance', 'normal'), coalesce(f->>'fact_kind', 'fact'),
    coalesce(f->>'verification', 'unverified'), coalesce(f->>'match_status', 'matched'), f->>'match_method',
    nullif(f->>'published_at', '')::date, f->>'dedup_key')
  ON CONFLICT (dedup_key) DO UPDATE SET
    title = EXCLUDED.title, detail = EXCLUDED.detail, source_url = coalesce(EXCLUDED.source_url, x.source_url),
    importance = EXCLUDED.importance,
    verification = CASE WHEN x.verification = 'verified' THEN 'verified' ELSE EXCLUDED.verification END,
    published_at = greatest(x.published_at, EXCLUDED.published_at),
    -- a reviewer's decision is never undone by the collector
    business_id = CASE WHEN x.reviewed_at IS NOT NULL THEN x.business_id ELSE coalesce(EXCLUDED.business_id, x.business_id) END,
    match_status = CASE WHEN x.reviewed_at IS NOT NULL THEN x.match_status ELSE EXCLUDED.match_status END,
    candidate_ids = EXCLUDED.candidate_ids,
    updated_at = now()
  RETURNING id INTO v;
  RETURN v;
END;
$$;

-- ── 7. triggers: new details on EXISTING businesses become findings (any collector) ──
CREATE OR REPLACE FUNCTION public.nr_cp_finding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first timestamptz; v_cat text; v_title text; v_imp text := 'normal';
BEGIN
  SELECT first_seen_at INTO v_first FROM public.nr_businesses WHERE id = NEW.business_id;
  -- details that arrived with the business itself are not "new information about an existing business"
  IF v_first IS NULL OR v_first > now() - interval '30 minutes' THEN RETURN NEW; END IF;
  v_cat := CASE NEW.kind WHEN 'phone' THEN 'new_phone' WHEN 'email' THEN 'new_email' WHEN 'website' THEN 'new_website'
                         WHEN 'fax' THEN NULL ELSE 'new_social' END;
  IF v_cat IS NULL THEN RETURN NEW; END IF;
  IF v_cat IN ('new_phone', 'new_website') THEN v_imp := 'important'; END IF;
  v_title := CASE v_cat
    WHEN 'new_phone' THEN 'נמצא מספר טלפון חדש: ' || coalesce(NEW.display, NEW.value) || CASE WHEN NEW.subkind = 'branch' THEN ' (סניף)' ELSE '' END
    WHEN 'new_email' THEN 'נמצא אימייל חדש: ' || NEW.value
    WHEN 'new_website' THEN 'נמצא אתר אינטרנט חדש: ' || NEW.value
    ELSE 'נמצא קישור חדש (' || coalesce(NEW.subkind, NEW.kind) || '): ' || NEW.value END;
  PERFORM public.nr_put_finding(jsonb_build_object('business_id', NEW.business_id, 'source_key', NEW.sources[1], 'category', v_cat,
    'title', v_title, 'importance', v_imp, 'verification', CASE WHEN NEW.verified THEN 'verified' ELSE 'unverified' END,
    'match_method', 'existing_business', 'detail', jsonb_build_object('cp_id', NEW.id, 'kind', NEW.kind, 'value', NEW.value),
    'source_url', CASE WHEN NEW.value ~ '^https?://' THEN NEW.value END,
    'dedup_key', 'cp:' || NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nr_cp_finding_trg ON public.nr_contact_points;
CREATE TRIGGER nr_cp_finding_trg AFTER INSERT ON public.nr_contact_points FOR EACH ROW EXECUTE FUNCTION public.nr_cp_finding();

-- a contact point confirmed by a second independent source turns its finding green
CREATE OR REPLACE FUNCTION public.nr_cp_verified() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verified AND NOT OLD.verified THEN
    UPDATE public.nr_findings SET verification = 'verified', updated_at = now(),
      detail = detail || jsonb_build_object('verified_by', NEW.sources)
     WHERE dedup_key = 'cp:' || NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nr_cp_verified_trg ON public.nr_contact_points;
CREATE TRIGGER nr_cp_verified_trg AFTER UPDATE OF sources ON public.nr_contact_points FOR EACH ROW EXECUTE FUNCTION public.nr_cp_verified();

CREATE OR REPLACE FUNCTION public.nr_people_finding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first timestamptz; v_cat text := public.nr_role_category(NEW.role); v_fc text;
BEGIN
  SELECT first_seen_at INTO v_first FROM public.nr_businesses WHERE id = NEW.business_id;
  IF v_first IS NULL OR v_first > now() - interval '30 minutes' THEN RETURN NEW; END IF;
  v_fc := CASE WHEN v_cat = 'ceo' THEN 'ceo' WHEN v_cat IN ('operations', 'fleet') THEN 'operations_manager' ELSE 'person' END;
  PERFORM public.nr_put_finding(jsonb_build_object('business_id', NEW.business_id, 'source_key', NEW.source_key, 'source_url', NEW.source_url,
    'category', v_fc, 'importance', CASE WHEN v_fc = 'person' THEN 'normal' ELSE 'important' END,
    'title', CASE v_fc WHEN 'ceo' THEN 'זוהה מנכ"ל: ' WHEN 'operations_manager' THEN 'זוהה מנהל תפעול / לוגיסטיקה / צי: ' ELSE 'זוהה איש קשר עסקי: ' END
             || NEW.full_name || CASE WHEN NEW.role <> '' THEN ' – ' || NEW.role ELSE '' END,
    'match_method', 'existing_business', 'detail', jsonb_build_object('person_id', NEW.id, 'role', NEW.role),
    'dedup_key', 'person:' || NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nr_people_finding_trg ON public.nr_people;
CREATE TRIGGER nr_people_finding_trg AFTER INSERT ON public.nr_people FOR EACH ROW EXECUTE FUNCTION public.nr_people_finding();

-- ── 8. job classification ──
CREATE OR REPLACE FUNCTION public.nr_job_flags(p_title text, p_occ text, p_license text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'driver', concat_ws(' ', p_title, p_occ) ~* '(^|[^א-ת])נהג|driver|משאית|מערבל|מלגזן' OR coalesce(p_license, '') ~ '(^|\s)(C1?|C|D|E)\s*-',
    'logistics', concat_ws(' ', p_title, p_occ) ~* 'מחסן|לוגיסט|ליקוט|שילוח|הפצה|שליח|מפיץ|שרשרת אספקה|יבוא|יצוא|סדרן|צי רכב|תעבורה|logistic|warehouse|supply chain|courier|delivery|רכש',
    'operations', concat_ws(' ', p_title, p_occ) ~* 'תפעול|operations|מנהל.{0,3} (לוגיסטיקה|מחסן|צי|רכש|הפצה)|קצין.{0,3} (בטיחות|רכב)|סדרן');
$$;

-- ── 9. jobs ingest: upsert postings, match employer, keep uncertain employers for review ──
CREATE OR REPLACE FUNCTION public.nr_ingest_jobs(p_source text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r jsonb; m jsonb; fl jsonb; v_bid bigint; v_status text; v_norm text; v_ids bigint[] := '{}';
  v_matched int := 0; v_pending int := 0; v_unmatched int := 0; v_noemp int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    fl := public.nr_job_flags(r->>'title', r->>'occupation', r->>'license');
    v_norm := public.nr_norm_name(r->>'employer');
    v_bid := nullif(r->>'business_id', '')::bigint;
    m := NULL;
    IF v_bid IS NOT NULL THEN m := jsonb_build_object('id', v_bid, 'status', 'matched', 'method', 'business_website', 'candidates', jsonb_build_array(v_bid));
    ELSIF coalesce(btrim(r->>'employer'), '') = '' THEN m := jsonb_build_object('status', 'unmatched', 'method', 'employer_hidden', 'candidates', '[]'::jsonb);
    ELSE
      -- the same employer name was already decided by a reviewer: reuse that decision
      SELECT jsonb_build_object('id', j.business_id, 'status', 'matched', 'method', 'manual_review', 'candidates', jsonb_build_array(j.business_id))
        INTO m FROM public.nr_jobs j WHERE j.employer_norm = v_norm AND j.match_method = 'manual_review' AND j.business_id IS NOT NULL LIMIT 1;
      IF m IS NULL THEN m := public.nr_match_business(r->>'employer', r->>'city', r->>'reg_id'); END IF;
    END IF;
    v_status := CASE WHEN coalesce(btrim(r->>'employer'), '') = '' AND v_bid IS NULL THEN 'no_employer' ELSE coalesce(r->>'status', 'unknown') END;
    INSERT INTO public.nr_jobs AS j (source_key, url, ext_id, business_id, candidate_ids, employer_name, employer_norm, title, occupation, field, city,
      license, posted_date, status, is_driver, is_logistics, is_operations, match_status, match_method, fetched_at, attempts)
    VALUES (p_source, r->>'url', r->>'ext_id', (m->>'id')::bigint, ARRAY(SELECT jsonb_array_elements_text(m->'candidates'))::bigint[],
      nullif(btrim(r->>'employer'), ''), nullif(v_norm, ''), r->>'title', r->>'occupation', r->>'field', r->>'city', r->>'license',
      nullif(r->>'posted', '')::date, v_status, (fl->>'driver')::boolean, (fl->>'logistics')::boolean, (fl->>'operations')::boolean,
      m->>'status', m->>'method', now(), 1)
    ON CONFLICT (url) DO UPDATE SET ext_id = EXCLUDED.ext_id,
      business_id = CASE WHEN j.match_method = 'manual_review' THEN j.business_id ELSE EXCLUDED.business_id END,
      candidate_ids = EXCLUDED.candidate_ids, employer_name = EXCLUDED.employer_name, employer_norm = EXCLUDED.employer_norm,
      title = EXCLUDED.title, occupation = EXCLUDED.occupation, field = EXCLUDED.field, city = EXCLUDED.city, license = EXCLUDED.license,
      posted_date = EXCLUDED.posted_date, status = EXCLUDED.status, is_driver = EXCLUDED.is_driver, is_logistics = EXCLUDED.is_logistics,
      is_operations = EXCLUDED.is_operations,
      match_status = CASE WHEN j.match_method = 'manual_review' THEN j.match_status ELSE EXCLUDED.match_status END,
      match_method = CASE WHEN j.match_method = 'manual_review' THEN j.match_method ELSE EXCLUDED.match_method END,
      fetched_at = now(), attempts = j.attempts + 1;
    IF m->>'status' = 'matched' THEN v_matched := v_matched + 1; v_ids := v_ids || (m->>'id')::bigint;
    ELSIF m->>'status' = 'pending_review' THEN v_pending := v_pending + 1;
      -- one review item per employer name, listing every posting under it
      PERFORM public.nr_put_finding(jsonb_build_object('source_key', p_source, 'source_url', r->>'url', 'category', 'hiring',
        'subject_name', r->>'employer', 'subject_city', r->>'city', 'candidates', m->'candidates',
        'title', 'המעסיק "' || (r->>'employer') || '" מגייס – ממתין לאישור שיוך לחברה',
        'match_status', 'pending_review', 'match_method', m->>'method', 'published_at', r->>'posted',
        'detail', jsonb_build_object('employer', r->>'employer', 'reason', m->>'method'),
        'dedup_key', 'pending_employer:' || p_source || ':' || v_norm));
    ELSIF v_status = 'no_employer' THEN v_noemp := v_noemp + 1;
    ELSE v_unmatched := v_unmatched + 1; END IF;
  END LOOP;
  IF cardinality(v_ids) > 0 THEN PERFORM public.nr_jobs_rollup(v_ids); END IF;
  RETURN jsonb_build_object('matched', v_matched, 'pending', v_pending, 'unmatched', v_unmatched, 'no_employer', v_noemp, 'businesses', cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))));
END;
$$;

-- per-business hiring findings from its postings (one finding per category, kept up to date)
CREATE OR REPLACE FUNCTION public.nr_jobs_rollup(p_ids bigint[]) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; v_titles text;
BEGIN
  FOR r IN
    SELECT j.business_id, j.source_key, count(*) total, count(*) FILTER (WHERE j.status = 'open') open_n,
           count(*) FILTER (WHERE j.is_driver) drivers, count(*) FILTER (WHERE j.is_logistics) logi, count(*) FILTER (WHERE j.is_operations) ops,
           max(j.posted_date) last_date, (array_agg(j.url ORDER BY j.posted_date DESC NULLS LAST))[1] last_url,
           (array_agg(j.url ORDER BY j.posted_date DESC NULLS LAST) FILTER (WHERE j.is_driver))[1] driver_url,
           (array_agg(j.url ORDER BY j.posted_date DESC NULLS LAST) FILTER (WHERE j.is_logistics OR j.is_operations))[1] logi_url,
           array_agg(DISTINCT j.title) FILTER (WHERE j.title IS NOT NULL) titles,
           array_agg(DISTINCT j.title) FILTER (WHERE j.is_driver AND j.title IS NOT NULL) driver_titles,
           array_agg(DISTINCT j.title) FILTER (WHERE (j.is_logistics OR j.is_operations) AND j.title IS NOT NULL) logi_titles,
           array_agg(DISTINCT j.city) FILTER (WHERE j.city IS NOT NULL) cities
      FROM public.nr_jobs j WHERE j.business_id = ANY(p_ids) AND j.status IN ('open','closed','unknown')
     GROUP BY j.business_id, j.source_key
  LOOP
    v_titles := array_to_string(r.titles[1:4], ' · ');
    PERFORM public.nr_put_finding(jsonb_build_object('business_id', r.business_id, 'source_key', r.source_key, 'source_url', r.last_url,
      'category', 'hiring', 'importance', 'normal', 'published_at', r.last_date,
      'title', 'החברה מגייסת – ' || r.total || ' משרות פורסמו' || CASE WHEN r.open_n > 0 THEN ' (' || r.open_n || ' פעילות)' ELSE '' END || ': ' || v_titles,
      'detail', jsonb_build_object('jobs', r.total, 'open', r.open_n, 'titles', to_jsonb(r.titles[1:15]), 'cities', to_jsonb(r.cities[1:10])),
      'dedup_key', 'hiring:' || r.source_key || ':' || r.business_id));
    IF r.drivers > 0 THEN
      PERFORM public.nr_put_finding(jsonb_build_object('business_id', r.business_id, 'source_key', r.source_key, 'source_url', r.driver_url,
        'category', 'hiring_drivers', 'importance', 'important', 'published_at', r.last_date,
        'title', 'מידע חשוב חדש – החברה מגייסת נהגים (' || r.drivers || ' משרות): ' || array_to_string(r.driver_titles[1:3], ' · '),
        'detail', jsonb_build_object('jobs', r.drivers, 'titles', to_jsonb(r.driver_titles[1:15])),
        'dedup_key', 'hiring_drivers:' || r.source_key || ':' || r.business_id));
    END IF;
    IF r.logi + r.ops > 0 THEN
      PERFORM public.nr_put_finding(jsonb_build_object('business_id', r.business_id, 'source_key', r.source_key, 'source_url', r.logi_url,
        'category', CASE WHEN r.ops > 0 THEN 'hiring_operations' ELSE 'hiring_logistics' END, 'importance', 'important', 'published_at', r.last_date,
        'title', 'מידע חשוב חדש – החברה מגייסת אנשי לוגיסטיקה / תפעול: ' || array_to_string(r.logi_titles[1:3], ' · '),
        'detail', jsonb_build_object('jobs', greatest(r.logi, r.ops), 'titles', to_jsonb(r.logi_titles[1:15])),
        'dedup_key', 'hiring_logistics:' || r.source_key || ':' || r.business_id));
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ── 10. generic findings ingest (websites, news, government evidence) ──
-- row: {business_id? | name, city, reg_id}, category, title, detail, url, published_at, importance, fact_kind, verification, key
CREATE OR REPLACE FUNCTION public.nr_ingest_findings(p_source text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r jsonb; m jsonb; v_matched int := 0; v_pending int := 0; v_unmatched int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF r ? 'business_id' THEN m := jsonb_build_object('id', r->'business_id', 'status', 'matched', 'method', coalesce(r->>'method', 'business_website'), 'candidates', jsonb_build_array(r->'business_id'));
    ELSE m := public.nr_match_business(r->>'name', r->>'city', r->>'reg_id');
    END IF;
    IF m->>'status' = 'unmatched' THEN v_unmatched := v_unmatched + 1; CONTINUE; END IF;
    PERFORM public.nr_put_finding(jsonb_build_object('business_id', CASE WHEN m->>'status' = 'matched' THEN m->'id' END,
      'candidates', m->'candidates', 'subject_name', r->>'name', 'subject_city', r->>'city', 'source_key', p_source, 'source_url', r->>'url',
      'category', r->>'category', 'title', r->>'title', 'detail', coalesce(r->'detail', '{}'), 'importance', coalesce(r->>'importance', 'normal'),
      'fact_kind', coalesce(r->>'fact_kind', 'fact'), 'verification', coalesce(r->>'verification', 'unverified'),
      'match_status', m->>'status', 'match_method', m->>'method', 'published_at', r->>'published_at',
      'dedup_key', p_source || ':' || (r->>'category') || ':' || coalesce(r->>'key', md5(r::text)) || CASE WHEN m->>'status' = 'matched' THEN ':' || (m->>'id') ELSE '' END));
    IF m->>'status' = 'matched' THEN v_matched := v_matched + 1; ELSE v_pending := v_pending + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('matched', v_matched, 'pending', v_pending, 'unmatched', v_unmatched);
END;
$$;

-- ── 11. flags on the business record from its findings / jobs / contacts ──
CREATE OR REPLACE FUNCTION public.nr_refresh_enrich(p_ids bigint[]) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH ids AS (SELECT DISTINCT unnest(p_ids) id),
  f AS (
    SELECT f.business_id,
      bool_or(category = 'tender_won') tw, bool_or(category = 'gov_contract') gc, bool_or(category = 'expansion' OR category = 'branch_opened') ex,
      bool_or(category = 'branch_opened') br, bool_or(category = 'fleet') fl, bool_or(category = 'new_phone') np, bool_or(category = 'new_website') nw,
      bool_or(category IN ('hiring','hiring_drivers','hiring_logistics','hiring_operations')) hi,
      bool_or(category = 'hiring_drivers') hd, bool_or(category IN ('hiring_logistics','hiring_operations')) hl,
      bool_or(importance = 'important') imp, bool_or(verification = 'verified') ver, count(*) cnt, max(discovered_at) last_at,
      array_agg(DISTINCT source_key) srcs,
      (array_agg(title ORDER BY (importance = 'important') DESC, discovered_at DESC))[1] headline
    FROM public.nr_findings f JOIN ids ON ids.id = f.business_id WHERE f.match_status = 'matched' GROUP BY f.business_id
  ), j AS (
    SELECT j.business_id, count(*) total, count(*) FILTER (WHERE status = 'open') open_n, max(posted_date) last_date
      FROM public.nr_jobs j JOIN ids ON ids.id = j.business_id WHERE j.status IN ('open','closed','unknown') GROUP BY j.business_id
  ), rv AS (
    SELECT DISTINCT unnest(candidate_ids) id FROM public.nr_findings WHERE match_status = 'pending_review' AND candidate_ids && p_ids
  ), em AS (
    SELECT c.business_id, true corp FROM public.nr_contact_points c JOIN ids ON ids.id = c.business_id
     WHERE c.kind = 'email' AND split_part(c.value, '@', 2) !~ '^(gmail|walla|hotmail|yahoo|outlook|012\.net|netvision|bezeqint|zahav|smile|actcom|017|live|icloud|msn|aol|inter\.net|me\.com|googlemail)'
     GROUP BY c.business_id
  )
  UPDATE public.nr_businesses b SET
    enr_hiring = coalesce(f.hi, false), enr_hiring_drivers = coalesce(f.hd, false), enr_hiring_logistics = coalesce(f.hl, false),
    enr_jobs_count = coalesce(j.total, 0), enr_jobs_open = coalesce(j.open_n, 0), enr_last_job_date = j.last_date,
    enr_expansion = coalesce(f.ex, false), enr_branch_opened = coalesce(f.br, false), enr_tender_won = coalesce(f.tw, false),
    enr_gov_contract = coalesce(f.gc, false), enr_fleet = coalesce(f.fl, false), enr_new_phone = coalesce(f.np, false),
    enr_new_website = coalesce(f.nw, false), enr_important = coalesce(f.imp, false), enr_verified = coalesce(f.ver, false),
    enr_findings = coalesce(f.cnt, 0)::int, enr_last_found_at = f.last_at, enr_sources = coalesce(f.srcs, '{}'),
    enr_headline = f.headline, enr_corp_email = coalesce(em.corp, false),
    enr_needs_review = rv.id IS NOT NULL OR EXISTS (SELECT 1 FROM public.nr_marks mk WHERE mk.business_id = b.id AND mk.mark = 'review')
  FROM ids LEFT JOIN f ON f.business_id = ids.id LEFT JOIN j ON j.business_id = ids.id
       LEFT JOIN rv ON rv.id = ids.id LEFT JOIN em ON em.business_id = ids.id
  WHERE b.id = ids.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- incremental: businesses whose findings / jobs changed recently
CREATE OR REPLACE FUNCTION public.nr_refresh_enrich_recent(p_minutes int DEFAULT 6) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint[];
BEGIN
  SELECT array_agg(DISTINCT x) INTO v FROM (
    SELECT business_id x FROM public.nr_findings WHERE updated_at > now() - make_interval(mins => p_minutes) AND business_id IS NOT NULL
    UNION SELECT unnest(candidate_ids) FROM public.nr_findings WHERE updated_at > now() - make_interval(mins => p_minutes) AND match_status = 'pending_review'
    UNION SELECT business_id FROM public.nr_jobs WHERE fetched_at > now() - make_interval(mins => p_minutes) AND business_id IS NOT NULL) q;
  IF v IS NULL THEN RETURN 0; END IF;
  RETURN public.nr_refresh_enrich(v);
END;
$$;

-- ── 12. reviewer decision on an uncertain match ──
CREATE OR REPLACE FUNCTION public.nr_review_finding(p_id bigint, p_business_id bigint, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.nr_findings%ROWTYPE; v_jobs int := 0; v_norm text;
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO f FROM public.nr_findings WHERE id = p_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF p_accept THEN
    IF p_business_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.nr_businesses WHERE id = p_business_id) THEN RAISE EXCEPTION 'business required'; END IF;
    UPDATE public.nr_findings SET business_id = p_business_id, match_status = 'matched', match_method = 'manual_review',
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_id;
    -- an accepted employer brings all of its postings along
    IF f.dedup_key LIKE 'pending_employer:%' THEN
      v_norm := public.nr_norm_name(f.subject_name);
      UPDATE public.nr_jobs SET business_id = p_business_id, match_status = 'matched', match_method = 'manual_review'
       WHERE employer_norm = v_norm AND source_key = f.source_key;
      GET DIAGNOSTICS v_jobs = ROW_COUNT;
      PERFORM public.nr_jobs_rollup(ARRAY[p_business_id]);
    END IF;
  ELSE
    UPDATE public.nr_findings SET match_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_id;
  END IF;
  PERFORM public.nr_refresh_enrich(array_append(f.candidate_ids, p_business_id));
  RETURN jsonb_build_object('ok', true, 'jobs_attached', v_jobs);
END;
$$;

-- ── 13. RLS + grants ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nr_findings','nr_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.nr_can_read())', t || '_select', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.nr_enrich_try_lock(int), public.nr_enrich_unlock(), public.nr_put_finding(jsonb),
  public.nr_ingest_jobs(text, jsonb), public.nr_jobs_rollup(bigint[]), public.nr_ingest_findings(text, jsonb),
  public.nr_refresh_enrich(bigint[]), public.nr_refresh_enrich_recent(int), public.nr_match_business(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_enrich_try_lock(int), public.nr_enrich_unlock(), public.nr_ingest_jobs(text, jsonb),
  public.nr_ingest_findings(text, jsonb), public.nr_refresh_enrich(bigint[]), public.nr_match_business(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.nr_review_finding(bigint, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_review_finding(bigint, bigint, boolean) TO authenticated;
