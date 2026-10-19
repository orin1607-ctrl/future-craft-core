-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Industry / profession classification of every business in the national registry (same table, no copies).
--  * one taxonomy (nr_industries): main industry → sub-industry → profession, each with the words that identify it
--  * a business may belong to several sub-industries; each assignment keeps its basis:
--      sector   – the sector / activity text that came with the business from its source (licence, register, OSM tag)
--      corp     – the legal form (עמותה / חל"צ / אגודה שיתופית חקלאית)
--      name     – an explicit profession word in the registered name ("עורכי דין", "רו"ח", "הובלות")
--    nothing is inferred beyond these; a business with no basis is "unclassified" (לא מסווג)
--  * classification never filters or deletes businesses; the 7 lead rules stay separate (Dalia leads only)
--  * new and changed businesses are classified automatically every few minutes (cron nr-classify)
CREATE TABLE IF NOT EXISTS public.nr_industries (
  code text PRIMARY KEY,
  main_code text NOT NULL,
  main_label text NOT NULL,
  sub_label text NOT NULL,
  profession text,
  sort int NOT NULL DEFAULT 100,
  pat text,        -- matched against sector + activity text
  name_pat text    -- matched against the business name (explicit profession words only)
);
ALTER TABLE public.nr_industries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_industries_read ON public.nr_industries;
CREATE POLICY nr_industries_read ON public.nr_industries FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.nr_industries FROM anon;

TRUNCATE public.nr_industries;
INSERT INTO public.nr_industries (code, main_code, main_label, sub_label, profession, sort, pat, name_pat) VALUES
-- משפט
('law', 'legal', 'עורכי דין ומשפט', 'משרדי עורכי דין ונוטריונים', 'עורך דין', 10,
  $p$עורכ(י|ת)? דין|עו"ד|עוה"ד|נוטריון|ייעוץ משפטי|שירותים משפטיים|law firm|attorney|lawyer$p$,
  $p$עורכי? דין|עו"ד|עוה"ד|נוטריון|law offices?|advocates|attorneys$p$),
-- ראיית חשבון
('acc', 'accounting', 'רואי חשבון ויועצי מס', 'ראיית חשבון, הנהלת חשבונות ומיסים', 'רואה חשבון / יועץ מס', 20,
  $p$רואי? חשבון|רו"ח|ראיית חשבון|הנהלת חשבונות|יועצ(י)? מס|ייעוץ מס|חשבונאות|accountant|accounting|cpa$p$,
  $p$רואי? חשבון|רו"ח|הנהלת חשבונות|יועצי? מס|cpa$p$),
-- בנייה
('con_build', 'construction', 'קבלנים ובנייה', 'קבלני בניין ושיפוצים', 'קבלן', 30,
  $p$בני(י)?ה|בניין|בנין|קבלנ|שיפוצ|בנאי|קונסטרוקצ|construction$p$,
  $p$בני(י)?ה|בניין|בנין|קבלנות|קבלני|שיפוצים|construction|builders$p$),
('con_infra', 'construction', 'קבלנים ובנייה', 'תשתיות, כבישים ועבודות עפר', 'קבלן תשתיות', 31,
  $p$תשתי|עבודות עפר|עפר|כביש|סליל|גשר|ניקוז|ביוב|צנרת|חפיר|פיתוח שטח$p$,
  $p$תשתיות|עבודות עפר|כבישים|סלילה|חפירות$p$),
('con_trades', 'construction', 'קבלנים ובנייה', 'מקצועות הבנייה – חשמל, אינסטלציה, מיזוג, גמר', 'בעל מקצוע', 32,
  $p$חשמלאי|עבודות חשמל|אינסטלצ|שרברב|מיזוג אוויר|מיזוג אויר|מעליות|איטום|ריצוף|גבס|אלומיניום|נגרות|זגגות$p$,
  $p$אינסטלציה|מיזוג אוויר|מעליות|איטום|אלומיניום|נגרות|זגגות$p$),
-- הובלות ולוגיסטיקה
('tr_haul', 'transport', 'הובלות, לוגיסטיקה ותחבורה', 'הובלות, משאיות ומנופים', 'מוביל', 40,
  $p$הובל|משאי|שינוע|גריר|מנוף|היסעים והובלות$p$,
  $p$הובלות|הובלה|שינוע|משאיות|מנופים|גרירה|גרר$p$),
('tr_pass', 'transport', 'הובלות, לוגיסטיקה ותחבורה', 'הסעות, אוטובוסים ומוניות', 'מפעיל הסעות', 41,
  $p$הסעה|הסעות|היסעים|אוטובוס|מונית|מוניות|תחבורה ציבורית$p$,
  $p$הסעות|היסעים|אוטובוסים|מוניות|תחבורה$p$),
('tr_courier', 'transport', 'הובלות, לוגיסטיקה ותחבורה', 'שליחויות ודואר', 'שליחויות', 42,
  $p$שליחויות|בלדר|שירותי דואר|courier$p$,
  $p$שליחויות|משלוחים|courier|express$p$),
('tr_logi', 'transport', 'הובלות, לוגיסטיקה ותחבורה', 'לוגיסטיקה, אחסנה, הפצה ושילוח', 'לוגיסטיקה', 43,
  $p$לוגיסט|הפצה|מחסנ|אחסנה|שילוח|עמיל(ות)? מכס|logistic|warehous|freight$p$,
  $p$לוגיסטיקה|הפצה|שילוח|logistics|freight|עמילות מכס$p$),
-- תעשייה
('ind_food', 'industry', 'מפעלים ותעשייה', 'תעשיית מזון ומשקאות', 'יצרן מזון', 50,
  $p$תעשיית מזון|מפעל מזון|ייצור מזון|תעשיית מזון ומשקאות|מחלב|ייצור משקאות$p$,
  $p$מחלבות|תעשיות מזון|מזון בע$p$),
('ind_metal', 'industry', 'מפעלים ותעשייה', 'מתכת, מכונות ומסגרות', 'מפעל מתכת', 51,
  $p$מתכת|מתכות|עבודות מסגרות|מסגריה|ריתוך|חריטה|יציקה|פלדה$p$,
  $p$מתכת|מסגרות|פלדה$p$),
('ind_chem', 'industry', 'מפעלים ותעשייה', 'כימיה, פלסטיק ופרמצבטיקה', 'מפעל כימי', 52,
  $p$תעשייה כימית|כימיק|פלסטיק|גומי|דשנים|פרמצבט$p$,
  $p$כימיקלים|כימיה|פלסטיק|pharma$p$),
('ind_print', 'industry', 'מפעלים ותעשייה', 'דפוס ואריזה', 'בית דפוס', 53,
  $p$דפוס|אריזה|אריזות|קרטון$p$,
  $p$דפוס|אריזות$p$),
('ind_general', 'industry', 'מפעלים ותעשייה', 'ייצור ותעשייה – כללי', 'מפעל', 59,
  $p$תעשי|מפעל|ייצור|יצרנ|manufactur|factory$p$,
  $p$תעשיות|מפעלי|industries|manufacturing$p$),
-- רכב
('auto_garage', 'automotive', 'מוסכים וענף הרכב', 'מוסכים, מכוני רישוי, פחחות וצמיגים', 'מוסך', 60,
  $p$מוסך|מכון רישוי|מכוני רישוי|car_repair|פחחות|צמיג|car_wash|שטיפת רכב$p$,
  $p$מוסך|פחחות|צמיגים|garage$p$),
('auto_trade', 'automotive', 'מוסכים וענף הרכב', 'סחר, יבוא וחלפים לרכב', 'סוחר רכב', 61,
  $p$סחר, יבוא וייצור מוצרי תעבורה|יבוא רכב|סוכנות רכב|shop=car$|shop=car_parts|חלפים|חלקי חילוף$p$,
  $p$מוטורס|motors|חלפים$p$),
('auto_rental', 'automotive', 'מוסכים וענף הרכב', 'השכרת רכב וליסינג', 'ליסינג / השכרה', 62,
  $p$השכרת רכב|ליסינג|car_rental|leasing$p$,
  $p$ליסינג|השכרת רכב|rent a car|leasing$p$),
('auto_driving', 'automotive', 'מוסכים וענף הרכב', 'בתי ספר לנהיגה', 'מורה נהיגה', 63,
  $p$בית ספר לנהיגה|בתי ספר לנהיגה|לימוד נהיגה|driving_school$p$,
  $p$לימוד נהיגה|בית ספר לנהיגה$p$),
-- אנרגיה
('en_fuel', 'energy', 'אנרגיה, דלק וסביבה', 'דלק ותחנות תדלוק', 'תחנת דלק', 70,
  $p$דלק ותחנות תדלוק|תחנת דלק|תחנות דלק|תדלוק|amenity=fuel$p$,
  $p$דלקן|פטרוליום|petrol$p$),
('en_power', 'energy', 'אנרגיה, דלק וסביבה', 'חשמל ואנרגיה מתחדשת', 'אנרגיה', 71,
  $p$סולאר|אנרגיה מתחדשת|פוטו.?וולט|solar$p$,
  $p$אנרגיה|סולאר|solar|energy$p$),
('en_env', 'energy', 'אנרגיה, דלק וסביבה', 'פסולת, מיחזור והנדסת סביבה', 'סביבה ומיחזור', 72,
  $p$פסולת|מיחזור|אסבסט|הנדסת סביבה|שפכים|recycling$p$,
  $p$מיחזור|recycling|פסולת$p$),
-- הייטק
('ht_software', 'hitech', 'הייטק וטכנולוגיה', 'תוכנה ואפליקציות', 'חברת תוכנה', 80,
  $p$תוכנה|בתי תוכנה|software|אפליקצי|saas$p$,
  $p$software|תוכנה$p$),
('ht_tech', 'hitech', 'הייטק וטכנולוגיה', 'טכנולוגיה, סייבר, מחשוב ותקשורת', 'חברת טכנולוגיה', 81,
  $p$טכנולוג|הייטק|היי.?טק|סייבר|cyber|מחשוב|תקשורת, הנדסה ומחשוב|מחקר~ מדע וטכנולוגיה|אלקטרוניק$p$,
  $p$טכנולוגיות|technologies|cyber|סייבר|מחשוב|דיגיטל|digital$p$),
-- רפואה
('h_clinic', 'health', 'רפואה ובריאות', 'מרפאות, רופאים ובריאות', 'רופא / מרפאה', 90,
  $p$מרפא|רופא|רפוא|קליניק|clinic|doctors|בריאות|כירורג|הצלת חיים|hospital|בית חולים|healthcare$p$,
  $p$מרפאה|מרפאת|קליניקה|ד"ר|רפואה|medical|clinic$p$),
('h_dental', 'health', 'רפואה ובריאות', 'רפואת שיניים', 'רופא שיניים', 91,
  $p$שיניים|dentist|אורתודונט$p$,
  $p$שיניים|dental$p$),
('h_pharm', 'health', 'רפואה ובריאות', 'בתי מרקחת', 'רוקח', 92,
  $p$מרקחת|pharmacy$p$,
  $p$בית מרקחת|pharm$p$),
('h_therapy', 'health', 'רפואה ובריאות', 'פסיכולוגיה, פיזיותרפיה וטיפול', 'מטפל', 93,
  $p$פסיכולוג|פיזיותרפ|ריפוי בעיסוק|קלינא|טיפול רגשי|psycholog|physiotherap$p$,
  $p$פסיכולוג|פיזיותרפיה$p$),
('h_vet', 'health', 'רפואה ובריאות', 'וטרינריה', 'וטרינר', 94,
  $p$וטרינר|veterinary$p$,
  $p$וטרינר$p$),
-- מסחר
('r_grocery', 'retail', 'מסחר, חנויות ורשתות', 'מכולות, מרכולים וסופרמרקטים', 'מכולת / סופר', 100,
  $p$מרכול|מכולת|סופרמרקט|מצרכי מזון|ממכר מזון|supermarket|convenience$p$,
  $p$מרכול|מכולת|מינימרקט|סופרמרקט$p$),
('r_fashion', 'retail', 'מסחר, חנויות ורשתות', 'ביגוד, הנעלה, אופנה ותכשיטים', 'חנות אופנה', 101,
  $p$ביגוד|הלבשה|הנעלה|נעליים|אופנה|תכשיט|shop=clothes|shop=shoes|shop=jewelry$p$,
  $p$אופנה|fashion|נעליים|תכשיטים$p$),
('r_electric', 'retail', 'מסחר, חנויות ורשתות', 'חשמל, אלקטרוניקה וסלולר', 'חנות חשמל', 102,
  $p$מכשירי חשמל|סלולר|shop=electronics|shop=mobile_phone$p$,
  $p$סלולר|אלקטריק$p$),
('r_home', 'retail', 'מסחר, חנויות ורשתות', 'ריהוט, בית וחומרי בניין', 'חנות לבית', 103,
  $p$רהיט|furniture|כלי בית|מוצרי בית|shop=hardware|shop=doityourself|חומרי בניין$p$,
  $p$רהיטים|furniture$p$),
('r_wholesale', 'retail', 'מסחר, חנויות ורשתות', 'יבוא, סיטונאות ושיווק', 'יבואן / סיטונאי', 104,
  $p$יבוא|סיטונ|import|wholesale|שיווק והפצה$p$,
  $p$יבוא|יבואן|import|trading|סחר$p$),
('r_general', 'retail', 'מסחר, חנויות ורשתות', 'חנויות ומסחר קמעונאי – כללי', 'חנות', 109,
  $p$חנות|מסחר קמעונאי|shop=|קמעונא|retail|^מסחר($|[ |])$p$,
  $p$חנות|store|shop$p$),
-- נדל"ן
('re_dev', 'realestate', 'נדל"ן', 'יזמות, השקעות ונכסים', 'יזם נדל"ן', 110,
  $p$נדל"ן|נדלן|יזמות|real estate|מקרקעין|שיכון ופיתוח|^שיכון($|[ |])$p$,
  $p$נדל"ן|נדלן|נכסים|יזמות|מקרקעין|real estate|properties$p$),
('re_broker', 'realestate', 'נדל"ן', 'תיווך נדל"ן', 'מתווך', 111,
  $p$תיווך|מתווכ|real_estate_agent|office=estate_agent$p$,
  $p$תיווך|רימקס|re/max$p$),
('re_mgmt', 'realestate', 'נדל"ן', 'ניהול נכסים ובתים משותפים', 'ניהול נכסים', 112,
  $p$ניהול נכסים|ניהול בתים משותפים|ניהול מבנים|אחזקת מבנים$p$,
  $p$ניהול נכסים|ניהול מבנים$p$),
-- מזון ומסעדנות
('f_rest', 'food', 'מזון ומסעדנות', 'מסעדות ובתי אוכל', 'מסעדה', 120,
  $p$מסעד|בית אוכל|בתי אוכל|מזנון|restaurant|fast_food|food_court|פיצרי|שווארמ|פלאפל|סושי$p$,
  $p$מסעדה|מסעדת|פיצה|פיצרייה|שווארמה|פלאפל|סושי|burger|ביסטרו$p$),
('f_cafe', 'food', 'מזון ומסעדנות', 'בתי קפה, ברים וגלידריות', 'בית קפה', 121,
  $p$בית קפה|בתי קפה|amenity=cafe|amenity=bar|amenity=pub|ice_cream|גלידה$p$,
  $p$קפה|cafe|coffee|גלידה$p$),
('f_bakery', 'food', 'מזון ומסעדנות', 'מאפיות וקונדיטוריות', 'מאפייה', 122,
  $p$מאפי|מאפה|קונדיטור|bakery$p$,
  $p$מאפיית|מאפייה|bakery|קונדיטוריה$p$),
('f_catering', 'food', 'מזון ומסעדנות', 'קייטרינג ואירועים', 'קייטרינג', 123,
  $p$קייטרינג|catering|אולם אירועים|אולמות אירועים$p$,
  $p$קייטרינג|catering|אירועים$p$),
-- אבטחה וניקיון
('s_guard', 'security', 'אבטחה, ניקיון וכוח אדם', 'אבטחה ושמירה', 'חברת אבטחה', 130,
  $p$אבטח|שירותי שמירה|חברת שמירה|שמירה ואבטחה|כוח אדם, שמירה|security|מוקד ביטחון$p$,
  $p$אבטחה|שמירה|security$p$),
('s_clean', 'security', 'אבטחה, ניקיון וכוח אדם', 'ניקיון, הדברה ואחזקה', 'חברת ניקיון', 131,
  $p$ניקיון|ניקוי|cleaning|הדברה$p$,
  $p$ניקיון|cleaning|הדברה$p$),
('s_staff', 'security', 'אבטחה, ניקיון וכוח אדם', 'כוח אדם והשמה', 'חברת כוח אדם', 132,
  $p$כוח אדם|השמה|staffing$p$,
  $p$כוח אדם|השמה|staffing$p$),
-- שירותים מקצועיים
('p_eng', 'professional', 'שירותים מקצועיים', 'הנדסה, אדריכלות ומדידות', 'מהנדס / אדריכל', 140,
  $p$הנדס|אדריכל|מהנדס|מדידות|engineering|architect|שמאות$p$,
  $p$הנדסה|אדריכל|מהנדסים|engineering|architects|מדידות$p$),
('p_consult', 'professional', 'שירותים מקצועיים', 'ייעוץ וניהול', 'יועץ', 141,
  $p$ייעוץ עסקי|ייעוץ ניהולי|ייעוץ הנדסי|ייעוץ ארגוני|consult|ניהול פרויקטים$p$,
  $p$ייעוץ|יעוץ|consulting|consultants$p$),
('p_marketing', 'professional', 'שירותים מקצועיים', 'שיווק, פרסום, מדיה ועיצוב', 'פרסום ושיווק', 142,
  $p$פרסום|שיווק דיגיטלי|יחסי ציבור|advertis|marketing|הפקות|צילום|עיצוב גרפי$p$,
  $p$פרסום|מדיה|media|marketing|הפקות|סטודיו|studio$p$),
('p_finance', 'professional', 'שירותים מקצועיים', 'פיננסים, ביטוח והשקעות', 'פיננסים / ביטוח', 143,
  $p$ביטוח|insurance|פיננס|השקעות|אשראי|הלוואות|בנקאות|קופת תגמולים|גמל ופנסיה|שוקי הון|ניהול תיקים$p$,
  $p$ביטוח|insurance|השקעות|פיננס|finance|capital|קפיטל|ניהול הון$p$),
('p_personal', 'professional', 'שירותים מקצועיים', 'שירותים אישיים – מספרות וקוסמטיקה', 'מספרה / קוסמטיקה', 144,
  $p$מספר(ה|ות)|עיצוב שיער|קוסמטיק|hairdresser|beauty|ציפורניים|ספא$p$,
  $p$עיצוב שיער|מספרה|קוסמטיקה|beauty$p$),
('p_general', 'professional', 'שירותים מקצועיים', 'שירותים מקצועיים, טכניים ואישיים – כללי', 'נותן שירות', 149,
  $p$שרותים מקצועיים|שירותים מקצועיים|משרדים$p$,
  NULL),
-- חקלאות
('a_farm', 'agriculture', 'חקלאות', 'חקלאות, משקים וגידולים', 'חקלאי', 150,
  $p$חקלא|מטע|פרדס|רפת|לול|agricultur|farm$p$,
  $p$חקלאות|מטעי|farm$p$),
('a_coop', 'agriculture', 'חקלאות', 'קיבוצים, מושבים ואגודות חקלאיות', 'אגודה חקלאית', 151,
  $p$אגודה שיתופית חקלאית|^חקלאית($|[ |])$p$,
  $p$אגודה שיתופית חקלאית|קיבוץ|מושב עובדים|כפר שיתופי$p$),
-- מוסדות ועמותות
('n_assoc', 'nonprofit', 'מוסדות ועמותות', 'עמותות וחברות לתועלת הציבור', 'עמותה', 160, NULL,
  $p$\(ע"ר\)|\(ע~ר\)|\(חל"צ\)|\(חל~צ\)$p$),
('n_religion', 'nonprofit', 'מוסדות ועמותות', 'דת וקהילה', 'מוסד דת', 161,
  $p$^דת($|[ |])|בית כנסת|בתי כנסת|ישיבה|ישיבות|מועצה דתית|שירותי דת$p$,
  $p$ישיבת|בית כנסת|^כולל|חב"ד$p$),
('n_welfare', 'nonprofit', 'מוסדות ועמותות', 'רווחה, סיוע והתנדבות', 'רווחה', 162,
  $p$רווחה|התנדבות|פילנתרופ|קהילה וחברה|דיור מוגן|ארגוני סנגור$p$,
  NULL),
('n_culture', 'nonprofit', 'מוסדות ועמותות', 'תרבות, ספורט ומורשת', 'תרבות וספורט', 163,
  $p$תרבות|אמנות|מוזאון|מוזיאון|^ספורט($|[ |])|מורשת|הנצחה|sport$p$,
  $p$תיאטרון|מוזיאון|מוזאון|תזמורת|מועדון ספורט$p$),
-- חינוך
('e_school', 'education', 'חינוך והכשרה', 'בתי ספר, גנים ומעונות', 'מוסד חינוך', 170,
  $p$^חינוך($|[ |])|בית ספר|בתי ספר|גן ילדים|גני ילדים|מעון|מעונות יום|kindergarten|amenity=school$p$,
  $p$בית ספר|מעון יום$p$),
('e_training', 'education', 'חינוך והכשרה', 'השכלה, הכשרה מקצועית ומכללות', 'הכשרה', 171,
  $p$השכלה והכשרה|הכשרה מקצועית|מכללה|college|קורסים|language_school|music_school$p$,
  $p$מכללת|מכללה|academy|אקדמיה|college$p$),
-- תיירות
('t_hotel', 'tourism', 'תיירות ואירוח', 'מלונות, צימרים ולינה', 'מלון / לינה', 180,
  $p$מלון|לינה|צימר|hotel|guest_house|hostel|אכסני|camp_site|motel$p$,
  $p$מלון|hotel|צימר|resort$p$),
('t_travel', 'tourism', 'תיירות ואירוח', 'סוכנויות נסיעות ותיירות', 'סוכן נסיעות', 181,
  $p$סוכנות נסיעות|סוכנויות נסיעות|תיירות|travel agency|tour operator$p$,
  $p$נסיעות ותיירות|תיירות|travel|tours$p$),
-- רשויות
('g_local', 'public', 'רשויות וגופים ציבוריים', 'רשויות מקומיות ותאגידים עירוניים', 'רשות', 190,
  NULL,
  $p$^עיריית|^מועצה אזורית|^מועצה מקומית|^המועצה האזורית|^המועצה המקומית$p$);

ALTER TABLE public.nr_businesses
  ADD COLUMN IF NOT EXISTS ind_codes text[],
  ADD COLUMN IF NOT EXISTS ind_main text[],
  ADD COLUMN IF NOT EXISTS ind_basis jsonb,
  ADD COLUMN IF NOT EXISTS ind_secondary text[],
  ADD COLUMN IF NOT EXISTS ind_at timestamptz;
CREATE INDEX IF NOT EXISTS nr_b_ind_main ON public.nr_businesses USING gin (ind_main);
CREATE INDEX IF NOT EXISTS nr_b_ind_codes ON public.nr_businesses USING gin (ind_codes);
CREATE INDEX IF NOT EXISTS nr_b_ind_todo ON public.nr_businesses (id) WHERE ind_at IS NULL;

-- word start: the match must start a word (an optional Hebrew prefix letter ו/ה/ב/ל/מ/ש/כ is allowed)
CREATE OR REPLACE FUNCTION public.nr_ind_rx(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT '(?:^|[^א-תa-z0-9])[והבלמשכ]{0,2}(' || p || ')' $$;

-- classify a batch of businesses (new or changed since their last classification).
-- The loop runs pattern by pattern over the whole batch so each regular expression is compiled once
-- (PostgreSQL keeps only a few compiled patterns; row-by-row matching against ~120 patterns recompiles constantly).
CREATE OR REPLACE FUNCTION public.nr_classify_batch(p_limit int DEFAULT 20000) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '280s' AS $$
DECLARE v int; r record;
BEGIN
  -- one run at a time (cron starts a run every minute; a long run must not be classified twice)
  IF NOT pg_try_advisory_xact_lock(hashtext('nr_classify_batch')) THEN RETURN jsonb_build_object('skipped', 'running'); END IF;
  -- txt = the business's own sector / main activity; act = additional activities (licence records, OSM tags, site text)
  CREATE TEMP TABLE IF NOT EXISTS _cls (id bigint PRIMARY KEY, nm text, txt text, act text, corp text) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _hits (id bigint, code text, main_code text, by_ text, hit text) ON COMMIT DROP;
  TRUNCATE _cls; TRUNCATE _hits;
  INSERT INTO _cls
  SELECT b.id, lower(b.name), lower(concat_ws(' | ', b.sector, b.main_activity)), lower(concat_ws(' | ', b.activity_text, array_to_string(b.activities, ' | '))), b.corp_type
    FROM public.nr_businesses b
   -- new / changed businesses, and any classified before the primary / secondary version (19.10.2026 11:53 UTC)
   WHERE b.ind_at IS NULL OR b.ind_at < b.updated_at OR b.ind_at < '2026-10-19 11:53:00+00'
   ORDER BY (b.ind_at IS NULL) DESC, b.id
   LIMIT p_limit;
  FOR r IN SELECT code, main_code, public.nr_ind_rx(pat) rx, public.nr_ind_rx(name_pat) nrx FROM public.nr_industries LOOP
    IF r.rx IS NOT NULL THEN
      INSERT INTO _hits SELECT c.id, r.code, r.main_code, 'sector', substring(c.txt from r.rx) FROM _cls c WHERE c.txt <> '' AND c.txt ~* r.rx;
      INSERT INTO _hits SELECT c.id, r.code, r.main_code, 'activity', substring(c.act from r.rx) FROM _cls c WHERE c.act <> '' AND c.act ~* r.rx;
    END IF;
    IF r.nrx IS NOT NULL THEN
      INSERT INTO _hits SELECT c.id, r.code, r.main_code, 'name', substring(c.nm from r.nrx) FROM _cls c WHERE c.nm ~* r.nrx;
    END IF;
  END LOOP;
  INSERT INTO _hits SELECT c.id, 'n_assoc', 'nonprofit', 'corp', c.corp FROM _cls c WHERE c.corp IN ('עמותה', 'חברה לתועלת הציבור');
  INSERT INTO _hits SELECT c.id, 'a_coop', 'agriculture', 'corp', c.corp FROM _cls c WHERE c.corp = 'אגודה שיתופית' AND (c.txt || ' ' || c.act) ~ 'חקלא';
  -- primary = the business's own sector / main activity, legal form, or a profession word in its name;
  -- additional activities (e.g. licence records attached to a large company) are secondary, unless they are all we know
  WITH agg AS (
    SELECT c.id,
           array_agg(DISTINCT h.code) FILTER (WHERE h.by_ <> 'activity') p_codes, array_agg(DISTINCT h.main_code) FILTER (WHERE h.by_ <> 'activity') p_mains,
           array_agg(DISTINCT h.code) FILTER (WHERE h.by_ = 'activity') a_codes, array_agg(DISTINCT h.main_code) FILTER (WHERE h.by_ = 'activity') a_mains,
           jsonb_agg(DISTINCT jsonb_build_object('code', h.code, 'by', h.by_, 'hit', left(btrim(h.hit, ' |'), 60))) FILTER (WHERE h.code IS NOT NULL) basis
      FROM _cls c LEFT JOIN _hits h ON h.id = c.id GROUP BY c.id
  )
  UPDATE public.nr_businesses b
     SET ind_codes = coalesce(a.p_codes, a.a_codes, '{unclassified}'),
         ind_main = coalesce(a.p_mains, a.a_mains, '{unclassified}'),
         ind_secondary = CASE WHEN a.p_codes IS NOT NULL THEN (SELECT array_agg(x) FROM unnest(a.a_codes) x WHERE x <> ALL(a.p_codes)) END,
         ind_basis = a.basis, ind_at = now()
    FROM agg a WHERE b.id = a.id;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN jsonb_build_object('classified', v, 'left', (SELECT count(*) FROM public.nr_businesses WHERE ind_at IS NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.nr_classify_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_classify_batch(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.nr_ind_rx(text) TO authenticated, service_role;

-- every minute until the registry is classified, then only new / changed businesses
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-classify'; END $$;
SELECT cron.schedule('nr-classify', '* * * * *', $cmd$ select public.nr_classify_batch(10000) $cmd$);
-- (a full re-classification is triggered by clearing ind_at in chunks of 50,000, outside this file)
