-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry, part 5: official registries (companies, non-profits, public-benefit companies, cooperatives) own the
-- legal name / type / status; spelling variants of a name are no longer flagged as a conflict between sources.

CREATE OR REPLACE FUNCTION public.nr_name_words(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(array_agg(w), '{}') FROM unnest(regexp_split_to_array(lower(regexp_replace(regexp_replace(coalesce(t, ''),
    'בע[~"״''׳]?מ|\mltd\M|חל[~"״]צ|ע[~"״]ר|חברת|חברה|בישראל', ' ', 'gi'), '[^0-9a-zA-Zא-ת]+', ' ', 'g')), '\s+')) w
  WHERE length(w) >= 3;
$$;

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
  -- official registries own the legal name, type and status of a business
  v_official boolean := p_source IN ('cat:54', 'cat:55', 'cat:56', 'dgov:cooperatives');
  v_rename boolean;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_reg := nullif(regexp_replace(coalesce(r->>'reg_id', ''), '\D', '', 'g'), '');
    IF v_reg IS NOT NULL AND (length(v_reg) < 6 OR v_reg ~ '^0+$') THEN v_reg := NULL; END IF;
    v_norm := public.nr_norm_name(r->>'name');
    v_city_norm := public.nr_norm_city(r->>'city');
    IF length(v_norm) < 2 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_id := NULL; v_method := NULL; v_row_details := 0; v_conf := NULL;

    -- a) official id
    -- 0) record that belongs to a known business (website enrichment)
    IF r ? 'business_id' THEN
      SELECT id INTO v_id FROM public.nr_businesses WHERE id = (r->>'business_id')::bigint;
      IF v_id IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
      v_method := 'business_website'; v_norm := (SELECT name_norm FROM public.nr_businesses WHERE id = v_id);
    END IF;
    IF v_id IS NULL AND v_reg IS NOT NULL THEN
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
        -- a name is a conflict only when the two names share no word (spelling variants are not conflicts)
        'name', CASE WHEN v_method = 'reg_id' AND p_source NOT IN ('src:welfare', 'src:daycare') AND v_norm <> v_b.name_norm AND NOT EXISTS (
                  SELECT 1 FROM unnest(public.nr_name_words(r->>'name')) w WHERE w = ANY(public.nr_name_words(v_b.name))) THEN r->>'name' END));
      IF v_conf = '{}'::jsonb THEN v_conf := NULL; END IF;
      v_rename := v_official AND v_method = 'reg_id' AND v_norm <> v_b.name_norm;
      UPDATE public.nr_businesses b SET
        reg_id = coalesce(b.reg_id, v_reg),
        reg_id_type = coalesce(b.reg_id_type, CASE WHEN v_reg IS NOT NULL THEN nullif(r->>'reg_type', '') END),
        name = CASE WHEN v_rename THEN btrim(r->>'name') ELSE b.name END,
        name_norm = CASE WHEN v_rename THEN v_norm ELSE b.name_norm END,
        names_alt = CASE WHEN v_rename AND NOT (b.name = ANY(b.names_alt)) AND cardinality(b.names_alt) < 10 THEN array_remove(b.names_alt, btrim(r->>'name')) || b.name
                         WHEN v_method <> 'business_website' AND v_norm <> b.name_norm AND NOT (btrim(r->>'name') = ANY(b.names_alt)) AND cardinality(b.names_alt) < 10
                         THEN b.names_alt || btrim(r->>'name') ELSE b.names_alt END,
        name_en = coalesce(b.name_en, nullif(btrim(r->>'name_en'), '')),
        corp_type = CASE WHEN v_official THEN coalesce(nullif(r->>'corp_type', ''), b.corp_type) ELSE coalesce(b.corp_type, nullif(r->>'corp_type', '')) END,
        status = CASE WHEN v_official AND nullif(r->>'status', '') IS NOT NULL THEN r->>'status'
                      WHEN b.status = 'unknown' THEN coalesce(nullif(r->>'status', ''), 'unknown') ELSE b.status END,
        status_raw = CASE WHEN v_official THEN coalesce(nullif(r->>'status_raw', ''), b.status_raw) ELSE coalesce(b.status_raw, nullif(r->>'status_raw', '')) END,
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


-- Retro-fix for records merged before this change
-- 1) official registry name wins (the old function kept every differing registry name in the evidence conflict)
UPDATE public.nr_businesses b SET name = x.official, name_norm = public.nr_norm_name(x.official),
       names_alt = array_remove(b.names_alt, x.official) || b.name, updated_at = now()
  FROM (SELECT DISTINCT ON (e.business_id) e.business_id, e.conflicts->>'name' AS official
          FROM public.nr_evidence e WHERE e.source_key IN ('cat:54','cat:55','cat:56','dgov:cooperatives') AND e.match_method = 'reg_id' AND e.conflicts ? 'name'
         ORDER BY e.business_id, e.id DESC) x
 WHERE b.id = x.business_id AND b.name <> x.official;
UPDATE public.nr_evidence SET conflicts = nullif(conflicts - 'name', '{}'::jsonb)
 WHERE source_key IN ('cat:54','cat:55','cat:56','dgov:cooperatives','src:welfare','src:daycare') AND conflicts ? 'name';
-- 2) remaining name "conflicts" that are only spelling variants
UPDATE public.nr_evidence e SET conflicts = nullif(e.conflicts - 'name', '{}'::jsonb)
  FROM public.nr_businesses b
 WHERE b.id = e.business_id AND e.conflicts ? 'name'
   AND EXISTS (SELECT 1 FROM unnest(public.nr_name_words(e.conflicts->>'name')) w WHERE w = ANY(public.nr_name_words(b.name)));
UPDATE public.nr_businesses b SET has_conflict = EXISTS (SELECT 1 FROM public.nr_evidence e WHERE e.business_id = b.id AND e.conflicts IS NOT NULL)
 WHERE b.has_conflict;
