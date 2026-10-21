-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Social / digital-presence locator inside OpenProspector ("דליה איתור לידים") – per company, on demand.
-- Reuses the existing contact investigation (marketing-hub/contactFinder.ts investigate) from the nr-enrichment function;
-- results go to the SAME registry tables:
--  * high confidence (linked from the company's own confirmed website, or Wikidata matched by the company's domain)
--    → nr_contact_points / nr_businesses.socials through nr_ingest (adds a source, never overwrites a value)
--  * anything else → nr_findings pending_review (category new_social), every candidate kept for the reviewer;
--    accepting attaches it to the card, rejecting keeps it from being offered again
--  * every run is logged (what was checked, what was found, how sure) in nr_social_runs
-- Backup first; nothing is deleted.
CREATE SCHEMA IF NOT EXISTS nr_backup_20261021;
CREATE TABLE IF NOT EXISTS nr_backup_20261021.contact_points_social AS
  SELECT * FROM public.nr_contact_points WHERE kind IN ('social', 'website', 'whatsapp', 'contact_form');
CREATE TABLE IF NOT EXISTS nr_backup_20261021.business_socials AS
  SELECT id, website, socials, whatsapp FROM public.nr_businesses WHERE website IS NOT NULL OR socials <> '{}'::jsonb OR whatsapp IS NOT NULL;

INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config)
VALUES ('enr:social_locate', 'E33', 'איתור רשתות חברתיות ונוכחות דיגיטלית (לפי בקשה)', NULL, 'אתר החברה, Wikidata, התאמת דומיין',
  'enrich_social_locate', ARRAY['facebook', 'instagram', 'linkedin', 'website', 'email', 'whatsapp', 'contact_form'],
  'רק מקורות מותרים: אתר החברה עצמו (robots.txt נבדק), Wikidata (CC0), דומיינים ישראליים מוכרים שאומתו מול טלפון / אימייל / ח.פ. של החברה. אין חיפוש בתוך פייסבוק / אינסטגרם / לינקדאין ואין עקיפת הרשאות.',
  'collecting', 'מופעל לפי בקשה מכרטיס העסק ובמדגמי בדיקה', 7, '{}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.nr_businesses ADD COLUMN IF NOT EXISTS social_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.nr_social_runs (
  id bigserial PRIMARY KEY,
  business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ms int,
  mode text NOT NULL DEFAULT 'button',          -- button | sample
  tag text,                                     -- sample name
  requested_by uuid,
  site text, site_status text,                  -- website used and how it was confirmed
  steps jsonb NOT NULL DEFAULT '[]',
  findings jsonb NOT NULL DEFAULT '[]',         -- [{platform,url,handle,confidence,source,evidence,action,finding_id}]
  saved int NOT NULL DEFAULT 0, review int NOT NULL DEFAULT 0, error text
);
CREATE INDEX IF NOT EXISTS nr_social_runs_biz ON public.nr_social_runs (business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS nr_social_runs_tag ON public.nr_social_runs (tag) WHERE tag IS NOT NULL;
ALTER TABLE public.nr_social_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_social_runs_select ON public.nr_social_runs;
CREATE POLICY nr_social_runs_select ON public.nr_social_runs FOR SELECT TO authenticated USING (public.nr_can_read());
REVOKE ALL ON public.nr_social_runs FROM anon;

-- known Israeli domains whose name resembles the company (English name / transliteration); checked against the site afterwards
CREATE INDEX IF NOT EXISTS nr_site_queue_label_trgm ON public.nr_site_queue USING gin (split_part(domain, '.', 1) gin_trgm_ops);
CREATE OR REPLACE FUNCTION public.nr_social_domain_candidates(p_labels text[], p_business bigint) RETURNS TABLE(domain text, sim real, owner bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions SET pg_trgm.similarity_threshold = 0.5 AS $$
  SELECT q.domain, max(similarity(split_part(q.domain, '.', 1), l)) sim,
         CASE WHEN q.business_id IS DISTINCT FROM p_business THEN q.business_id END owner
    FROM public.nr_site_queue q, unnest(p_labels) l
   WHERE length(l) >= 4 AND split_part(q.domain, '.', 1) % l
   GROUP BY q.domain, q.business_id ORDER BY 2 DESC LIMIT 6;
$$;
REVOKE ALL ON FUNCTION public.nr_social_domain_candidates(text[], bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_social_domain_candidates(text[], bigint) TO service_role;

-- what the card shows: current links with their sources, open candidates, and the last run (steps + findings)
CREATE OR REPLACE FUNCTION public.nr_social_result(p_business_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'saved', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'sub', c.subkind, 'v', coalesce(c.display, c.value), 'verified', c.verified,
                      'sources', (SELECT coalesce(jsonb_agg(coalesce(s.name, k)), '[]') FROM unnest(c.sources) k LEFT JOIN public.nr_sources s ON s.key = k))
                    ORDER BY c.kind, c.subkind), '[]')
                FROM public.nr_contact_points c WHERE c.business_id = p_business_id AND c.kind IN ('social', 'website', 'whatsapp', 'contact_form', 'email')),
    'pending', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'url', f.source_url, 'detail', f.detail) ORDER BY f.id), '[]')
                  FROM public.nr_findings f WHERE f.business_id = p_business_id AND f.match_status = 'pending_review' AND f.dedup_key LIKE 'social_locate:%'),
    'rejected', (SELECT count(*) FROM public.nr_findings f WHERE f.business_id = p_business_id AND f.match_status = 'rejected' AND f.dedup_key LIKE 'social_locate:%'),
    'last_run', (SELECT to_jsonb(r) FROM public.nr_social_runs r WHERE r.business_id = p_business_id ORDER BY r.id DESC LIMIT 1))
  INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_social_result(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_social_result(bigint) TO authenticated, service_role;

-- measurable test: one sample tag → companies checked, per platform found / saved (high) / for review
CREATE OR REPLACE FUNCTION public.nr_social_sample_report(p_tag text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT DISTINCT ON (business_id) * FROM public.nr_social_runs WHERE tag = p_tag ORDER BY business_id, id DESC),
  f AS (SELECT r.business_id, r.site_status, x->>'platform' platform, x->>'confidence' conf, x->>'action' action
          FROM r, jsonb_array_elements(r.findings) x),
  known AS (SELECT r.business_id, c.subkind platform FROM r JOIN public.nr_contact_points c ON c.business_id = r.business_id AND c.kind = 'social'
             WHERE NOT ('enr:social_locate' = ANY(c.sources)) OR cardinality(c.sources) > 1)
  SELECT jsonb_build_object(
    'tag', p_tag, 'companies', (SELECT count(*) FROM r), 'errors', (SELECT count(*) FROM r WHERE error IS NOT NULL),
    'avg_seconds', (SELECT round(avg(ms) / 1000.0, 1) FROM r),
    'site', (SELECT jsonb_object_agg(coalesce(site_status, 'none'), n) FROM (SELECT site_status, count(*) n FROM r GROUP BY 1) s),
    'platforms', (SELECT jsonb_object_agg(p, jsonb_build_object(
        'companies_with_any', (SELECT count(DISTINCT business_id) FROM f WHERE platform = p AND action IN ('saved', 'review', 'known')),
        'known_before', (SELECT count(DISTINCT business_id) FROM known WHERE known.platform = p),
        'new_saved', (SELECT count(DISTINCT business_id) FROM f WHERE platform = p AND action = 'saved'),
        'new_review', (SELECT count(DISTINCT business_id) FROM f WHERE platform = p AND action = 'review' AND NOT EXISTS (SELECT 1 FROM f f2 WHERE f2.business_id = f.business_id AND f2.platform = p AND f2.action = 'saved'))))
      FROM unnest(ARRAY['facebook', 'instagram', 'linkedin', 'website', 'email', 'whatsapp', 'contact_form']) p));
$$;
REVOKE ALL ON FUNCTION public.nr_social_sample_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_social_sample_report(text) TO authenticated, service_role;

-- review: accepting a located link attaches it to the card (without replacing an existing value)
CREATE OR REPLACE FUNCTION public.nr_review_finding(p_id bigint, p_business_id bigint, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.nr_findings%ROWTYPE; v_jobs int := 0; v_norm text; v_site text; v_pf text; v_url text;
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO f FROM public.nr_findings WHERE id = p_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF p_accept THEN
    IF p_business_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.nr_businesses WHERE id = p_business_id) THEN RAISE EXCEPTION 'business required'; END IF;
    UPDATE public.nr_findings SET business_id = p_business_id, match_status = 'matched', match_method = 'manual_review',
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_id;
    IF f.dedup_key LIKE 'pending_employer:%' THEN
      v_norm := public.nr_norm_name(f.subject_name);
      UPDATE public.nr_jobs SET business_id = p_business_id, match_status = 'matched', match_method = 'manual_review'
       WHERE employer_norm = v_norm AND source_key = f.source_key;
      GET DIAGNOSTICS v_jobs = ROW_COUNT;
      PERFORM public.nr_jobs_rollup(ARRAY[p_business_id]);
    END IF;
    IF f.dedup_key LIKE 'site_identify:%' THEN
      v_site := lower(rtrim(f.source_url, '/'));
      PERFORM public.nr_upsert_cp(p_business_id, 'website', NULL, v_site, v_site, NULL, NULL, 'manual_review');
      UPDATE public.nr_businesses SET website = coalesce(website, v_site), enr_site_checked_at = CASE WHEN website IS NULL THEN NULL ELSE enr_site_checked_at END,
             updated_at = now() WHERE id = p_business_id;
      UPDATE public.nr_site_queue SET status = 'matched', business_id = p_business_id, method = 'manual_review' WHERE domain = public.nr_host(v_site);
    END IF;
    IF f.dedup_key LIKE 'social_locate:%' THEN
      v_pf := f.detail->>'platform'; v_url := f.detail->>'url';
      IF v_pf = 'website' THEN
        v_site := lower(rtrim(v_url, '/'));
        PERFORM public.nr_upsert_cp(p_business_id, 'website', NULL, v_site, v_site, NULL, NULL, 'manual_review');
        UPDATE public.nr_businesses SET website = coalesce(website, v_site), updated_at = now() WHERE id = p_business_id;
      ELSIF v_pf = 'email' THEN
        PERFORM public.nr_upsert_cp(p_business_id, 'email', NULL, lower(v_url), lower(v_url), NULL, NULL, 'manual_review');
        UPDATE public.nr_businesses SET email_main = coalesce(email_main, lower(v_url)), has_email = true, updated_at = now() WHERE id = p_business_id;
      ELSIF v_pf IN ('facebook', 'instagram', 'linkedin', 'whatsapp', 'contact_form') AND v_url ~ '^https?://' THEN
        PERFORM public.nr_upsert_cp(p_business_id, CASE WHEN v_pf IN ('whatsapp', 'contact_form') THEN v_pf ELSE 'social' END, v_pf,
          lower(rtrim(v_url, '/')), v_url, NULL, NULL, 'manual_review');
        UPDATE public.nr_businesses b SET socials = CASE WHEN b.socials ? v_pf THEN b.socials ELSE b.socials || jsonb_build_object(v_pf, v_url) END,
          whatsapp = CASE WHEN v_pf = 'whatsapp' THEN coalesce(b.whatsapp, v_url) ELSE b.whatsapp END, updated_at = now()
         WHERE b.id = p_business_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.nr_findings SET match_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_id;
  END IF;
  PERFORM public.nr_refresh_enrich(array_append(f.candidate_ids, p_business_id));
  RETURN jsonb_build_object('ok', true, 'jobs_attached', v_jobs);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_review_finding(bigint, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_review_finding(bigint, bigint, boolean) TO authenticated;

SELECT (SELECT count(*) FROM nr_backup_20261021.contact_points_social) backup_cp,
       (SELECT count(*) FROM nr_backup_20261021.business_socials) backup_biz,
       (SELECT count(*) FROM public.nr_social_domain_candidates(ARRAY['galmarine'], 0)) cand_test;
