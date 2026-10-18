-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- OpenProspector – "מאגר עסקים ארצי": broad national business registry, collected WITHOUT the 7 lead rules.
-- Separate from prospect_leads (the 2,018 existing leads are not touched).
-- Writes happen only server-side (service_role via the national-registry-collector edge function).

-- ── 1. Businesses: one merged record per business ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.nr_businesses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reg_id text UNIQUE,                         -- official id digits (ח.פ. / עמותה / חל"צ / אגודה / עוסק)
  reg_id_type text,                           -- company | amuta | chalatz | cooperative | osek
  name text NOT NULL,
  name_norm text NOT NULL,
  name_en text,
  names_alt text[] NOT NULL DEFAULT '{}',
  corp_type text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('active','inactive','unknown')),
  status_raw text,
  founded_year int,
  description text,
  main_activity text,
  activities text[] NOT NULL DEFAULT '{}',
  sector text,
  address text,
  city text,
  city_norm text,
  zip text,
  region text,
  phone_main text,
  email_main text,
  website text,
  website_checked_at timestamptz,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"facebook":"https://...", "instagram":"https://..."}
  whatsapp text,
  employees_count int,
  employees_range text,
  branches_count int,
  size_class text,
  fleet_known boolean NOT NULL DEFAULT false,
  fleet_vehicles int,
  fleet_types text[] NOT NULL DEFAULT '{}',
  logistics_indicators text[] NOT NULL DEFAULT '{}',
  sources text[] NOT NULL DEFAULT '{}',
  has_conflict boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nr_businesses_name_norm_idx ON public.nr_businesses (name_norm);
CREATE INDEX IF NOT EXISTS nr_businesses_city_norm_idx ON public.nr_businesses (city_norm);
CREATE INDEX IF NOT EXISTS nr_businesses_sector_idx ON public.nr_businesses (sector);
CREATE INDEX IF NOT EXISTS nr_businesses_website_todo_idx ON public.nr_businesses (id) WHERE website IS NOT NULL AND website_checked_at IS NULL;

-- ── 2. Contact points: phones, emails, websites, social links, WhatsApp, contact forms ──
CREATE TABLE IF NOT EXISTS public.nr_contact_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('phone','email','website','social','whatsapp','contact_form','fax')),
  subkind text,                               -- main | mobile | branch | service | facebook | instagram | linkedin ...
  value text NOT NULL,                        -- normalized (digits / lowercase email / url)
  display text,
  branch_name text,
  branch_address text,
  sources text[] NOT NULL DEFAULT '{}',
  verified boolean GENERATED ALWAYS AS (cardinality(sources) >= 2) STORED,  -- 2 independent sources
  entry_mode text NOT NULL DEFAULT 'auto' CHECK (entry_mode IN ('auto','manual')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, kind, value)
);
CREATE INDEX IF NOT EXISTS nr_contact_points_kind_idx ON public.nr_contact_points (kind, business_id);

-- ── 3. Business people (published business roles only) ──
CREATE TABLE IF NOT EXISTS public.nr_people (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT '',
  phone text,
  email text,
  source_key text NOT NULL,
  source_url text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, full_name, role)
);

-- ── 4. Evidence: one row per (business, source record) with exactly what that record contributed ──
CREATE TABLE IF NOT EXISTS public.nr_evidence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_record_id text NOT NULL,
  source_url text,
  match_method text NOT NULL,                 -- created | reg_id | name+city | name_unique
  entry_mode text NOT NULL DEFAULT 'auto' CHECK (entry_mode IN ('auto','manual')),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflicts jsonb,
  collected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_key, source_record_id)
);
CREATE INDEX IF NOT EXISTS nr_evidence_source_idx ON public.nr_evidence (source_key);

-- ── 5. Sources: the 135 catalog sources + discovered sources, with real status and checkpoint ──
CREATE TABLE IF NOT EXISTS public.nr_sources (
  key text PRIMARY KEY,
  catalog_id text,
  name text NOT NULL,
  url text,
  provider text,
  kind text NOT NULL,                         -- ckan | overpass | fleet_ckan | website | manual | paid | blocked | discovered
  data_types text[] NOT NULL DEFAULT '{}',
  terms text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','collecting','completed','partial','blocked','unsupported','error')),
  status_reason text,
  priority int NOT NULL DEFAULT 1000,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_records int,
  cursor int NOT NULL DEFAULT 0,
  records_read int NOT NULL DEFAULT 0,
  businesses_new int NOT NULL DEFAULT 0,
  businesses_enriched int NOT NULL DEFAULT 0,
  businesses_merged int NOT NULL DEFAULT 0,
  details_added int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  last_run_at timestamptz,
  duration_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Batches (runs) and events ──
CREATE TABLE IF NOT EXISTS public.nr_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  cursor_from int,
  cursor_to int,
  records_read int NOT NULL DEFAULT 0,
  businesses_new int NOT NULL DEFAULT 0,
  businesses_enriched int NOT NULL DEFAULT 0,
  businesses_merged int NOT NULL DEFAULT 0,
  details_added int NOT NULL DEFAULT 0,
  duration_ms int,
  ok boolean NOT NULL DEFAULT true,
  error text
);
CREATE INDEX IF NOT EXISTS nr_runs_started_idx ON public.nr_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.nr_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error','checkpoint')),
  source_key text,
  message text NOT NULL,
  data jsonb
);
CREATE INDEX IF NOT EXISTS nr_events_at_idx ON public.nr_events (at DESC);

-- ── 7. Control singleton ──
CREATE TABLE IF NOT EXISTS public.nr_control (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  running boolean NOT NULL DEFAULT false,
  target int NOT NULL DEFAULT 100000,
  page_size int NOT NULL DEFAULT 1000,
  max_db_mb int NOT NULL DEFAULT 4000,
  current_source text,
  lock_until timestamptz,
  checkpoints_done int[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.nr_control (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── 8. Normalizers (single source of truth for matching) ──
CREATE OR REPLACE FUNCTION public.nr_norm_name(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''),
    '\((חל|ע)[~"״''׳]?(צ|ר)\)|חל[~"״]צ|\(ע[~"״]ר\)', '', 'g'),
    'בע[~"״''׳]?מ|\mltd\M\.?|\mlimited\M|\minc\M\.?|\mcorp\M\.?', '', 'gi'),
    '[^0-9a-zA-Zא-ת]+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.nr_norm_city(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(regexp_replace(coalesce(t, ''), '[^א-תa-zA-Z]+', '', 'g'), '');
$$;

-- Upsert one contact point; returns true only when it is new for this business
CREATE OR REPLACE FUNCTION public.nr_upsert_cp(p_business bigint, p_kind text, p_sub text, p_value text, p_display text,
  p_branch_name text, p_branch_address text, p_source text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new boolean;
BEGIN
  INSERT INTO public.nr_contact_points AS cp (business_id, kind, subkind, value, display, branch_name, branch_address, sources)
  VALUES (p_business, p_kind, nullif(p_sub, ''), p_value, coalesce(p_display, p_value), nullif(p_branch_name, ''), nullif(p_branch_address, ''), ARRAY[p_source])
  ON CONFLICT (business_id, kind, value) DO UPDATE
    SET sources = CASE WHEN p_source = ANY(cp.sources) THEN cp.sources ELSE cp.sources || p_source END
  RETURNING (xmax = 0) INTO v_new;
  RETURN v_new;
END;
$$;

-- ── 9. Ingest: merge one page of mapped records from one source ──
-- Row shape (jsonb array): {rid, url, reg_id, reg_type, name, name_en, alt_names[], corp_type, status, status_raw,
--   founded_year, description, activity, activities[], sector, address, city, zip, region,
--   phones[{v,sub,branch_name,branch_address}], emails[{v,sub}], websites[], socials{}, whatsapp,
--   people[{name,role,phone,email}], employees, employees_range, branches, fleet{vehicles,types[]}, logistics[],
--   create (default true), fields{} }
CREATE OR REPLACE FUNCTION public.nr_ingest(p_source text, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_id bigint;
  v_method text;
  v_reg text;
  v_norm text;
  v_city_norm text;
  v_cnt int;
  v_new int := 0; v_enriched int := 0; v_merged int := 0; v_details int := 0; v_skipped int := 0;
  v_row_details int;
  v_b public.nr_businesses%ROWTYPE;
  v_conf jsonb;
  p jsonb;
  v_val text;
  v_ins int;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_reg := nullif(regexp_replace(coalesce(r->>'reg_id', ''), '\D', '', 'g'), '');
    IF v_reg IS NOT NULL AND (length(v_reg) < 6 OR v_reg ~ '^0+$') THEN v_reg := NULL; END IF;
    v_norm := public.nr_norm_name(r->>'name');
    v_city_norm := public.nr_norm_city(r->>'city');
    IF length(v_norm) < 2 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_id := NULL; v_method := NULL; v_row_details := 0; v_conf := NULL;

    -- a) official id
    IF v_reg IS NOT NULL THEN
      SELECT id INTO v_id FROM public.nr_businesses WHERE reg_id = v_reg;
      IF v_id IS NOT NULL THEN v_method := 'reg_id'; END IF;
    END IF;
    -- b) exact normalized name + same city, only when exactly one candidate without a conflicting official id
    IF v_id IS NULL AND v_city_norm IS NOT NULL THEN
      SELECT count(*), min(id) INTO v_cnt, v_id FROM public.nr_businesses
       WHERE name_norm = v_norm AND city_norm = v_city_norm AND (v_reg IS NULL OR reg_id IS NULL);
      IF v_cnt = 1 THEN v_method := 'name+city'; ELSE v_id := NULL; END IF;
    END IF;
    -- c) exact normalized name, no city on the incoming record, unique in the registry, long enough to be distinctive
    IF v_id IS NULL AND v_city_norm IS NULL AND v_reg IS NULL AND length(v_norm) >= 6 THEN
      SELECT count(*), min(id) INTO v_cnt, v_id FROM public.nr_businesses WHERE name_norm = v_norm;
      IF v_cnt = 1 THEN v_method := 'name_unique'; ELSE v_id := NULL; END IF;
    END IF;

    IF v_id IS NULL THEN
      IF coalesce((r->>'create')::boolean, true) = false THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
      INSERT INTO public.nr_businesses (reg_id, reg_id_type, name, name_norm, name_en, corp_type, status, status_raw,
        founded_year, description, main_activity, sector, address, city, city_norm, zip, region,
        employees_count, employees_range, branches_count, sources)
      VALUES (v_reg, CASE WHEN v_reg IS NOT NULL THEN nullif(r->>'reg_type', '') END, btrim(r->>'name'), v_norm,
        nullif(btrim(r->>'name_en'), ''), nullif(r->>'corp_type', ''), coalesce(nullif(r->>'status', ''), 'unknown'),
        nullif(r->>'status_raw', ''), nullif(r->>'founded_year', '')::int, nullif(btrim(r->>'description'), ''),
        nullif(btrim(r->>'activity'), ''), nullif(r->>'sector', ''), nullif(btrim(r->>'address'), ''),
        nullif(btrim(r->>'city'), ''), v_city_norm, nullif(r->>'zip', ''), nullif(r->>'region', ''),
        nullif(r->>'employees', '')::int, nullif(r->>'employees_range', ''), nullif(r->>'branches', '')::int,
        ARRAY[p_source])
      ON CONFLICT (reg_id) DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN SELECT id INTO v_id FROM public.nr_businesses WHERE reg_id = v_reg; v_method := 'reg_id';
      ELSE v_method := 'created'; v_new := v_new + 1; END IF;
    END IF;

    IF v_method <> 'created' THEN
      v_merged := v_merged + 1;
      SELECT * INTO v_b FROM public.nr_businesses WHERE id = v_id;
      -- record disagreements instead of overwriting
      v_conf := jsonb_strip_nulls(jsonb_build_object(
        'city', CASE WHEN v_city_norm IS NOT NULL AND v_b.city_norm IS NOT NULL AND v_city_norm <> v_b.city_norm THEN r->>'city' END,
        'name', CASE WHEN v_method = 'reg_id' AND v_norm <> v_b.name_norm THEN r->>'name' END));
      IF v_conf = '{}'::jsonb THEN v_conf := NULL; END IF;
      UPDATE public.nr_businesses b SET
        reg_id = coalesce(b.reg_id, v_reg),
        reg_id_type = coalesce(b.reg_id_type, CASE WHEN v_reg IS NOT NULL THEN nullif(r->>'reg_type', '') END),
        names_alt = CASE WHEN v_norm <> b.name_norm AND NOT (btrim(r->>'name') = ANY(b.names_alt)) AND cardinality(b.names_alt) < 10
                         THEN b.names_alt || btrim(r->>'name') ELSE b.names_alt END,
        name_en = coalesce(b.name_en, nullif(btrim(r->>'name_en'), '')),
        corp_type = coalesce(b.corp_type, nullif(r->>'corp_type', '')),
        status = CASE WHEN b.status = 'unknown' THEN coalesce(nullif(r->>'status', ''), 'unknown') ELSE b.status END,
        status_raw = coalesce(b.status_raw, nullif(r->>'status_raw', '')),
        founded_year = coalesce(b.founded_year, nullif(r->>'founded_year', '')::int),
        description = coalesce(b.description, nullif(btrim(r->>'description'), '')),
        main_activity = coalesce(b.main_activity, nullif(btrim(r->>'activity'), '')),
        sector = coalesce(b.sector, nullif(r->>'sector', '')),
        address = coalesce(b.address, nullif(btrim(r->>'address'), '')),
        city = coalesce(b.city, nullif(btrim(r->>'city'), '')),
        city_norm = coalesce(b.city_norm, v_city_norm),
        zip = coalesce(b.zip, nullif(r->>'zip', '')),
        region = coalesce(b.region, nullif(r->>'region', '')),
        employees_count = coalesce(b.employees_count, nullif(r->>'employees', '')::int),
        employees_range = coalesce(b.employees_range, nullif(r->>'employees_range', '')),
        branches_count = coalesce(b.branches_count, nullif(r->>'branches', '')::int),
        sources = CASE WHEN p_source = ANY(b.sources) THEN b.sources ELSE b.sources || p_source END,
        has_conflict = b.has_conflict OR v_conf IS NOT NULL,
        updated_at = now()
      WHERE b.id = v_id;
      -- scalar fields filled for the first time count as details
      v_row_details := v_row_details
        + (CASE WHEN v_b.reg_id IS NULL AND v_reg IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN v_b.address IS NULL AND nullif(btrim(r->>'address'), '') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN v_b.main_activity IS NULL AND nullif(btrim(r->>'activity'), '') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN v_b.sector IS NULL AND nullif(r->>'sector', '') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN v_b.employees_count IS NULL AND nullif(r->>'employees', '') IS NOT NULL THEN 1 ELSE 0 END);
    END IF;

    -- activities (multi)
    IF jsonb_typeof(r->'activities') = 'array' THEN
      UPDATE public.nr_businesses b SET activities = (
        SELECT coalesce(array_agg(DISTINCT a), '{}') FROM (
          SELECT unnest(b.activities) a UNION SELECT btrim(x) FROM jsonb_array_elements_text(r->'activities') x WHERE btrim(x) <> '') q)
      WHERE b.id = v_id AND cardinality(b.activities) < 20;
    END IF;

    -- phones
    IF jsonb_typeof(r->'phones') = 'array' THEN
      FOR p IN SELECT * FROM jsonb_array_elements(r->'phones') LOOP
        v_val := regexp_replace(coalesce(p->>'v', ''), '\D', '', 'g');
        CONTINUE WHEN v_val = '';
        IF public.nr_upsert_cp(v_id, CASE WHEN p->>'sub' = 'fax' THEN 'fax' ELSE 'phone' END, p->>'sub', v_val, p->>'d',
             p->>'branch_name', p->>'branch_address', p_source) THEN
          v_row_details := v_row_details + 1;
        END IF;
        IF coalesce(p->>'sub', '') NOT IN ('branch', 'fax') THEN
          UPDATE public.nr_businesses SET phone_main = coalesce(phone_main, coalesce(p->>'d', v_val)) WHERE id = v_id;
        END IF;
      END LOOP;
    END IF;

    -- emails
    IF jsonb_typeof(r->'emails') = 'array' THEN
      FOR p IN SELECT * FROM jsonb_array_elements(r->'emails') LOOP
        v_val := lower(btrim(coalesce(p->>'v', '')));
        CONTINUE WHEN v_val !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$';
        IF public.nr_upsert_cp(v_id, 'email', p->>'sub', v_val, v_val, NULL, NULL, p_source) THEN
          v_row_details := v_row_details + 1;
        END IF;
        UPDATE public.nr_businesses SET email_main = coalesce(email_main, v_val) WHERE id = v_id;
      END LOOP;
    END IF;

    -- websites
    IF jsonb_typeof(r->'websites') = 'array' THEN
      FOR v_val IN SELECT lower(rtrim(btrim(x), '/')) FROM jsonb_array_elements_text(r->'websites') x LOOP
        CONTINUE WHEN v_val !~ '^https?://[a-z0-9.-]+\.[a-z]{2,}';
        IF public.nr_upsert_cp(v_id, 'website', NULL, v_val, v_val, NULL, NULL, p_source) THEN
          v_row_details := v_row_details + 1;
        END IF;
        UPDATE public.nr_businesses SET website = coalesce(website, v_val) WHERE id = v_id;
      END LOOP;
    END IF;

    -- social links / contact form / whatsapp (real URLs only)
    IF jsonb_typeof(r->'socials') = 'object' THEN
      FOR v_val, p IN SELECT key, to_jsonb(value) FROM jsonb_each_text(r->'socials') LOOP
        CONTINUE WHEN (p #>> '{}') !~ '^https?://';
        IF public.nr_upsert_cp(v_id, CASE WHEN v_val = 'contact_form' THEN 'contact_form' WHEN v_val = 'whatsapp' THEN 'whatsapp' ELSE 'social' END,
             v_val, lower(rtrim(p #>> '{}', '/')), p #>> '{}', NULL, NULL, p_source) THEN
          v_row_details := v_row_details + 1;
        END IF;
        UPDATE public.nr_businesses b SET socials = CASE WHEN b.socials ? v_val THEN b.socials ELSE b.socials || jsonb_build_object(v_val, p #>> '{}') END,
          whatsapp = CASE WHEN v_val = 'whatsapp' THEN coalesce(b.whatsapp, p #>> '{}') ELSE b.whatsapp END
        WHERE b.id = v_id;
      END LOOP;
    END IF;

    -- people
    IF jsonb_typeof(r->'people') = 'array' THEN
      FOR p IN SELECT * FROM jsonb_array_elements(r->'people') LOOP
        CONTINUE WHEN length(btrim(coalesce(p->>'name', ''))) < 3;
        INSERT INTO public.nr_people (business_id, full_name, role, phone, email, source_key, source_url)
        VALUES (v_id, btrim(p->>'name'), coalesce(btrim(p->>'role'), ''), nullif(p->>'phone', ''), nullif(p->>'email', ''), p_source, r->>'url')
        ON CONFLICT (business_id, full_name, role) DO NOTHING;
        GET DIAGNOSTICS v_ins = ROW_COUNT;
        v_row_details := v_row_details + v_ins;
      END LOOP;
    END IF;

    -- fleet (only with a concrete source record)
    IF jsonb_typeof(r->'fleet') = 'object' THEN
      UPDATE public.nr_businesses b SET fleet_known = true,
        fleet_vehicles = greatest(coalesce(b.fleet_vehicles, 0), coalesce(nullif(r->'fleet'->>'vehicles', '')::int, 0)),
        fleet_types = (SELECT coalesce(array_agg(DISTINCT t), '{}') FROM (SELECT unnest(b.fleet_types) t UNION
                       SELECT x FROM jsonb_array_elements_text(coalesce(r->'fleet'->'types', '[]')) x) q)
      WHERE b.id = v_id;
      v_row_details := v_row_details + 1;
    END IF;
    IF jsonb_typeof(r->'logistics') = 'array' THEN
      UPDATE public.nr_businesses b SET logistics_indicators = (SELECT coalesce(array_agg(DISTINCT t), '{}') FROM (
        SELECT unnest(b.logistics_indicators) t UNION SELECT x FROM jsonb_array_elements_text(r->'logistics') x) q)
      WHERE b.id = v_id;
    END IF;

    -- evidence (idempotent per source record)
    INSERT INTO public.nr_evidence (business_id, source_key, source_record_id, source_url, match_method, fields, conflicts)
    VALUES (v_id, p_source, coalesce(r->>'rid', md5(r::text)), r->>'url', v_method, coalesce(r->'fields', '{}'::jsonb), v_conf)
    ON CONFLICT (business_id, source_key, source_record_id) DO UPDATE SET collected_at = now(), fields = EXCLUDED.fields;

    IF v_method <> 'created' AND v_row_details > 0 THEN v_enriched := v_enriched + 1; END IF;
    v_details := v_details + v_row_details;
  END LOOP;

  RETURN jsonb_build_object('new', v_new, 'enriched', v_enriched, 'merged', v_merged, 'details', v_details, 'skipped', v_skipped);
END;
$$;

-- Lock so overlapping scheduler ticks never run in parallel
CREATE OR REPLACE FUNCTION public.nr_try_lock(p_seconds int) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_control SET lock_until = now() + make_interval(secs => p_seconds)
   WHERE id = 1 AND (lock_until IS NULL OR lock_until < now())
  RETURNING true;
$$;
CREATE OR REPLACE FUNCTION public.nr_unlock() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_control SET lock_until = NULL WHERE id = 1;
$$;

-- ── 10. Read-side for the dashboard (role-checked) ──
CREATE OR REPLACE FUNCTION public.nr_can_read() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role'
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::app_role)
      OR public.has_role(auth.uid(), 'telemarketing_agent'::app_role);
$$;
CREATE OR REPLACE FUNCTION public.nr_can_control() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role'
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.nr_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'control', (SELECT to_jsonb(c) - 'lock_until' FROM public.nr_control c WHERE id = 1),
    'businesses', (SELECT count(*) FROM public.nr_businesses),
    'with_reg_id', (SELECT count(*) FROM public.nr_businesses WHERE reg_id IS NOT NULL),
    'active', (SELECT count(*) FROM public.nr_businesses WHERE status = 'active'),
    'with_phone', (SELECT count(DISTINCT business_id) FROM public.nr_contact_points WHERE kind = 'phone'),
    'with_email', (SELECT count(DISTINCT business_id) FROM public.nr_contact_points WHERE kind = 'email'),
    'with_website', (SELECT count(DISTINCT business_id) FROM public.nr_contact_points WHERE kind = 'website'),
    'with_social', (SELECT count(DISTINCT business_id) FROM public.nr_contact_points WHERE kind = 'social'),
    'with_people', (SELECT count(DISTINCT business_id) FROM public.nr_people),
    'with_fleet', (SELECT count(*) FROM public.nr_businesses WHERE fleet_known),
    'with_employees', (SELECT count(*) FROM public.nr_businesses WHERE employees_count IS NOT NULL),
    'multi_source', (SELECT count(*) FROM public.nr_businesses WHERE cardinality(sources) >= 2),
    'conflicts', (SELECT count(*) FROM public.nr_businesses WHERE has_conflict),
    'merged_records', (SELECT coalesce(sum(businesses_merged), 0) FROM public.nr_sources),
    'phones', (SELECT count(*) FROM public.nr_contact_points WHERE kind = 'phone'),
    'emails', (SELECT count(*) FROM public.nr_contact_points WHERE kind = 'email'),
    'contact_points_verified', (SELECT count(*) FROM public.nr_contact_points WHERE verified),
    'contact_points_unverified', (SELECT count(*) FROM public.nr_contact_points WHERE NOT verified),
    'people', (SELECT count(*) FROM public.nr_people),
    'evidence', (SELECT count(*) FROM public.nr_evidence),
    'sources_by_status', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.nr_sources GROUP BY status) s),
    'rate_last_hour', (SELECT coalesce(sum(businesses_new), 0) FROM public.nr_runs WHERE started_at > now() - interval '1 hour'),
    'records_last_hour', (SELECT coalesce(sum(records_read), 0) FROM public.nr_runs WHERE started_at > now() - interval '1 hour'),
    'last_run', (SELECT to_jsonb(x) FROM (SELECT * FROM public.nr_runs ORDER BY id DESC LIMIT 1) x),
    'db_mb', (SELECT round(pg_database_size(current_database()) / 1048576.0)),
    'registry_mb', (SELECT round(sum(pg_total_relation_size(c.oid)) / 1048576.0, 1) FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'nr\_%'),
    'events', (SELECT coalesce(jsonb_agg(e ORDER BY e.id DESC), '[]') FROM (SELECT id, at, level, source_key, message FROM public.nr_events ORDER BY id DESC LIMIT 30) e),
    'generated_at', now()
  ) INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_set_running(p_running boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.nr_control SET running = p_running, updated_at = now(), updated_by = auth.uid() WHERE id = 1;
  INSERT INTO public.nr_events (level, message) VALUES ('info', CASE WHEN p_running THEN 'האיסוף הופעל' ELSE 'האיסוף נעצר' END);
  RETURN (SELECT to_jsonb(c) - 'lock_until' FROM public.nr_control c WHERE id = 1);
END;
$$;

-- ── 11. RLS: read for lead roles; no direct writes from clients ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nr_businesses','nr_contact_points','nr_people','nr_evidence','nr_sources','nr_runs','nr_events','nr_control'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.nr_can_read())', t || '_select', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.nr_ingest(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nr_try_lock(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nr_unlock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nr_upsert_cp(bigint, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_ingest(text, jsonb), public.nr_try_lock(int), public.nr_unlock() TO service_role;
REVOKE ALL ON FUNCTION public.nr_stats(), public.nr_set_running(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_stats(), public.nr_set_running(boolean) TO authenticated, service_role;
