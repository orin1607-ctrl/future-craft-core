# UI Wiring Phase — דוח Staging

**תאריך:** 2026-06-30  
**מטרה:** חיבור כל השערים והפאנלים AI לזרימת האשף הראשית — ללא שינוי עיצוב/צבעים.

## מה בוצע

### business-strategy-wizard.js
- `mountAllGatePanels()` — טוען את כל השערים + Google Readiness + חדר אסטרטגיה AI
- נקרא ב-`mountWizard()` (פתיחה) וב-`exportData()` (ייצוא)
- בלוק `#exported` / `#gates-flow-block` גלוי תמיד (מחוץ לטאב 5) עם ניווט `scrollGate()`
- תיקון ולידציה שלב 1: חסימה אם חסר שם עסק **או** תחום
- `assertGatesForBuild()` מאחד בדיקות לפני בניית אתר

### strategic-briefing-questionnaire.js
- שדות חובה חדשים: **תוכנה** (`software`) ו-**אפליקציה** (`app`)
- הודעות שגיאה מפורטות לשדות חסרים
- כפתור AI קיים בשלב briefing

### ai-consultant-module.js
- `buildRegionIdeas()` + `buildPageIdeas()` עם הסבר **למה**
- `renderIdeasPanel` מציג: מילות מפתח, קהל, אזורים, שירותים, עמודים — כולם עם למה

### google-page-quality-standard.js
- `mountPanel('google-readiness-root')` — ציוני Google Readiness מ-Blueprint/Preview/דוח

### ai-strategy-room-module.js (חדש)
- פאנל המלצה מאוחדת מכל הסוכנים הווירטואליים
- `mountPanel('ai-strategy-room-root')`

### materials-readiness-gate.js / seo-strategy-module.js
- כפתור 💡 AI גלוי גם במצב "חסום" (לפני אישור שאלון/חומרים)

### ai-marketing-platform.html
- טעינת `ai-strategy-room-module.js` בשרשרת boot

## QA

| סקריפט | תוצאה |
|--------|--------|
| `scripts/verify-ui-wiring.mjs` | **11/11 pass** |
| `scripts/verify-full-marketing-flow.mjs` | **153/153 pass** (desktop + iPhone + Android) |

## Staging URL

```
https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=COMMIT_HASH
```

(החלף `COMMIT_HASH` ב-hash הקצר של הקומיט לאחר push — ראה `report.json` בשדה `commit`.)

## קבצים שהשתנו

- `public/ai-marketing/business-strategy-wizard.js`
- `public/ai-marketing/strategic-briefing-questionnaire.js`
- `public/ai-marketing/ai-consultant-module.js`
- `public/ai-marketing/google-page-quality-standard.js`
- `public/ai-marketing/ai-strategy-room-module.js` *(חדש)*
- `public/ai-marketing/materials-readiness-gate.js`
- `public/ai-marketing/seo-strategy-module.js`
- `public/ai-marketing-platform.html`
- `scripts/verify-ui-wiring.mjs` *(חדש)*
- `scripts/verify-full-marketing-flow.mjs`

## הערות

- Staging בלבד — ללא deploy לפרודקשן
- ללא שינוי CSS/צבעים/לייאאוט
- טקסט חסר: **"חסר מידע"**
