# Mission 35 / Wave 1 — מפת 301 (STAGING בלבד)

## סטטוס חשוב

- מסמך תכנון בלבד (`STAGING_PLAN_ONLY`).
- **לא בוצע שום שינוי בפרודקשן** (`dalia-c.com`).
- אין מחיקה בפועל של עמודים חיים בשלב זה.

## מטרת המפה

לרכז את כל ה-URLs הישנים המשמעותיים (עמודים עסקיים קיימים + 404s עם תנועה מ-GA4) למבנה ה-URLs החדש בעברית, כדי למנוע אובדן טראפיק בזמן מיגרציה עתידית.

## מקורות נתונים

- `docs/audit-reports/mission-34-site-master-plan/MASTER-PLAN-HE.md`
- `public/project-001/site-crawl-lite.json`
- `docs/audit-reports/project-001/GA4-URL-AUDIT.md`
- `docs/audit-reports/project-001/SEO-LANDING-PAGES-PLAN.md`

## קבצי מקור למימוש עתידי

- קובץ JSON מלא: `docs/audit-reports/mission-35-wave1/REDIRECT-MAP.json`
- כולל:
  - `exact_redirects` — מיפוי כתובת ישנה לכתובת יעד
  - `pattern_redirects` — חוקים קבוצתיים (category/elementor/mdsl-id)
  - `preserve_without_redirect` — נתיבים שלא נוגעים בהם (למשל `my-account`)

## דגשים עסקיים

- קטלוג רכבים נמחק בתכנון, אך **לא נמחק בפועל בפרודקשן** בשלב Wave 1.
- `/my-account/` נשאר פורטל נפרד, ללא איחוד לאתר השיווק.
- עמודי Wave 1 שבנינו ב-Staging:
  - `/`
  - `/צור-קשר/`
  - `/חבילות-ניהול-צי/`

## הערת הפעלה עתידית

בעת פריסה (Wave מתאים + אישור), המפה תיושם ברמת שרת/hosting כ-301 קבועים, כולל בדיקות smoke על URLs עם טראפיק גבוה מ-GA4.
