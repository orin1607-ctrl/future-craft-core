# דוח אינטגרציה — Business Strategy + Website Builder (Staging)

תאריך: 2026-06-30  
סביבה: Staging בלבד (Orin / GitHub Pages)  
מודול: `חברות ועסקים` (`screen-business-strategy`)

## קבצים ששונו

- `public/ai-marketing/business-strategy-approved-source.html`
- `public/ai-marketing/business-strategy-module.js`
- `public/ai-marketing/business-strategy-wizard.js` (נבנה מחדש)
- `public/ai-marketing/business-strategy-wizard.css` (נבנה מחדש)
- `public/ai-marketing/website-builder-approved-source.html` (חדש)
- `public/ai-marketing/website-builder-module.js` (חדש, נבנה)
- `public/ai-marketing/website-builder-wizard.css` (חדש, נבנה)
- `public/ai-marketing/coco-claude-screens.html`
- `public/ai-marketing-platform.html`
- `scripts/compile-business-strategy-wizard.mjs`
- `scripts/compile-website-builder.mjs` (חדש)
- `scripts/e2e-website-builder-integration.mjs` (חדש)
- `docs/audit-reports/website-builder-integration/report.json` (תוצר בדיקות)

## איך קוד 1 שולב (Business Strategy)

- עודכן מקור מאושר `business-strategy-approved-source.html` כך שב־Tab 5 (`#exported`) נוסף כפתור `🌐 צור אתר AI`.
- פונקציית `openWebsiteBuilder()` בקוד האסטרטגיה הופכת קריאה פנימית ל־`WebsiteBuilderWizard.open()` (ללא `window.open`, ללא tab חדש).
- `compile-business-strategy-wizard.mjs` עודכן כדי:
  - לשמר ייצוא `dalia_biz` + העברה דרך `BusinessStrategyModule.exportToPlatform`.
  - לחשוף `openWebsiteBuilder` ל־`window` ול־`BusinessStrategyWizard`.
- בוצעה קומפילציה מחדש של `business-strategy-wizard.js/.css`.

## איך קוד 2 שולב (Website Builder — 7 צעדים)

- נשמר מקור מאושר חדש: `public/ai-marketing/website-builder-approved-source.html`.
- נוצר קומפיילר חדש: `scripts/compile-website-builder.mjs`.
- תוצרי קומפילציה:
  - `public/ai-marketing/website-builder-module.js`
  - `public/ai-marketing/website-builder-wizard.css`
- ה־Wizard עובד ב־7 שלבים: `analyze`, `structure`, `content`, `design`, `SEO`, `preview`, `deploy`.
- קריאת הקשר עסקי נעשית מתוך localStorage:
  - `dalia_biz`
  - `coco-business-context-v1`

## אינטגרציה תחת חברות ועסקים בלבד

- `website-builder-root` נוסף באותו מסך `screen-business-strategy`.
- פתיחת Website Builder מסתירה זמנית את `#biz-strategy-root` ומציגה את `#website-builder-root` — ללא מסך חיצוני.
- כפתור חזרה בבילדר מחזיר לאסטרטגיה באותו מודול.
- טעינת CSS/JS של הבילדר נעשית מתוך `public/ai-marketing-platform.html` אחרי מודול האסטרטגיה.

## תקינות פונקציונלית

- כפתור `🌐 צור אתר AI` עובד: **כן**.
- Website Builder נפתח בתוך `screen-business-strategy`: **כן**.
- העברת נתונים מ־Business Context לבילדר: **כן**.
- זרימת המשך ל־`עוזרים → מטרות → פעולות`: **כן** (הבדיקה חוזרת ל־`screen-agents` בסיום שלב 7).

## בדיקות

- סקריפט: `scripts/e2e-website-builder-integration.mjs`
- ריצה: Desktop + iPhone 13
- תוצאות: `24/24` בדיקות עברו
- פלט מלא: `docs/audit-reports/website-builder-integration/report.json`

## שגיאות

- שגיאות חוסמות: **אין**.
- סריקת console בבדיקת E2E: **נקי** (לא זוהו שגיאות חוסמות).

## מה דמו ומה דורש חיבור אמיתי

- דמו קיים:
  - בניית זרימת 7 שלבים בתוך המערכת.
  - יצירת payload שמור ל־localStorage והעברה להמשך עבודה.
- דורש חיבור אמיתי בהמשך:
  - פריסה אמיתית ל־CMS/Hosting.
  - סנכרון דו-כיווני מול תשתית אתר חיה.

## Commit + Staging

- Commit hash: `633614c`
- Staging URL: `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=wb-integration`
