-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Measured test of the social locator: a fixed random sample of companies that have a phone, an e-mail and a full name,
-- in three groups (A: known website + business e-mail; B: no website, business e-mail domain; C: no website, free e-mail
-- only, English registry name). The sample list is kept so the test can be repeated and audited.
CREATE TABLE IF NOT EXISTS public.nr_social_samples (
  tag text NOT NULL, business_id bigint NOT NULL REFERENCES public.nr_businesses(id) ON DELETE CASCADE, grp text NOT NULL,
  PRIMARY KEY (tag, business_id));
ALTER TABLE public.nr_social_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_social_samples_select ON public.nr_social_samples;
CREATE POLICY nr_social_samples_select ON public.nr_social_samples FOR SELECT TO authenticated USING (public.nr_can_read());
REVOKE ALL ON public.nr_social_samples FROM anon;

WITH base AS (
  SELECT b.id, b.website, b.name_en,
         EXISTS (SELECT 1 FROM public.nr_contact_points c WHERE c.business_id = b.id AND c.kind = 'email'
                  AND c.value !~* '@(gmail|walla|hotmail|yahoo|outlook|live|icloud|me|012|netvision|bezeqint|zahav|smile|actcom|017|013|msn|aol|nana10?)\.') corp_mail
    FROM public.nr_businesses b
   WHERE b.has_phone AND b.has_email AND coalesce(b.status, '') <> 'inactive' AND length(b.name) >= 4 AND b.social_checked_at IS NULL
)
INSERT INTO public.nr_social_samples (tag, business_id, grp)
SELECT 'social_test_1', id, grp FROM (
  (SELECT id, 'A' grp FROM base WHERE website IS NOT NULL AND corp_mail ORDER BY md5(id::text || 'st1') LIMIT 40)
  UNION ALL (SELECT id, 'B' FROM base WHERE website IS NULL AND corp_mail ORDER BY md5(id::text || 'st1') LIMIT 40)
  UNION ALL (SELECT id, 'C' FROM base WHERE website IS NULL AND NOT corp_mail AND name_en IS NOT NULL ORDER BY md5(id::text || 'st1') LIMIT 40)
) s
ON CONFLICT DO NOTHING;

SELECT grp, count(*) FROM public.nr_social_samples WHERE tag = 'social_test_1' GROUP BY 1 ORDER BY 1;
