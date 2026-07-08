# דוח לפני Commit — פרסום Standalone + Client Context

**תאריך:** 2026-07-08  
**בדיקה:** מקומית (`http://127.0.0.1:4173`) לפני Push ל-Staging  
**תוצאה:** `passed: true` · 0 כשלונות

---

## מה בוצע

| שינוי | פירוט |
|--------|--------|
| עמוד חדש | `public/coco-dalia/pirsum-home.html` — קל, בלי Orin, בלי launcher, בלי iframes |
| כפתור פרסום ב-Orin | `openPirsumStandalone()` מתוך `client-id-ssot.js` — מעביר `clientId/name/site/domain` |
| ניתוק מהמנהל הישן | ביטול auto-open ל-`screen-pirsum`; הוסר `coco-dalia-pirsum-launcher.js` מ-boot של Orin |
| OAuth | callback חוזר ל-`pirsum-home.html` |
| Orin עצמו | לא נמחק / לא נשבר — רק כפתור פרסום מצביע החוצה |

## Client Context

- נשמר ב-`localStorage` (`coco-pirsum-client-v1` + `coco-flow-context-v2`)
- מועבר ב-query ל-work / control
- בבדיקה: שם לקוח **דליה…** + `dalia-c-official` מופיעים ב-home; LS נשמר גם ב-work/control

## מדדי ביצועים (מקומי)

| מדד | ערך |
|-----|-----|
| Orin boot | **2350ms** |
| פתיחת pirsum-home | **1042ms** |
| פתיחת מרכז העבודה | **1612ms** |
| פתיחת מרכז השליטה | **2869ms** |
| מעבר עבודה↔שליטה (avg / max) | **37s / 47s** — ניווט עמוד מלא של v5 (לא hang של Playwright) |
| Home scripts חיצוניים | **0** |
| Home heap | **9.5MB** |
| Home iframes | **0** |
| Launcher ישן ב-Orin | **לא נטען** |

## צ׳ק-ליסט לפני Commit

| בדיקה | סטטוס |
|--------|--------|
| כניסה Orin → פרסום | ✓ |
| מרכז העבודה עמוד עצמאי | ✓ |
| מרכז השליטה עמוד עצמאי | ✓ |
| מעבר ביניהם יציב (5 סיבובים, ללא hang) | ✓ |
| אין תלות ב-launcher / screen-pirsum בזרימה | ✓ |
| אין iframe של Orin בעמוד החדש | ✓ |
| Client context נשמר | ✓ |
| לא נגענו במנועים / Google / Supabase / Production | ✓ |

## הערות

1. זמן מעבר ~37s ממוצע משקף **טעינה מלאה של v5** (עשרות סקריפטים) כעמוד עצמאי — זה צפוי בארכיטקטורה B. זה **לא** קפיאת iframe ישנה.
2. בשלב הבא (לא ב-commit הזה): לדחות סקריפטים כבדים ב-v5 עד אחרי first paint — שיפור ביצועים בלי לערבב חזרה ל-Orin.
3. `screen-pirsum` / launcher **נשארו בקבצים** אבל מחוץ לזרימה הפעילה (לא נמחקו).

ראיות: `docs/audit-reports/staging-freeze-diagnostic/standalone-pirsum-verify.json`
