-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Correction of the locator's first test run (21.10.2026): on pages that embed HTML inside JavaScript the shared link
-- reader produced fragments ("facebook.com/&quot;]}…", "facebook.com/p", "office@x.co.il\&quot;&gt;…"), and a form on a
-- home page was saved as a contact form. Both readers are fixed. This removes ONLY values that the locator itself added
-- (source enr:social_locate) and that are malformed or not a contact page; a value that another source also reported keeps
-- its row and only loses the locator's source. Everything is copied to nr_backup_20261021 first.
CREATE TABLE IF NOT EXISTS nr_backup_20261021.social_locate_cleanup_cp AS SELECT * FROM public.nr_contact_points WHERE false;
CREATE TABLE IF NOT EXISTS nr_backup_20261021.social_locate_cleanup_biz AS SELECT id, socials, email_main, whatsapp FROM public.nr_businesses WHERE false;

CREATE TEMP TABLE bad ON COMMIT DROP AS
SELECT c.* FROM public.nr_contact_points c
 WHERE 'enr:social_locate' = ANY(c.sources)
   AND ((c.kind = 'social' AND (c.value ~ '[&;\[\]{}"\\<>]' OR c.value ~* 'facebook\.com/p/?$'))
     OR (c.kind = 'email' AND c.value !~* '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$')
     OR (c.kind = 'contact_form' AND c.value !~* '(contact|צור|קשר|%d7%a6%d7%95%d7%a8|%d7%a6%d7%a8%d7%95|%d7%a7%d7%a9%d7%a8|kesher|pniot|פניות)'));

INSERT INTO nr_backup_20261021.social_locate_cleanup_cp SELECT * FROM bad;
INSERT INTO nr_backup_20261021.social_locate_cleanup_biz
  SELECT b.id, b.socials, b.email_main, b.whatsapp FROM public.nr_businesses b WHERE b.id IN (SELECT business_id FROM bad);

-- values the locator alone reported: removed; values others also reported: keep the row, drop only the locator's source
DELETE FROM public.nr_contact_points c USING bad WHERE c.id = bad.id AND cardinality(bad.sources) = 1;
UPDATE public.nr_contact_points c SET sources = array_remove(c.sources, 'enr:social_locate') FROM bad WHERE c.id = bad.id AND cardinality(bad.sources) > 1;

-- card fields that took one of the removed values
UPDATE public.nr_businesses b SET
  socials = (SELECT coalesce(jsonb_object_agg(k, v), '{}') FROM jsonb_each_text(b.socials) e(k, v)
              WHERE NOT EXISTS (SELECT 1 FROM bad WHERE bad.business_id = b.id AND cardinality(bad.sources) = 1 AND lower(rtrim(e.v, '/')) = bad.value)),
  email_main = CASE WHEN EXISTS (SELECT 1 FROM bad WHERE bad.business_id = b.id AND bad.kind = 'email' AND cardinality(bad.sources) = 1 AND lower(b.email_main) = bad.value)
                    THEN (SELECT c.value FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'email' ORDER BY c.verified DESC, c.id LIMIT 1) ELSE b.email_main END,
  updated_at = now()
 WHERE b.id IN (SELECT business_id FROM bad);

SELECT (SELECT count(*) FROM nr_backup_20261021.social_locate_cleanup_cp) backed_up,
       (SELECT json_agg(json_build_object('kind', kind, 'v', left(value, 70))) FROM nr_backup_20261021.social_locate_cleanup_cp) removed;
