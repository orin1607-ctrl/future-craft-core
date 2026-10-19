-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Quality cleanup for businesses created today by site identification:
--  * a city that is page markup ("specs…"), a single letter, or a locality not written in the site's address line is cleared
--    (it came from a footer word such as a person's name); the business is flagged "לבדיקה" with the reason
--  * a junk name ("Share by") is flagged "לבדיקה"
-- Nothing is deleted; the evidence row keeps what the site said.
WITH c AS (
  SELECT b.id, b.city, b.address FROM public.nr_businesses b
   WHERE b.sources[1] = 'enr:site_identify' AND b.reg_id IS NULL AND b.city IS NOT NULL
     AND (b.city ~ '["{}<>=;]|specs|\.' OR length(b.city) < 2
          OR (b.city !~ '^[A-Za-z]' AND (b.address IS NULL OR position(b.city IN b.address) = 0)))
), u AS (
  UPDATE public.nr_businesses b SET city = NULL, city_norm = NULL, district = NULL, updated_at = now() FROM c WHERE b.id = c.id RETURNING b.id, c.city old_city
)
INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'זיהוי אתר: העיר "' || old_city || '" לא הופיעה בכתובת באתר ולכן נמחקה מהכרטיס – יש לבדוק' FROM u
ON CONFLICT (business_id, mark) DO NOTHING;

INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'זיהוי אתר: שם העסק נראה כטקסט כללי מהאתר – יש לבדוק' FROM public.nr_businesses
 WHERE sources[1] = 'enr:site_identify' AND name ~* '^(share by|share|שתף)$'
ON CONFLICT (business_id, mark) DO NOTHING;

SELECT (SELECT count(*) FROM public.nr_marks WHERE note LIKE 'זיהוי אתר:%') flagged,
       (SELECT count(*) FROM public.nr_businesses WHERE sources[1] = 'enr:site_identify' AND reg_id IS NULL) created_by_site_identify;
