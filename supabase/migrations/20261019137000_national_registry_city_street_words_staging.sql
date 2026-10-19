-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- City detection read street words as localities:
--  * "רחוב" (street) matched the moshav רחוב; "שדרות X" (boulevard) matched the city שדרות
--  * the address-line keyword "רחוב" also matched inside "רחובות", so any page naming Rehovot got that city
-- Street phrases ("רחוב הרצל", "שד' רוטשילד") are removed before matching and the locality "רחוב" is not matched from free text.
-- Existing cards created by site identification are corrected: a city that is not stated as a locality in the site's
-- address is cleared and the card is flagged "לבדיקה". Backup first, nothing is deleted.
CREATE OR REPLACE FUNCTION public.nr_strip_street_words(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(p_text, ''), '(^|[^א-ת])(רחוב|רח[''׳]|שדרות|שד[''׳.]|סמטת|כיכר|דרך)\s+[^\s,.;:()]+', '\1 ', 'g');
$$;

CREATE OR REPLACE FUNCTION public.nr_cities_in_text(p_text text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT l.city), '{}') FROM public.nr_localities l
   WHERE length(l.city) >= 3 AND l.city <> 'רחוב'
     AND (' ' || regexp_replace(public.nr_strip_street_words(p_text), '[,.()\n:|]', ' ', 'g') || ' ') LIKE '% ' || l.city || ' %';
$$;

CREATE OR REPLACE FUNCTION public.nr_city_in_text(p_text text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.city FROM public.nr_localities l
   WHERE length(l.city) >= 3 AND l.city <> 'רחוב'
     AND (' ' || regexp_replace(public.nr_strip_street_words(p_text), '[,.()]', ' ', 'g') || ' ') LIKE '% ' || l.city || ' %'
   ORDER BY length(l.city) DESC LIMIT 1;
$$;

CREATE SCHEMA IF NOT EXISTS nr_backup_20261019b;
CREATE TABLE IF NOT EXISTS nr_backup_20261019b.city_street_fix AS
  SELECT id, name, city, city_norm, district, address FROM public.nr_businesses WHERE false;

WITH c AS (
  SELECT b.id, b.city, b.address FROM public.nr_businesses b
   WHERE b.sources[1] = 'enr:site_identify' AND b.reg_id IS NULL
     AND (b.city = 'רחוב'
       OR (b.city IN ('רחובות', 'שדרות')
           AND NOT (' ' || regexp_replace(public.nr_strip_street_words(b.address), '[,.()]', ' ', 'g') || ' ') LIKE '% ' || b.city || ' %'))
), bk AS (
  INSERT INTO nr_backup_20261019b.city_street_fix
  SELECT b.id, b.name, b.city, b.city_norm, b.district, b.address FROM public.nr_businesses b JOIN c USING (id)
   WHERE NOT EXISTS (SELECT 1 FROM nr_backup_20261019b.city_street_fix x WHERE x.id = b.id) RETURNING id
), u AS (
  UPDATE public.nr_businesses b SET city = NULL, city_norm = NULL, district = NULL, updated_at = now() FROM c WHERE b.id = c.id RETURNING b.id, c.city old_city
)
INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'זיהוי אתר: העיר "' || old_city || '" נלקחה ממילה בכתובת (רחוב / שדרות) ולא מיישוב – הוסרה מהכרטיס, יש לבדוק' FROM u
ON CONFLICT (business_id, mark) DO NOTHING;

-- an "address" that is only a label from the page ("כתובת מייל", "כתובת למשלוח") is not an address
WITH j AS (
  SELECT id, address FROM public.nr_businesses
   WHERE sources[1] = 'enr:site_identify' AND reg_id IS NULL
     AND address ~* '^\s*[-:*]?\s*(מייל|אימייל|דוא|e-?mail|למשלוח|לשליחת|המייל|מין|המרפאה:?$|הקליניקות|שליחה)'
), bk AS (
  INSERT INTO nr_backup_20261019b.city_street_fix
  SELECT b.id, b.name, b.city, b.city_norm, b.district, b.address FROM public.nr_businesses b JOIN j USING (id)
   WHERE NOT EXISTS (SELECT 1 FROM nr_backup_20261019b.city_street_fix x WHERE x.id = b.id) RETURNING id
)
UPDATE public.nr_businesses b SET address = NULL, updated_at = now() FROM j WHERE b.id = j.id;

SELECT (SELECT count(*) FROM nr_backup_20261019b.city_street_fix) backed_up,
       (SELECT count(*) FROM public.nr_marks WHERE note LIKE 'זיהוי אתר: העיר "%" נלקחה ממילה בכתובת%') flagged,
       (SELECT json_object_agg(city, c) FROM (SELECT city, count(*) c FROM public.nr_businesses WHERE sources[1] = 'enr:site_identify' AND city IN ('רחוב', 'רחובות', 'שדרות') GROUP BY 1) x) left_now,
       public.nr_cities_in_text('רחוב הרצל 5, רחובות') t1, public.nr_cities_in_text('שדרות רוטשילד 10 תל אביב') t2, public.nr_cities_in_text('הנגב 3, שדרות') t3;
