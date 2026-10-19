-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Review queue: accepting a website match from site identification also attaches the website to the chosen business
-- (website contact point + website field when empty) and queues it for the deep crawl.
CREATE OR REPLACE FUNCTION public.nr_review_finding(p_id bigint, p_business_id bigint, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.nr_findings%ROWTYPE; v_jobs int := 0; v_norm text; v_site text;
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
  ELSE
    UPDATE public.nr_findings SET match_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_id;
  END IF;
  PERFORM public.nr_refresh_enrich(array_append(f.candidate_ids, p_business_id));
  RETURN jsonb_build_object('ok', true, 'jobs_attached', v_jobs);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_review_finding(bigint, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_review_finding(bigint, bigint, boolean) TO authenticated;
