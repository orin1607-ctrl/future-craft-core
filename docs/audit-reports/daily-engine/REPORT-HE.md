# דוח מנוע אוטומציה יומי — Orin Staging

**תאריך:** 2026-06-29  
**גרסה:** v3-daily-engine-1  
**Staging URL:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-1  
**Commit (לפני דחיפה):** c8e8cb5 → יתעדכן לאחר commit  

---

## 1. מנוע אוטומציה יומי

מנוע יומי (`DailyEngine`) רץ **פעם ביום** (06:00 UTC ב-GitHub Actions) או **ידנית** מכפתור «מצב אוטומטי» במסך פעולות.

**מחזור ריצה:**
1. **איסוף נתונים** — `dashboard.json`, `site-work-plan.json`, `site-crawl-lite.json`
2. **בדיקת אתר/עמודים/מטרות/פעולות** — סטטוס HTTP, SEO, תוכן חסר, פעולות פתוחות/תקועות
3. **יצירת המלצות + מטרה + פעולת טיוטה** — ממתינות לאישור משתמש
4. **עדכון היסטוריה** — `dalia-work-progress-log` + `dalia-daily-engine-runs-v1`
5. **דוח יומי** — `docs/audit-reports/daily-engine/report.json`

**עקרון:** המנוע **לעולם לא מבצע** שינויים באתר החי — רק `EXECUTION_MODE=preview`.

---

## 2. מקורות נתונים

| מקור | סטטוס Staging | הערה |
|------|---------------|------|
| GSC | ✅ snapshot | נתונים ב-`dashboard.json` / work-plan — לא API חי בדפדפן |
| GA4 | ✅ snapshot | idem |
| GBP | ❌ | `pending_google_api_approval` |
| Google Ads | ❌ | `pending_production_access` |
| PageSpeed | ❌ | לא מחובר |
| CRM (Supabase) | ❌ | Staging static — אין חיבור remote |
| Google Sheets | ⚠️ | חשבון מחובר; **webhook URL ריק** |
| נתוני אתר (crawl) | ✅ | `site-crawl-lite.json` — 28 עמודים |
| work-plan / dashboard | ✅ | 28 עמודים, 395 פעולות |
| סוכני AI | ❌ | 0 API חיים |
| ידני | ✅ | כפתור «מצב אוטומטי» |

**חסר לחיבור מלא:** GBP, Ads, PageSpeed API, Supabase remote, Sheets webhook, OpenAI/Claude/Gemini live.

---

## 3. מה המנוע עושה בכל ריצה יומית

- **עמודים למעלה/למטה** — בדיקת `httpStatus` מ-crawl (0 עמודים down בריצת הדוגמה)
- **עמודים איטיים** — אם `loadTimeMs > 3000` (אין נתוני מהירות ב-snapshot הנוכחי)
- **תוכן חסר** — `missing`, `issues` מ-work-plan (20+ עמודים עם חוסרים)
- **SEO** — checklist fails + `seoScore < 5` (6 עמודים בריצת הדוגמה)
- **פעולות פתוחות** — 395
- **הושלמו** — 0
- **תקועות** — 0 (אין `in_progress` מעל 7 ימים)
- **דורשות אישור** — 395 + 1 טיוטה חדשה מהמנוע

---

## 4. אישור לפני ביצוע

- המנוע יוצר רק: המלצות, מטרה, פעולת טיוטה (`requiresApproval: true`)
- `enabled: false` תמיד ב-`dalia-auto-mode-v1`
- אישור ביצוע נשאר דרך `CocoActApprove` — Staging preview בלבד
- **אין deploy לאתר חי**

---

## 5. כפתור מצב אוטומטי

שופר ב-`actions-workbench.js` (לוגיקה בלבד, ללא שינוי עיצוב):

- לחיצה מפעילה `DailyEngine.run()`
- Toast עם סיכום ריצה
- תגית על הכפתור: ריצה אחרונה, ספירת המלצות/פעולות, שגיאות
- `title` tooltip: ריצה הבאה (`nextRunAt` — 06:00 UTC למחרת)
- מצב נשמר ב-`dalia-auto-mode-v1` (מורחב: `lastRunAt`, `lastRunSummary`, `runCount`, …)

---

## 6. דוח יומי בסוף ריצה

נוצר `docs/audit-reports/daily-engine/report.json` עם:
- סיכום (עמודים, המלצות, מטרות, פעולות)
- מקורות נתונים + חסרים
- ממצאים (SEO, תוכן, פעולות)
- המלצות, מטרה, פעולות שנוצרו
- שגיאות (אם יש)

---

## 7. היסטוריה

כל ריצה נשמרת ב-`dalia-daily-engine-runs-v1` (דפדפן) / `local-state-snapshot.json` (Node POC):

| שדה | תיאור |
|-----|--------|
| `id` | מזהה ריצה (`run-…`) |
| `client` | `dalia-c-official` |
| `site` | `dalia-c.com` |
| `dataChecked` | רשימת מקורות שעברו |
| `conclusions` | כותרות המלצות |
| `actionsCreated` | מזהי פעולות טיוטה |
| `status` | `completed` / `error` |
| `errors` | מערך שגיאות |

פעילות מופיעה גם במסך היסטוריה דרך `dalia-work-progress-log`.

---

## 8. מה נדרש למערכת עובדת — מלאי כנה

### קיים היום
- מנוע ליבה: `daily-engine.js` + `daily-engine-core.mjs`
- סקריפט headless: `scripts/daily-marketing-engine.mjs`
- GitHub Actions cron: `.github/workflows/daily-marketing-engine.yml`
- אחסון localStorage בדפדפן
- מיזוג פעולות טיוטה ב-`coco-claude-data.js`
- כפתור מצב אוטומטי משופר

### חסר / לא פעיל
- API חי ל-GSC/GA4/Ads מ-GH Pages (סטטי)
- Supabase על Staging marketing screen
- Sheets webhook URL (ריק)
- סוכני AI (0 live)
- PageSpeed API
- GBP / Ads production access
- שרת cron ייעודי — **מוחלף ב-GitHub Actions + הרצה ידנית בדפדפן**

### איך להפעיל
1. **ידני בדפדפן:** Staging → מסך פעולות → «🤖 מצב אוטומטי»
2. **Node מקומי:** `node scripts/daily-marketing-engine.mjs`
3. **Cron:** GitHub Actions `Daily Marketing Engine` — יומי 06:00 UTC או `workflow_dispatch`

### איך לאמת
- בדוק `report.json` ב-`docs/audit-reports/daily-engine/`
- בדפדפן: localStorage `dalia-auto-mode-v1` — `lastRunAt` מעודכן
- מסך היסטוריה: רשומת «מנוע יומי»
- מסך פעולות: פעולה `act-daily-…` (אחרי הרצה בדפדפן)

---

## 9. Proof of Work — ריצת דוגמה אחת

| שלב | סוג | תוצאה |
|-----|-----|--------|
| התחלת ריצה | **REAL** | `node scripts/daily-marketing-engine.mjs` — `run-1782703252004` |
| איסוף נתונים | **REAL** | dashboard + work-plan + crawl — 28 עמודים |
| המלצה | **REAL** | «שיפור SEO — /», «תוכן חסר — /» |
| מטרה | **REAL** | `goal-daily-1782703252005` — ממתין לאישור |
| פעולה | **REAL** (טיוטה) | `act-daily-03252004` — נשמר ב-snapshot, לא בדפדפן עדיין |
| מסך פעולות | **DEMO עד הרצה בדפדפן** | הפעולה תופיע אחרי לחיצה על «מצב אוטומטי» ב-Staging |
| היסטוריה | **DEMO עד הרצה בדפדפן** | localStorage נכתב רק בדפדפן |
| דוח | **REAL** | `report.json` + `meta.json` |

**סיכום ריצה:** 28 עמודים · 2 המלצות · 1 מטרה · 1 פעולה · 395 פתוחות · 0 down · 6 SEO issues

---

## 10. דוח סופי

### נבנה
- `public/ai-marketing/daily-engine.js` — מנוע דפדפן
- `scripts/lib/daily-engine-core.mjs` — ליבה משותפת
- `scripts/daily-marketing-engine.mjs` — POC headless
- `.github/workflows/daily-marketing-engine.yml` — cron יומי
- שיפור כפתור מצב אוטומטי + מיזוג טיוטות

### עובד
- ריצת Node POC מלאה עם דוח JSON
- לוגיקת ניתוח SEO/תוכן/פעולות
- תזמון ריצה הבאה
- תשתית אישור לפני ביצוע

### ידני / דמו
- הצגת פעולה במסך פעולות — דורשת הרצה בדפדפן Staging
- היסטוריה ב-UI — דורשת localStorage מהדפדפן

### חסר
- חיבורי API חיים, Supabase, Sheets webhook, AI agents

### קבצים שהשתנו
- `public/ai-marketing/daily-engine.js` (חדש)
- `scripts/lib/daily-engine-core.mjs` (חדש)
- `scripts/daily-marketing-engine.mjs` (חדש)
- `.github/workflows/daily-marketing-engine.yml` (חדש)
- `public/ai-marketing-platform.html`
- `public/ai-marketing/actions-workbench.js`
- `public/ai-marketing/coco-claude-data.js`
- `docs/audit-reports/daily-engine/*`

### Staging URL
https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-1

---

*Orin Staging בלבד · ללא שינוי Production · ללא שינוי עיצוב UI*
