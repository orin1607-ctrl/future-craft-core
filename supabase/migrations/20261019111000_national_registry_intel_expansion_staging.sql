-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Company → company expansion details: depth per business, expansion only from stated / verified relations
-- (a plain link – e.g. the web designer's credit – is kept as a mention but not followed), and the crawler receives
-- the business's ח.פ. (finding it printed on the site is the strongest proof the site is the company's own).
ALTER TABLE public.nr_businesses ADD COLUMN IF NOT EXISTS enr_depth int NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.nr_claim_sites(int);
CREATE FUNCTION public.nr_claim_sites(p_limit int)
RETURNS TABLE(id bigint, name text, name_en text, reg_id text, reg_id_type text, website text, phones text[], emails text[], city text, shared_by int, depth int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_businesses b SET enr_site_checked_at = now()
     WHERE b.id IN (SELECT x.id FROM public.nr_businesses x WHERE x.website IS NOT NULL AND x.enr_site_checked_at IS NULL ORDER BY x.enr_depth, x.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.name, b.name_en, b.reg_id, b.reg_id_type, b.website, b.city, b.enr_depth)
  SELECT c.id, c.name, c.name_en, c.reg_id, c.reg_id_type, c.website,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'email'), c.city,
         (SELECT count(*)::int FROM public.nr_businesses o
           WHERE regexp_replace(lower(o.website), '^https?://(www\.)?([^/]+).*$', '\2') = regexp_replace(lower(c.website), '^https?://(www\.)?([^/]+).*$', '\2')),
         c.enr_depth
    FROM c;
$$;
DROP FUNCTION IF EXISTS public.nr_claim_watch(int);
CREATE FUNCTION public.nr_claim_watch(p_limit int)
RETURNS TABLE(id bigint, name text, name_en text, reg_id text, reg_id_type text, website text, phones text[], emails text[], city text, shared_by int, depth int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (
    UPDATE public.nr_watch w SET last_checked_at = now(), checks = w.checks + 1,
           next_due_at = now() + CASE w.frequency WHEN 'daily' THEN interval '1 day' ELSE interval '7 days' END
     WHERE w.business_id IN (SELECT x.business_id FROM public.nr_watch x WHERE x.active AND x.next_due_at <= now() ORDER BY x.next_due_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING w.business_id)
  SELECT b.id, b.name, b.name_en, b.reg_id, b.reg_id_type, b.website,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = b.id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = b.id AND p.kind = 'email'), b.city,
         (SELECT count(*)::int FROM public.nr_businesses o WHERE b.website IS NOT NULL
             AND regexp_replace(lower(o.website), '^https?://(www\.)?([^/]+).*$', '\2') = regexp_replace(lower(b.website), '^https?://(www\.)?([^/]+).*$', '\2')),
         b.enr_depth
    FROM w JOIN public.nr_businesses b ON b.id = w.business_id;
$$;
REVOKE ALL ON FUNCTION public.nr_claim_sites(int), public.nr_claim_watch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_sites(int), public.nr_claim_watch(int) TO service_role;

-- business lookup by registry number (for sites that print their ח.פ.)
CREATE OR REPLACE FUNCTION public.nr_business_by_reg(p_reg text) RETURNS TABLE(id bigint, name text, website text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, website FROM public.nr_businesses WHERE reg_id = regexp_replace(coalesce(p_reg, ''), '\D', '', 'g');
$$;
REVOKE ALL ON FUNCTION public.nr_business_by_reg(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_business_by_reg(text) TO service_role;

-- expansion only from stated / verified relations
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
    -- a name taken only from a logo is kept only when it is exactly a registered company
    CONTINUE WHEN v_to IS NULL AND r->>'require_match' = 'true';
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

REVOKE ALL ON FUNCTION public.nr_ingest_relations(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_ingest_relations(text, jsonb) TO service_role;
