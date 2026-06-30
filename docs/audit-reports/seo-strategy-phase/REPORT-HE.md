# דוח שלב — מודול אסטרטגיית SEO + שער חומרים

**תאריך:** 2026-06-30  
**ריפו:** orin1607-ctrl/future-craft-core (Staging)  
**ענף:** main

---

## 1. מה בוצע

### שער חומרים (`materials-readiness-gate.js`)
- רשימת בדיקה חובה (8 סעיפים): סריקת אתר, ניתוח עמודים, מתחרים, מילות מפתח, שירותים, מטרות, קהל יעד, חומרים.
- שאלה: "האם יש מידע נוסף שעדיין לא הועלה למערכת?"
- הוספת מטא-דאטה לחומרים (מסמכים, מצגות, תמונות, אינטגרציות וכו').
- אישור חומרים לפני המשך ל-SEO.
- מפתח localStorage: `coco-materials-gate-v1`.

### מודול אסטרטגיית SEO (`seo-strategy-module.js`)
- ניהול מתחרים (אוטומטי + הוספה ידנית) — `coco-competitors-v1`.
- מילות מפתח בשלוש שכבות: Core, Service, Article (עם seeds ל-FleetOS).
- מטא-דאטה לכל מילה: תחרות, עדיפות, עמוד יעד, קידום, שלב, short/long tail.
- מפת דרכים חודש 1–4.
- יעדי דירוג (Top 10/5/3/#1) עם זמן משוער.
- מיפוי SEO לעמוד.
- אגרגציה מ-GSC, Analytics, GBP, Ads, PageSpeed, SEO, AI — חסר → "חסר מידע".
- אישור אסטרטגיה + סנכרון משימות ל-Hub.
- מפתח localStorage: `coco-seo-strategy-v1`, `coco-seo-strategy-approved-v1`.

### אינטגרציה בזרימה
```
אסטרטגיה → שער חומרים → אסטרטגיית SEO → דוח Pre-Build (משופר) → Blueprint → בניית אתר → ...
```

### קבצים שעודכנו
- `pre-build-work-report-module.js` — שילוב SEO בדוח, שער build משולב.
- `site-blueprint-module.js` — audience, headings, content plan, FAQ, Schema, internal links, funnel role.
- `marketing-lifecycle-module.js` — שלבים `materials`, `seo`.
- `ai-stage-advisor.js` — ייעוץ לשלבים החדשים.
- `site-marketing-hub-module.js` — `mergeTasks()` לסנכרון משימות SEO.
- `business-strategy-approved-source.html` + wizard מקומפל.
- `ai-marketing-platform.html` — טעינת המודולים החדשים.
- `scripts/verify-full-marketing-flow.mjs` — בדיקות שער + SEO.

---

## 2. מה נשאר

- חיבור אמיתי ל-API של GSC/GA4/GBP/Ads (כרגע stub — מסומן "חסר מידע").
- ניתוח מתחרים מלא (שירותים, עמודים, מילות מפתח) — דורש קלט משתמש.
- העלאת קבצים אמיתית (כרגע מטא-דאטה בלבד).
- עריכת מילות מפתח inline בממשק (כרגע seeds + רענון).
- דוח SEO בפורמט HTML (כרגע JSON בלבד).

---

## 3. בדיקות

| בדיקה | תוצאה |
|--------|--------|
| QA מלא desktop + mobile | **PASS** (66/66) |
| שער חומרים חוסם build | ✅ |
| SEO חוסם build עד אישור | ✅ |
| דוח Pre-Build כולל SEO | ✅ |
| Blueprint מורחב | ✅ |
| משימות SEO ב-Hub | ✅ |
| FAB יחיד, ללא שגיאות JS | ✅ |

הרצה: `node scripts/verify-full-marketing-flow.mjs`

---

## 4. בעיות

- נתוני אינטגרציות חיצוניות לא מחוברות — מוצג "חסר מידע" (לפי דרישה).
- ניתוח מתחרים אוטומטי מוגבל לשם בלבד עד קלט משתמש.

---

## 5. פתרונות

- שימוש ב-data layer עם סימון מפורש "חסר מידע" במקום ניחוש.
- שערים מדורגים: חומרים → SEO → דוח → build.
- QA מעדכן gates דרך `approveStrategy()` לסנכרון משימות.

---

## 6. Commit

```
feat(staging): SEO strategy module + materials gate before build
```

---

## 7. Staging URL

https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html

ניווט: חברות ועסקים → אסטרטגיה → ייצוא → שער חומרים → SEO → דוח → צור אתר AI

---

## 8. המלצות

1. לחבר GSC/GA4 בפרויקט 001 לפני go-live כדי למלא שדות "חסר מידע".
2. לאפשר למשתמש לערוך מילות מפתח ומתחרים לפני אישור SEO.
3. להוסיף דוח SEO ב-HTML להורדה (כמו Pre-Build).
4. לשקול webhook לסריקת מתחרים אוטומטית (עתידי).
