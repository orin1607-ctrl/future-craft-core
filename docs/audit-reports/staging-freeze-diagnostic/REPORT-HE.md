# דוח אבחון — תקיעות Staging (ללא שינוי קוד)

**תאריך:** 2026-07-08  
**URL:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html  
**סטטוס:** אבחון בלבד — לא בוצעו תיקונים

---

## סיכום מנהלים

התקיעות **לא נובעת מ-GitHub Pages כשירות תקול**, אלא משילוב של:

1. **מרכז העבודה (WIRED)** — קובץ ענק (469KB) עם 5 iframes מסוג `srcdoc` מוטמעים בתוכו; לחיצות על כפתורים בתוכו מאפסות `srcdoc` וגורמות לקפיאה (מתועד בקוד).
2. **טעינת boot כבדה** — `site-work-plan.json` בגודל **731KB** נטען בכל כניסה עם `cache: no-store`.
3. **`leavePirsum()`** — יציאה ממסך פרסום (או חזרה ל-Hub) מאפסת iframes ל-`about:blank` → טעינה מחדש מלאה.
4. **מעבר טאבים** — גם אחרי תיקון `1.2.0-tab-cache`, טעינה ראשונה של מרכז השליטה + שני iframes כבדים בזיכרון = קפיאות לסירוגין (אומת בבדיקות).

---

## 1. מה בדיוק גורם לתקיעה

| # | גורם | חומרה | מתי מורגש |
|---|------|--------|-----------|
| A | פרסור/רינדור `coco-dalia-full-A-J-WIRED (1).html` (469KB + srcdoc) | **קריטי** | כניסה לפרסום, לחיצה על כפתורים במרכז העבודה |
| B | `leavePirsum()` → `about:blank` | **גבוה** | יציאה מפרסום וחזרה; לפעמים ניווט פנימי |
| C | `initOfficial()` טוען JSON 731KB+ | **גבוה** | כל רענון דף |
| D | טעינה ראשונה של מרכז השליטה (91KB, ~4K DOM) תוך כדי WIRED בזיכרון | **בינוני** | מעבר ראשון לטאב שליטה |
| E | כפילות `CocoPirsumHub.open` / `goScreen` מרובד (6+ שכבות) | **בינוני** | boot, מעברי מסך |
| F | `ai-assistant.js` נטען אחרי 8 שניות ב-Lite | **נמוך-בינוני** | ~8s אחרי כניסה |
| G | 404 ב-fetch (`/api/project/baseline` בתוך WIRED) | **נמוך** | רקע; לא חוסם אבל מלכלך console |

---

## 2. באיזה קובץ

| קובץ | תפקיד בבעיה |
|------|-------------|
| `public/coco-dalia/coco-dalia-full-A-J-WIRED (1).html` | מרכז העבודה — srcdoc ענק, `showPart`, `launchCampaign` מאפס srcdoc |
| `public/ai-marketing/coco-dalia-pirsum-launcher.js` | `leavePirsum`, `suspendFrame`, ניהול iframes |
| `public/ai-marketing/dalia-site-config.js` | `initOfficial()` — fetch של work-plan 731KB |
| `public/ai-marketing-platform.html` | boot כפול לפרסום, `assetUrl` עם `v=v3-live-demo-3` |
| `public/ai-marketing/coco-marketing-lite-mode.js` | `maybeAutoOpenPirsum`, 3 עטיפות `goScreen` |
| `public/ai-marketing/coco-claude-bridge.js` | עטיפת `goScreen` נוספת |
| `public/ai-marketing/coco-marketing-unified.js` | `hookNavigation` על `goScreen` |
| `public/ai-marketing/ai-control-center-v5-STANDALONE.html` | מרכז השליטה — iframe שני |

---

## 3. באיזה פעולה

- **רענון מלא** → boot איטי (JSON + סקריפטים + auto-open פרסום)
- **כניסה לפרסום** → טעינת WIRED ב-iframe
- **לחיצה על כפתורים במרכז העבודה** (יצירת קמפיין, מעבר חלקים) → איפוס `srcdoc` פנימי
- **מעבר מרכז עבודה ↔ מרכז שליטה** → טעינה ראשונה של שליטה / לחץ זיכרון
- **חזרה ל-Hub ושוב לפרסום** → `leavePirsum` = טעינה מחדש מלאה של WIRED
- **השארת המערכת פתוחה** → `ai-assistant.js` ב-8s; אין לולאה אינסופית שזוהתה

---

## 4. הוכחות

### Network — גודל וזמן הורדה (מדידה 2026-07-08)

| משאב | גודל | זמן הורדה |
|--------|------|-----------|
| `ai-marketing-platform.html` | 18KB | 1019ms |
| `coco-claude-screens.html` | 404KB | 261ms |
| **WIRED (מרכז עבודה)** | **469KB** | 275ms |
| `ai-control-center-v5-STANDALONE.html` | 91KB | 172ms |
| `project-001/dashboard.json` | 43KB | 167ms |
| **`project-001/site-work-plan.json`** | **731KB** | 191ms |

הורדה מהירה; **הצוואר בקבוק הוא עיבוד בדפדפן**, לא CDN.

### בדיקות אוטומטיות (היום)

| בדיקה | תוצאה |
|--------|--------|
| `verify-hub-lite-staging.mjs` | 13/13 PASS אבל **64 שניות** סה"כ (ready: 7.9s) |
| `profile-staging-fast.mjs` | **נתקע** (>6 דקות, לא הסתיים) |
| בדיקת טאבים מהירה | boot 6.7s; טאבים 259–1674ms; **נתקע** באמצע סבב |
| גרסת launcher חיה | `1.2.0-tab-cache` — תיקון טאבים **קיים בשרת** |
| Service Worker | **לא קיים** |
| Console 404 | **כן** — `Failed to load resource: 404` |

### קוד — איפוס srcdoc שגורם לתקיעה (מתועד במקור)

בקובץ WIRED, שורות ~540–549:
> `reload() על iframe מסוג srcdoc אינו אמין בין דפדפנים ועלול לגרום לתקיעה`

### קוד — leavePirsum מאפס iframes

`coco-dalia-pirsum-launcher.js` — `suspendFrame` → `f.src = 'about:blank'`

---

## 5. רק אצלך או גם אצלי?

**גם אצלי.** הבדיקות האוטומטיות מראות:

- עלייה איטית (6–64 שניות לפי תרחיש)
- מעברי טאב לא יציבים (מאות ms עד **נתקיעה מוחלטת** של Playwright)
- לא תמיד נכשל — **לסירוגין** — מה שמסביר "לפעמים עובד, לפעמים תוקע"

דפדפן אמיתי עם DevTools פתוח, חלונות נוספים, או cache ישן — יכול להחמיר.

---

## 6. פתרון מוצע (לא מיושם — לאישורך)

### שלב א — הקלה מיידית (סיכון נמוך)

1. **ב-Lite:** לא לטעון `site-work-plan.json` (731KB) עד אחרי שהמשתמש בפרסום — או לדלג לגמרי אם לא נדרש למסך פרסום.
2. **בטל `leavePirsum` ביציאה זמנית ל-Hub** — השאר iframes בזיכרון (visibility בלבד).
3. **איחוד פתיחת פרסום** — נתיב אחד בלבד (`maybeAutoOpenPirsum` **או** boot ב-platform, לא שניהם).
4. **אל תטען `ai-assistant.js` במצב פרסום פעיל** ב-Lite.
5. **עדכן cache-buster** של `coco-dalia-pirsum-launcher.js` ל-`hub-lite-6` (כיום `v3-live-demo-3`).

### שלב ב — תיקון שורש (סיכון בינוני)

6. **החלף WIRED ב-embedded mode** בגרסה קלה יותר (ללא 5× srcdoc מוטמע) — למשל `coco-dalia-full-A-J` או shell נפרד לפרסום.
7. **פצל מרכז שליטה** לטעינה lazy עם skeleton עד `load`.

---

## 7. סיכון הפתרון

| פתרון | סיכון |
|--------|--------|
| דחיית work-plan | מסכי hub עלולים להראות פחות נתונים עד טעינה — **לא אמור לפגוע בפרסום** |
| ביטול leavePirsum | יותר זיכרון בטאב — מקובל לעומת reload של 469KB |
| החלפת WIRED | דורש QA על כפתורים בפנים — **הכי רגיש** אבל **הכי משמעותי** |
| איחוד goScreen | רגרסיה בניווט full mode אם לא נבדק עם `?hub=full` |

**לא נוגעים:** Production, Hostinger, Google, Supabase, Edge, 50 עוזרים, Orchestrator, מנועי בנייה, בוט ChatGPT.

---

## 8. מה לבדוק אחרי תיקון (מוצע)

1. רענון מלא — boot < 5s עד פרסום פעיל
2. 20 מעברי טאב עבודה↔שליטה — מקסימום < 500ms, אפס `about:blank` על WIRED
3. לחיצה על 5 כפתורים במרכז העבודה — אין קפיאה > 2s
4. Hub → פרסום → Hub → פרסום — בלי reload מלא של WIRED
5. Incognito + Hard Refresh + localStorage מנוקה
6. זיכרון יציב אחרי 10 דקות (< 300MB לטאב)
7. אפס שגיאות 404 קריטיות ב-console

---

## תשובות לצ'ק-ליסט

| שאלה | תשובה |
|------|--------|
| GitHub Pages / טעינת קבצים? | הורדה מהירה; הבעיה ב**גודל + עיבוד** |
| קוד? | **כן** — עיקרי |
| iframe? | **כן** — WIRED + leavePirsum |
| מרכז עבודה? | **כן** — 469KB + srcdoc |
| מרכז שליטה? | **חלקי** — טעינה ראשונה + זיכרון משולב |
| לולאת סקריפט? | **לא זוהתה** |
| Event Listeners כפולים? | **כן פוטנציאלי** — 6+ עטיפות goScreen |
| localStorage כבד? | בדרך כלל לא; WIRED כותב מפתחות קטנים |
| fetch/API תקוע? | work-plan 731KB; baseline 404 ב-WIRED |
| קובץ שלא נטען? | 404 על `/api/project/baseline` (צפוי ב-GH Pages) |
| שגיאות Console? | **כן** — 404 |
| זיכרון? | שני iframes כבדים במקביל |
| reload מיותר iframe? | **כן** — leavePirsum + srcdoc reset |
| cache ישן? | אפשרי ל-JS עם `v=v3-live-demo-3`; launcher בשרת מעודכן |
| Service Worker? | **לא** |

---

*נוצר אוטומטית. סקריפטים: `scripts/diagnose-staging-freeze-v3.mjs` (הופסק בגלל תקיעה), מדידות network ידניות.*
