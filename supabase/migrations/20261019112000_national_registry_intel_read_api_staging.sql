-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Business intelligence – read side: filters (each social network yes/no, WhatsApp, any social, relations, partners,
-- new this week, watched), links column data, relations + tracking in the business card, report additions.

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
  -- ── websites, social networks, relations, tracking ──
  IF f->>'fb' = 'yes' THEN w := array_append(w, 'b.has_facebook'); ELSIF f->>'fb' = 'no' THEN w := array_append(w, 'NOT b.has_facebook'); END IF;
  IF f->>'ig' = 'yes' THEN w := array_append(w, 'b.has_instagram'); ELSIF f->>'ig' = 'no' THEN w := array_append(w, 'NOT b.has_instagram'); END IF;
  IF f->>'li' = 'yes' THEN w := array_append(w, 'b.has_linkedin'); ELSIF f->>'li' = 'no' THEN w := array_append(w, 'NOT b.has_linkedin'); END IF;
  IF f->>'tt' = 'yes' THEN w := array_append(w, 'b.has_tiktok'); ELSIF f->>'tt' = 'no' THEN w := array_append(w, 'NOT b.has_tiktok'); END IF;
  IF f->>'yt' = 'yes' THEN w := array_append(w, 'b.has_youtube'); ELSIF f->>'yt' = 'no' THEN w := array_append(w, 'NOT b.has_youtube'); END IF;
  IF (f->>'whatsapp')::boolean IS TRUE THEN w := array_append(w, 'b.has_whatsapp'); END IF;
  IF (f->>'social_any')::boolean IS TRUE THEN w := array_append(w, '(b.has_facebook OR b.has_instagram OR b.has_linkedin OR b.has_tiktok OR b.has_youtube OR b.has_twitter)'); END IF;
  IF (f->>'relations')::boolean IS TRUE THEN w := array_append(w, 'b.rel_count > 0'); END IF;
  IF (f->>'partners')::boolean IS TRUE THEN w := array_append(w, 'b.has_partners'); END IF;
  IF (f->>'new_week')::boolean IS TRUE THEN w := array_append(w, $w$b.enr_last_found_at >= now() - interval '7 days'$w$); END IF;
  IF (f->>'watched')::boolean IS TRUE THEN w := array_append(w, 'b.watched'); END IF;
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
    WHEN 'relations' THEN 'b.rel_count DESC, b.id'
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
             b.whatsapp, b.has_facebook, b.has_instagram, b.has_linkedin, b.has_tiktok, b.has_youtube, b.has_whatsapp, b.rel_count, b.rel_verified, b.watched,
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
         FROM public.nr_findings f WHERE f.match_status = 'pending_review' AND f.candidate_ids @> ARRAY[p_id] LIMIT 50) f),
    -- relations in both directions, described from the point of view of THIS company
    'relations', (SELECT coalesce(jsonb_agg(x ORDER BY x.lvl, x.discovered_at DESC), '[]') FROM (
       SELECT r.id, CASE r.level WHEN 'verified' THEN 1 WHEN 'stated' THEN 2 ELSE 3 END lvl, r.level, r.source_key, s.name source_name, r.source_url, r.discovered_at,
              CASE WHEN r.from_business_id = p_id THEN r.relation
                   ELSE CASE r.relation WHEN 'client' THEN 'client_of' WHEN 'supplier' THEN 'supplier_of' WHEN 'parent' THEN 'subsidiary' WHEN 'subsidiary' THEN 'parent'
                                        WHEN 'owner' THEN 'owned' WHEN 'partner' THEN 'partner' ELSE 'mentioned_by' END END AS relation,
              CASE WHEN r.from_business_id = p_id THEN r.to_business_id ELSE r.from_business_id END other_id,
              coalesce(o.name, CASE WHEN r.from_business_id = p_id THEN coalesce(r.to_name, r.to_domain) END) other_name, o.city other_city,
              CASE WHEN r.from_business_id = p_id THEN r.to_domain END other_domain
         FROM public.nr_relations r LEFT JOIN public.nr_sources s ON s.key = r.source_key
         LEFT JOIN public.nr_businesses o ON o.id = CASE WHEN r.from_business_id = p_id THEN r.to_business_id ELSE r.from_business_id END
        WHERE r.from_business_id = p_id OR r.to_business_id = p_id LIMIT 150) x),
    'watch', (SELECT to_jsonb(w) FROM public.nr_watch w WHERE w.business_id = p_id AND w.active)
  );
END;
$$;

-- intelligence report (numbers saved in the database, not search results)
CREATE OR REPLACE FUNCTION public.nr_intel_report() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'businesses_total', (SELECT count(*) FROM public.nr_businesses),
    'new_businesses', (SELECT coalesce(sum(businesses_new), 0) FROM public.nr_sources WHERE key LIKE 'enr:%'),
    'websites_found', (SELECT count(*) FROM public.nr_findings WHERE category = 'new_website' AND match_status = 'matched'),
    'with_website', (SELECT count(*) FROM public.nr_businesses WHERE has_website),
    'facebook', (SELECT count(*) FROM public.nr_businesses WHERE has_facebook),
    'linkedin', (SELECT count(*) FROM public.nr_businesses WHERE has_linkedin),
    'instagram', (SELECT count(*) FROM public.nr_businesses WHERE has_instagram),
    'tiktok', (SELECT count(*) FROM public.nr_businesses WHERE has_tiktok),
    'youtube', (SELECT count(*) FROM public.nr_businesses WHERE has_youtube),
    'whatsapp', (SELECT count(*) FROM public.nr_businesses WHERE has_whatsapp),
    'relations_verified', (SELECT count(*) FROM public.nr_relations WHERE level = 'verified'),
    'relations_stated', (SELECT count(*) FROM public.nr_relations WHERE level = 'stated'),
    'relations_mention', (SELECT count(*) FROM public.nr_relations WHERE level = 'mention'),
    'relations_resolved', (SELECT count(*) FROM public.nr_relations WHERE to_business_id IS NOT NULL),
    'businesses_with_relations', (SELECT count(*) FROM public.nr_businesses WHERE rel_count > 0),
    'related_sites', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.nr_rel_domain_queue GROUP BY 1) q),
    'watched', (SELECT count(*) FROM public.nr_watch WHERE active),
    'watched_with_important', (SELECT count(DISTINCT f.business_id) FROM public.nr_findings f JOIN public.nr_watch w ON w.business_id = f.business_id AND w.active
                                WHERE f.importance = 'important' AND f.match_status = 'matched' AND f.discovered_at >= w.created_at),
    'sources_active', (SELECT count(*) FROM public.nr_sources WHERE key LIKE 'enr:%' AND kind LIKE 'enrich%' AND status IN ('pending','collecting','completed')),
    'sources_blocked', (SELECT count(*) FROM public.nr_sources WHERE (key LIKE 'enr:%' OR config ? 'enrichment_check') AND status IN ('blocked','unsupported','error')),
    'sources_awaiting', (SELECT count(*) FROM public.nr_sources WHERE status = 'awaiting_permission'),
    'last_run', (SELECT max(finished_at) FROM public.nr_runs WHERE source_key LIKE 'enr:%'),
    'runs_last_hour', (SELECT count(*) FROM public.nr_runs WHERE source_key LIKE 'enr:%' AND started_at > now() - interval '1 hour'),
    'failed_last_hour', (SELECT count(*) FROM public.nr_runs WHERE source_key LIKE 'enr:%' AND started_at > now() - interval '1 hour' AND NOT ok),
    'engine_running', (SELECT enrich_running FROM public.nr_control WHERE id = 1),
    'db_mb', (SELECT round(pg_database_size(current_database()) / 1048576.0)),
    'relation_examples', (SELECT coalesce(jsonb_agg(x), '[]') FROM (
       SELECT r.from_business_id, f.name from_name, r.to_business_id, coalesce(t.name, r.to_name, r.to_domain) to_name, r.relation, r.level, r.source_url, s.name source_name
         FROM public.nr_relations r JOIN public.nr_businesses f ON f.id = r.from_business_id LEFT JOIN public.nr_businesses t ON t.id = r.to_business_id
         LEFT JOIN public.nr_sources s ON s.key = r.source_key
        WHERE r.level IN ('verified','stated') AND r.to_business_id IS NOT NULL ORDER BY (r.level = 'verified') DESC, r.discovered_at DESC LIMIT 12) x)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.nr_intel_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_intel_report() TO authenticated, service_role;
