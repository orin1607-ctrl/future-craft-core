# ניתוח שורש — למה Staging נתקע (אבחון מבוסס-ראיות, בלי תיקון)

**תאריך:** 2026-07-08  
**בסיס:** `REPORT-HE.md` + מדידות + קוד launcher/WIRED + תוצאות Playwright שנכנסו ל-timeout  
**סטטוס:** אבחון בלבד — אין שינוי קוד

---

## תשובה קצרה

השורש הסביר ביותר הוא **מרכז העבודה (WIRED) כ-iframe כבד עם iframes מקוננים מסוג `srcdoc`**, שגורם לחסימת ה-main thread של הדפדפן.  
מנגנון המעבר למרכז השליטה **מחמיר** את זה כי הוא מוסיף iframe שני כבד במקביל — וזה מסביר למה גם Playwright נתקע.

זה **לא** בעיקר bug של Event Listeners, ולא Promise שלא מסתיים, ולא כשל ברשת של GitHub Pages.

---

## 1. מהו הגורם הסביר ביותר?

**חסימת main-thread בגלל טעינה/תחזוקה של `coco-dalia-full-A-J-WIRED (1).html` בתוך `pirsum-frame-work`.**

הקובץ:

- ~469KB HTML
- 5 אלמנטים מסוג `<iframe>`
- ~9 מופעי `srcdoc` (תוכן HTML ענק מוטמע בתוך ה-string של ה-HTML עצמו)
- עשרות בלוקי script פנימיים

כשהדפדפן טוען אותו, הוא לא רק "מוריד קובץ" — הוא **מפרסר ומצייר עץ מסמכים מקונן**. זה חוסם את ה-UI thread. כשמוסיפים מעליו גם את מרכז השליטה, הלחץ גדל עוד.

זה מתאים בדיוק לדפוס שאתה מתאר:

- עלייה איטית
- כפתורים שלא מגיבים / תוקעים את העמוד
- מעבר בין מרכזי עבודה/שליטה לא יציב
- לפעמים צריך יציאה מלאה מהמערכת

---

## 2. באיזה קובץ/מודול זה מתחיל?

**נקודת הכניסה:**  
`public/ai-marketing/coco-dalia-pirsum-launcher.js`

```9:10:public/ai-marketing/coco-dalia-pirsum-launcher.js
  var WIRED_FILE = 'coco-dalia/coco-dalia-full-A-J-WIRED%20(1).html';
  var V5_FILE = 'ai-marketing/ai-control-center-v5-STANDALONE.html';
```

`ensureFrameLoaded('work')` קובע את ה-src של `pirsum-frame-work` ל-WIRED.

**נקודת העומס בפועל:**  
`public/coco-dalia/coco-dalia-full-A-J-WIRED (1).html`

שם נמצאים:

- ה-iframes המקוננים (`frame-a/b/c/team/d`)
- איפוסי `srcdoc` בלחיצת campaign (הערה מפורשת בקוד על תקיעה בין דפדפנים)
- `connectToDataLayer()` עם fetch ל-`/api/project/baseline` (404 ב-GitHub Pages)

---

## 3. מה סוג הבעיה?

| מועמד | האם זה השורש? | הסבר |
|--------|----------------|------|
| **iframe מקונן + עומס רינדור** | **כן — ראשי** | WIRED + srcdoc + שליטה במקביל |
| **זיכרון / לחץ renderer** | **כן — משני ישיר** | שני iframes כבדים חיים יחד אחרי מעבר טאב ראשון |
| JavaScript loop אינסופי | לא נמצא | אין `while`/polling חשוד כגורם ראשי |
| Promise שלא מסתיים | לא ראשי | boot כן מחכה ל-JSON גדול, אבל זה מסביר איטיות, לא את הנתקיעה באמצע מעברי טאב |
| Event Listeners כפולים (`goScreen`) | מחמיר | 6+ עטיפות — מסבך ניווט, לא מסביר לבד את קפיאת Playwright |
| fetch/API תקוע | מחמיר | work-plan 731KB מאט boot; 404 baseline ב-WIRED לא חוסם |
| Service Worker / cache ישן | לא | SW לא קיים; launcher חי = `1.2.0-tab-cache` |
| GitHub Pages כשל רשת | לא | הורדות 170–275ms |

**מסקנה:** סוג הבעיה הוא **iframe + חסימת main-thread / לחץ renderer**, לא באג לוגיקה פשוט של JS.

---

## 4. איפה התקיעה — עבודה / שליטה / מעבר?

**עיקר: מרכז העבודה.**  
**מחמיר: מנגנון המעבר + טעינה ראשונה של מרכז השליטה.**

רצף מדויק:

1. Lite פותח אוטומטית פרסום → launcher טוען WIRED ל-`pirsum-frame-work`.
2. הדפדפן בונה מסמך כבד עם iframes פנימיים → העמוד כבר רגיש לתקיעה.
3. לחיצה על "מרכז השליטה" → `ensureFrameLoaded('control')` מתחיל טעינת `ai-control-center-v5-STANDALONE.html` (~91KB, אלפי DOM).
4. מעכשיו **שני** iframes כבדים חיים במקביל (WIRED מוסתר ב-CSS אבל עדיין פעיל בזיכרון/CPU).
5. כל מעבר טאב נוסף (גם בלי reload) דורש מה-renderer לעדכן visibility/paint על עץ כבד → לפעמים קפאון.

חשוב: תיקון `1.2.0-tab-cache` כבר **ביטל reload מיותר בכל מעבר טאב**.  
כלומר התקיעה הנוכחית **אינה** בעיקר `about:blank` בכל switch — אלא עצם נוכחות WIRED + שליטה יחד.

`leavePirsum()` עדיין גרוע בנפרד: יציאה ל-Hub → `about:blank` → כניסה מחדש לפרסום = טעינת WIRED מחדש מאפס.

---

## 5. למה גם Playwright נתקע?

כי Playwright מדבר עם הדפדפן דרך CDP.  
כשה-main thread של העמוד חסום / ה-renderer לא מגיב:

- `page.evaluate(...)` לא חוזר
- לולאות "רק הצג טאב" נתקעות באמצע
- הסקריפט נראה כאילו "רץ לנצח" עד שעוצרים אותו ידנית

זה קרה בפועל:

| סקריפט | מה קרה |
|---------|---------|
| `diagnose-staging-freeze` / v2 / v3 | נתקעו באמצע מעברי טאב אחרי boot תקין |
| `profile-staging-fast.mjs` | נתקע >6 דקות |
| בדיקת טאבים מהירה | boot 6.7s + כמה switches, ואז קפיאה באמצע |
| `verify-hub-lite-staging.mjs` | עבר, אבל לקח ~64s — עומס גבוה גם בנתיב ה"שמח" |

**פירוש:** זו לא תקלה של כלי הבדיקה. זה אותו freeze של העמוד, שנמדד מבחוץ.

---

## 6. הראיות שמובילות למסקנה

1. **Network מהיר, חוויה איטית** — WIRED יורד ב-~275ms אבל העמוד עדיין כבד → צוואר הבקבוק הוא עיבוד, לא CDN.
2. **מבנה WIRED** — 469KB, 5 iframes, ~9 srcdoc, 52 מופעי script — ארכיטקטורת "מסמך בתוך מסמך".
3. **הערה בקוד עצמו** ב-WIRED על תקיעה באיפוס `srcdoc` בין דפדפנים.
4. **גרסת launcher חיה `1.2.0-tab-cache`** — בלי suspend בכל switch; ובכל זאת יש תקיעות → הבעיה נשארת גם בלי reload בכל טאב.
5. **Playwright נתקע על פעולות קלות** (`showTab` + `evaluate`) — סימן קלאסי לחסימת renderer, לא ל-timeout של רשת.
6. **מדידות iframe פנימיות קודמות** הראו DOM של אלפי אלמנטים בתוך שליטה + srcdoc פנימי ב-WIRED.
7. **Service Worker לא קיים** — שולל טעינת גרסה ישנה דרך SW.
8. **הדפוס לסירוגין** — מתאים ללחץ זיכרון/CPU תלוי מצב, לא לבאג דטרמיניסטי קטן.

---

## 7. שלוש הסיבות הסבירות ביותר (לפי עדיפות)

### #1 — שורש (הכי סביר)
**WIRED כ-iframe עם srcdoc מקונן** — חסימת main-thread בטעינה ובשימוש.
- קובץ: `coco-dalia-full-A-J-WIRED (1).html`
- פעולה: כניסה לפרסום / עבודה במרכז העבודה / מעבר טאבים אחרי שהטאב נטען

### #2 — מחמיר ישיר
**טעינה ומגורים במקביל של מרכז השליטה ליד WIRED**
- קובץ: launcher + `ai-control-center-v5-STANDALONE.html`
- פעולה: לחיצה ראשונה על "מרכז השליטה", ואז מעברים חוזרים

### #3 — מחמיר boot / חזרה
**`initOfficial()` עם `site-work-plan.json` (731KB) + `leavePirsum()` שמאפס iframes**
- קבצים: `dalia-site-config.js`, `coco-dalia-pirsum-launcher.js`
- פעולה: רענון / Hub↔פרסום
- חשוב: זה מסביר איטיות ו"צריך להיכנס מחדש", אבל **פחות** מסביר את קפיאת Playwright באמצע מעברי טאב אחרי שהכל כבר פתוח

---

## 8. איזה תיקון לבצע ראשון — ולמה (המלצה בלבד)

**התיקון הראשון שאני ממליץ עליו (לא מיושם):**

> **להפסיק לטעון את `coco-dalia-full-A-J-WIRED (1).html` כ-iframe העבודה במצב Lite.**  
> במקומו: shell קל / גרסת פרסום מקוצרת בלי 5× srcdoc מוטמע.

### למה דווקא זה?

- זה **מכה בשורש #1**, לא בסימפטום.
- כל התיקונים הקטנים עד עכשיו (Lite, tab-cache, הסתרת UI) שיפרו מדדים חלקיים — אבל **Playwright עדיין נתקע**, ואתה עדיין נתקע.
- דחיית work-plan / ביטול leavePirsum / cache-buster — חשובים, אבל אם WIRED נשאר כמות שהוא, התקיעה תופיע שוב ברגע שמרכז העבודה פתוח.

### סדר מומלץ בהמשך (רק אחרי אישור)

1. **שורש:** החלפת יעד העבודה של Lite מ-WIRED לגרסה קלה  
2. **בידוד:** לא לשמור את שני ה-iframes כבדים פעילים יחד בלי צורך (או להשהות את הלא-פעיל בלי לאבד cache בצורה מסוכנת)  
3. **הקלה:** דחיית `site-work-plan.json` ב-Lite + ביטול `leavePirsum` האגרסיבי

---

## מה לא נחשב לשורש

- Production / Hostinger
- חיבורי Google / Supabase / Edge
- 50 עוזרים / 10 יועצים / Orchestrator / בוט ChatGPT
- כשל GitHub Pages כרשת
- Service Worker

---

## שורה תחתונה לקבלת החלטה

| שאלה | תשובה |
|------|--------|
| שורש? | WIRED iframe עם srcdoc מקונן |
| מתחיל ב? | launcher טוען WIRED → הקובץ עצמו חונק את הדפדפן |
| סוג? | iframe + main-thread / לחץ renderer |
| איפה? | בעיקר מרכז העבודה; מעבר לשליטה מחמיר |
| למה Playwright נתקע? | כי אותו freeze חוסם גם את ה-agent אוטומטי |
| תיקון ראשון? | להפסיק להשתמש ב-WIRED כ-iframe העבודה ב-Lite |

**אין תיקון בדוח הזה.** ממתינים להחלטה שלך אם להתקדם לתיקון השורש (#1) או קודם להקלות (#3) בלבד.
