# דוח מנוע אוטומציה יומי v2 — Orin Staging

**תאריך:** 2026-06-29  
**גרסה:** v3-daily-engine-2 · Engine 2.0.0  
**Staging URL:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-2  
**Commit:** `3f8426c`  

---

## 1. איך המנוע עובד

מנוע יומי קל (`DailyEngine` v2) מריץ **צינור שלבים** (pipeline) — לא קריאה אחת כבדה:

```
companies → sites → sources → analyze → goals → actions → SLA → history-lite → report-lite → schedule-recheck
```

**הרצה:**
- **GitHub Actions** — cron יומי 06:00 UTC (`daily-marketing-engine.yml`)
- **Node POC** — `node scripts/daily-marketing-engine.mjs`
- **דפדפן Staging** — כפתור «🤖 מצב אוטומטי» במסך פעולות

**עקרון:** `EXECUTION_MODE=preview` — המנוע **מכין** מטרות ופעולות טיוטה בלבד; אין deploy לאתר חי.

**מודל multi-tenant (מוכן לעתיד):**
```js
{ clientId, businessId, siteId, domain, keywords[], sources[], schedule: { daily, seoRecheckDays, pagespeedDays } }
```

כיום: לקוח יחיד `dalia-c-official` · אתר `dalia-c.com`.

---

## 2. איך שומרים על מהירות האתר

| מנגנון | יישום |
|--------|--------|
| **אתר אחד בכל פעם** | `stageSites` — `processOneAtATime: true` |
| **עמודים ב-chunks** | `PAGE_CHUNK=5` — 28 עמודים = 6 chunks |
| **מקורות sequential** | GSC/GA4/GBP/Ads/PageSpeed — דילוג אם לא מחובר |
| **yield בדפדפן** | `requestIdleCallback` / `setTimeout(0)` בין chunks |
| **localStorage מוגבל** | 30 ריצות · 50 טיוטות · 100 history-lite |
| **דוח רזה** | `<50KB` — ללא HTML crawl מלא |
| **אין תמונות/JSON כבד** | אין embed של crawl מלא ב-LS |

**הערכת גודל LS (POC):** ~4.4KB סה"כ (runs 1.1KB · drafts 2KB · keywords 168B · autoMode 386B · history 556B).

---

## 3. מה הנתונים שהמנוע אוסף

**ממצאים (slim):**
- עמודים down / slow (HTTP, loadTimeMs)
- תוכן חסר (`missing`, `issues`)
- בעיות SEO (checklist fails, `seoScore < 5`)
- פעולות פתוחות / תקועות (>7 ימים)
- התאמת keyword לעמוד

**לא נאסף בדפדפן:** HTML מלא, crawl גולמי, דוחות audit כבדים.

---

## 4. מאיפה הנתונים מגיעים

| מקור | סטטוס Staging | מצב |
|------|---------------|-----|
| **dashboard.json** | ✅ | snapshot |
| **site-work-plan.json** | ✅ | 28 עמודים · 395 פעולות |
| **site-crawl-lite.json** | ✅ | crawl-lite · 28 עמודים |
| **GSC** | ✅ | snapshot ב-dashboard — לא API חי |
| **GA4** | ✅ | snapshot — לא API חי |
| **GBP** | ❌ | `not_connected` — מדולג |
| **Google Ads** | ❌ | `not_connected` — מדולג |
| **PageSpeed** | ❌ | `not_connected` — מדולג |
| **Sheets** | ⚠️ | webhook ריק — CSV fallback |
| **CRM** | ⚠️ | `local_only` |
| **AI agents** | ❌ | `skip_live` — 0 קריאות |
| **ידני** | ✅ | כפתור מצב אוטומטי |

---

## 5. נתונים → מטרות (Goals)

כל המלצה → מטרת טיוטה **רזה**:

| שדה | דוגמה |
|-----|--------|
| `id` | `goal-daily-1782703966127-0` |
| `clientId` / `siteId` | `dalia-c-official` / `site-dalia-c` |
| `pageId` | `page-01` |
| `keyword` | `ניהול צי רכב` |
| `topic` | `SEO` |
| `priority` | `גבוה` |
| `reason` | עד 200 תווים |
| `status` | `pending_approval` |

**Keywords ברירת מחדל (dalia-c):** ניהול צי רכב, מעקב GPS, תחזוקת רכבים, דלק וצריכה, ביטוח צי, נהגים ורישיונות, טלמטיקה, Fleet management, vehicle tracking, תחזוקה מונעת.

---

## 6. מטרות → פעולות (Actions)

כל פעולה **חייבת**:

| שדה | חובה |
|-----|------|
| `name`, `description` | ✅ |
| `goalId`, `clientId`, `siteId`, `pageId` | ✅ |
| `keyword`, `priority`, `status` | ✅ |
| `sla` | `{ type, dueAt, openedAt, recheckAt }` |
| `assignee` | אופציונלי |
| `completionChecklist` | מחרוזת קצרה |

**POC:** 2 פעולות — `act-daily-03966124` (SEO) · `act-daily-03966124-1` (תוכן).

---

## 7. SLA ומסגרות זמן

| סוג | dueAt | recheckAt |
|-----|-------|-----------|
| **urgent** | היום (סוף יום UTC) | — |
| **normal** | 2–3 ימים | — |
| **large** | 7 ימים | — |
| **seo_followup** | N ימים (`seoRecheckDays=14`) | = dueAt |

**דוגמה POC:**
- SEO: `seo_followup` → due 2026-07-13
- תוכן: `normal` → due 2026-07-01

---

## 8. מחזורי Recheck

`schedule` per client:
- **daily** — פעולות יומיות (בדיקת `lastRunAt`)
- **seo** — כל 14 יום
- **pagespeed** — on demand / כל 30 יום
- **reports** — daily/weekly

אחרי השלמת פעולה → `recheckAt` — **לא** פותח מחדש מיד.

**nextRecheck POC:** daily 06:00 UTC · seo 2026-07-13 · pagespeed 2026-07-29.

---

## 9. איפה ההיסטוריה נשמרת

| מיקום | תוכן | מגבלה |
|-------|------|--------|
| **דפדפן** `dalia-daily-engine-history-lite-v1` | שורות רזות: client, site, goalId, actionId, status, date, who, result, link, commit, note | 100 |
| **דפדפן** `dalia-daily-engine-runs-v1` | סיכום ריצות (~2KB/ריצה) | 30 |
| **Node** `docs/audit-reports/daily-engine/` | דוח מלא JSON + meta | repo בלבד |
| **progress log** | `dalia-work-progress-log` | 100 |

**ייצוא:** `exportHistoryToSheets()` — POST ל-webhook אם מוגדר, אחרת CSV download.

---

## 10. מה הולך ל-Google Sheets

- **ייצוא היסטוריה** — POST `{ type: 'daily-engine-history', rows: [...] }` ל-webhook
- **ייצוא פעולות** — קיים במסך פעולות (CSV / Sheets webhook נפרד)
- **דוח יומי מלא** — **לא** בדפדפן; Node כותב ל-`docs/audit-reports/daily-engine/report.json`

**חסר:** webhook URL ריק — Sheets לא פעיל עד הגדרה (`SHEETS-WEBHOOK-SETUP-HE.md`).

---

## 11. מה **לא** נשמר באתר

- ❌ HTML crawl מלא
- ❌ קוד מקור עמודים
- ❌ תמונות / assets
- ❌ דוחות audit כבדים (>50KB)
- ❌ JSON work-plan מלא ב-localStorage
- ❌ payloads כבדים ב-`dalia-auto-mode-v1` (סטטוס בלבד)
- ❌ קריאות AI agents חיות

---

## 12. Multi-business / Multi-site

**מוכן בתשתית:**
- `getDefaultTenants()` — מערך tenants
- שדות `clientId`, `businessId`, `siteId`, `domain` בכל goal/action
- `dalia-daily-engine-keywords-v1` — keywords per client

**כיום בפועל:** tenant יחיד (dalia-c). הרחבה = הוספת tenants למערך + keywords per client.

---

## 13. מה דורש API / webhook / setup

| פריט | סטטוס |
|------|--------|
| Sheets webhook URL | ⚠️ ריק — חסום |
| GSC/GA4 live API | ❌ snapshot בלבד |
| GBP / Ads | ❌ לא מחובר |
| PageSpeed API | ❌ לא מחובר |
| Supabase CRM remote | ❌ Staging static |
| AI agents (OpenAI/Claude/Gemini) | ❌ skip_live |
| GitHub Actions cron | ✅ פעיל (read-only artifact) |
| Deploy Staging | ⚠️ **ידני בלבד** — אין auto-deploy |

---

## 14. מה עובד ב-Staging עכשיו

| יכולת | סטטוס |
|-------|--------|
| Pipeline v2 (10 שלבים) | ✅ REAL |
| Batch chunks (5 עמודים) | ✅ REAL |
| Keywords + topic ב-goals/actions | ✅ REAL |
| SLA dates + recheckAt | ✅ REAL |
| Draft actions עם כל השדות | ✅ REAL |
| Node POC + report.json | ✅ REAL |
| כפתור מצב אוטומטי + progress toast | ✅ REAL (לאחר deploy) |
| מיזוג טיוטות ב-coco-claude-data | ✅ REAL |
| history-lite + export CSV | ✅ REAL |
| GitHub Actions cron | ✅ תשתית |

**POC אחרון:** `run-1782703966124` · 28 עמודים · 6 chunks · 2 המלצות · 2 מטרות · 2 פעולות · 0 down · 6 SEO.

---

## 15. מה תשתית בלבד (לא production)

- GitHub Actions — artifact בלבד, **לא deploy**
- GBP, Ads, PageSpeed — placeholders
- AI agents — 0 live calls
- Supabase remote — לא על GH Pages
- Sheets — דורש webhook ידני
- Multi-tenant UI — אין מסך בחירת לקוח (data model מוכן)
- `enabled: false` תמיד — אין auto-execute ללא אישור
- Production / dalia-c.com — **לא נגע**

---

## קבצים שהשתנו

- `public/ai-marketing/daily-engine.js` — refactor v2 + batch
- `scripts/lib/daily-engine-core.mjs` — pipeline משותף
- `scripts/daily-marketing-engine.mjs` — POC v2
- `public/ai-marketing/actions-workbench.js` — auto mode stats + progress
- `public/ai-marketing-platform.html` — cache `v3-daily-engine-2`
- `docs/audit-reports/daily-engine/REPORT-HE-v2.md` — מסמך זה
- `docs/audit-reports/daily-engine/report.json`, `meta.json`, `run-*.json`

---

## פערים כנים (Gaps)

1. Webhook Sheets — URL ריק
2. GSC/GA4 — snapshot, לא live
3. GBP, Ads, PageSpeed — לא מחוברים
4. AI agents — skip
5. Deploy Staging — דורש אישור ידני (preview)
6. Multi-tenant UI — לא מיושם
7. SEO recheck skip logic — רץ ב-POC הראשון; ידלג ב-reruns באותו יום

---

*Orin Staging בלבד · ללא Production · ללא שינוי עיצוב UI*
