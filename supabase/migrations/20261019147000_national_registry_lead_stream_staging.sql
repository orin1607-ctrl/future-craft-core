-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Automatic Dalia lead stream from the national registry into the EXISTING leads table (prospect_leads).
--  * collection is untouched: the registry keeps every business; the 7 lead rules (public/openprospector-qualify.js,
--    OPQualify.evaluate – the same code the app uses) run only here, to pick leads
--  * the cloud engine (nr-enrichment, action "leads", cron nr-leads every 2 minutes) takes registry companies with fleet
--    signals, builds the same input row the app's search builds, evaluates it and inserts grade A / B companies with an
--    estimated fleet of 5+ vehicles. company_hp is unique → no duplicates; an existing lead is never overwritten
--  * contact sources are passed as source GROUPS (official register / the company's own site / other): two crawls of one
--    website never count as two independent confirmations
--  * work statuses: חדש / בטיפול / יצרנו קשר / מעקב / נסגר (plus the existing ones)
ALTER TABLE public.nr_businesses
  ADD COLUMN IF NOT EXISTS lead_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_result text,
  ADD COLUMN IF NOT EXISTS lead_grade text;
CREATE INDEX IF NOT EXISTS nr_b_lead_todo ON public.nr_businesses (fleet_score DESC NULLS LAST, id)
  WHERE fleet_level IS NOT NULL AND lead_checked_at IS NULL;

ALTER TABLE public.prospect_leads ADD COLUMN IF NOT EXISTS registry_id bigint;
CREATE INDEX IF NOT EXISTS idx_prospect_leads_registry ON public.prospect_leads (registry_id) WHERE registry_id IS NOT NULL;
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.prospect_leads'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status = ANY%' AND pg_get_constraintdef(oid) NOT LIKE '%lead_stage%' AND pg_get_constraintdef(oid) NOT LIKE '%crm_handoff%' AND pg_get_constraintdef(oid) NOT LIKE '%fleet_size_status%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.prospect_leads DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.prospect_leads ADD CONSTRAINT prospect_leads_status_check
  CHECK (status = ANY (ARRAY['new', 'in_progress', 'review', 'contacted', 'follow_up', 'meeting', 'quote', 'won', 'closed', 'lost', 'rejected', 'irrelevant']));

-- candidates: registry companies with a real company number and fleet signals, not yet a lead, not evaluated since their
-- last change. Claims them (lead_checked_at) so parallel calls never take the same company.
CREATE OR REPLACE FUNCTION public.nr_lead_candidates(p_limit int DEFAULT 80) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
  -- never evaluated first (partial index, strongest fleet evidence first), then a few whose fleet evidence changed since
  WITH fresh AS (
    SELECT b.id FROM public.nr_businesses b
     WHERE b.fleet_level IS NOT NULL AND b.lead_checked_at IS NULL AND b.reg_id ~ '^5[0-9]{8}$' AND coalesce(b.status, '') <> 'inactive'
       AND NOT EXISTS (SELECT 1 FROM public.prospect_leads l WHERE l.company_hp = b.reg_id)
       AND NOT EXISTS (SELECT 1 FROM public.nr_marks m WHERE m.business_id = b.id AND m.mark IN ('irrelevant', 'archived'))
     ORDER BY b.fleet_score DESC NULLS LAST, b.id
     LIMIT p_limit
     FOR UPDATE OF b SKIP LOCKED
  ), changed AS (
    SELECT b.id FROM public.nr_businesses b
     WHERE b.fleet_level IS NOT NULL AND b.lead_checked_at < b.fleet_at AND b.reg_id ~ '^5[0-9]{8}$' AND coalesce(b.status, '') <> 'inactive'
       AND NOT EXISTS (SELECT 1 FROM public.prospect_leads l WHERE l.company_hp = b.reg_id)
     LIMIT greatest(p_limit / 5, 5)
     FOR UPDATE OF b SKIP LOCKED
  ), pick AS (SELECT id FROM fresh UNION SELECT id FROM changed), upd AS (
    UPDATE public.nr_businesses b SET lead_checked_at = now() FROM pick WHERE b.id = pick.id RETURNING b.*
  ), cp AS (
    SELECT c.business_id, c.kind, c.subkind, coalesce(c.display, c.value) v, c.src_official, c.src_own_site, c.src_other, c.src_groups,
           array_remove(ARRAY[
             CASE WHEN c.src_official THEN 'מאגר רשמי: ' || coalesce((SELECT s.name FROM public.nr_sources s WHERE s.key = ANY(c.sources) AND s.kind IN ('ckan', 'arcgis', 'fleet_ckan') LIMIT 1), 'מאגר ממשלתי') END,
             CASE WHEN c.src_own_site THEN 'אתר החברה' END,
             CASE WHEN c.src_other THEN 'מקור אחר: ' || coalesce((SELECT s.name FROM public.nr_sources s WHERE s.key = ANY(c.sources) AND s.kind NOT IN ('ckan', 'arcgis', 'fleet_ckan', 'website', 'enrich_web_deep', 'enrich_site_identify', 'enrich_web_discovery', 'enrich_watch') LIMIT 1), 'מקור נוסף') END], NULL) groups,
           row_number() OVER (PARTITION BY c.business_id, c.kind, (c.subkind = 'mobile')
                              ORDER BY c.src_groups DESC, c.src_official DESC, (c.subkind = 'main') DESC, c.id) rk
      FROM public.nr_contact_points c JOIN upd ON upd.id = c.business_id WHERE c.kind IN ('phone', 'email')
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registry_id', u.id,
    'company_name', u.name,
    'company_hp', u.reg_id,
    'status', CASE WHEN u.status = 'active' THEN 'פעילה' ELSE '' END,
    'company_active_status', CASE WHEN u.status = 'active' THEN 'פעילה' ELSE NULL END,
    'industry', concat_ws(' | ', u.sector, u.main_activity, nullif(u.activity_text, ''), array_to_string(u.activities, ' | ')),
    'industry_name', concat_ws(' | ', u.sector, u.main_activity),
    'city', coalesce(u.city, ''), 'region', coalesce(u.district, ''), 'address', coalesce(u.address, u.city, ''),
    'website', coalesce(u.website, ''),
    'phone', (SELECT v FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone' AND cp.subkind IS DISTINCT FROM 'mobile' AND rk = 1),
    'mobile_phone', (SELECT v FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone' AND cp.subkind = 'mobile' AND rk = 1),
    'phone_sources', coalesce((SELECT to_jsonb(groups) FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone' AND rk = 1
                                ORDER BY src_groups DESC, (subkind IS DISTINCT FROM 'mobile') DESC LIMIT 1), '[]'),
    'email', (SELECT v FROM cp WHERE cp.business_id = u.id AND cp.kind = 'email' AND rk = 1 ORDER BY src_groups DESC LIMIT 1),
    'email_sources', coalesce((SELECT to_jsonb(groups) FROM cp WHERE cp.business_id = u.id AND cp.kind = 'email' AND rk = 1 ORDER BY src_groups DESC LIMIT 1), '[]'),
    'all_phones', (SELECT coalesce(jsonb_agg(jsonb_build_object('v', v, 'sub', subkind, 'groups', groups) ORDER BY src_groups DESC), '[]') FROM cp WHERE cp.business_id = u.id AND cp.kind = 'phone'),
    'all_emails', (SELECT coalesce(jsonb_agg(jsonb_build_object('v', v, 'groups', groups) ORDER BY src_groups DESC), '[]') FROM cp WHERE cp.business_id = u.id AND cp.kind = 'email'),
    'source', CASE WHEN 'cat:61' = ANY(u.sources) THEN 'contractors' ELSE 'companies' END,
    'source_list', (SELECT coalesce(jsonb_agg(s.name), '[]') FROM public.nr_sources s WHERE s.key = ANY(u.sources)),
    'employee_count', u.employees_count, 'verified_employee_count', u.employees_count, 'employee_source', u.employees_basis,
    'fleet_level', u.fleet_level, 'fleet_min', u.fleet_min, 'fleet_evidence', u.fleet_evidence,
    'fleet_size', CASE WHEN u.fleet_level = 'documented' THEN u.fleet_min END,
    'fleetIsFact', u.fleet_level = 'documented',
    'fleet_exists', CASE WHEN u.fleet_level = 'documented' THEN true END,
    'fleet_source', (SELECT x->>'src' FROM jsonb_array_elements(u.fleet_evidence) x WHERE x->>'lvl' = 'documented' LIMIT 1),
    'fleet_types', u.fleet_types,
    'industry_fleet_basis', (SELECT x->>'t' FROM jsonb_array_elements(u.fleet_evidence) x WHERE x->>'lvl' = 'strong' ORDER BY (x->>'rank')::int LIMIT 1),
    'people', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role, 'cat', public.nr_role_cat(p.role), 'phone', p.phone, 'email', p.email, 'source', p.source_key, 'url', p.source_url)
                ORDER BY CASE public.nr_role_cat(p.role) WHEN 'fleet' THEN 0 WHEN 'ops' THEN 1 WHEN 'owner' THEN 2 ELSE 3 END), '[]')
                FROM public.nr_people p WHERE p.business_id = u.id),
    'socials', u.socials, 'whatsapp', u.whatsapp, 'ind_codes', u.ind_codes,
    'registry_check', jsonb_build_object(
       'checked_at', now(),
       'companies', jsonb_build_object('found', 'cat:54' = ANY(u.sources) OR u.reg_id_type = 'company', 'status', CASE WHEN u.status = 'active' THEN 'פעילה' ELSE NULL END),
       'contractors', jsonb_build_object('found', 'cat:61' = ANY(u.sources),
          'records', (SELECT coalesce(jsonb_agg(jsonb_build_object('anaf', split_part(a, ' (', 1), 'sivug', substring(a from 'סיווג ([א-ת]?\d)\)'))), '[]')
                        FROM unnest(u.activities) a WHERE 'cat:61' = ANY(u.sources) AND a ~ 'סיווג')))
  )), '[]') INTO v_out FROM upd u;
  RETURN v_out;
END;
$$;

-- store: new leads only (an existing lead – worked by a person – is never touched); every evaluated company keeps its result
CREATE OR REPLACE FUNCTION public.nr_lead_store(p_leads jsonb, p_results jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins int := 0;
BEGIN
  UPDATE public.nr_businesses b SET lead_result = left(r->>'result', 200), lead_grade = r->>'grade'
    FROM jsonb_array_elements(coalesce(p_results, '[]')) r WHERE b.id = (r->>'id')::bigint;
  WITH ins AS (
    INSERT INTO public.prospect_leads (company_name, company_hp, industry, city, region, address, website, phone, email, company_size,
        fleet_info, fleet_type, score, status, found_date, updated_date, lead_reason, facts, evidence, people, multi_phones, multi_mails,
        notes, raw_payload, company_active_status, phone_secondary, linkedin_company, public_whatsapp, contact_name, contact_role, contact_phone, contact_email,
        fleet_exists, fleet_size, fleet_size_status, fleet_types, fleet_evidence, fleet_manager_name, fleet_manager_source,
        verification_status, verification_date, missing_fields, source_list, field_status, registry_check, tier, lead_stage, lead_quality,
        ready_for_contact, rejected_reason, is_approved_lead, source_keyword, registry_id)
    SELECT l->>'company_name', l->>'company_hp', l->>'industry', l->>'city', l->>'region', l->>'address', l->>'website', coalesce(l->>'phone', ''), coalesce(l->>'email', ''), l->>'company_size',
        coalesce(l->'fleet_info', '{}'), l->>'fleet_type', coalesce((l->>'score')::int, 0), 'new', l->>'found_date', l->>'found_date', l->>'lead_reason',
        coalesce(l->'facts', '{}'), coalesce(l->'evidence', '[]'), coalesce(l->'people', '[]'), coalesce(l->'multi_phones', '[]'), coalesce(l->'multi_mails', '[]'),
        '', l->'raw_payload', l->>'company_active_status', l->>'phone_secondary', l->>'linkedin_company', l->>'public_whatsapp',
        l->>'contact_name', l->>'contact_role', l->>'contact_phone', l->>'contact_email',
        (l->>'fleet_exists')::boolean, (l->>'fleet_size')::int, l->>'fleet_size_status',
        CASE WHEN jsonb_typeof(l->'fleet_types') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(l->'fleet_types')) END,
        l->'fleet_evidence', l->>'fleet_manager_name', l->>'fleet_manager_source',
        l->>'verification_status', current_date,
        CASE WHEN jsonb_typeof(l->'missing_fields') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(l->'missing_fields')) END,
        CASE WHEN jsonb_typeof(l->'source_list') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(l->'source_list')) END,
        l->'field_status', l->'registry_check', l->>'tier', l->>'lead_stage', l->>'lead_quality',
        coalesce((l->>'ready_for_contact')::boolean, false) AND coalesce(l->>'phone', '') <> '', l->>'rejected_reason', true, 'national_registry', (l->>'registry_id')::bigint
      FROM jsonb_array_elements(coalesce(p_leads, '[]')) l
    ON CONFLICT (company_hp) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_ins FROM ins;
  RETURN jsonb_build_object('inserted', v_ins);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_lead_candidates(int), public.nr_lead_store(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_lead_candidates(int), public.nr_lead_store(jsonb, jsonb) TO service_role;

-- the live list in the registry tab: leads from the stream (and any other lead linked to a registry card), newest first
CREATE OR REPLACE FUNCTION public.nr_leads_page(p_filters jsonb DEFAULT '{}', p_offset int DEFAULT 0, p_limit int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f jsonb := coalesce(p_filters, '{}'); v jsonb; t bigint;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH l AS (
    SELECT l.*, b.ind_codes, b.fleet_level b_fleet_level, b.socials b_socials, b.district b_district
      FROM public.prospect_leads l LEFT JOIN public.nr_businesses b ON b.id = l.registry_id
     WHERE l.source_keyword = 'national_registry'
       AND (coalesce(f->>'status', '') = '' OR l.status = f->>'status')
       AND (coalesce(f->>'tier', '') = '' OR l.tier = f->>'tier')
       AND (coalesce(f->>'district', '') = '' OR coalesce(l.region, b.district) = f->>'district')
       AND (coalesce(f->>'q', '') = '' OR l.company_name ILIKE '%' || (f->>'q') || '%')
       AND (jsonb_typeof(f->'ind') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'ind') = 0
            OR b.ind_main && ARRAY(SELECT jsonb_array_elements_text(f->'ind')) OR b.ind_codes && ARRAY(SELECT jsonb_array_elements_text(f->'ind')))
       AND (NOT coalesce((f->>'fleet_contact')::boolean, false) OR coalesce(l.contact_name, '') <> '')
       AND (NOT coalesce((f->>'reachable')::boolean, false) OR coalesce(l.phone, '') <> '' OR coalesce(l.email, '') <> '')
  )
  SELECT (SELECT count(*) FROM l),
         (SELECT coalesce(jsonb_agg(x ORDER BY x.ord), '[]') FROM (
            -- ready to work first: grade, then a phone, then an e-mail, then the rules' potential score
            SELECT row_number() OVER (ORDER BY CASE l.tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END, (coalesce(l.phone, '') <> '') DESC,
                                               (coalesce(l.email, '') <> '') DESC, l.score DESC, l.created_at DESC) ord,
                   l.id, l.lead_number, l.company_name, l.company_hp, l.industry, l.city, l.region, l.website, l.phone, l.phone_secondary, l.email,
                   l.contact_name, l.contact_role, l.contact_phone, l.contact_email, l.fleet_size, l.fleet_size_status, l.fleet_evidence,
                   l.lead_reason, l.tier, l.lead_stage, l.lead_quality, l.verification_status, l.ready_for_contact, l.missing_fields, l.status, l.notes,
                   l.multi_phones, l.multi_mails, l.registry_id, l.created_at, l.updated_at, l.raw_payload->'fleet_estimate' fleet_estimate,
                   l.raw_payload->'why' why, l.ind_codes, l.b_socials socials, l.public_whatsapp, l.linkedin_company
              FROM l ORDER BY ord LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0)) x)
    INTO t, v;
  RETURN jsonb_build_object('total', t, 'rows', v);
END;
$$;
CREATE OR REPLACE FUNCTION public.nr_leads_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.prospect_leads WHERE source_keyword = 'national_registry'),
    'today', (SELECT count(*) FROM public.prospect_leads WHERE source_keyword = 'national_registry' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem'),
    'last_hour', (SELECT count(*) FROM public.prospect_leads WHERE source_keyword = 'national_registry' AND created_at > now() - interval '1 hour'),
    'by_status', (SELECT coalesce(jsonb_object_agg(status, c), '{}') FROM (SELECT status, count(*) c FROM public.prospect_leads WHERE source_keyword = 'national_registry' GROUP BY 1) x),
    'by_tier', (SELECT coalesce(jsonb_object_agg(coalesce(tier, '-'), c), '{}') FROM (SELECT tier, count(*) c FROM public.prospect_leads WHERE source_keyword = 'national_registry' GROUP BY 1) x),
    'evaluated', (SELECT count(*) FROM public.nr_businesses WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL),
    'waiting', (SELECT count(*) FROM public.nr_businesses b WHERE b.fleet_level IS NOT NULL AND b.reg_id ~ '^5[0-9]{8}$' AND coalesce(b.status, '') <> 'inactive'
                 AND (b.lead_checked_at IS NULL OR b.lead_checked_at < b.fleet_at)),
    'rejected_reasons', (SELECT coalesce(jsonb_object_agg(lead_result, c), '{}') FROM (SELECT lead_result, count(*) c FROM public.nr_businesses
                          WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL AND lead_grade IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6) x),
    'last_run', (SELECT max(lead_checked_at) FROM public.nr_businesses WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.nr_leads_page(jsonb, int, int), public.nr_leads_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_leads_page(jsonb, int, int), public.nr_leads_stats() TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS nr_b_lead_changed ON public.nr_businesses (lead_checked_at) WHERE fleet_level IS NOT NULL AND lead_checked_at IS NOT NULL;
