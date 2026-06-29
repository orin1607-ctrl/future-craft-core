# Mission 35 — Wave 1 Report (Staging)

**תאריך:** 2026-06-29  
**סביבה:** Git/Staging בלבד  
**פרודקשן:** לא נגעו

## מה נבנה בפועל

### 1) אתר Staging סטטי (RTL, Hebrew, B2B)

נתיב פרויקט: `sites/dalia-new/`

- `index.html` — דף בית (`/`): hero, 3 יתרונות, טיזר חבילות, CTA.
- `צור-קשר/index.html` — דף צור קשר (`/צור-קשר/`): UI לטופס, טלפון, trust signals.
- `חבילות-ניהול-צי/index.html` — דף חבילות (`/חבילות-ניהול-צי/`): 3 כרטיסים (35/129/462), טבלת השוואה, FAQ, CTA.
- `assets/styles.css` — עיצוב אחיד, mobile-first, RTL.
- `assets/layout.js` — header/footer משותפים + CTA קבוע ליצירת קשר.

### 2) מפת 301 (תיעוד בלבד)

- `docs/audit-reports/mission-35-wave1/REDIRECT-MAP.json`
- `docs/audit-reports/mission-35-wave1/REDIRECT-MAP-HE.md`

כולל:
- מיפוי URLs ישנים מה-crawl לעמודי היעד החדשים.
- טיפול ב-404s מה-GA4 audit.
- חוקים קבוצתיים (`/category/*`, `/elementor-*`, `/mdsl-id*`).
- סימון מפורש: STAGING/PLAN ONLY.

### 3) תיעוד אישור והיקף

- `docs/audit-reports/mission-35-wave1/APPROVAL-HE.md`

תיעוד רשמי של אישורי Mission 34 וההגבלות ל-Wave 1.

### 4) אימות בסיסי (אופציונלי)

- `scripts/verify-mission-35-wave1.mjs`
- `npm run mission-35:wave1:verify`

בודק קיום קבצים ותגיות RTL/H1 בשלושת עמודי Wave 1.

## איך לצפות מקומית

1. `npm run mission-35:wave1:serve`
2. פתחו דפדפן: `http://localhost:8891/`

## GitHub Pages (אם רוצים preview מרוחק)

יש workflow קיים ב-repo:
- `.github/workflows/deploy-staging-pages.yml`

לא בוצעה כאן פריסת production. אם מפעילים deployment staging דרך GitHub Actions, URL ה-preview מתקבל בפלט של צעד `deploy-pages` (`page_url`).

## מה בכוונה לא נעשה ב-Wave 1

- לא פותחו עמודי Wave 2 (pillars/blog/איך זה עובד/אודות).
- לא בוצעה מחיקה של עמודים חיים.
- לא בוצעה החלה אמיתית של redirects בפרודקשן.
- לא בוצעה שום פעולה ב-DNS/WordPress/hosting חי.
- `my-account` לא נבנה כחלק מהאתר השיווקי.
