# חבילת פריסה ל-Production — שדות תחקיר בשאלון התאונה

סטטוס: **מוכנה, לא פורסמה.** אין push, אין deploy ואין שינוי ב-Production עד אישור מפורש לכל שלב.

## מה משתנה

| | לפני (Production חי היום) | אחרי |
|---|---|---|
| תאריך ושעת תאונה | עובד | ללא שינוי |
| האם הנהג אשם? | מוצג, נעול, לא נשמר | כן / לא / טרם נקבע — נשמר ומוצג בכרטיס |
| האם בוצע תחקיר? | מוצג, נעול, לא נשמר | כן / לא / טרם בוצע — נשמר ומוצג בכרטיס |
| מסקנות התחקיר | מוצג, נעול, לא נשמר | טקסט חופשי — נשמר ומוצג בכרטיס |

- קוד: commit `4d2a2a19` על הענף `claude/accident-investigation-fields`, מעל הגרסה החיה `3532f02d` (bundle `index-C-TPe4y3.js`).
- קבצים: `src/pages/Accidents.tsx`, `src/lib/incidentCreate.ts`, `src/lib/accidentInvestigation.ts` (+ בדיקה), שני קובצי migration.
- מסד: 3 עמודות חדשות ב-`public.accidents`, כולן nullable, בלי ערך ברירת מחדל:
  `driver_at_fault`, `investigation_done` (רק `yes` / `no` / NULL), `investigation_conclusions` (טקסט).
- **אין** שינוי ב-RLS, בהרשאות, ב-Storage, ב-Auth או בנתוני לקוחות. אין OpenProspector.
- ה-trigger `on_accident_notify_managers` רץ רק ב-INSERT, כך שעריכת תאונה לא שולחת התראות.

## מה נבדק ב-STAGING (2026-10-18)

- migration הוחל על `usfeoerkpcafxxlyuldl`. 11 התאונות הקיימות לא השתנו (טביעת md5 זהה לפני ואחרי).
- הפרדה בין לקוחות (בדיקה עם rollback): מנהל צי של "חברה 1" עדכן תאונה של החברה שלו (שורה 1), ולא הצליח לעדכן תאונה של "חברה 2" (0 שורות). ערך לא חוקי נדחה על ידי ה-constraint.
- ממשק (אפליקציה מקומית מול מסד הבדיקות): עריכת תאונת ה-QA, מילוי 3 השדות, שמירה, הצגה בכרטיס, טעינה מחדש בעריכה, ניקוי ושמירה. התאונה הוחזרה למצבה המקורי (טביעה זהה, 0 תשובות).
- 52 קובצי בדיקה / 244 בדיקות עברו, וה-build עבר.

## מצב Production לפני הפריסה (נבדק, קריאה בלבד)

- טבלת `accidents` זהה במבנה למסד הבדיקות: אותן 23 עמודות ואותן 4 מדיניות RLS לפי `company_name`. אין הרשאות ברמת עמודה.
- 16 תאונות, 6 חברות.

## סדר הפריסה — כל שלב באישור נפרד

### שלב A — גיבוי + migration במסד Production (דורש אישור מפורש)
1. גיבוי: לשמור צילום מלא של `public.accidents` (JSON של כל השורות, מספר שורות וטביעת md5) לקובץ מקומי בתיקיית `backups/`.
2. להחיל את `supabase/migrations/20261018120000_accident_investigation_fields.sql`.
3. אימות: 3 העמודות קיימות, 16 שורות, טביעת md5 של העמודות הקיימות זהה לגיבוי, ועדיין 4 מדיניות.

> שימו לב: ה-hook החדש חוסם כל קריאת Supabase ל-Production, גם במצב Bypass. כדי לבצע שלב A צריך לעשות אחד מאלה: הבעלים מריץ את ה-SQL בעצמו ב-Supabase Dashboard → SQL Editor (מומלץ), או שהבעלים משבית את ה-hook זמנית ומחזיר אותו מיד אחרי השלב.

### שלב B — פריסת ה-frontend (דורש אישור מפורש, ורק אחרי שלב A)
1. commit שמחליף את `public/project-001/oren-car-prod-accident-investigation.json` ל-`"armed": true` ול-`"owner_approved": "<תאריך>"`.
2. `git push origin claude/accident-investigation-fields`. ה-push מפעיל את `.github/workflows/oren-car-prod-accident-investigation.yml`.
3. ה-workflow מבצע אוטומטית:
   - gate: הענף הנכון, הקבצים מדויקים (8 קבצי מוצר), ולא `main` ולא `production`;
   - build עם הגדרות Production, כל הבדיקות, ובדיקה שה-bundle מכיל את Production ולא את STAGING, שהשדות החדשים בו, שהקטע הנעול הישן הוסר ושאין OpenProspector;
   - **בדיקה שהעמודות קיימות במסד Production.** אם לא — עוצר לפני כל שינוי;
   - בדיקה שהאתר החי הוא בדיוק `3532f02d` / `index-C-TPe4y3.js`;
   - גיבוי מאומת של `dist` ל-`/root/pre-deploy-dist-<STAMP>.tgz`;
   - rsync ו-reload ל-nginx;
   - אימות marker, bundle, מחרוזות ומסלולים (`/accidents` ועוד). **בכל כשל — שחזור אוטומטי מהגיבוי.**

### שלב C — בדיקה ידנית ב-dalia-car.online
פתיחת תאונה קיימת → עריכה → מילוי 3 השדות → שמירה → הצגה בכרטיס → ניקוי והחזרה, על תאונת בדיקה בלבד.

## חזרה לאחור (Rollback)

| מה | איך | מתי |
|---|---|---|
| Frontend | workflow `rollback-production-vps.yml` עם `backup_path` = נתיב ה-tgz שה-workflow הדפיס (`BACKUP=...`) | אם יש תקלה בממשק |
| מסד | **לא נדרש בדרך כלל.** עמודות nullable שהקוד הישן מתעלם מהן לא מפריעות. | — |
| מסד (רק אם חובה) | קודם לגבות את התשובות שנשמרו (הפקודה בראש קובץ ה-rollback), ואז להריץ את `20261018120000_accident_investigation_fields_rollback.sql` | רק באישור נפרד — מוחק תשובות תחקיר שנשמרו |

## אישורים נדרשים

1. ☐ שלב A — גיבוי ו-migration במסד Production (`qasomfndnjuixgjmjwcm`), ומי מריץ אותו.
2. ☐ שלב B — push לענף ופריסת ה-frontend ל-dalia-car.online.
3. ☐ שלב C — עריכת תאונת בדיקה ב-Production לאימות.

## הערות

- אתר הבדיקות (GitHub Pages) **לא** מציג כרגע את שאלון התאונה. הפריסה של `codex/garage-open-case-flow-staging` מ-2026-10-18 05:05 דרסה אותו. השינוי נבדק מקומית מול מסד הבדיקות. פריסה לאתר הבדיקות תדרוס עבודה של סוכן אחר, ולכן דורשת תיאום.
- `src/integrations/supabase/types.ts` לא היה מעודכן עוד לפני השינוי הזה (חסרות בו עמודות כמו `event_number`), ולכן לא נגעתי בו.
