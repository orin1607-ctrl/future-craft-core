-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry – enrichment READ side for the "מאגר עסקים ארצי" screen:
--  * new filters (combine with every existing one): hiring, hiring drivers / logistics, number of postings, expansion,
--    branch opened, tender won, government contract, fleet info, CEO / operations manager identified, business e-mail,
--    new phone, new website, important new info, verified, needs review, enrichment source, discovery / posting dates
--  * sort by latest discovery / number of postings
--  * business card: findings (colour + text + date + source link), job postings, matches waiting for review
--  * review queue + accept / reject (nr_review_finding), enrichment progress report with real examples

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
  -- ── enrichment ──
  IF (f->>'hiring')::boolean IS TRUE THEN w := array_append(w, 'b.enr_hiring'); END IF;
  IF (f->>'hiring_drivers')::boolean IS TRUE THEN w := array_append(w, 'b.enr_hiring_drivers'); END IF;
  IF (f->>'hiring_logistics')::boolean IS TRUE THEN w := array_append(w, 'b.enr_hiring_logistics'); END IF;
  IF (f->>'jobs_open')::boolean IS TRUE THEN w := array_append(w, 'b.enr_jobs_open > 0'); END IF;
  IF coalesce(f->>'jobs_min', '') <> '' THEN w := array_append(w, $w$b.enr_jobs_count >= ($1->>'jobs_min')::int$w$); END IF;
  IF coalesce(f->>'job_from', '') <> '' THEN w := array_append(w, $w$b.enr_last_job_date >= ($1->>'job_from')::date$w$); END IF;
  IF (f->>'expanded')::boolean IS TRUE THEN w := array_append(w, 'b.enr_expansion'); END IF;
  IF (f->>'branch_opened')::boolean IS TRUE THEN w := array_append(w, 'b.enr_branch_opened'); END IF;
  IF (f->>'tender_won')::boolean IS TRUE THEN w := array_append(w, 'b.enr_tender_won'); END IF;
  IF (f->>'gov_contract')::boolean IS TRUE THEN w := array_append(w, '(b.enr_gov_contract OR b.enr_tender_won)'); END IF;
  IF (f->>'fleet_info')::boolean IS TRUE THEN w := array_append(w, '(b.fleet_known OR b.enr_fleet)'); END IF;
  IF (f->>'ceo')::boolean IS TRUE THEN w := array_append(w, $w$'ceo' = ANY(b.people_roles)$w$); END IF;
  IF (f->>'ops_manager')::boolean IS TRUE THEN w := array_append(w, $w$b.people_roles && ARRAY['operations','fleet']$w$); END IF;
  IF (f->>'corp_email')::boolean IS TRUE THEN w := array_append(w, 'b.enr_corp_email'); END IF;
  IF (f->>'new_phone')::boolean IS TRUE THEN w := array_append(w, 'b.enr_new_phone'); END IF;
  IF (f->>'new_website')::boolean IS TRUE THEN w := array_append(w, 'b.enr_new_website'); END IF;
  IF (f->>'important_new')::boolean IS TRUE THEN w := array_append(w, 'b.enr_important'); END IF;
  IF (f->>'new_info')::boolean IS TRUE THEN w := array_append(w, 'b.enr_findings > 0'); END IF;
  IF (f->>'enrich_verified')::boolean IS TRUE THEN w := array_append(w, 'b.enr_verified'); END IF;
  IF (f->>'needs_review')::boolean IS TRUE THEN w := array_append(w, 'b.enr_needs_review'); END IF;
  IF coalesce(f->>'finding_source', '') <> '' THEN w := array_append(w, $w$b.enr_sources @> ARRAY[$1->>'finding_source']$w$); END IF;
  IF coalesce(f->>'found_from', '') <> '' THEN w := array_append(w, $w$b.enr_last_found_at >= ($1->>'found_from')::date$w$); END IF;
  IF coalesce(f->>'found_to', '') <> '' THEN w := array_append(w, $w$b.enr_last_found_at < ($1->>'found_to')::date + 1$w$); END IF;
  -- ── marks / groups / ids ──
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
    WHEN 'found' THEN 'b.enr_last_found_at DESC NULLS LAST, b.id'
    WHEN 'important' THEN 'b.enr_important DESC, b.enr_last_found_at DESC NULLS LAST, b.id'
    WHEN 'jobs' THEN 'b.enr_jobs_count DESC, b.id'
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
             b.enr_headline, b.enr_important, b.enr_verified, b.enr_findings, b.enr_last_found_at, b.enr_hiring, b.enr_hiring_drivers,
             b.enr_hiring_logistics, b.enr_jobs_count, b.enr_jobs_open, b.enr_last_job_date, b.enr_needs_review, b.enr_new_phone, b.enr_new_website,
             b.enr_tender_won, b.enr_gov_contract, b.enr_fleet, b.enr_expansion, b.enr_branch_opened,
             (SELECT array_agg(m.mark) FROM public.nr_marks m WHERE m.business_id = b.id) marks
        FROM public.nr_businesses b WHERE %s ORDER BY %s LIMIT %s OFFSET %s) r$q$, v_order, v_where, v_order, v_size, v_off)
    INTO v_rows USING p_filters;
  RETURN jsonb_build_object('total', v_total, 'page', greatest(coalesce(p_page, 1), 1), 'page_size', v_size, 'rows', v_rows);
END;
$$;

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
         FROM public.nr_evidence e LEFT JOIN public.nr_sources s ON s.key = e.source_key WHERE e.business_id = p_id) e),
    'findings', (SELECT coalesce(jsonb_agg(f ORDER BY (f.importance = 'important') DESC, f.discovered_at DESC), '[]') FROM (
       SELECT f.id, f.category, f.title, f.importance, f.fact_kind, f.verification, f.match_method, f.source_key, s.name AS source_name, f.source_url,
              f.published_at, f.discovered_at, f.detail - 'rids' AS detail
         FROM public.nr_findings f LEFT JOIN public.nr_sources s ON s.key = f.source_key
        WHERE f.business_id = p_id AND f.match_status = 'matched' LIMIT 200) f),
    'jobs', (SELECT coalesce(jsonb_agg(j ORDER BY j.posted_date DESC NULLS LAST), '[]') FROM (
       SELECT id, title, occupation, city, posted_date, status, is_driver, is_logistics, is_operations, url, source_key, match_method
         FROM public.nr_jobs WHERE business_id = p_id ORDER BY posted_date DESC NULLS LAST LIMIT 60) j),
    'pending', (SELECT coalesce(jsonb_agg(f ORDER BY f.discovered_at DESC), '[]') FROM (
       SELECT f.id, f.category, f.title, f.subject_name, f.subject_city, f.source_key, f.source_url, f.match_method, f.published_at, f.discovered_at, f.candidate_ids
         FROM public.nr_findings f WHERE f.match_status = 'pending_review' AND f.candidate_ids @> ARRAY[p_id] LIMIT 50) f)
  );
END;
$$;

-- review queue: uncertain matches with their candidate businesses
CREATE OR REPLACE FUNCTION public.nr_review_queue(p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.nr_findings WHERE match_status = 'pending_review' AND (p_source IS NULL OR source_key = p_source)),
    'rows', (SELECT coalesce(jsonb_agg(x ORDER BY x.discovered_at DESC), '[]') FROM (
      SELECT f.id, f.category, f.title, f.subject_name, f.subject_city, f.source_key, s.name source_name, f.source_url, f.match_method, f.published_at, f.discovered_at,
             (SELECT count(*) FROM public.nr_jobs j WHERE j.source_key = f.source_key AND f.dedup_key LIKE 'pending_employer:%' AND j.employer_norm = public.nr_norm_name(f.subject_name)) jobs,
             (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'city', b.city, 'reg_id', b.reg_id, 'status', b.status, 'activity', coalesce(b.main_activity, b.sector))), '[]')
                FROM public.nr_businesses b WHERE b.id = ANY(f.candidate_ids)) candidates
        FROM public.nr_findings f LEFT JOIN public.nr_sources s ON s.key = f.source_key
       WHERE f.match_status = 'pending_review' AND (p_source IS NULL OR f.source_key = p_source)
       ORDER BY f.discovered_at DESC LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0)) x));
END;
$$;

-- ── progress report ──
CREATE OR REPLACE FUNCTION public.nr_enrichment_report() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH src AS (
    SELECT * FROM public.nr_sources WHERE key LIKE 'enr:%' OR config ? 'enrichment_check'
  ), fm AS (
    SELECT * FROM public.nr_findings WHERE match_status = 'matched'
  )
  SELECT jsonb_build_object(
    'sources_checked', (SELECT count(*) FROM src),
    'sources_auto', (SELECT count(*) FROM src WHERE kind LIKE 'enrich%' AND status IN ('pending','collecting','completed')),
    'sources_unavailable', (SELECT count(*) FROM src WHERE status IN ('blocked','unsupported','error')),
    'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'catalog_id', catalog_id, 'name', name, 'url', url, 'kind', kind, 'status', status,
                  'reason', status_reason, 'read', records_read, 'enriched', businesses_enriched, 'details', details_added, 'last_run_at', last_run_at,
                  'total', total_records, 'cursor', cursor) ORDER BY (kind LIKE 'enrich%') DESC, priority, key), '[]') FROM src),
    'businesses_new', (SELECT coalesce(sum(businesses_new), 0) FROM src),
    'businesses_enriched', (SELECT count(DISTINCT business_id) FROM fm),
    'new_phones', (SELECT count(*) FROM fm WHERE category = 'new_phone'),
    'new_emails', (SELECT count(*) FROM fm WHERE category = 'new_email'),
    'new_websites', (SELECT count(*) FROM fm WHERE category = 'new_website'),
    'new_socials', (SELECT count(*) FROM fm WHERE category = 'new_social'),
    'hiring', (SELECT count(*) FROM public.nr_businesses WHERE enr_hiring),
    'hiring_drivers', (SELECT count(*) FROM public.nr_businesses WHERE enr_hiring_drivers),
    'hiring_logistics', (SELECT count(*) FROM public.nr_businesses WHERE enr_hiring_logistics),
    'branch_opened', (SELECT count(*) FROM public.nr_businesses WHERE enr_branch_opened),
    'expansion', (SELECT count(*) FROM public.nr_businesses WHERE enr_expansion),
    'tender_won', (SELECT count(*) FROM public.nr_businesses WHERE enr_tender_won),
    'gov_contract', (SELECT count(*) FROM public.nr_businesses WHERE enr_gov_contract),
    'fleet', (SELECT count(*) FROM public.nr_businesses WHERE enr_fleet),
    'people_found', (SELECT count(*) FROM fm WHERE category IN ('ceo','operations_manager','person')),
    'ceo_found', (SELECT count(*) FROM fm WHERE category = 'ceo'),
    'ops_found', (SELECT count(*) FROM fm WHERE category = 'operations_manager'),
    'verified', (SELECT count(*) FROM fm WHERE verification = 'verified'),
    'important', (SELECT count(*) FROM public.nr_businesses WHERE enr_important),
    'pending_review', (SELECT count(*) FROM public.nr_findings WHERE match_status = 'pending_review'),
    'findings', (SELECT count(*) FROM fm),
    'jobs', (SELECT jsonb_build_object('total', count(*), 'read', count(*) FILTER (WHERE status NOT IN ('queued')),
               'queued', count(*) FILTER (WHERE status = 'queued'), 'open', count(*) FILTER (WHERE status = 'open'),
               'no_employer', count(*) FILTER (WHERE status = 'no_employer'), 'matched', count(*) FILTER (WHERE match_status = 'matched'),
               'pending', count(*) FILTER (WHERE match_status = 'pending_review'), 'unmatched', count(*) FILTER (WHERE match_status = 'unmatched'),
               'drivers', count(*) FILTER (WHERE is_driver), 'employers_matched', count(DISTINCT business_id),
               'employers_not_in_registry', count(DISTINCT employer_norm) FILTER (WHERE match_status = 'unmatched' AND employer_norm IS NOT NULL))
             FROM public.nr_jobs),
    -- every one of these records was attached to the business already in the registry instead of creating another record
    'duplicates_avoided', (SELECT count(*) FROM public.nr_jobs WHERE match_status = 'matched')
                        + (SELECT coalesce(sum((detail->>'count')::int), 0) FROM fm WHERE category IN ('tender_won','gov_contract'))
                        + (SELECT coalesce(sum(businesses_enriched), 0) FROM src WHERE key IN ('enr:web_discovery','enr:web_deep')),
    'domains', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.nr_domain_queue GROUP BY 1) d),
    'sites_left', (SELECT count(*) FROM public.nr_businesses WHERE website IS NOT NULL AND enr_site_checked_at IS NULL),
    'by_category', (SELECT jsonb_object_agg(category, n) FROM (SELECT category, count(*) n FROM fm GROUP BY 1) c),
    'examples', (SELECT coalesce(jsonb_agg(x ORDER BY x.discovered_at DESC), '[]') FROM (
       SELECT DISTINCT ON (f.category) f.business_id, b.name, b.city, b.reg_id, f.category, f.title, f.importance, f.verification, f.source_url, s.name source_name, f.discovered_at, f.published_at
         FROM fm f JOIN public.nr_businesses b ON b.id = f.business_id LEFT JOIN public.nr_sources s ON s.key = f.source_key
        WHERE f.importance = 'important' OR f.category IN ('hiring','new_email','gov_contract','employees')
        ORDER BY f.category, (f.verification = 'verified') DESC, f.discovered_at DESC) x),
    'recent_important', (SELECT coalesce(jsonb_agg(x), '[]') FROM (
       SELECT f.business_id, b.name, b.city, f.category, f.title, f.verification, f.source_url, s.name source_name, f.discovered_at
         FROM fm f JOIN public.nr_businesses b ON b.id = f.business_id LEFT JOIN public.nr_sources s ON s.key = f.source_key
        WHERE f.importance = 'important' ORDER BY f.discovered_at DESC LIMIT 25) x),
    'control', (SELECT jsonb_build_object('enrich_running', enrich_running, 'enrich_current', enrich_current) FROM public.nr_control WHERE id = 1),
    'generated_at', now()
  ) INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_set_enrich_running(p_running boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.nr_control SET enrich_running = p_running, updated_at = now(), updated_by = auth.uid() WHERE id = 1;
  INSERT INTO public.nr_events (level, message) VALUES ('info', CASE WHEN p_running THEN 'העשרת המאגר הופעלה' ELSE 'העשרת המאגר נעצרה' END);
  RETURN jsonb_build_object('enrich_running', p_running);
END;
$$;

-- facets: enrichment sources for the "finding source" dropdown
CREATE OR REPLACE FUNCTION public.nr_facets() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (SELECT data || jsonb_build_object('refreshed_at', refreshed_at,
            'groups', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'n', (SELECT count(*) FROM public.nr_group_members m WHERE m.group_id = g.id)) ORDER BY g.id), '[]') FROM public.nr_groups g),
            'finding_sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('v', s.key, 'name', s.name) ORDER BY s.priority), '[]') FROM public.nr_sources s
                                 WHERE s.key IN (SELECT DISTINCT source_key FROM public.nr_findings WHERE match_status = 'matched')))
          FROM public.nr_facets_cache WHERE id = 1);
END;
$$;

-- the scheduler also wakes up for the daily re-read of the Employment Service sitemap
CREATE OR REPLACE FUNCTION public.nr_enrich_has_work() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT enrich_running FROM public.nr_control WHERE id = 1), false) AND (
       EXISTS (SELECT 1 FROM public.nr_sources WHERE key LIKE 'enr:%' AND kind LIKE 'enrich%' AND status IN ('pending','collecting') AND key <> 'enr:news_rss')
    OR EXISTS (SELECT 1 FROM public.nr_jobs WHERE status = 'queued')
    OR EXISTS (SELECT 1 FROM public.nr_domain_queue WHERE status = 'queued')
    OR EXISTS (SELECT 1 FROM public.nr_businesses WHERE website IS NOT NULL AND enr_site_checked_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.nr_sources WHERE key = 'enr:taasuka_jobs' AND coalesce((config->>'sitemap_loaded_at')::timestamptz, 'epoch') < now() - interval '24 hours')
    OR EXISTS (SELECT 1 FROM public.nr_sources WHERE key = 'enr:news_rss' AND (last_run_at IS NULL OR last_run_at < now() - interval '3 hours')));
$$;
REVOKE ALL ON FUNCTION public.nr_enrich_has_work() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.nr_review_queue(int, int, text), public.nr_enrichment_report(), public.nr_set_enrich_running(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_review_queue(int, int, text), public.nr_enrichment_report(), public.nr_set_enrich_running(boolean) TO authenticated, service_role;

-- business e-mail flag for every business that already has an e-mail (one-time; the 5-minute refresh keeps it current)
SELECT public.nr_refresh_enrich(ARRAY(SELECT DISTINCT business_id FROM public.nr_contact_points WHERE kind = 'email'));
