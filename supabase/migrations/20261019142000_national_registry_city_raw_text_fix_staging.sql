-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Cards created by site identification whose city is raw address text ("חיפה בWaze)", "קומת כניסה)") instead of an official
-- locality name: a single clear locality in that text replaces it; anything else is cleared and the card flagged "לבדיקה".
-- (nr_cities_in_text no longer reads everyday words such as "אזור" / "מגדל" / "כרמל" as localities.) Backup first.
CREATE TABLE IF NOT EXISTS nr_backup_20261019b.city_raw_fix AS SELECT id, name, city, city_norm, district FROM public.nr_businesses WHERE false;
WITH c AS (
  SELECT b.id, b.city, public.nr_cities_in_text(b.city) m FROM public.nr_businesses b
   WHERE b.sources[1] = 'enr:site_identify' AND b.city IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.nr_localities l WHERE l.city = b.city)
), bk AS (
  INSERT INTO nr_backup_20261019b.city_raw_fix SELECT b.id, b.name, b.city, b.city_norm, b.district FROM public.nr_businesses b JOIN c USING (id)
   WHERE NOT EXISTS (SELECT 1 FROM nr_backup_20261019b.city_raw_fix x WHERE x.id = b.id) RETURNING id
), mapped AS (
  UPDATE public.nr_businesses b SET city = c.m[1], city_norm = NULL, updated_at = now() FROM c WHERE b.id = c.id AND cardinality(c.m) = 1 RETURNING b.id
), cleared AS (
  UPDATE public.nr_businesses b SET city = NULL, city_norm = NULL, district = NULL, updated_at = now() FROM c WHERE b.id = c.id AND cardinality(c.m) <> 1 RETURNING b.id, c.city old_city
)
INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'זיהוי אתר: העיר באתר "' || old_city || '" אינה שם יישוב ברור – הוסרה מהכרטיס, יש לבדוק' FROM cleared
ON CONFLICT (business_id, mark) DO NOTHING;
SELECT (SELECT count(*) FROM nr_backup_20261019b.city_raw_fix) backed_up,
       (SELECT json_agg(json_build_object('before', f.city, 'after', b.city)) FROM nr_backup_20261019b.city_raw_fix f JOIN public.nr_businesses b USING (id)) changes;
