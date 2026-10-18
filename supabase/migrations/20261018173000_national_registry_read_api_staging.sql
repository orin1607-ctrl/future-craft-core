-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry, part 4: read API for the dashboard (role-checked, read-only).

CREATE INDEX IF NOT EXISTS nr_contact_points_sources_gin ON public.nr_contact_points USING gin (sources);
CREATE INDEX IF NOT EXISTS nr_people_source_idx ON public.nr_people (source_key);
CREATE INDEX IF NOT EXISTS nr_businesses_reg_prefix_idx ON public.nr_businesses (reg_id text_pattern_ops);
CREATE INDEX IF NOT EXISTS nr_businesses_name_prefix_idx ON public.nr_businesses (name_norm text_pattern_ops);

-- What one source contributed, with 5 sample records + their evidence links
CREATE OR REPLACE FUNCTION public.nr_source_detail(p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'source', (SELECT to_jsonb(s) FROM public.nr_sources s WHERE key = p_key),
    'businesses_touched', (SELECT count(DISTINCT business_id) FROM public.nr_evidence WHERE source_key = p_key),
    'evidence_rows', (SELECT count(*) FROM public.nr_evidence WHERE source_key = p_key),
    'by_match', (SELECT coalesce(jsonb_object_agg(match_method, n), '{}') FROM (SELECT match_method, count(*) n FROM public.nr_evidence WHERE source_key = p_key GROUP BY 1) m),
    'contact_points', (SELECT coalesce(jsonb_object_agg(kind, n), '{}') FROM (SELECT kind, count(*) n FROM public.nr_contact_points WHERE sources @> ARRAY[p_key] GROUP BY 1) c),
    'people', (SELECT count(*) FROM public.nr_people WHERE source_key = p_key),
    'runs', (SELECT coalesce(jsonb_agg(r ORDER BY r.id DESC), '[]') FROM (SELECT id, started_at, cursor_from, cursor_to, records_read, businesses_new, businesses_enriched, businesses_merged, details_added, duration_ms, ok, error
              FROM public.nr_runs WHERE source_key = p_key ORDER BY id DESC LIMIT 10) r),
    'samples', (SELECT coalesce(jsonb_agg(x), '[]') FROM (
      SELECT b.id, b.name, b.reg_id, b.city, e.match_method, e.source_url, e.fields, e.collected_at
        FROM public.nr_evidence e JOIN public.nr_businesses b ON b.id = e.business_id
       WHERE e.source_key = p_key ORDER BY e.id DESC LIMIT 5) x)
  );
END;
$$;

-- Search the registry (name / official id / city / sector), newest-enriched first
CREATE OR REPLACE FUNCTION public.nr_search(p_q text, p_filter text DEFAULT 'all', p_limit int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := btrim(coalesce(p_q, '')); v_norm text := public.nr_norm_name(p_q); v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x), '[]') FROM (
    SELECT b.id, b.name, b.reg_id, b.reg_id_type, b.status, b.city, b.sector, b.main_activity, b.phone_main, b.email_main, b.website,
           b.socials, b.fleet_known, b.fleet_vehicles, b.employees_count, cardinality(b.sources) AS source_count, b.has_conflict
      FROM public.nr_businesses b
     WHERE (v_q = ''
            OR (length(v_digits) >= 6 AND b.reg_id LIKE v_digits || '%')
            OR (length(v_norm) >= 2 AND b.name_norm LIKE v_norm || '%')
            OR b.city = v_q OR b.sector = v_q)
       AND CASE p_filter
             WHEN 'phone' THEN b.phone_main IS NOT NULL OR EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'phone')
             WHEN 'email' THEN b.email_main IS NOT NULL
             WHEN 'website' THEN b.website IS NOT NULL
             WHEN 'social' THEN b.socials <> '{}'::jsonb
             WHEN 'fleet' THEN b.fleet_known
             WHEN 'multi' THEN cardinality(b.sources) >= 2
             ELSE true END
     ORDER BY cardinality(b.sources) DESC, b.updated_at DESC
     LIMIT least(greatest(p_limit, 1), 200)) x);
END;
$$;

-- One business with every contact point, person and evidence row
CREATE OR REPLACE FUNCTION public.nr_business_detail(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'business', (SELECT to_jsonb(b) - 'name_norm' - 'city_norm' FROM public.nr_businesses b WHERE id = p_id),
    'contacts', (SELECT coalesce(jsonb_agg(c ORDER BY c.kind, c.verified DESC, c.id), '[]') FROM (
       SELECT id, kind, subkind, value, display, branch_name, branch_address, sources, verified, entry_mode, first_seen_at FROM public.nr_contact_points WHERE business_id = p_id) c),
    'people', (SELECT coalesce(jsonb_agg(p ORDER BY p.id), '[]') FROM (
       SELECT id, full_name, role, phone, email, source_key, source_url, collected_at FROM public.nr_people WHERE business_id = p_id) p),
    'evidence', (SELECT coalesce(jsonb_agg(e ORDER BY e.id), '[]') FROM (
       SELECT e.id, e.source_key, s.name AS source_name, e.source_record_id, e.source_url, e.match_method, e.entry_mode, e.fields, e.conflicts, e.collected_at
         FROM public.nr_evidence e LEFT JOIN public.nr_sources s ON s.key = e.source_key WHERE e.business_id = p_id) e)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nr_source_detail(text), public.nr_search(text, text, int), public.nr_business_detail(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_source_detail(text), public.nr_search(text, text, int), public.nr_business_detail(bigint) TO authenticated, service_role;
