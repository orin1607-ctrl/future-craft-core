-- National registry – review-queue fixes and automatic verification (STAGING)
-- 1) nr_review_finding: bulk-index findings (bulk_wikidata:/bulk_osm:) are attached on accept exactly like
--    social_locate: findings (they were not attached before – accept would only change the status).
-- 2) nr_auto_accept_finding(id, business_id, reason): same attach logic for a pending finding, used only by
--    internal jobs for findings that a SECOND independent signal confirms (labelled auto_verified:<reason>).
--    Not granted to users; the manual review stays the only path for everything else.
-- Original nr_review_finding is kept in git history (migration before this one) – this only widens one condition.

CREATE OR REPLACE FUNCTION public.nr_review_finding(p_id bigint, p_business_id bigint, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF f.dedup_key LIKE 'social_locate:%' OR f.dedup_key LIKE 'bulk_wikidata:%' OR f.dedup_key LIKE 'bulk_osm:%' THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.nr_auto_accept_finding(p_id bigint, p_business_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.nr_findings%ROWTYPE; v_jobs int := 0; v_norm text; v_site text; v_pf text; v_url text;
BEGIN
  SELECT * INTO f FROM public.nr_findings WHERE id = p_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF f.match_status <> 'pending_review' THEN RETURN jsonb_build_object('ok', false, 'skipped', f.match_status); END IF;
  IF true THEN
    IF p_business_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.nr_businesses WHERE id = p_business_id) THEN RAISE EXCEPTION 'business required'; END IF;
    UPDATE public.nr_findings SET business_id = p_business_id, match_status = 'matched', match_method = 'auto_verified:' || p_reason,
      reviewed_by = NULL, reviewed_at = now(), updated_at = now() WHERE id = p_id;
    IF f.dedup_key LIKE 'pending_employer:%' THEN
      v_norm := public.nr_norm_name(f.subject_name);
      UPDATE public.nr_jobs SET business_id = p_business_id, match_status = 'matched', match_method = ('auto_verified:' || p_reason)
       WHERE employer_norm = v_norm AND source_key = f.source_key;
      GET DIAGNOSTICS v_jobs = ROW_COUNT;
      PERFORM public.nr_jobs_rollup(ARRAY[p_business_id]);
    END IF;
    IF f.dedup_key LIKE 'site_identify:%' THEN
      v_site := lower(rtrim(f.source_url, '/'));
      PERFORM public.nr_upsert_cp(p_business_id, 'website', NULL, v_site, v_site, NULL, NULL, ('auto_verified:' || p_reason));
      UPDATE public.nr_businesses SET website = coalesce(website, v_site), enr_site_checked_at = CASE WHEN website IS NULL THEN NULL ELSE enr_site_checked_at END,
             updated_at = now() WHERE id = p_business_id;
      UPDATE public.nr_site_queue SET status = 'matched', business_id = p_business_id, method = ('auto_verified:' || p_reason) WHERE domain = public.nr_host(v_site);
    END IF;
    IF f.dedup_key LIKE 'social_locate:%' OR f.dedup_key LIKE 'bulk_wikidata:%' OR f.dedup_key LIKE 'bulk_osm:%' THEN
      v_pf := f.detail->>'platform'; v_url := f.detail->>'url';
      IF v_pf = 'website' THEN
        v_site := lower(rtrim(v_url, '/'));
        PERFORM public.nr_upsert_cp(p_business_id, 'website', NULL, v_site, v_site, NULL, NULL, ('auto_verified:' || p_reason));
        UPDATE public.nr_businesses SET website = coalesce(website, v_site), updated_at = now() WHERE id = p_business_id;
      ELSIF v_pf = 'email' THEN
        PERFORM public.nr_upsert_cp(p_business_id, 'email', NULL, lower(v_url), lower(v_url), NULL, NULL, ('auto_verified:' || p_reason));
        UPDATE public.nr_businesses SET email_main = coalesce(email_main, lower(v_url)), has_email = true, updated_at = now() WHERE id = p_business_id;
      ELSIF v_pf IN ('facebook', 'instagram', 'linkedin', 'whatsapp', 'contact_form') AND v_url ~ '^https?://' THEN
        PERFORM public.nr_upsert_cp(p_business_id, CASE WHEN v_pf IN ('whatsapp', 'contact_form') THEN v_pf ELSE 'social' END, v_pf,
          lower(rtrim(v_url, '/')), v_url, NULL, NULL, ('auto_verified:' || p_reason));
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
$function$;

revoke all on function public.nr_auto_accept_finding(bigint, bigint, text) from public, anon, authenticated;
