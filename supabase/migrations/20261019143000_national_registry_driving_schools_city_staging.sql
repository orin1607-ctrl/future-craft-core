-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Driving schools came without a city field (the licence area is not the school's city): the city is read from the
-- address with the official locality list. Two cards with the same name, city and street address are the same school
-- listed under two licence areas – they are flagged "לבדיקה" for a merge decision, nothing is deleted.
UPDATE public.nr_businesses b SET city = c, updated_at = now()
  FROM (SELECT id, public.nr_city_in_text(regexp_replace(address, '\mת\s?א\M|ת"א', 'תל אביב', 'g')) c FROM public.nr_businesses
         WHERE sources[1] = 'dgov:driving_schools' AND city IS NULL AND address IS NOT NULL) x
 WHERE b.id = x.id AND x.c IS NOT NULL;

WITH d AS (
  SELECT b.id, min(b.id) OVER (PARTITION BY lower(b.name), b.city, regexp_replace(coalesce(b.address, ''), '[^א-ת0-9]', '', 'g')) keep_id,
         count(*) OVER (PARTITION BY lower(b.name), b.city, regexp_replace(coalesce(b.address, ''), '[^א-ת0-9]', '', 'g')) n
    FROM public.nr_businesses b WHERE b.sources[1] = 'dgov:driving_schools'
)
INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'בית ספר לנהיגה: אותו שם וכתובת כמו כרטיס ' || keep_id || ' – כנראה אותו בית ספר בשני אזורי רישוי, למיזוג לאחר בדיקה'
  FROM d WHERE n > 1 AND id <> keep_id
ON CONFLICT (business_id, mark) DO NOTHING;

SELECT (SELECT count(*) FROM public.nr_businesses WHERE sources[1] = 'dgov:driving_schools') schools,
       (SELECT count(*) FROM public.nr_businesses WHERE sources[1] = 'dgov:driving_schools' AND city IS NOT NULL) with_city,
       (SELECT count(*) FROM public.nr_marks WHERE note LIKE 'בית ספר לנהיגה: אותו שם וכתובת%') flagged_same,
       (SELECT count(*) FROM (SELECT lower(name), city FROM public.nr_businesses WHERE id > 539326 GROUP BY 1, 2 HAVING count(*) > 1) d) name_city_pairs_left;
