# דוח — Strategic Briefing / Specification Phase (Staging)

תאריך: 2026-06-30  
סביבה: Staging בלבד — Orin Core (`orin1607-ctrl/future-craft-core`)  
מודול: שיווק + Website Builder

## 1. מה בוצע

- **מודול חדש** `public/ai-marketing/strategic-briefing-questionnaire.js`:
  - שאלון אסטרטגי חובה עם כל 8 קבוצות השדות (בנייה, מטרה, שירותים, קהל, אזורים, מתחרים, מילות מפתח, פלטפורמות)
  - localStorage: `coco-strategic-briefing-v1`, `coco-strategic-briefing-approved-v1`
  - הודעת חסימה: "חסר מידע. לא ניתן להמשיך עד להשלמת כל שדות החובה."
  - זרעי FleetOS למילות מפתח
  - אישור: "האם אתה מאשר שהמידע נכון ומלא?"
- **שרשרת שערים (Gate Chain)**:
  ```
  Strategy Wizard → Strategic Briefing → Materials Gate → SEO → Pre-Build Report → Blueprint → צור אתר AI → Website Builder
  ```
- **הרחבת שער חומרים** — ניסוח "האם יש עוד חומר שלא הועלה?" + checkbox "אני מאשר שאין כרגע מידע נוסף להעלות."
- **הרחבת דוח Pre-Build**:
  - פרק SEO לפי מילת מפתח (תחרות, חשיבות, התאמה, נפח, עמוד, מתחרים, יעד, זמן, פעולות)
  - פרק "אסטרטגיית השיווק והפלטפורמות"
  - ציוני מוכנות (%) — 8 תחומים + override מפורש
- **עדכון lifecycle** — שלב `briefing`
- **עדכון QA** — `scripts/verify-full-marketing-flow.mjs`
- **אין שינויי עיצוב** — panels קיימים, CSS classes קיימים, כפתורים במקום

## 2. מה לא בוצע

- חיבור API חיצוני לנפח חיפוש אמיתי (מוצג "חסר מידע")
- ניתוח מתחרים אוטומטי מלא (רק זיהוי + הוספה ידנית)
- העלאת קבצים בפועל (metadata בלבד בשער חומרים — כמו קודם)

## 3. מה נשאר

- חיבור GSC/Ads לנפחי חיפוש בזמן אמת
- UI להעלאת קבצים אמיתית (לא רק metadata)
- בדיקות E2E מול staging לאחר deploy

## 4. בדיקות

- `node scripts/verify-full-marketing-flow.mjs` — desktop + iPhone 13
- בדיקות: gates block, strategic briefing fill, readiness scores, keyword chapters, marketing strategy chapter, FAB יחיד, console נקי

## 5. בעיות

- QA מול GitHub Pages דורש deploy לאחר push (cache ~1-2 דקות)
- ציון מוכנות נמוך לפני אישור כל השערים — נדרש override או השלמת שרשרת

## 6. פתרונות

- Gate chain מונע דילוג על שלבים
- Override checkbox בדוח Pre-Build למקרה מוכנות חלקית
- sync ל-`coco-business-context-v1` ו-`coco-competitors-v1` מהשאלון

## 7. Commit

`feat(staging): strategic briefing questionnaire + readiness scores + enhanced pre-build report`

## 8. Staging URL

https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html

## 9. שלב הבא

- Deploy staging QA מלא לאחר push
- חיבור נפחי חיפוש מ-GSC
- הרחבת Blueprint עם נתוני השאלון האסטרטגי
