# דוח QA — דוגמת מערכת מדיה · דליה (Staging בלבד)

תאריך: 2026-07-11  
סביבה: Orin Staging בלבד · אין Production · אין Hostinger  
לקוח: דליה פתרונות תפעול ותחזוקה לרכב · יוני אטיאס

---

## 1. קישורים לבדיקה

| פריט | קישור |
|------|--------|
| אתר Preview | https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/index.html |
| שירותים | https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/services.html |
| FleetOS | https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/fleet-management-software.html |
| דוח יומי (latest) | https://orin1607-ctrl.github.io/future-craft-core/coco-reports/dalia-c-official/daily/latest.html |
| Viewer | https://orin1607-ctrl.github.io/future-craft-core/coco-reports/dalia-c-official/daily/latest.html#viewer |
| PDF | https://orin1607-ctrl.github.io/future-craft-core/coco-reports/dalia-c-official/daily/latest.pdf |
| Briefs | https://orin1607-ctrl.github.io/future-craft-core/coco-media/dalia-c-official/briefs.json |
| Manifest | https://orin1607-ctrl.github.io/future-craft-core/coco-media/dalia-c-official/manifest.json |
| Health | https://orin1607-ctrl.github.io/future-craft-core/coco-media/dalia-c-official/health.json |

---

## 2. ארבע התמונות — שיבוץ והצדקה

### Hero (`index.html` — צד ויזואלי)
- **למה נבחרה:** חסרה עוגן ויזואלי ליד H1 על ניהול צי חכם.
- **תמיכה בתוכן:** מחברת את המסר "שליטה תפעולית" לדימוי מרכז בקרה B2B.
- **המלצת יועצים:** יועץ UX/UI + יועץ מיתוג (navy/teal, מקצועי, בלי לוגואים מומצאים).
- **מסר עסקי:** הצי בשליטה — תפעול, תחזוקה וטכנולוגיה במקום אחד.
- **Alt:** מרכז בקרה לניהול צי רכב לעסקים — מסכי מעקב ותפעול מקצועיים.
- **מובייל/עיצוב:** `object-fit: cover` בתוך `.media-slot` · יחס ~4:3 · WebP ~89KB.

### שירות (`services.html` — תפעול ותחזוקה)
- **למה נבחרה:** סעיף תחזוקה היה טקסטואלי בלי דימוי שטח.
- **תמיכה בתוכן:** מחזקת "לא מוסך — שותף תפעולי".
- **המלצת יועצים:** מומחה תמונות שירות (צי אמיתי, לא סטוק כללי).
- **מסר עסקי:** תחזוקה מונעת וטיפול בתקלות — צי זמין ובטוח.
- **Alt:** צוות תפעול מקצועי מתחזק רכב צי עסקי בחניה מסודרת.
- **מובייל/עיצוב:** יחס 16:9 · WebP ~74KB.

### FleetOS (`fleet-management-software.html` — Hero צד)
- **למה נבחרה:** חסר דימוי מוצר לדשבורד (לא רק טבלת יכולות).
- **תמיכה בתוכן:** מבדילה מ-GPS בלבד — תפעול מלא על מסך אחד.
- **המלצת יועצים:** יועץ מיתוג + מומחה איתור תמונות חסרות.
- **מסר עסקי:** FleetOS — דשבורד ניהולי בזמן אמת לצי.
- **Alt:** מסך דשבורד לניהול צי רכב עם מפות, התראות וסטטוס רכבים.
- **מובייל/עיצוב:** WebP ~59KB · UI מופשט בלי טקסט קריא / לוגואים.

### CTA (`index.html` — רצועת CTA)
- **למה נבחרה:** CTA חזק טקסטואלית בלי רקע ויזואלי להמרה.
- **תמיכה בתוכן:** תומך בקריאה להדגמה לפי גודל צי.
- **המלצת יועצים:** יועץ CRO + שיווק דיגיטלי.
- **מסר עסקי:** הגיע הזמן לשליטה אמיתית בצי — בואו להדגמה.
- **Alt:** צי רכבים עסקיים מסודר בחניה — מוכנים להדגמת ניהול צי.
- **מובייל/עיצוב:** רקע רחב עם overlay קיים · WebP ~177KB.

---

## 3. זרימת CO.CO שבוצעה

מידע עסק → המלצות יועצים (`briefs.json`) → Brief לכל סלוט → מנוע תמונות → אופטימיזציית WebP → העלאה ל-Supabase `coco-media` → שילוב ב-Preview → דוח יומי עם נכס `media-system` → ממתין לאישור Owner → פרסום (עדיין לא).

**הערה טכנית:** OpenAI Images חזר עם `Billing hard limit`. הדוגמה הושלמה במנוע חלופי זמני לפי אותם Briefs. מומלץ להסיר מגבלת Billing להמשך אוטומציה.

---

## 4. בדיקות QA

| בדיקה | תוצאה |
|--------|--------|
| תמונות ב-Git | לא — רק URL חיצוני + JSON |
| Bucket | `coco-media` · קריאה ציבורית · כתיבה service_role |
| HEAD על 4 URLs | תקין |
| Alt לכל 4 | כן |
| WebP | כן · 4/4 |
| מבנה אתר / עיצוב כללי | לא שונה — רק החלפת סלוטים |
| עמוד חדש | לא נוצר |
| Production | לא נגע |
| נכס בדוח | `מערכת מדיה — תמונות וסרטונים` |
| סינון חכם | קטגוריות media-* ב-catalog |
| ממתינות לאישור | 4 |
| קישורים שבורים | 0 |
| מנוע וידאו | לא מחובר עדיין |

---

## 5. Rollback

1. להסיר/להחליף את תגי `<figure class="media-slot">` / `.cta-media` בקבצי ה-HTML.
2. אופציונלי: למחוק אובייקטים בנתיב `customers/dalia-c-official/...` ב-bucket.
3. להריץ מחדש `generate-daily-progress-dalia.mjs` אחרי עדכון manifest.

---

## 6. סטטוס Owner

**Preview מוכן לבדיקה.**  
פרסום סופי רק אחרי אישור Owner לכל ארבע התמונות.
