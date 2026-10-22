-- STAGING only (usfeoerkpcafxxlyuldl). Business card: every contact point carries where it came from,
-- so the card can show a reliability level per field (official registry / the company's own verified site / other),
-- not only "2+ sources". Read-only change: three columns added to the contacts list; the rest is the deployed definition.
CREATE OR REPLACE FUNCTION public.nr_business_detail(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '25s'
AS $function$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'business', (SELECT to_jsonb(b) - 'name_norm' - 'city_norm' FROM public.nr_businesses b WHERE id = p_id),
    'contacts', (SELECT coalesce(jsonb_agg(c ORDER BY c.kind, c.verified DESC, c.id), '[]') FROM (
       SELECT id, kind, subkind, value, display, branch_name, branch_address, sources, verified, entry_mode, first_seen_at, src_official, src_own_site, src_other, src_groups FROM public.nr_contact_points WHERE business_id = p_id) c),
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
$function$;
