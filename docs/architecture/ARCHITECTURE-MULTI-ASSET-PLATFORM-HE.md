# ארכיטקטורת Multi-Asset — פלטפורמה ללא הגבלת מספר נכסים

**תאריך:** 2026-07-13  
**סטטוס:** מסמך ארכיטקטורה מחייב — לפני ביצוע  
**קשור ל:** `PLAN-THIRD-ASSET-FULL-INTEGRATION-HE.md` (המקרה הראשון שמוסיף נכס נוסף תחת הארכיטקטורה הזו)

---

## עקרון על

המערכת היא **פלטפורמת Multi-Asset אמיתית**.

- מספר הנכסים: **N ≥ 1**, ללא תקרה ארכיטקטונית (עשרות / מאות).
- כל נכס הוא **אזרח שווה** — אותן יכולות, אותם חיבורים, אותם מנועי AI.
- **אסור** לבנות לוגיקה של «נכס ראשון / שני / שלישי».
- הוספת נכס חדש = יצירת Asset + חיבורי Google — **בלי שינוי ארכיטקטורה**.
- כל פיתוח עתידי חל אוטומטית על **כל** הנכסים דרך אותה שכבה.

המקרה של «אתר התדמית החדש» (`/site/`) הוא **מופע ראשון** של הוספת נכס תחת הארכיטקטורה הזו — לא «חריג של נכס שלישי».

---

## 10 דרישות ארכיטקטוניות (מחייבות)

| # | דרישה | כלל מימוש |
|---|--------|-----------|
| 1 | אין לוגיקת first/second/third | רק `asset_id` / `website_id` ברשימה דינמית |
| 2 | נכס חדש → כל היכולות אוטומטית | Capability matrix לפי סוג נכס, לא לפי אינדקס |
| 3 | 50 העוזרים על כל נכס | קונטקסט = `assets[]` + `activeAssetId` |
| 4 | 10 היועצים על כל נכס | אותו מנגנון דינמי |
| 5 | כל מנועי AI על כל נכס | לולאות על `getAssets()` / DB query |
| 6 | כל חיבורי Google לכל נכס | bindings לפי `website_id` (GA4, GTM, GSC, GBP, Ads, PSI, OAuth, APIs עתידיים) |
| 7 | דוחות ו-Dashboard לכל נכס | generators מקבלים `websiteIds: string[]` |
| 8 | השוואה לכל גודל קבוצה | 1 / 2 / 3 / … / N נכסים נבחרים |
| 9 | פיתוח עתידי חל על כולם | אסור hardcode של רשימת דומיינים |
| 10 | הוספת נכס = תהליך פשוט | Create Asset → Connect providers → Ready |

---

## מודל נתונים (קנוני)

```text
Customer (customer_id)
  └── Website / Asset  × N   (website_id, asset_id, url, type, label, status)
        └── ProviderBinding × M
              provider: ga4 | gtm | gsc | gbp | ads | pagespeed | …
              external_ids: property / container / measurement / …
              status: live | pending | mock | error
              token_ref: (OAuth shared at customer/owner level; scope per need)
        └── MetricsDaily / History / Recommendations / ContentDrafts
              keyed by website_id (+ optional campaign_id)
```

### כללי זהב ב-DB / Edge Functions

1. **כל** שאילתה מסוננת ב-`customer_id` ואז ב-`website_id` (או רשימת `website_ids`).
2. **אסור** `if (domain === 'dalia-c.com')` או `assets[0]` / `assets[1]` כלוגיקת עסק.
3. אינדקסים: `(customer_id, website_id, provider)`.
4. OAuth tokens ברמת Owner/Customer; **bindings** ברמת Website.
5. Provider חדש בעתיד = שורת enum + handler — לא טבלה נפרדת לכל אתר.

---

## שכבת SSOT ב-Frontend (פרסום / Orin)

### לפני (אסור להשאיר)

```js
primaryAsset()
secondaryLiveAsset()
// או ASSETS באורך קבוע 2
```

### אחרי (חובה)

```js
AssetRegistry.list(customerId)           // → Asset[]
AssetRegistry.get(assetId)
AssetRegistry.getActive()
AssetRegistry.setActive(assetId)
AssetRegistry.getSelectedForCompare()    // → assetId[]  (1..N)
AssetRegistry.add(assetDraft)            // יצירת נכס חדש
```

מקור אמת מועדף: **Supabase** (websites + bindings).  
קבצי JS סטטיים (`coco-dalia-assets.js`) יכולים לשמש bootstrap / cache — אבל חייבים להיגזר מאותו מודל, לא מרשימה מקודדת קשיחה לטווח ארוך.

---

## יכולות לכל נכס (Capability Matrix)

כל `Asset` מקבל את אותה מטריצה. סטטוס לכל תא: `live | pending | mock | na`.

| יכולת | חל על כל Asset |
|--------|----------------|
| GA4 Property/Stream/Measurement | ✅ |
| GTM Container | ✅ |
| GSC property (domain או URL-prefix) | ✅ |
| GBP (קריאה / קישור עסקי) | ✅ (שינוי URL ציבורי — רק באישור מפורש) |
| Google Ads binding + conversions | ✅ (Pending עד אישור Google) |
| PageSpeed Mobile/Desktop + CWV | ✅ |
| OAuth דרך Owner | ✅ |
| Supabase website row + history | ✅ |
| דוח יומי / Dashboard / PDF / Viewer | ✅ |
| 50 Assistants | ✅ |
| 10 Consultants | ✅ |
| Build / SEO / Content engines | ✅ |
| Work Center · Control · Brief · Filters | ✅ |
| Compare / Portfolio modes | ✅ |

סוגי נכס (`website | app | landing | gbp | social | …`) משפיעים על **אילו** providers רלוונטיים (`na` אם לא), לא על «האם הנכס אזרח מלא».

---

## AI: Single · Compare · Portfolio (לכל N)

```text
mode: 'single'     → activeAssetId
mode: 'compare'    → selectedAssetIds.length ∈ [2..N]
mode: 'portfolio'  → כל הנכסים של ה-customer (או קבוצה מוגדרת)
```

### קונטקסט חובה לכל עוזר / יועץ / מנוע

```text
customer_id
assets: Asset[]                 // כל הנכסים הזמינים
active_asset_id: string | null
compare_asset_ids: string[]     // 0..N
mode: single | compare | portfolio
providers_by_asset: { [assetId]: ProviderStatus[] }
metrics_by_asset: { [assetId]: MetricsSlice }
```

### השוואות נתמכות (לא מוגבלות ל-3)

- נכס בודד  
- כל זוג  
- כל שלישייה  
- כל תת-קבוצה שנבחרה ב-UI  
- כל הפורטפוליו  

מטריקות להשוואה (מינימום): תנועה, מיקומים, KW, תוכן, מהירות, המרות, CWV, אינדוקס, קישורים, LP, SEO, המלצות AI.

### כללי AI

1. עוזר לא מקבל רשימת דומיינים מקודדת — רק `assets[]` חיה.  
2. המלצה נשמרת עם `website_id` (או `website_ids` בהשוואה).  
3. «מי מוביל / מי נחלש / מה להעתיק» מחושב על הקבוצה הנבחרת, לא על «שלושת אתרי דליה» בלבד.

---

## תהליך הוספת נכס חדש (סטנדרטי)

```text
1. Create Asset
   - label, url, type, customer_id
   - → website_id + asset_id

2. Connect providers (לפי הצורך)
   - GA4 / GTM / GSC / Ads / PSI / GBP-link / …
   - כל אחד: live | pending | mock

3. Verify
   - Realtime / Preview / Inspection / HTTP 200 לפי סוג

4. Activate in UI
   - מופיע ברשימת Assets
   - זמין ל-Assistants / Consultants / Reports / Compare

5. Done
   - אין שינוי קוד ארכיטקטוני
```

**המקרה הנוכחי (אתר תדמית `/site/`)** רץ בדיוק בתהליך הזה + צעדי תשתית nginx/static חד-פעמיים לכתובת הקבועה.

---

## דוחות ו-Dashboard

| רכיב | התנהגות Multi-Asset |
|------|---------------------|
| Daily report | לולאה על `website_ids` של ה-customer (או סינון) |
| Asset section | template אחד × N |
| Compare block | על `selectedAssetIds` (1..N) |
| Leader/Laggard | על הקבוצה הנבחרת |
| PDF / Viewer / History | keyed by report_id + website_ids |
| Smart filter | customer → assets → channels → date |

אסור: כותרות/סקשנים קשיחים «אתר 1 / אתר 2 / אתר 3» בקוד — רק תוויות דינמיות מ-`asset.label`.

---

## איסורים ארכיטקטוניים (Definition of Done לכל PR)

אסור למזג קוד שמכיל:

- `primaryAsset` / `secondaryAsset` / `tertiaryAsset` כמקור אמת  
- `ASSETS.length === 2` או `=== 3` כתנאי עסקי  
- `sites.dalia-c.com` + `sites['dalia-car.online']` בלבד בלי מבנה כללי  
- השוואה קשיחה «רק בין שני דומיינים»  
- עוזר/יועץ עם רשימת אתרים ב-hardcode  

חובה בכל שינוי:

- עבודה מול `Asset[]` / `website_id`  
- בדיקת רגרסיה: הוספת נכס mock רביעי לא שוברת UI/דוח/AI  

---

## מיפוי למקרה הביצוע הקרוב (דליה)

לאחר יישום הארכיטקטורה, אצל דליה יהיו (לדוגמה) N=3 נכסים — אבל המערכת לא «יודעת» שהם שלושה:

| asset_id (דוגמה) | label | url |
|------------------|-------|-----|
| `dalia-c-com` | dalia-c.com | https://dalia-c.com/ |
| `dalia-car-app` | אפליקציית דליה | https://dalia-car.online/ |
| `dalia-brand-site` | אתר התדמית החדש | https://dalia-car.online/site/ |

נכס רביעי בעתיד (למשל landing / אתר נוסף) = שורות חדשות בלבד.

---

## קשר לתוכנית הביצוע

1. **לפני כל גל ביצוע** — עובדים לפי מסמך זה.  
2. גל התשתית הראשון חייב לכלול **רפקטור Multi-Asset** (הסרת dual-asset hardcoded) יחד עם הוספת `/site/`.  
3. בסיום — דוח אימות:  
   - N נכסים אצל דליה (כולל התדמית)  
   - בדיקת «נכס רביעי מדומה» עובר Assistants/Reports/Compare  
   - אין שאריות לוגיקת first/second/third  

---

## סיכום

| שאלה | תשובה |
|------|--------|
| האם המערכת ל-3 נכסים? | **לא** — ל-N בלתי מוגבל |
| האם אתר התדמית מיוחד? | **לא** — Asset רגיל בתהליך הסטנדרטי |
| מה נדרש להוספת אתר בעתיד? | Create Asset + Connect Google — בלי שינוי ארכיטקטורה |
| האם AI רואה את כולם? | כן — 50 / 10 / engines על כל Asset + compare לכל תת-קבוצה |

**אין ביצוע עד אישור מפורש.** מסמך זה מעדכן את הארכיטקטורה כפי שביקשת.
