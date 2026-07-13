# תוכנית ביצוע מעודכנת — נכס מלא (אתר תדמית) תחת Multi-Asset
**תאריך:** 2026-07-13  
**סטטוס:** תכנון מאושר לסקירה — **אין ביצוע עד אישור מפורש שלך**  
**לקוח:** `dalia-c-official` · Owner OAuth: `orin1607@gmail.com`

> **ארכיטקטורה מחייבת:** [`ARCHITECTURE-MULTI-ASSET-PLATFORM-HE.md`](./ARCHITECTURE-MULTI-ASSET-PLATFORM-HE.md)  
> המערכת היא פלטפורמת **N נכסים** (ללא תקרה). אין לוגיקת «נכס ראשון/שני/שלישי».  
> «אתר התדמית החדש» הוא **מופע** של Create Asset + Connect — לא חריג ארכיטקטוני.

---

## אישור כיסוי (חובה לפני ביצוע)

אני מאשר בזאת שהתוכנית המעודכנת כוללת במפורש את **כל** החיבורים הבאים לנכס החדש (אתר התדמית) — לא ככתובת סטטית בלבד, אלא כאזרח מלא במערכת Multi-Asset:

| # | תחום | כלול בתוכנית |
|---|------|----------------|
| 1 | GA4 Property + Stream + Measurement ID + הטמעה + Realtime + פרסום + Supabase | ✅ |
| 2 | GTM Container נפרד + הטמעה + תג GA4 + Triggers/Variables + Preview + Publish | ✅ |
| 3 | GSC URL-prefix `https://dalia-car.online/site/` + אימות + Sitemap + אינדוקס + דוחות | ✅ |
| 4 | GBP — נתונים בתוך המערכת בלי שינוי URL ציבורי בפרופיל | ✅ |
| 5 | Google Ads Binding + המרות + Pending עד Basic Access → LIVE אוטומטי | ✅ |
| 6 | PageSpeed נפרד Mobile/Desktop + CWV + דוח יומי + השוואה | ✅ |
| 7 | OAuth קיים + עצירה רק אם חסרה הרשאה + Tokens מאובטחים לפי website | ✅ |
| 8 | Supabase customer/website_id + טבלאות + Edge Functions דינמיים | ✅ |
| 9 | דוח יומי + השוואת N נכסים (1 / 2 / 3 / קבוצה) + LIVE/Pending/Mock אמיתי | ✅ |
| 10 | Work Center · Control · Brief · SEO · תוכן · סינון · היסטוריה · PDF · Viewer | ✅ |
| 11 | 50 עוזרים · 10 יועצים · מנועי AI · ניתוח נפרד + השוואה לכל תת-קבוצה | ✅ |
| 12 | בדיקות חובה (Realtime, GTM, GSC, PSI, Supabase, OAuth, E2E) | ✅ |
| 13 | **ארכיטקטורת Multi-Asset ל-N בלתי מוגבל** (לא hardcode ל-2/3) | ✅ |

**מסקנה:** התוכנית מכסה נכס מלא ועצמאי — Google + נתונים + AI + דוחות — תחת פלטפורמת Multi-Asset.  
**אין התחלת ביצוע** עד שתכתוב במפורש לאשר ולהתחיל.

---

## זהות הנכס החדש (קנונית) — מופע Create Asset

| שדה | ערך |
|-----|------|
| **שם ב-UI** | אתר התדמית החדש |
| **URL קבוע** | `https://dalia-car.online/site/` |
| **asset_id** | `dalia-brand-site` |
| **website_id** | UUID חדש ב-Supabase (נוצר בשלב 8) |
| **customer_id** | אותו customer של דליה (`dalia-c-official`) |
| **תפקיד** | אתר תדמית / קידום אורגני + המרות |
| **מיקום קבצים** | תיקיית static קבועה מחוץ ל-wipe של SPA build |
| **nginx** | `location ^~ /site/` לפני SPA catch-all |
| **Redirect** | Preview ישן → `/site/` (301) אחרי אימות |

### נכסי דליה אחרי המעבר (N=3 כרגע — המערכת לא מוגבלת ל-3)

| asset_id (דוגמה) | שם | URL | סוג |
|------------------|-----|-----|-----|
| `dalia-c-com` | dalia-c.com | `https://dalia-c.com/` | אתר ראשי |
| `dalia-car-app` | אפליקציית דליה | `https://dalia-car.online/` | SPA מוצר |
| `dalia-brand-site` | **אתר התדמית החדש** | `https://dalia-car.online/site/` | תדמית — אזרח מלא |

נכס רביעי ומעלה בעתיד = אותה טבלה + אותן יכולות, בלי שינוי ארכיטקטורה.

---

## עקרון ארכיטקטורה: Multi-Asset (N) + AI מערכתית

ראו פירוט מלא: [`ARCHITECTURE-MULTI-ASSET-PLATFORM-HE.md`](./ARCHITECTURE-MULTI-ASSET-PLATFORM-HE.md)

```text
Customer (דליה)
 └── Website / Asset  × N   (website_id לכל נכס — אין first/second/third)
      ├── Google bindings (GA4/GSC/GTM/Ads/PSI/GBP-read/…)
      ├── Daily metrics + history
      └── AI context (assistants / consultants / engines)

AI Layer
 ├── single     → נכס בודד
 ├── compare    → כל תת-קבוצה (2..N)
 └── portfolio  → כל הנכסים של הלקוח
```

**חובה בביצוע:** רפקטור להסרת `primaryAsset` / `secondaryLiveAsset` / רשימות באורך קבוע — מעבר ל-`AssetRegistry` דינמי לפני/יחד עם הוספת `/site/`.

---

## שלב 0 — הכנה (חצי יום)

1. גיבוי Preview + קונפיג Orin נוכחי  
2. יצירת תיקיית static: למשל `/root/future-craft-core/site-static/`  
3. העתקת עמודי התדמית מ-`client-previews/dalia-c-official`  
4. תיקון קישורים פנימיים / canonical ל-`/site/`  
5. nginx `/site/` + בדיקת 200 (עדיין בלי 301 מ-Preview)  
6. וידוא ש-`/` נשאר SPA  

**שער יציאה:** `/site/` נטען, האפליקציה לא נשברת.

---

## שלב 1 — GA4 (מלא)

| פעולה | פירוט |
|--------|--------|
| Property נפרד | תחת חשבון COCO / `orin1607` |
| Web Data Stream | URL: `https://dalia-car.online/site/` |
| Measurement ID | `G-XXXXXXXX` חדש |
| הטמעה | בכל עמודי `/site/*.html` (דרך GTM — ראה שלב 2; או snippet זמני לבדיקה) |
| Realtime | פתיחת עמוד + וידוא hit ב-Realtime |
| פרסום UI | `coco-dalia-assets.js` + dashboard + Owner Google screen |
| Supabase | שורות `provider=google_analytics` עם `customer_id` + `website_id` של נכס 3 |

**שער יציאה:** Realtime ירוק + מזהים שמורים ב-DB.

---

## שלב 2 — GTM (מלא)

| פעולה | פירוט |
|--------|--------|
| Container נפרד | Web container לאתר התדמית |
| Snippet | בכל עמודי `/site/` (head + noscript) |
| תג GA4 | Configuration Tag → Measurement ID החדש |
| Variables | Page URL, Path, Click, Form (לפי הצורך) |
| Triggers | All Pages · (אופציונלי) Contact submit / CTA clicks |
| Preview | Tag Assistant — קונטיינר + GA4 נורים |
| Publish | רק אחרי Preview תקין |

**שער יציאה:** GTM נטען בפועל + GA4 דרך GTM ב-Realtime.

---

## שלב 3 — Search Console (מלא)

| פעולה | פירוט |
|--------|--------|
| Property | URL-prefix: `https://dalia-car.online/site/` |
| אימות | HTML file / meta / DNS — לפי מה שזמין ב-OAuth |
| Sitemap | `/site/sitemap.xml` + Submit |
| אינדוקס | URL Inspection לכל עמוד ליבה |
| מערכת | binding GSC ל-`website_id` נכס 3 |
| דוחות | שאילתות/דפים/אינדוקס בדוח יומי לנכס 3 |

**שער יציאה:** Property מאומת + sitemap submitted + לפחות Home ב-Inspection.

---

## שלב 4 — Google Business Profile (קריאה בלבד לנכס 3)

| פעולה | פירוט |
|--------|--------|
| חיבור נתונים | אותו GBP LIVE של דליה (מיקום קיים) מוצג גם תחת נכס 3 |
| UI נכס 3 | כרטיסי עסק, ביקורות, פעילות, סטטוס |
| **איסור** | **לא לשנות** website URL בפרופיל ל-`/site/` בלי אישור נפרד |
| דוח | שורה מפורשת: «GBP מחובר לנתונים · כתובת האתר בפרופיל עדיין לא שונתה» |

**שער יציאה:** נתוני GBP מוצגים בנכס 3; URL בפרופיל ללא שינוי.

---

## שלב 5 — Google Ads (Binding + Pending)

| פעולה | פירוט |
|--------|--------|
| Binding | רשומת `google_ads` ל-`website_id` נכס 3 (אותו Ads customer אם רלוונטי) |
| המרות | הכנת Conversion Actions / GTM events לדפי `/site/` (contact, CTA) |
| Landing | קישור מתוכנן: קמפיינים → `/site/` / דפי שירות |
| סטטוס | `Pending` כל עוד `DEVELOPER_TOKEN_NOT_APPROVED` |
| אחרי אישור Google | סנכרון אוטומטי → `CONNECTED` / `LIVE` (אותו מנגנון כמו נכסים 1–2) |
| **איסור** | לא להגיש בקשת Basic Access חדשה |

**שער יציאה:** Binding קיים · UI = Pending עם סיבה Google · מוכן ל-LIVE אחרי אישור.

---

## שלב 6 — PageSpeed Insights

| פעולה | פירוט |
|--------|--------|
| יעד | `https://dalia-car.online/site/` (+ עמודים מרכזיים) |
| מדדים | Mobile · Desktop · LCP/INP/CLS · הזדמנויות |
| אחסון | לפי `website_id` |
| דוח יומי | סקשן נכס התדמית + השוואת PSI בין כל הנכסים הנבחרים (N) |

**שער יציאה:** ציונים חיים ב-UI ובדוח.

---

## שלב 7 — OAuth ו-Tokens

| פעולה | פירוט |
|--------|--------|
| חשבון | `orin1607@gmail.com` — OAuth קיים |
| Scopes | וידוא כיסוי Analytics, GSC, GTM, GBP read, Ads (כשיהיה), PSI |
| חוסר הרשאה | **עצירה רק בנקודה הזו** + קישור אישור מדויק אליך |
| אחסון | Tokens/refresh מאובטחים; bindings לפי `website_id` נכס 3 (לא ערבוב עם נכס 2) |

**שער יציאה:** כל קריאות נכס 3 עוברות עם אותו OAuth; אין כשל scope לא מדווח.

---

## שלב 8 — Supabase + Edge Functions

| פעולה | פירוט |
|--------|--------|
| website row | יצירת `website_id` ל-`https://dalia-car.online/site/` תחת אותו `customer_id` |
| טבלאות חיבורים | GA4, GSC, GTM, Ads, PSI, GBP-link — לפי `website_id` |
| Edge Functions | פרמטר `website_id` / `asset_id` דינמי — **אסור** hardcode של 2 נכסים |
| Migrations | אם חסרים עמודות/אינדקסים — migration ייעודית |
| SSOT | `coco-dalia-assets.js`, `asset-flow-ssot`, `dalia-site-config`, `dashboard.json` |

**שער יציאה:** שאילתה מחזירה את כל ה-websites של הלקוח (N) + providers לנכס התדמית; הוספת נכס נוסף לא דורשת שינוי סכמה.

---

## שלב 9 — דוחות ונתונים

| פעולה | פירוט |
|--------|--------|
| דוח יומי | סקשן מלא לכל Asset (כולל תדמית): GA4, GSC, GTM, GBP, PSI, Ads |
| השוואת N | כל תת-קבוצה שנבחרה (1 / 2 / 3 / … / כל הפורטפוליו) |
| השוואת זוג | בחירת שני `asset_id` מתוך הרשימה |
| אמינות | LIVE / Pending / Mock אמיתי לכל שירות לכל נכס |
| PDF + Viewer | דינמיים לפי `website_ids` בדוח |
| תובנות חובה בדוח | מי מוביל · מי נחלש · מה להעתיק · איזה תוכן · אילו עמודים — על הקבוצה הנבחרת |

**שער יציאה:** דוח עם לולאה על N נכסים + מצב השוואה לכל תת-קבוצה.

---

## שלב 10 — כל מערכות העבודה + AI (דרישת האזרח המלא)

### 10A — תשתית קונטקסט AI

כל עוזר/יועץ/מנוע מקבל:

```text
clientId, customer_id,
assets: [asset1, asset2, asset3],
activeAssetId,
compareAssetIds: [] | [idA, idB] | [idA, idB, idC],
mode: 'single' | 'compare' | 'portfolio'
```

### 10B — 50 העוזרים

- כל 50 מקבלים את **רשימת כל הנכסים** של הלקוח (`assets[]`)  
- עבודה שוטפת על כל `activeAssetId` — כולל אתר התדמית  
- המלצות/טיוטות נשמרות עם `website_id` / `asset_id`  
- אין עוזר עם רשימת אתרים מקודדת או מגבלה ל-2/3  

### 10C — 10 היועצים

- ניתוח קבוע לכל Asset ברשימה (כולל תדמית)  
- דוחות יועץ דינמיים × N  
- השוואות יועץ על כל תת-קבוצה: תנועה, מיקומים, KW, תוכן, מהירות, המרות, CWV, אינדוקס, קישורים, LP, SEO, המלצות AI

### 10D — מנועי בנייה / SEO / תוכן

- מנועי בנייה לפי `website_id` פעיל  
- SEO / Content engines משויכים ל-Asset — לא לדומיין קשיח  

### 10E — מסכי תפעול

Work Center · Control Center · Project Brief · סינון חכם · בחירת כמה נכסים · היסטוריה · PDF · Viewer — כולם Multi-Asset (N) עם מצבי single/compare/portfolio.

### 10F — מודל הניתוח (חובה)

| מצב | התנהגות |
|-----|----------|
| נפרד | ניתוח מלא של נכס בודד (כל Asset) |
| השוואה | כל תת-קבוצה 2..N — אותן מטריקות |
| פורטפוליו | כל נכסי הלקוח + המלצות cross-site |

**שער יציאה:** דוח אימות AI — 50+10+engines על כל הנכסים; בדיקת רגרסיה עם **נכס רביעי מדומה** שמופיע ב-Assistants/Compare/Reports בלי שינוי קוד.

---

## שלב 11 — בדיקות חובה (שער סיום)

| בדיקה | קריטריון הצלחה |
|--------|----------------|
| GA4 Realtime | hit מ-`/site/` ב-Property החדש |
| GTM Preview + טעינה | Container + GA4 tag |
| GSC | Property מאומת, sitemap, Inspection |
| PageSpeed | Mobile+Desktop לנתיב `/site/` |
| Supabase | `website_id` + providers לנכס 3 |
| OAuth/Tokens | קריאות מצליחות; אין scope חסר שקט |
| דוחות | סקשן 3 + השוואה 3/2 |
| בחירת נכס 3 בפרסום | chip «אתר התדמית החדש» |
| «האתר שלי» | פותח `https://dalia-car.online/site/` |
| השוואת 3 נכסים | UI + נתונים |
| AI | 50+10+engines על 3 נכסים (דוח אימות) |
| QA/E2E | SPA לא נשבר; Preview→301; אין hardcode ×2 |

---

## לוח זמנים מעודכן (עם AI מלא)

| גל | תוכן | זמן משוער |
|----|------|-----------|
| **A** | רפקטור Multi-Asset (AssetRegistry) + Static `/site/` + nginx + הוספת Asset התדמית בפרסום | 1.5–2 ימים |
| **B** | GA4 + GTM + GSC + PSI + Supabase bindings | 1.5–2 ימים |
| **C** | GBP-read + Ads Pending binding + דוח יומי + השוואות | 1–1.5 ימים |
| **D** | AI: 50/10/engines + compare/portfolio + אימות | 1.5–2 ימים |
| **E** | 301 Preview + QA/E2E + דוח סיום | 0.5–1 יום |
| **סה״כ** | | **~6.5–8.5 ימי עבודה** |

ניתן להתחיל רק בגל A אחרי אישורך, ואז B→E לפי סדר.

---

## סיכונים (מעודכן)

| סיכון | מניעה |
|--------|--------|
| `/site/` נבלע ב-SPA | nginx `^~ /site/` לפני catch-all |
| Build מוחק תדמית | static מחוץ ל-`dist/assets` |
| ערבוב GA4 אפליקציה↔תדמית | Property נפרד חובה |
| שינוי GBP URL בטעות | checklist + איסור מפורש בקוד/סקריפט |
| AI עדיין על רשימה קשיחה | רגרסיה: נכס רביעי מדומה ב-Assistants/Reports/Compare |
| Ads נראה כתקלה | Pending + טקסט Google בלבד |
| Scope חסר | עצירה + קישור אישור מדויק |

---

## מה יסופק בסיום הביצוע (לא עכשיו)

1. דוח חיבורים: GA4/GTM/GSC/GBP/Ads/PSI/OAuth/Supabase — LIVE או Pending עם סיבה  
2. דוח AI Multi-Asset: 50+10+engines על כל הנכסים + השוואת תת-קבוצות + בדיקת נכס רביעי מדומה  
3. דוח ארכיטקטורה: אין שאריות first/second/third / primary/secondary  
4. צילומי/לוגים: Realtime, GTM, GSC, «האתר שלי», השוואה  
5. רשימת מזהים: Property, Stream, Measurement, GTM, website_id  

---

## החלטות שכבר מקובעות בתוכנית (לפי בקשתך)

- ארכיטקטורה: **Multi-Asset ל-N בלתי מוגבל**  
- שם הנכס החדש: **אתר התדמית החדש**  
- URL: **`https://dalia-car.online/site/`**  
- GA4: **Property נפרד**  
- GTM: **Container נפרד**  
- GSC: **URL-prefix נפרד**  
- GBP: **נתונים כן · שינוי URL בפרופיל לא**  
- Ads: **Binding + Pending עד Google**  
- AI: **אזרח מלא — 50+10+engines על כל Asset + compare לכל תת-קבוצה**

---

## שורת סיום

**התוכנית + מסמך הארכיטקטורה עודכנו.**  
המערכת מתוכננת כפלטפורמת Multi-Asset אמיתית; אתר התדמית הוא Create Asset רגיל עם חיבורי Google מלאים — לא «נכס שלישי מיוחד».

**אין ביצוע עד שתאשר במפורש להתחיל.**
