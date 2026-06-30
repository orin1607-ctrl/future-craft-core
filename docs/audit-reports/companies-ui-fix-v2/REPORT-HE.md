## 1. מה עדיין היה תקוע
- בדשבורד הראשי היה חשד לגלילה כפולה במובייל (root + inner scroll), עם התנהגות קפיצה.
- בסיום Website Builder הייתה הפניה אוטומטית לעוזרים במקום הצגת Preview.
- כפתורי הסיום ב-`חברות ועסקים` לא היו מופרדים מספיק לפי פעולה.

## 2. איפה היה הסרגל העליון / שכבת הגלילה הבעייתית
- שכבת `#coco-gfc-chrome` הייתה עם `overflow-x: auto`, מה שתרם לתחושת שכבת גלילה נוספת.
- במובייל, ללא נעילת scroll root אחיד, יכלו להופיע שני אזורי גלילה (עמוד + תוכן מסך).

## 3. מה תיקנת בדשבורד הראשי
- ב-`coco-claude-integration.css` הוחלף `#coco-gfc-chrome` ל-`overflow-x: hidden`.
- במובייל הוגדר scroll root יחיד: `html/body/#coco-claude-root` נעולים, והגלילה עוברת למסך הפעיל בלבד.
- למסך הפעיל הוגדר `overflow: hidden` ול-`.content` הוגדר `overflow-y: auto` עם `touch-action: pan-y`.

## 4. למה Website Builder לא נפתח
- ה-CTA כן פתח את ה-Builder מתוך `screen-business-strategy`, אבל בסוף הזרימה היה redirect קשיח ל-`screen-agents`.
- המשתמש חווה זאת כאילו ה-Builder "לא באמת נפתח/לא באמת נסגר עם תוצאה".

## 5. איפה עכשיו נמצא הכפתור 🌐 צור אתר AI
- בשלב אישור הייצוא (`#exported`) של `Business Strategy Wizard`.
- נוסף עיגון טוב יותר לנראות במובייל דרך `biz-export-actions` (sticky מעל footer).

## 6. איך מגיעים אליו שלב אחרי שלב
- דשבורד `ניהול שיווק` -> `חברות ועסקים`.
- מעבר בשלבי האשף, הפעלת ניתוח AI, והגעה לשלב אישור.
- לחיצה על `אשר ושלח לעוזרים` מציגה אזור `#exported`.
- שם מופיעים שני כפתורים נפרדים: `פתח מנהל השיווק / שלח לעוזרים` ו-`🌐 צור אתר AI`.

## 7. האם הוא פותח Website Builder בפועל
- כן. ה-`🌐 צור אתר AI` פותח את ה-Builder בתוך אותו מסך, בלי ניווט לעוזרים.
- ב-`website-builder-module.js` בוטל redirect אוטומטי בסיום.
- נוספה השלמת Builder עם Preview בתוך המסך (`#wb-complete` + `#wb-preview-frame`) וכפתור נפרד `המשך לעוזרים`.

### מה קורה אחרי Builder, האם נבנה אתר אמיתי, מה דמו, והשלב הבא
- אחרי `סיום ובנה Preview` נוצרת תצוגת אתר דמו מתוך נתוני העסק/אסטרטגיה ונשמרת ב-`localStorage`.
- נשמרים מפתחות: `coco-website-builder-last-output-v1`, `coco-website-builder-last-context-v1`, `coco-website-builder-preview-html-v1`.
- כרגע זה **Preview דמו** (template-based `iframe/srcdoc`) ולא deploy אמיתי ל-hosting.
- שלב הבא המתוכנן: חיבור build/deploy אמיתי (CMS/hosting pipeline), תצוגת multi-page מלאה, ואישור publish.

## 8. האם העוזרים עדיין עובדים בנפרד
- כן. בוצעה הפרדה ברורה:
- `פתח מנהל השיווק / שלח לעוזרים` -> ניווט ל-`screen-agents`.
- `🌐 צור אתר AI` -> פתיחת Builder בתוך המסך, ללא ערבוב פעולות.

## 9. Commit
- `f42a021` (pushed ל-`origin/main`).

## 10. קישור Staging
- URL בדיקה: `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-companies-ui-fix-v2`
- סטטוס אוטומציה: `PASS` (24/24, Desktop + iPhone 13).
