-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Tracking: a re-check of the same site must not register the same fact twice.
--  * site facts use one source-independent identity (engine change); duplicates already created by tracking are marked rejected
--  * when a known fact changes (e.g. new lines on the careers page), the finding keeps the previous text and a change date,
--    and the tracking feed shows it as a change
CREATE OR REPLACE FUNCTION public.nr_put_finding(f jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO public.nr_findings AS x (business_id, candidate_ids, subject_name, subject_city, source_key, source_url, category, title, detail,
    importance, fact_kind, verification, match_status, match_method, published_at, dedup_key)
  VALUES ((f->>'business_id')::bigint, coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(f->'candidates', '[]')))::bigint[], '{}'),
    f->>'subject_name', f->>'subject_city', f->>'source_key', f->>'source_url', f->>'category', left(f->>'title', 300),
    coalesce(f->'detail', '{}'), coalesce(f->>'importance', 'normal'), coalesce(f->>'fact_kind', 'fact'),
    coalesce(f->>'verification', 'unverified'), coalesce(f->>'match_status', 'matched'), f->>'match_method',
    nullif(f->>'published_at', '')::date, f->>'dedup_key')
  ON CONFLICT (dedup_key) DO UPDATE SET
    detail = CASE WHEN x.title IS DISTINCT FROM EXCLUDED.title AND x.category NOT IN ('gov_contract','tender_won')
                  THEN EXCLUDED.detail || jsonb_build_object('previous_title', x.title, 'changed_at', now())
                  ELSE EXCLUDED.detail || coalesce(x.detail - ARRAY(SELECT jsonb_object_keys(EXCLUDED.detail)), '{}') - 'cp_id' || EXCLUDED.detail END,
    title = EXCLUDED.title, source_url = coalesce(EXCLUDED.source_url, x.source_url),
    importance = EXCLUDED.importance,
    verification = CASE WHEN x.verification = 'verified' THEN 'verified' ELSE EXCLUDED.verification END,
    published_at = greatest(x.published_at, EXCLUDED.published_at),
    business_id = CASE WHEN x.reviewed_at IS NOT NULL THEN x.business_id ELSE coalesce(EXCLUDED.business_id, x.business_id) END,
    match_status = CASE WHEN x.reviewed_at IS NOT NULL THEN x.match_status ELSE EXCLUDED.match_status END,
    candidate_ids = EXCLUDED.candidate_ids,
    updated_at = now()
  RETURNING id INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_watch_updates(p_limit int DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'watched', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'city', b.city, 'frequency', w.frequency, 'last_checked_at', w.last_checked_at,
                  'next_due_at', w.next_due_at, 'checks', w.checks, 'last_result', w.last_result) ORDER BY w.created_at DESC), '[]')
                  FROM public.nr_watch w JOIN public.nr_businesses b ON b.id = w.business_id WHERE w.active),
    'updates', (SELECT coalesce(jsonb_agg(x ORDER BY x.discovered_at DESC), '[]') FROM (
       SELECT f.business_id, b.name, f.category,
              CASE WHEN (f.detail->>'changed_at')::timestamptz >= w.created_at THEN 'עודכן: ' || f.title ELSE f.title END AS title,
              f.importance, f.verification, f.fact_kind, f.source_url, s.name source_name,
              greatest(f.discovered_at, coalesce((f.detail->>'changed_at')::timestamptz, f.discovered_at)) discovered_at, f.published_at
         FROM public.nr_findings f JOIN public.nr_watch w ON w.business_id = f.business_id AND w.active
         JOIN public.nr_businesses b ON b.id = f.business_id LEFT JOIN public.nr_sources s ON s.key = f.source_key
        WHERE f.match_status = 'matched' AND (f.discovered_at >= w.created_at - interval '1 minute' OR (f.detail->>'changed_at')::timestamptz >= w.created_at)
        ORDER BY 12 DESC LIMIT least(greatest(p_limit, 1), 500)) x));
END;
$$;
REVOKE ALL ON FUNCTION public.nr_watch_updates(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_watch_updates(int) TO authenticated, service_role;

UPDATE public.nr_findings f SET match_status = 'rejected', reviewed_at = now(), updated_at = now(),
       detail = f.detail || '{"rejected_reason":"כפילות – אותו ממצא כבר נרשם מסריקת האתר"}'
 WHERE f.source_key = 'enr:watch' AND f.match_status = 'matched'
   AND EXISTS (SELECT 1 FROM public.nr_findings o WHERE o.dedup_key = replace(f.dedup_key, 'enr:watch:', 'enr:web_deep:') AND o.match_status = 'matched');
SELECT public.nr_refresh_enrich(ARRAY[23472::bigint]);
SELECT count(*) dups_rejected FROM public.nr_findings WHERE source_key = 'enr:watch' AND match_status = 'rejected';
