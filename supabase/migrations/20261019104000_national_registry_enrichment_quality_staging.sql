-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Enrichment quality fixes after the first real batches:
--  * the deep crawl receives the business's e-mails and English name so it can confirm that a website really belongs to it
--  * a stylesheet / script / image URL is never a "contact form" (the older website crawler records such links); no finding for it
--  * findings already created from such links are marked rejected (kept, not deleted)
--  * websites crawled before the confirmation check are queued again so they pass through it

DROP FUNCTION IF EXISTS public.nr_claim_sites(int);
CREATE FUNCTION public.nr_claim_sites(p_limit int)
RETURNS TABLE(id bigint, name text, name_en text, website text, phones text[], emails text[], city text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_businesses b SET enr_site_checked_at = now()
     WHERE b.id IN (SELECT x.id FROM public.nr_businesses x WHERE x.website IS NOT NULL AND x.enr_site_checked_at IS NULL ORDER BY x.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.name, b.name_en, b.website, b.city)
  SELECT c.id, c.name, c.name_en, c.website,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'email'), c.city FROM c;
$$;
REVOKE ALL ON FUNCTION public.nr_claim_sites(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_sites(int) TO service_role;

CREATE OR REPLACE FUNCTION public.nr_cp_finding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first timestamptz; v_cat text; v_title text; v_imp text := 'normal';
BEGIN
  SELECT first_seen_at INTO v_first FROM public.nr_businesses WHERE id = NEW.business_id;
  IF v_first IS NULL OR v_first > now() - interval '30 minutes' THEN RETURN NEW; END IF;
  -- asset files picked up by a crawler are not contact details
  IF NEW.value ~* '\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|pdf)(\?|$)' OR NEW.value ~* '/wp-(content|includes)/' THEN RETURN NEW; END IF;
  v_cat := CASE NEW.kind WHEN 'phone' THEN 'new_phone' WHEN 'email' THEN 'new_email' WHEN 'website' THEN 'new_website'
                         WHEN 'fax' THEN NULL ELSE 'new_social' END;
  IF v_cat IS NULL THEN RETURN NEW; END IF;
  IF v_cat IN ('new_phone', 'new_website') THEN v_imp := 'important'; END IF;
  v_title := CASE v_cat
    WHEN 'new_phone' THEN 'נמצא מספר טלפון חדש: ' || coalesce(NEW.display, NEW.value) || CASE WHEN NEW.subkind = 'branch' THEN ' (סניף)' ELSE '' END
    WHEN 'new_email' THEN 'נמצא אימייל חדש: ' || NEW.value
    WHEN 'new_website' THEN 'נמצא אתר אינטרנט חדש: ' || NEW.value
    ELSE 'נמצא קישור חדש (' || coalesce(NEW.subkind, NEW.kind) || '): ' || NEW.value END;
  PERFORM public.nr_put_finding(jsonb_build_object('business_id', NEW.business_id, 'source_key', NEW.sources[1], 'category', v_cat,
    'title', v_title, 'importance', v_imp, 'verification', CASE WHEN NEW.verified THEN 'verified' ELSE 'unverified' END,
    'match_method', 'existing_business', 'detail', jsonb_build_object('cp_id', NEW.id, 'kind', NEW.kind, 'value', NEW.value),
    'source_url', CASE WHEN NEW.value ~ '^https?://' THEN NEW.value END,
    'dedup_key', 'cp:' || NEW.id));
  RETURN NEW;
END;
$$;

UPDATE public.nr_findings SET match_status = 'rejected', reviewed_at = now(), updated_at = now(),
       detail = detail || '{"rejected_reason":"קישור לקובץ עיצוב/סקריפט – לא טופס יצירת קשר"}'
 WHERE category = 'new_social' AND match_status = 'matched'
   AND (detail->>'value' ~* '\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|pdf)(\?|$)' OR detail->>'value' ~* '/wp-(content|includes)/');

-- re-run the deep crawl (now with confirmation) on the sites crawled before it existed
UPDATE public.nr_businesses SET enr_site_checked_at = NULL
 WHERE id IN (SELECT DISTINCT business_id FROM public.nr_evidence WHERE source_key = 'enr:web_deep');
SELECT (SELECT count(*) FROM public.nr_findings WHERE match_status = 'rejected') rejected,
       (SELECT count(*) FROM public.nr_businesses WHERE website IS NOT NULL AND enr_site_checked_at IS NULL) sites_to_crawl;
