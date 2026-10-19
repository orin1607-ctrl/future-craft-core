-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Enrichment quality, round 3:
--  * a website listed for 3+ businesses (regional cooperative, brand / chain site) is not used to enrich any single one of them;
--    what was already taken from such sites is reverted (copied first to nr_backup_20261019.enr_reverted_*)
--  * a town name is never stored as a business person (e.g. "באקה אל גרביה – בעלים")

DROP FUNCTION IF EXISTS public.nr_claim_sites(int);
CREATE FUNCTION public.nr_claim_sites(p_limit int)
RETURNS TABLE(id bigint, name text, name_en text, reg_id_type text, website text, phones text[], emails text[], city text, shared_by int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_businesses b SET enr_site_checked_at = now()
     WHERE b.id IN (SELECT x.id FROM public.nr_businesses x WHERE x.website IS NOT NULL AND x.enr_site_checked_at IS NULL ORDER BY x.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.name, b.name_en, b.reg_id_type, b.website, b.city)
  SELECT c.id, c.name, c.name_en, c.reg_id_type, c.website,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'email'), c.city,
         (SELECT count(*)::int FROM public.nr_businesses o
           WHERE regexp_replace(lower(o.website), '^https?://(www\.)?([^/]+).*$', '\2') = regexp_replace(lower(c.website), '^https?://(www\.)?([^/]+).*$', '\2'))
    FROM c;
$$;
REVOKE ALL ON FUNCTION public.nr_claim_sites(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_sites(int) TO service_role;
CREATE INDEX IF NOT EXISTS nr_b_website_host ON public.nr_businesses ((regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2'))) WHERE website IS NOT NULL;

-- town names are not people (website enrichment only; official sources are not filtered here)
CREATE OR REPLACE FUNCTION public.nr_people_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source_key LIKE 'enr:%' AND EXISTS (SELECT 1 FROM public.nr_localities l WHERE l.city_norm = public.nr_norm_city(NEW.full_name)) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nr_people_guard_trg ON public.nr_people;
CREATE TRIGGER nr_people_guard_trg BEFORE INSERT ON public.nr_people FOR EACH ROW EXECUTE FUNCTION public.nr_people_guard();

-- ── revert what came from shared sites, and town-name "people" ──
CREATE TEMP TABLE sh_biz AS
  SELECT b.id AS business_id FROM public.nr_businesses b
   WHERE b.id IN (SELECT business_id FROM public.nr_evidence WHERE source_key = 'enr:web_deep')
     AND (SELECT count(*) FROM public.nr_businesses o WHERE regexp_replace(lower(o.website), '^https?://(www\.)?([^/]+).*$', '\2')
                                                       = regexp_replace(lower(b.website), '^https?://(www\.)?([^/]+).*$', '\2')) >= 3;
CREATE TEMP TABLE sh_cp AS SELECT cp.* FROM public.nr_contact_points cp JOIN sh_biz USING (business_id) WHERE cp.sources = ARRAY['enr:web_deep'];
CREATE TEMP TABLE sh_people AS
  SELECT p.* FROM public.nr_people p WHERE p.source_key = 'enr:web_deep'
     AND (p.business_id IN (SELECT business_id FROM sh_biz)
          OR EXISTS (SELECT 1 FROM public.nr_localities l WHERE l.city_norm = public.nr_norm_city(p.full_name)));
INSERT INTO nr_backup_20261019.enr_reverted_contact_points SELECT * FROM sh_cp;
INSERT INTO nr_backup_20261019.enr_reverted_people SELECT * FROM sh_people;
UPDATE public.nr_contact_points cp SET sources = array_remove(cp.sources, 'enr:web_deep')
  FROM sh_biz WHERE cp.business_id = sh_biz.business_id AND 'enr:web_deep' = ANY(cp.sources) AND cardinality(cp.sources) > 1;
UPDATE public.nr_findings f SET match_status = 'rejected', reviewed_at = now(), updated_at = now(),
       detail = f.detail || '{"rejected_reason":"אתר משותף לכמה עסקים / שם יישוב – לא מידע על העסק הזה"}'
 WHERE f.match_status = 'matched' AND (
       (f.source_key = 'enr:web_deep' AND f.business_id IN (SELECT business_id FROM sh_biz))
    OR f.dedup_key IN (SELECT 'cp:' || id FROM sh_cp) OR f.dedup_key IN (SELECT 'person:' || id FROM sh_people));
UPDATE public.nr_businesses b SET
  phone_main = CASE WHEN regexp_replace(coalesce(b.phone_main, ''), '\D', '', 'g') IN (SELECT value FROM sh_cp WHERE sh_cp.business_id = b.id AND kind = 'phone') THEN NULL ELSE b.phone_main END,
  email_main = CASE WHEN b.email_main IN (SELECT value FROM sh_cp WHERE sh_cp.business_id = b.id AND kind = 'email') THEN NULL ELSE b.email_main END,
  socials = coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each_text(b.socials) s(k, v)
                       WHERE lower(rtrim(v, '/')) NOT IN (SELECT value FROM sh_cp WHERE sh_cp.business_id = b.id)), '{}'::jsonb)
 WHERE b.id IN (SELECT business_id FROM sh_biz);
DELETE FROM public.nr_people WHERE id IN (SELECT id FROM sh_people);
DELETE FROM public.nr_contact_points WHERE id IN (SELECT id FROM sh_cp);
SELECT public.nr_refresh_enrich(ARRAY(SELECT business_id FROM sh_biz UNION SELECT business_id FROM sh_people));
SELECT public.nr_refresh_flags(NULL, lo, lo + 1) FROM (SELECT business_id lo FROM sh_biz UNION SELECT business_id FROM sh_people) x;
SELECT (SELECT count(*) FROM sh_biz) shared_site_businesses, (SELECT count(*) FROM sh_cp) contact_points_reverted, (SELECT count(*) FROM sh_people) people_reverted;
