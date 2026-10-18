-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry – browse API for the "מאגר עסקים ארצי" screen:
--  nr_browse        server-side filter + sort + page with an exact count (never the whole table to the browser)
--  nr_facets        cached value lists for the filter dropdowns
--  nr_mark / groups review / not-relevant / archive marks and work groups (single, selected, or all matching a filter)
--  nr_export_page   paged export rows for CSV / Excel
--  destructive ops  PREPARED ONLY: locked behind nr_control.allow_destructive (false), super_admin, typed confirmation,
--                   and an automatic backup before anything is removed. Nothing is deleted by this migration.

-- ── searchable activity text (main activity + sector + all activities) ──
ALTER TABLE public.nr_businesses ADD COLUMN IF NOT EXISTS activity_text text;
CREATE OR REPLACE FUNCTION public.nr_activity_text(a text, s text, arr text[]) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(btrim(concat_ws(' ', a, s, array_to_string(arr, ' ')))), '');
$$;

-- flag refresh now also maintains activity_text
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

-- ── marks and work groups ──
CREATE TABLE IF NOT EXISTS public.nr_marks (
  business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  mark text NOT NULL CHECK (mark IN ('review', 'irrelevant', 'archived')),
  note text,
  marked_by uuid,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, mark)
);
CREATE INDEX IF NOT EXISTS nr_marks_mark_idx ON public.nr_marks (mark, business_id);
CREATE TABLE IF NOT EXISTS public.nr_groups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nr_group_members (
  group_id bigint NOT NULL REFERENCES public.nr_groups(id) ON DELETE CASCADE,
  business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, business_id)
);
CREATE INDEX IF NOT EXISTS nr_group_members_biz_idx ON public.nr_group_members (business_id);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nr_marks','nr_groups','nr_group_members'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.nr_can_read())', t || '_select', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- destructive operations stay disabled until someone turns this on deliberately
ALTER TABLE public.nr_control ADD COLUMN IF NOT EXISTS allow_destructive boolean NOT NULL DEFAULT false;

-- ── WHERE clause from a filter object (values are only referenced as $1->>'key', never concatenated) ──
CREATE OR REPLACE FUNCTION public.nr_filter_sql(f jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text[] := ARRAY['true'];
BEGIN
  f := coalesce(f, '{}'::jsonb);
  IF coalesce(f->>'q', '') <> '' THEN
    IF regexp_replace(f->>'q', '\D', '', 'g') ~ '^\d{6,9}$' AND f->>'q' !~ '[א-תa-zA-Z]' THEN
      w := array_append(w, $w$b.reg_id LIKE regexp_replace($1->>'q', '\D', '', 'g') || '%'$w$);
    ELSE
      w := array_append(w, $w$b.name_norm LIKE '%' || public.nr_norm_name($1->>'q') || '%'$w$);
    END IF;
  END IF;
  IF coalesce(f->>'reg_id', '') <> '' THEN w := array_append(w, $w$b.reg_id LIKE regexp_replace($1->>'reg_id', '\D', '', 'g') || '%'$w$); END IF;
  IF coalesce(f->>'status', '') <> '' THEN w := array_append(w, $w$b.status = $1->>'status'$w$); END IF;
  IF coalesce(f->>'corp_type', '') <> '' THEN w := array_append(w, $w$b.corp_type = $1->>'corp_type'$w$); END IF;
  IF coalesce(f->>'activity', '') <> '' THEN w := array_append(w, $w$b.activity_text LIKE '%' || lower(btrim($1->>'activity')) || '%'$w$); END IF;
  IF coalesce(f->>'main_activity', '') <> '' THEN w := array_append(w, $w$(b.main_activity = $1->>'main_activity' OR b.sector = $1->>'main_activity')$w$); END IF;
  IF coalesce(f->>'founded_from', '') <> '' THEN w := array_append(w, $w$b.founded_year >= ($1->>'founded_from')::int$w$); END IF;
  IF coalesce(f->>'founded_to', '') <> '' THEN w := array_append(w, $w$b.founded_year <= ($1->>'founded_to')::int$w$); END IF;
  IF coalesce(f->>'city', '') <> '' THEN w := array_append(w, $w$b.city_norm = public.nr_norm_city($1->>'city')$w$); END IF;
  IF coalesce(f->>'district', '') <> '' THEN
    IF f->>'district' = 'unknown' THEN w := array_append(w, 'b.district IS NULL'); ELSE w := array_append(w, $w$b.district = $1->>'district'$w$); END IF;
  END IF;
  IF coalesce(f->>'address', '') <> '' THEN w := array_append(w, $w$b.address ILIKE '%' || ($1->>'address') || '%'$w$); END IF;
  IF (f->>'branches')::boolean IS TRUE THEN w := array_append(w, 'b.has_branch_phone'); END IF;
  IF f->>'phone' = 'yes' THEN w := array_append(w, 'b.has_phone'); ELSIF f->>'phone' = 'no' THEN w := array_append(w, 'NOT b.has_phone'); END IF;
  IF f->>'verified_phone' = 'yes' THEN w := array_append(w, 'b.has_verified_phone'); ELSIF f->>'verified_phone' = 'no' THEN w := array_append(w, '(b.has_phone AND NOT b.has_verified_phone)'); END IF;
  IF f->>'email' = 'yes' THEN w := array_append(w, 'b.has_email'); ELSIF f->>'email' = 'no' THEN w := array_append(w, 'NOT b.has_email'); END IF;
  IF f->>'website' = 'yes' THEN w := array_append(w, 'b.has_website'); ELSIF f->>'website' = 'no' THEN w := array_append(w, 'NOT b.has_website'); END IF;
  IF (f->>'facebook')::boolean IS TRUE THEN w := array_append(w, 'b.has_facebook'); END IF;
  IF (f->>'instagram')::boolean IS TRUE THEN w := array_append(w, 'b.has_instagram'); END IF;
  IF (f->>'linkedin')::boolean IS TRUE THEN w := array_append(w, 'b.has_linkedin'); END IF;
  IF f->>'people' = 'yes' THEN w := array_append(w, 'b.has_people'); ELSIF f->>'people' = 'no' THEN w := array_append(w, 'NOT b.has_people'); END IF;
  IF jsonb_typeof(f->'roles') = 'array' AND jsonb_array_length(f->'roles') > 0 THEN
    w := array_append(w, $w$b.people_roles && ARRAY(SELECT jsonb_array_elements_text($1->'roles'))$w$);
  END IF;
  IF coalesce(f->>'emp_min', '') <> '' THEN w := array_append(w, $w$b.employees_count >= ($1->>'emp_min')::int$w$); END IF;
  IF coalesce(f->>'emp_max', '') <> '' THEN w := array_append(w, $w$b.employees_count <= ($1->>'emp_max')::int$w$); END IF;
  IF jsonb_typeof(f->'emp_bands') = 'array' AND jsonb_array_length(f->'emp_bands') > 0 THEN
    IF f->'emp_bands' ? 'unknown' THEN
      w := array_append(w, $w$(b.employees_band = ANY(ARRAY(SELECT jsonb_array_elements_text($1->'emp_bands'))) OR b.employees_count IS NULL)$w$);
    ELSE
      w := array_append(w, $w$b.employees_band = ANY(ARRAY(SELECT jsonb_array_elements_text($1->'emp_bands')))$w$);
    END IF;
  END IF;
  IF (f->>'fleet')::boolean IS TRUE THEN w := array_append(w, 'b.fleet_known'); END IF;
  IF coalesce(f->>'vehicles_min', '') <> '' THEN w := array_append(w, $w$b.fleet_vehicles >= ($1->>'vehicles_min')::int$w$); END IF;
  IF (f->>'logistics')::boolean IS TRUE THEN w := array_append(w, 'cardinality(b.logistics_indicators) > 0'); END IF;
  IF coalesce(f->>'source', '') <> '' THEN w := array_append(w, $w$b.sources @> ARRAY[$1->>'source']$w$); END IF;
  IF coalesce(f->>'min_sources', '') <> '' THEN w := array_append(w, $w$b.source_count >= ($1->>'min_sources')::int$w$); END IF;
  IF f->>'verification' = 'verified' THEN w := array_append(w, 'b.verified_points > 0');
  ELSIF f->>'verification' = 'unverified' THEN w := array_append(w, 'b.verified_points = 0'); END IF;
  IF coalesce(f->>'collected_from', '') <> '' THEN w := array_append(w, $w$b.first_seen_at >= ($1->>'collected_from')::date$w$); END IF;
  IF coalesce(f->>'collected_to', '') <> '' THEN w := array_append(w, $w$b.first_seen_at < ($1->>'collected_to')::date + 1$w$); END IF;
  IF coalesce(f->>'updated_from', '') <> '' THEN w := array_append(w, $w$b.updated_at >= ($1->>'updated_from')::date$w$); END IF;
  IF coalesce(f->>'updated_to', '') <> '' THEN w := array_append(w, $w$b.updated_at < ($1->>'updated_to')::date + 1$w$); END IF;
  IF jsonb_typeof(f->'missing') = 'array' THEN
    IF f->'missing' ? 'phone' THEN w := array_append(w, 'NOT b.has_phone'); END IF;
    IF f->'missing' ? 'email' THEN w := array_append(w, 'NOT b.has_email'); END IF;
    IF f->'missing' ? 'address' THEN w := array_append(w, 'b.address IS NULL'); END IF;
    IF f->'missing' ? 'city' THEN w := array_append(w, 'b.city IS NULL'); END IF;
    IF f->'missing' ? 'activity' THEN w := array_append(w, 'b.activity_text IS NULL'); END IF;
    IF f->'missing' ? 'reg_id' THEN w := array_append(w, 'b.reg_id IS NULL'); END IF;
    IF f->'missing' ? 'employees' THEN w := array_append(w, 'b.employees_count IS NULL'); END IF;
  END IF;
  IF coalesce(f->>'mark', '') <> '' THEN
    w := array_append(w, $w$EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark = $1->>'mark')$w$);
  END IF;
  IF (f->>'hide_archived')::boolean IS TRUE THEN
    w := array_append(w, $w$NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark = 'archived')$w$);
  END IF;
  IF coalesce(f->>'group_id', '') <> '' THEN
    w := array_append(w, $w$EXISTS (SELECT 1 FROM public.nr_group_members g WHERE g.business_id = b.id AND g.group_id = ($1->>'group_id')::bigint)$w$);
  END IF;
  IF jsonb_typeof(f->'ids') = 'array' AND jsonb_array_length(f->'ids') > 0 THEN
    w := array_append(w, $w$b.id = ANY(ARRAY(SELECT (jsonb_array_elements_text($1->'ids'))::bigint))$w$);
  END IF;
  RETURN array_to_string(w, ' AND ');
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_browse(p_filters jsonb DEFAULT '{}', p_sort text DEFAULT 'sources', p_page int DEFAULT 1, p_page_size int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_where text; v_order text; v_total bigint; v_rows jsonb; v_size int; v_off int;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_where := public.nr_filter_sql(p_filters);
  v_order := CASE p_sort
    WHEN 'name' THEN 'b.name_norm, b.id'
    WHEN 'founded' THEN 'b.founded_year NULLS LAST, b.id'
    WHEN 'founded_desc' THEN 'b.founded_year DESC NULLS LAST, b.id'
    WHEN 'employees' THEN 'b.employees_count DESC NULLS LAST, b.id'
    WHEN 'updated' THEN 'b.updated_at DESC, b.id'
    WHEN 'collected' THEN 'b.first_seen_at DESC, b.id'
    WHEN 'city' THEN 'b.city_norm NULLS LAST, b.id'
    ELSE 'b.source_count DESC, b.id' END;
  v_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_off := (greatest(coalesce(p_page, 1), 1) - 1) * v_size;
  EXECUTE format('SELECT count(*) FROM public.nr_businesses b WHERE %s', v_where) INTO v_total USING p_filters;
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY rn), '[]') FROM (
      SELECT row_number() OVER (ORDER BY %s) rn, b.id, b.name, b.reg_id, b.reg_id_type, b.status, b.corp_type, b.city, b.district, b.address,
             b.main_activity, b.sector, b.phone_main, b.email_main, b.website, b.socials, b.employees_count, b.employees_basis,
             b.employees_band, b.fleet_known, b.fleet_vehicles, b.source_count, b.has_people, b.people_roles, b.verified_points,
             b.has_verified_phone, b.branch_phones, b.founded_year, b.first_seen_at, b.updated_at, b.has_conflict,
             (SELECT array_agg(m.mark) FROM public.nr_marks m WHERE m.business_id = b.id) marks
        FROM public.nr_businesses b WHERE %s ORDER BY %s LIMIT %s OFFSET %s) r$q$, v_order, v_where, v_order, v_size, v_off)
    INTO v_rows USING p_filters;
  RETURN jsonb_build_object('total', v_total, 'page', greatest(coalesce(p_page, 1), 1), 'page_size', v_size, 'rows', v_rows);
END;
$$;

-- ── cached dropdown values (refreshed hourly) ──
CREATE TABLE IF NOT EXISTS public.nr_facets_cache (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), data jsonb NOT NULL, refreshed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.nr_facets_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_facets_cache FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.nr_refresh_facets() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.nr_facets_cache (id, data, refreshed_at) VALUES (1, jsonb_build_object(
    'districts', (SELECT jsonb_agg(jsonb_build_object('v', coalesce(district, 'unknown'), 'n', n) ORDER BY n DESC) FROM (SELECT district, count(*) n FROM public.nr_businesses GROUP BY 1) x),
    'corp_types', (SELECT jsonb_agg(jsonb_build_object('v', corp_type, 'n', n) ORDER BY n DESC) FROM (SELECT corp_type, count(*) n FROM public.nr_businesses WHERE corp_type IS NOT NULL GROUP BY 1) x),
    'activities', (SELECT jsonb_agg(jsonb_build_object('v', v, 'n', n) ORDER BY n DESC) FROM (
                     SELECT v, count(*) n FROM (SELECT coalesce(sector, main_activity) v FROM public.nr_businesses WHERE coalesce(sector, main_activity) IS NOT NULL) a
                      GROUP BY 1 ORDER BY 2 DESC LIMIT 300) x),
    'cities', (SELECT jsonb_agg(jsonb_build_object('v', city, 'n', n) ORDER BY n DESC) FROM (
                 SELECT min(city) city, count(*) n FROM public.nr_businesses WHERE city_norm IS NOT NULL GROUP BY city_norm ORDER BY 2 DESC LIMIT 400) x),
    'sources', (SELECT jsonb_agg(jsonb_build_object('v', key, 'name', name, 'n', businesses_new + businesses_merged) ORDER BY priority, key)
                  FROM public.nr_sources WHERE records_read > 0),
    'emp_bands', (SELECT jsonb_agg(jsonb_build_object('v', coalesce(employees_band, 'unknown'), 'n', n)) FROM (SELECT employees_band, count(*) n FROM public.nr_businesses GROUP BY 1) x)
  ), now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, refreshed_at = EXCLUDED.refreshed_at;
$$;
REVOKE ALL ON FUNCTION public.nr_refresh_facets() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.nr_facets() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (SELECT data || jsonb_build_object('refreshed_at', refreshed_at,
            'groups', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'n', (SELECT count(*) FROM public.nr_group_members m WHERE m.group_id = g.id)) ORDER BY g.id), '[]') FROM public.nr_groups g))
          FROM public.nr_facets_cache WHERE id = 1);
END;
$$;

-- ── marks & groups (single / selected ids, or every business matching a filter – capped) ──
CREATE OR REPLACE FUNCTION public.nr_mark(p_ids bigint[], p_mark text, p_on boolean DEFAULT true, p_note text DEFAULT NULL, p_filters jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ids bigint[]; n int;
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_mark NOT IN ('review', 'irrelevant', 'archived') THEN RAISE EXCEPTION 'bad mark'; END IF;
  IF p_filters IS NOT NULL THEN
    EXECUTE format('SELECT array_agg(id) FROM (SELECT b.id FROM public.nr_businesses b WHERE %s LIMIT 100000) x', public.nr_filter_sql(p_filters)) INTO v_ids USING p_filters;
  ELSE v_ids := p_ids; END IF;
  IF p_on THEN
    INSERT INTO public.nr_marks (business_id, mark, note, marked_by) SELECT unnest(v_ids), p_mark, p_note, auth.uid()
    ON CONFLICT (business_id, mark) DO UPDATE SET note = coalesce(EXCLUDED.note, nr_marks.note), marked_at = now(), marked_by = EXCLUDED.marked_by;
  ELSE
    DELETE FROM public.nr_marks WHERE mark = p_mark AND business_id = ANY(v_ids);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('affected', n);
END;
$$;
CREATE OR REPLACE FUNCTION public.nr_group_create(p_name text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.nr_groups (name, created_by) VALUES (btrim(p_name), auth.uid()) RETURNING id INTO v;
  RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION public.nr_group_add(p_group bigint, p_ids bigint[], p_filters jsonb DEFAULT NULL, p_remove boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ids bigint[]; n int;
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_filters IS NOT NULL THEN
    EXECUTE format('SELECT array_agg(id) FROM (SELECT b.id FROM public.nr_businesses b WHERE %s LIMIT 100000) x', public.nr_filter_sql(p_filters)) INTO v_ids USING p_filters;
  ELSE v_ids := p_ids; END IF;
  IF p_remove THEN
    DELETE FROM public.nr_group_members WHERE group_id = p_group AND business_id = ANY(v_ids);
  ELSE
    INSERT INTO public.nr_group_members (group_id, business_id, added_by) SELECT p_group, unnest(v_ids), auth.uid() ON CONFLICT DO NOTHING;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('affected', n);
END;
$$;

-- ── export: one page of rows with all contact details flattened (client builds the CSV) ──
CREATE OR REPLACE FUNCTION public.nr_export_page(p_filters jsonb, p_after bigint DEFAULT 0, p_limit int DEFAULT 2000)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY r.id), '[]') FROM (
      SELECT b.id, b.name, b.reg_id, b.status, b.corp_type, b.founded_year, b.main_activity, b.sector, b.city, b.district, b.address, b.zip,
             b.employees_count, b.employees_basis, b.fleet_known, b.fleet_vehicles, b.website, b.source_count,
             (SELECT string_agg(coalesce(c.display, c.value) || CASE WHEN c.subkind = 'branch' THEN ' (סניף)' ELSE '' END || CASE WHEN c.verified THEN ' ✓' ELSE '' END, '; ')
                FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'phone') phones,
             (SELECT string_agg(c.value, '; ') FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'email') emails,
             (SELECT string_agg(c.subkind || ': ' || c.display, '; ') FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'social') socials,
             (SELECT string_agg(p.full_name || ' – ' || p.role, '; ') FROM public.nr_people p WHERE p.business_id = b.id) people,
             (SELECT string_agg(s.name, '; ') FROM public.nr_sources s WHERE s.key = ANY(b.sources)) source_names
        FROM public.nr_businesses b WHERE %s AND b.id > %s ORDER BY b.id LIMIT %s) r$q$,
    public.nr_filter_sql(p_filters), coalesce(p_after, 0), least(greatest(coalesce(p_limit, 2000), 1), 5000))
  INTO v USING p_filters;
  RETURN v;
END;
$$;

-- ── destructive operations – PREPARED, LOCKED (allow_destructive = false). Nothing runs them now. ──
CREATE TABLE IF NOT EXISTS public.nr_deleted_archive (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id bigint NOT NULL,
  snapshot jsonb NOT NULL,        -- business + contact points + people + evidence, exactly as they were
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
ALTER TABLE public.nr_deleted_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_deleted_archive FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.nr_delete_businesses(p_ids bigint[], p_confirm text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN RAISE EXCEPTION 'forbidden: super_admin only'; END IF;
  IF NOT (SELECT allow_destructive FROM public.nr_control WHERE id = 1) THEN RAISE EXCEPTION 'destructive operations are disabled (nr_control.allow_destructive = false)'; END IF;
  IF p_confirm IS DISTINCT FROM ('מחק ' || cardinality(p_ids) || ' עסקים') THEN RAISE EXCEPTION 'confirmation text does not match'; END IF;
  INSERT INTO public.nr_deleted_archive (business_id, snapshot, deleted_by, reason)
  SELECT b.id, jsonb_build_object('business', to_jsonb(b),
           'contacts', (SELECT jsonb_agg(to_jsonb(c)) FROM public.nr_contact_points c WHERE c.business_id = b.id),
           'people', (SELECT jsonb_agg(to_jsonb(p)) FROM public.nr_people p WHERE p.business_id = b.id),
           'evidence', (SELECT jsonb_agg(to_jsonb(e)) FROM public.nr_evidence e WHERE e.business_id = b.id)),
         auth.uid(), p_reason
    FROM public.nr_businesses b WHERE b.id = ANY(p_ids);
  DELETE FROM public.nr_businesses WHERE id = ANY(p_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.nr_events (level, message, data) VALUES ('warn', format('נמחקו %s עסקים (עותק נשמר ב-nr_deleted_archive)', n), jsonb_build_object('ids', p_ids, 'by', auth.uid()));
  RETURN jsonb_build_object('deleted', n, 'archived', n);
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_reset_registry(p_confirm text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schema text := 'nr_backup_' || to_char(now(), 'YYYYMMDD_HH24MI'); t text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN RAISE EXCEPTION 'forbidden: super_admin only'; END IF;
  IF NOT (SELECT allow_destructive FROM public.nr_control WHERE id = 1) THEN RAISE EXCEPTION 'destructive operations are disabled (nr_control.allow_destructive = false)'; END IF;
  IF p_confirm IS DISTINCT FROM 'אני מאשר איפוס מלא של המאגר הארצי' THEN RAISE EXCEPTION 'confirmation text does not match'; END IF;
  EXECUTE format('CREATE SCHEMA %I', v_schema);
  FOREACH t IN ARRAY ARRAY['nr_businesses','nr_contact_points','nr_people','nr_evidence','nr_sources','nr_runs','nr_events','nr_marks','nr_groups','nr_group_members'] LOOP
    EXECUTE format('CREATE TABLE %I.%I AS TABLE public.%I', v_schema, t, t);
  END LOOP;
  TRUNCATE public.nr_businesses CASCADE;
  UPDATE public.nr_sources SET cursor = 0, records_read = 0, businesses_new = 0, businesses_enriched = 0, businesses_merged = 0, details_added = 0,
         duration_ms = 0, status = CASE WHEN kind IN ('ckan','arcgis','fleet_ckan','overpass') THEN 'pending' ELSE status END, finished_at = NULL;
  UPDATE public.nr_control SET running = false, checkpoints_done = '{}', allow_destructive = false WHERE id = 1;
  INSERT INTO public.nr_events (level, message, data) VALUES ('warn', 'המאגר הארצי אופס – גיבוי מלא נשמר בסכמה ' || v_schema, jsonb_build_object('backup_schema', v_schema, 'by', auth.uid()));
  RETURN jsonb_build_object('backup_schema', v_schema);
END;
$$;

REVOKE ALL ON FUNCTION public.nr_filter_sql(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nr_browse(jsonb, text, int, int), public.nr_facets(), public.nr_mark(bigint[], text, boolean, text, jsonb),
  public.nr_group_create(text), public.nr_group_add(bigint, bigint[], jsonb, boolean), public.nr_export_page(jsonb, bigint, int),
  public.nr_delete_businesses(bigint[], text, text), public.nr_reset_registry(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_browse(jsonb, text, int, int), public.nr_facets(), public.nr_mark(bigint[], text, boolean, text, jsonb),
  public.nr_group_create(text), public.nr_group_add(bigint, bigint[], jsonb, boolean), public.nr_export_page(jsonb, bigint, int),
  public.nr_delete_businesses(bigint[], text, text), public.nr_reset_registry(text) TO authenticated;

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-refresh-facets'; END $$;
SELECT cron.schedule('nr-refresh-facets', '7 * * * *', $cmd$ select public.nr_refresh_facets() $cmd$);

-- dashboard counters from the precomputed flags (fast on 500K+ rows)
CREATE OR REPLACE FUNCTION public.nr_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'control', (SELECT to_jsonb(c) - 'lock_until' FROM public.nr_control c WHERE id = 1),
    'businesses', count(*),
    'with_reg_id', count(*) FILTER (WHERE reg_id IS NOT NULL),
    'active', count(*) FILTER (WHERE status = 'active'),
    'with_phone', count(*) FILTER (WHERE has_phone),
    'with_verified_phone', count(*) FILTER (WHERE has_verified_phone),
    'with_email', count(*) FILTER (WHERE has_email),
    'with_website', count(*) FILTER (WHERE has_website),
    'with_social', count(*) FILTER (WHERE has_facebook OR has_instagram OR has_linkedin OR socials <> '{}'::jsonb),
    'with_people', count(*) FILTER (WHERE has_people),
    'with_employees', count(*) FILTER (WHERE employees_count IS NOT NULL),
    'with_activity', count(*) FILTER (WHERE activity_text IS NOT NULL),
    'with_fleet', count(*) FILTER (WHERE fleet_known),
    'multi_source', count(*) FILTER (WHERE source_count >= 2),
    'conflicts', count(*) FILTER (WHERE has_conflict),
    'merged_records', (SELECT coalesce(sum(businesses_merged), 0) FROM public.nr_sources),
    'phones', (SELECT count(*) FROM public.nr_contact_points WHERE kind = 'phone'),
    'emails', (SELECT count(*) FROM public.nr_contact_points WHERE kind = 'email'),
    'contact_points_verified', (SELECT count(*) FROM public.nr_contact_points WHERE verified),
    'contact_points_unverified', (SELECT count(*) FROM public.nr_contact_points WHERE NOT verified),
    'people', (SELECT count(*) FROM public.nr_people),
    'evidence', (SELECT count(*) FROM public.nr_evidence),
    'marks', (SELECT jsonb_object_agg(mark, n) FROM (SELECT mark, count(*) n FROM public.nr_marks GROUP BY 1) m),
    'sources_by_status', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.nr_sources GROUP BY status) s),
    'sources_waiting', (SELECT coalesce(jsonb_agg(name), '[]') FROM public.nr_sources WHERE status IN ('pending','collecting','error') AND kind IN ('ckan','arcgis','fleet_ckan','overpass')),
    'rate_last_hour', (SELECT coalesce(sum(businesses_new), 0) FROM public.nr_runs WHERE started_at > now() - interval '1 hour'),
    'records_last_hour', (SELECT coalesce(sum(records_read), 0) FROM public.nr_runs WHERE started_at > now() - interval '1 hour'),
    'last_run', (SELECT to_jsonb(x) FROM (SELECT * FROM public.nr_runs ORDER BY id DESC LIMIT 1) x),
    'db_mb', (SELECT round(pg_database_size(current_database()) / 1048576.0)),
    'registry_mb', (SELECT round(sum(pg_total_relation_size(c.oid)) / 1048576.0, 1) FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'nr\_%'),
    'events', (SELECT coalesce(jsonb_agg(e ORDER BY e.id DESC), '[]') FROM (SELECT id, at, level, source_key, message FROM public.nr_events ORDER BY id DESC LIMIT 30) e),
    'generated_at', now()
  ) INTO res FROM public.nr_businesses;
  RETURN res;
END;
$$;
