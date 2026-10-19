-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Sites often state their city in English (json-ld addressLocality: "Tel Aviv-Yafo", "Kfar-Saba").
-- The registry keeps Hebrew locality names, so an English city is mapped to the official Hebrew name;
-- text that is not a known locality ("Israel", a slogan) is cleared from the card and flagged "לבדיקה".
-- Nothing is deleted: the affected rows are copied to the backup schema first and the evidence keeps what the site said.
CREATE TABLE IF NOT EXISTS public.nr_city_en (en_key text PRIMARY KEY, city text NOT NULL);
REVOKE ALL ON public.nr_city_en FROM anon;
ALTER TABLE public.nr_city_en ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_city_en_select ON public.nr_city_en;
CREATE POLICY nr_city_en_select ON public.nr_city_en FOR SELECT TO authenticated USING (true);

-- key: lower case, letters only ("Tel Aviv-Yafo" → "telavivyafo")
INSERT INTO public.nr_city_en (en_key, city) VALUES
 ('telaviv','תל אביב - יפו'),('telavivyafo','תל אביב - יפו'),('telavivjaffa','תל אביב - יפו'),('jaffa','תל אביב - יפו'),('yafo','תל אביב - יפו'),
 ('jerusalem','ירושלים'),('haifa','חיפה'),('rishonlezion','ראשון לציון'),('rishonletsiyyon','ראשון לציון'),('rishonleziyyon','ראשון לציון'),
 ('petahtikva','פתח תקווה'),('petachtikva','פתח תקווה'),('petahtiqwa','פתח תקווה'),('petahtikvah','פתח תקווה'),
 ('ashdod','אשדוד'),('netanya','נתניה'),('beersheva','באר שבע'),('beersheba','באר שבע'),('beershevaa','באר שבע'),
 ('holon','חולון'),('bneibrak','בני ברק'),('bneybrak','בני ברק'),('ramatgan','רמת גן'),('batyam','בת ים'),('rehovot','רחובות'),('rechovot','רחובות'),
 ('ashkelon','אשקלון'),('herzliya','הרצליה'),('herzliyya','הרצליה'),('herzlia','הרצליה'),('kfarsaba','כפר סבא'),('kefarsava','כפר סבא'),
 ('hadera','חדרה'),('modiin','מודיעין-מכבים-רעות'),('modiinmaccabimreut','מודיעין-מכבים-רעות'),('nazareth','נצרת'),('lod','לוד'),('ramla','רמלה'),
 ('raanana','רעננה'),('rahat','רהט'),('rosh haayin','ראש העין'),('roshhaayin','ראש העין'),('givatayim','גבעתיים'),('givataim','גבעתיים'),
 ('hodhasharon','הוד השרון'),('kiryatgat','קרית גת'),('qiryatgat','קרית גת'),('kiryatata','קרית אתא'),('kiryatono','קרית אונו'),('qiryatono','קרית אונו'),
 ('kiryatmotzkin','קרית מוצקין'),('kiryatbialik','קרית ביאליק'),('kiryatyam','קרית ים'),('kiryatshmona','קרית שמונה'),('kiryatmalakhi','קרית מלאכי'),
 ('nahariya','נהריה'),('nahariyya','נהריה'),('eilat','אילת'),('elat','אילת'),('tiberias','טבריה'),('afula','עפולה'),('karmiel','כרמיאל'),
 ('yavne','יבנה'),('yavneh','יבנה'),('nesziona','נס ציונה'),('nessziona','נס ציונה'),('nesstsiyyona','נס ציונה'),
 ('ramathasharon','רמת השרון'),('ganyavne','גן יבנה'),('gedera','גדרה'),('evenyehuda','אבן יהודה'),('kadimazoran','קדימה-צורן'),
 ('zichronyaakov','זכרון יעקב'),('zikhronyaaqov','זכרון יעקב'),('caesarea','קיסריה'),('yokneam','יקנעם עילית'),('yokneamillit','יקנעם עילית'),
 ('ariel','אריאל'),('maaleadumim','מעלה אדומים'),('betshemesh','בית שמש'),('beitshemesh','בית שמש'),('sderot','שדרות'),('netivot','נתיבות'),('ofakim','אופקים'),
 ('dimona','דימונה'),('arad','ערד'),('kiryatarba','קרית ארבע'),('migdalhaemek','מגדל העמק'),('nofhagalil','נוף הגליל'),('nazarethillit','נוף הגליל'),
 ('safed','צפת'),('zefat','צפת'),('tsfat','צפת'),('akko','עכו'),('acre','עכו'),('maalot','מעלות-תרשיחא'),('shoham','שוהם'),('yehud','יהוד-מונוסון'),
 ('orakiva','אור עקיבא'),('oryehuda','אור יהודה'),('azor','אזור'),('kiryatekron','קרית עקרון'),('mazkeret batya','מזכרת בתיה'),('mazkeretbatya','מזכרת בתיה'),
 ('pardeshanna','פרדס חנה-כרכור'),('pardeshannakarkur','פרדס חנה-כרכור'),('binyamina','בנימינה-גבעת עדה'),('tiratcarmel','טירת כרמל'),('tirathakarmel','טירת כרמל'),
 ('nesher','נשר'),('roshpina','ראש פינה'),('rosh pinna','ראש פינה'),('roshpinna','ראש פינה'),('katzrin','קצרין'),('qazrin','קצרין'),
 ('beitshean','בית שאן'),('umm alfahm','אום אל-פחם'),('ummalfahm','אום אל-פחם'),('sakhnin','סח''נין'),('tayibe','טייבה'),('tira','טירה'),
 ('elad','אלעד'),('beitarillit','ביתר עילית'),('modiinillit','מודיעין עילית'),('savyon','סביון'),('kfarshmaryahu','כפר שמריהו'),('ganeitikva','גני תקווה'),
 ('airport city','איירפורט סיטי'),('airportcity','איירפורט סיטי'),('kfaryona','כפר יונה'),('tzurhadassah','צור הדסה'),('mevasseret','מבשרת ציון'),('mevasseretzion','מבשרת ציון'),
 ('haogen','העוגן'),('usha','אושה'),('einiron','עין עירון'),('niram','ניר עם'),('ganshmuel','גן שמואל'),('shefayim','שפיים'),('maagan michael','מעגן מיכאל'),('maaganmichael','מעגן מיכאל')
ON CONFLICT (en_key) DO NOTHING;
-- only keep keys whose Hebrew name is a real locality in the official list (protects against a typo above)
DELETE FROM public.nr_city_en e WHERE NOT EXISTS (SELECT 1 FROM public.nr_localities l WHERE l.city = e.city);

CREATE OR REPLACE FUNCTION public.nr_city_from_en(p_city text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT city FROM public.nr_city_en WHERE en_key = regexp_replace(lower(coalesce(p_city, '')), '[^a-z]', '', 'g');
$$;
GRANT EXECUTE ON FUNCTION public.nr_city_from_en(text) TO authenticated, service_role;

-- backup, then fix the cards created by site identification
CREATE SCHEMA IF NOT EXISTS nr_backup_20261019b;
CREATE TABLE IF NOT EXISTS nr_backup_20261019b.city_en_fix AS
  SELECT id, name, city, city_norm, district FROM public.nr_businesses WHERE false;
INSERT INTO nr_backup_20261019b.city_en_fix
  SELECT id, name, city, city_norm, district FROM public.nr_businesses b
   WHERE b.sources[1] = 'enr:site_identify' AND b.city ~ '[A-Za-z]' AND NOT EXISTS (SELECT 1 FROM nr_backup_20261019b.city_en_fix x WHERE x.id = b.id);

WITH m AS (
  SELECT b.id, b.city old_city, public.nr_city_from_en(b.city) he FROM public.nr_businesses b
   WHERE b.sources[1] = 'enr:site_identify' AND b.city ~ '[A-Za-z]'
), fixed AS (
  UPDATE public.nr_businesses b SET city = m.he, city_norm = NULL, updated_at = now() FROM m WHERE b.id = m.id AND m.he IS NOT NULL RETURNING b.id
), cleared AS (
  UPDATE public.nr_businesses b SET city = NULL, city_norm = NULL, district = NULL, updated_at = now() FROM m WHERE b.id = m.id AND m.he IS NULL RETURNING b.id, m.old_city
)
INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'זיהוי אתר: העיר באתר "' || old_city || '" אינה יישוב מוכר ולכן לא נשמרה בכרטיס – יש לבדוק' FROM cleared
ON CONFLICT (business_id, mark) DO NOTHING;

INSERT INTO public.nr_marks (business_id, mark, note)
SELECT id, 'review', 'זיהוי אתר: שם העסק נראה כטקסט כללי מהאתר – יש לבדוק' FROM public.nr_businesses
 WHERE sources[1] = 'enr:site_identify' AND name ~* '^(share by|share|שתף)$'
ON CONFLICT (business_id, mark) DO NOTHING;

SELECT (SELECT count(*) FROM public.nr_city_en) mapped_names,
       (SELECT count(*) FROM nr_backup_20261019b.city_en_fix) backed_up,
       (SELECT count(*) FROM public.nr_businesses WHERE sources[1] = 'enr:site_identify' AND city ~ '[A-Za-z]') english_left,
       (SELECT json_agg(x) FROM (SELECT b.id, f.city before, b.city after FROM nr_backup_20261019b.city_en_fix f JOIN public.nr_businesses b USING (id) ORDER BY b.id) x) changes;
