-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Enrichment correction (19.10.2026, first hour of the enrichment run).
-- Problem found in review: a website found from an e-mail domain was attached even when the page did not confirm the business
-- (example: a sole proprietor with an @histadrut.org.il address got the Histadrut site, and its leadership page produced a
-- "CEO" and "driver hiring"). From now on a site is attached only when the page shows the business's phone / exact e-mail,
-- or – for a registered company / association – its name.
-- This migration reverts ONLY what the enrichment itself added today from websites (sources enr:web_discovery / enr:web_deep,
-- and the older website crawler's additions on those reverted sites after 21:45 UTC); every removed row is copied first to
-- nr_backup_20261019.enr_reverted_*. Those sites are queued again and pass the new confirmation check.
-- Nothing collected before the enrichment run is touched.

-- the claims return the registration type (name words confirm a site only for registered companies / associations)
DROP FUNCTION IF EXISTS public.nr_claim_sites(int);
CREATE FUNCTION public.nr_claim_sites(p_limit int)
RETURNS TABLE(id bigint, name text, name_en text, reg_id_type text, website text, phones text[], emails text[], city text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_businesses b SET enr_site_checked_at = now()
     WHERE b.id IN (SELECT x.id FROM public.nr_businesses x WHERE x.website IS NOT NULL AND x.enr_site_checked_at IS NULL ORDER BY x.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING b.id, b.name, b.name_en, b.reg_id_type, b.website, b.city)
  SELECT c.id, c.name, c.name_en, c.reg_id_type, c.website,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.id AND p.kind = 'email'), c.city FROM c;
$$;
DROP FUNCTION IF EXISTS public.nr_claim_domains(int);
CREATE FUNCTION public.nr_claim_domains(p_limit int)
RETURNS TABLE(business_id bigint, domain text, name text, name_en text, reg_id_type text, phones text[], emails text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE public.nr_domain_queue q SET status = 'error', note = 'claimed', checked_at = now()
     WHERE q.business_id IN (SELECT x.business_id FROM public.nr_domain_queue x WHERE x.status = 'queued' ORDER BY x.business_id LIMIT p_limit FOR UPDATE SKIP LOCKED)
    RETURNING q.business_id, q.domain)
  SELECT c.business_id, c.domain, b.name, b.name_en, b.reg_id_type,
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.business_id AND p.kind = 'phone'),
         ARRAY(SELECT p.value FROM public.nr_contact_points p WHERE p.business_id = c.business_id AND p.kind = 'email')
    FROM c JOIN public.nr_businesses b ON b.id = c.business_id;
$$;
REVOKE ALL ON FUNCTION public.nr_claim_sites(int), public.nr_claim_domains(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_sites(int), public.nr_claim_domains(int) TO service_role;

-- ── revert ──
CREATE TEMP TABLE rv_site AS   -- websites attached by discovery (all re-checked under the new rule)
  SELECT cp.business_id, cp.value AS site FROM public.nr_contact_points cp
   WHERE cp.kind = 'website' AND cp.sources = ARRAY['enr:web_discovery'];
CREATE TEMP TABLE rv_biz AS
  SELECT business_id FROM rv_site
  UNION SELECT DISTINCT business_id FROM public.nr_evidence WHERE source_key = 'enr:web_deep';

CREATE TEMP TABLE rv_cp AS
  SELECT cp.* FROM public.nr_contact_points cp JOIN rv_biz USING (business_id)
   WHERE cp.sources <@ ARRAY['enr:web_discovery','enr:web_deep']
      OR (cp.sources = ARRAY['website_crawl'] AND cp.first_seen_at > '2026-10-18 21:45+00' AND cp.business_id IN (SELECT business_id FROM rv_site));
CREATE TEMP TABLE rv_people AS
  SELECT p.* FROM public.nr_people p JOIN rv_biz USING (business_id) WHERE p.source_key IN ('enr:web_discovery','enr:web_deep');
CREATE TEMP TABLE rv_ev AS
  SELECT e.* FROM public.nr_evidence e JOIN rv_biz USING (business_id)
   WHERE e.source_key IN ('enr:web_discovery','enr:web_deep')
      OR (e.source_key = 'website_crawl' AND e.collected_at > '2026-10-18 21:45+00' AND e.business_id IN (SELECT business_id FROM rv_site));

CREATE TABLE IF NOT EXISTS nr_backup_20261019.enr_reverted_contact_points AS SELECT * FROM public.nr_contact_points WITH NO DATA;
CREATE TABLE IF NOT EXISTS nr_backup_20261019.enr_reverted_people AS SELECT * FROM public.nr_people WITH NO DATA;
CREATE TABLE IF NOT EXISTS nr_backup_20261019.enr_reverted_evidence AS SELECT * FROM public.nr_evidence WITH NO DATA;
INSERT INTO nr_backup_20261019.enr_reverted_contact_points SELECT * FROM rv_cp;
INSERT INTO nr_backup_20261019.enr_reverted_people SELECT * FROM rv_people;
INSERT INTO nr_backup_20261019.enr_reverted_evidence SELECT * FROM rv_ev;

-- enrichment sources removed from contact points that also came from an earlier source (the earlier source stays)
UPDATE public.nr_contact_points cp SET sources = array_remove(array_remove(cp.sources, 'enr:web_discovery'), 'enr:web_deep')
  FROM rv_biz WHERE cp.business_id = rv_biz.business_id AND cp.sources && ARRAY['enr:web_discovery','enr:web_deep']
   AND NOT cp.sources <@ ARRAY['enr:web_discovery','enr:web_deep'];

UPDATE public.nr_findings f SET match_status = 'rejected', reviewed_at = now(), updated_at = now(),
       detail = f.detail || '{"rejected_reason":"האתר לא אומת כשייך לחברה – המידע ממנו בוטל ונבדק מחדש"}'
 WHERE f.match_status = 'matched' AND (
       f.dedup_key IN (SELECT 'cp:' || id FROM rv_cp) OR f.dedup_key IN (SELECT 'person:' || id FROM rv_people)
    OR (f.source_key IN ('enr:web_deep','enr:web_discovery') AND f.business_id IN (SELECT business_id FROM rv_biz)));

-- scalar fields that were filled from a reverted value go back to empty
UPDATE public.nr_businesses b SET
  website = CASE WHEN lower(rtrim(b.website, '/')) IN (SELECT value FROM rv_cp WHERE rv_cp.business_id = b.id AND kind = 'website') THEN NULL ELSE b.website END,
  phone_main = CASE WHEN regexp_replace(coalesce(b.phone_main, ''), '\D', '', 'g') IN (SELECT value FROM rv_cp WHERE rv_cp.business_id = b.id AND kind = 'phone') THEN NULL ELSE b.phone_main END,
  email_main = CASE WHEN b.email_main IN (SELECT value FROM rv_cp WHERE rv_cp.business_id = b.id AND kind = 'email') THEN NULL ELSE b.email_main END,
  socials = coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each_text(b.socials) s(k, v)
                       WHERE lower(rtrim(v, '/')) NOT IN (SELECT value FROM rv_cp WHERE rv_cp.business_id = b.id)), '{}'::jsonb),
  sources = (SELECT coalesce(array_agg(x), '{}') FROM unnest(b.sources) x WHERE x NOT IN ('enr:web_discovery','enr:web_deep')),
  enr_site_checked_at = NULL
 WHERE b.id IN (SELECT business_id FROM rv_biz);

DELETE FROM public.nr_people WHERE id IN (SELECT id FROM rv_people);
DELETE FROM public.nr_contact_points WHERE id IN (SELECT id FROM rv_cp);
DELETE FROM public.nr_evidence WHERE id IN (SELECT id FROM rv_ev);

-- re-check under the new rule
UPDATE public.nr_domain_queue SET status = 'queued', note = 'נבדק מחדש לפי כלל האימות החדש', checked_at = NULL
 WHERE status = 'found' OR business_id IN (SELECT business_id FROM rv_site);
UPDATE public.nr_sources SET records_read = 0, businesses_enriched = 0, details_added = 0, cursor = 0, status = 'collecting',
       status_reason = 'הופעל מחדש 19.10.2026 עם אימות מחמיר של שייכות האתר לחברה'
 WHERE key IN ('enr:web_discovery', 'enr:web_deep');

SELECT public.nr_refresh_enrich(ARRAY(SELECT business_id FROM rv_biz));
SELECT public.nr_refresh_flags(NULL, lo, lo + 1) FROM (SELECT business_id lo FROM rv_biz) x;
SELECT (SELECT count(*) FROM rv_biz) businesses, (SELECT count(*) FROM rv_cp) contact_points_reverted, (SELECT count(*) FROM rv_people) people_reverted,
       (SELECT count(*) FROM rv_ev) evidence_reverted, (SELECT count(*) FROM public.nr_domain_queue WHERE status = 'queued') domains_queued;
