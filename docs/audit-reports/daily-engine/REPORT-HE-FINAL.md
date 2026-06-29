# דוח סופי — מערכת שיווק Orin Staging + מנוע יומי v2

**תאריך:** 2026-06-29  
**גרסה:** v3-daily-engine-2 · Engine 2.0.0  
**Staging URL:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-2  
**Commits:** `3f8426c` (pipeline v2) · `9b527bb` (REPORT-HE-v2) · `6f41134` (v1) · `045b635`/`c8e8cb5` (scroll v9)

---

## מבנה המסמך

| סעיפים | מיקום |
|--------|--------|
| **1–15** — ארכיטקטורה, pipeline, מקורות, SLA, היסטוריה, פערים | [REPORT-HE-v2.md](./REPORT-HE-v2.md) |
| **16–22** — סיכונים, תוכנית בוקר, כלים, עדיפויות, roadmap, הערכה מקצועית | **מסמך זה** |

---

## 16. סיכונים — ניתוח מלא

### 16.1 סיכוני מערכת כלליים

| סיכון | תיאור | רמת סיכון | מיטיגציה |
|-------|--------|-----------|----------|
| **Staging ≠ Production** | GH Pages סטטי; אין שרת backend; שינויים לא משפיעים על dalia-c.com | **נמוך** (למטרת POC) · **גבוה** (אם מבלבלים עם prod) | תיוג ברור `EXECUTION_MODE=preview`; `enabled: false` תמיד; אין deploy אוטומטי לאתר חי |
| **אחסון localStorage בלבד** | ריצות, טיוטות והיסטוריה נשמרים בדפדפן — אובדן בניקוי cache / מכשיר אחר | **בינוני** | מגבלות: 30 ריצות · 50 טיוטות · 100 history-lite; ייצוא CSV; webhook ל-Sheets כשמוגדר; Node POC כותב `report.json` ל-repo |
| **אין מקור אמת מרכזי** | נתונים מפוזרים: JSON סטטי, LS, repo | **בינוני** | מודל multi-tenant מוכן (`clientId`, `siteId`); שלב עתידי: Supabase / Sheets כמאגר מרכזי |
| **GitHub Actions לא מחליף דפדפן** | Cron יוצר artifact ב-repo בלבד — לא מעדכן LS במסך Staging | **בינוני** | הרצה ידנית בבוקר דרך «מצב אוטומטי»; תיעוד תוכנית בוקר (סעיף 17) |
| **Deploy Staging ידני** | שינויי קוד לא נראים ב-URL עד push + אישור | **נמוך** | cache bust `?v=v3-daily-engine-2`; תהליך Git מוגדר |

### 16.2 סיכוני ביצועים

| סיכון | תיאור | רמת סיכון | מיטיגציה |
|-------|--------|-----------|----------|
| **עומס על מסך פעולות** | 395 פעולות + ריצת מנוע עלולות להאט UI | **בינוני** (היה גבוה ב-v1) | v2: `PAGE_CHUNK=5` · `requestIdleCallback` / `setTimeout(0)` · אתר אחד בכל פעם · דוח `<50KB` |
| **מילוי localStorage** | הצטברות runs/drafts/history | **נמוך** (כיום ~4.4KB) | `MAX_RUNS=30`, `MAX_DRAFTS=50`, `MAX_HISTORY=100`; `history_overflow_export_to_sheets` |
| **Crawl כבד** | embed של HTML מלא היה הורס ביצועים | **נמוך** (מוסר) | `site-crawl-lite.json` בלבד — 28 עמודים, ללא HTML גולמי |
| **ריצות כפולות באותו יום** | יצירת טיוטות כפולות | **נמוך** | `shouldRunPhase('daily')` — ידלג על goals/actions אם כבר רצה היום (Node); בדפדפן — בדיקת `lastRunAt` |

### 16.3 סיכוני נתונים

| סיכון | תיאור | רמת סיכון | מיטיגציה |
|-------|--------|-----------|----------|
| **Snapshot מיושן** | GSC/GA4 ב-`dashboard.json` — לא live | **בינוני** | תיוג `mode: snapshot`; המלצות מבוססות crawl + work-plan (עדכניים יחסית); עדכון snapshot ידני/תקופתי |
| **אי-דיוק בהמלצות** | לוגיקת SEO פשוטה (`seoScore < 5`, checklist fails) | **בינוני** | אישור משתמש חובה (`pending_approval`); Preview בלבד; לא ביצוע אוטומטי |
| **Keywords לא מדויקים** | התאמה לפי path/title בלבד | **נמוך** | רשימת keywords per client ב-`dalia-daily-engine-keywords-v1`; ניתן לערוך |
| **אובדן היסטוריה** | LS לא מסונכרן בין מכשירים | **בינוני** | ייצוא CSV / Sheets; `docs/audit-reports/daily-engine/report.json` מ-Node |

### 16.4 סיכוני Multi-tenant

| סיכון | תיאור | רמת סיכון | מיטיגציה |
|-------|--------|-----------|----------|
| **לקוח יחיד בפועל** | רק `dalia-c-official` — אין בידוד נתונים אמיתי | **נמוך** (כיום) · **גבוה** (בהרחבה) | שדות `clientId`/`siteId`/`businessId` בכל goal/action; `getDefaultTenants()` מוכן להרחבה |
| **אין UI בחירת לקוח** | בלבול בעת הוספת tenants | **בינוני** (עתידי) | Roadmap שלב 3 — מסך בחירה; עד אז tenant יחיד מפורש |
| **Keywords מעורבבים** | store per client אך לא נבדק ב-UI | **נמוך** | `KEYWORDS_KEY` מפתח per `clientId` |

### 16.5 סיכוני מנוע אוטומטי

| סיכון | תיאור | רמת סיכון | מיטיגציה |
|-------|--------|-----------|----------|
| **ביצוע ללא אישור** | מנוע משנה אתר חי | **גבוה** (תיאורטי) · **נמוך** (מיושם) | `requiresApproval: true` · `executionMode: preview` · `enabled: false` · אין קריאות deploy |
| **יצירת פעולות רעש** | המלצות שגרתיות מיותרות | **בינוני** | מקסימום 5 goals · 10 recommendations · diff מול ריצה קודמת (`newIssues`) |
| **שגיאות שקטות** | כשל ב-chunk לא נעצר | **נמוך** | `errors[]` בריצה; toast + `lastRunErrors` ב-auto mode |
| **AI agents חיים** | עלות / hallucination | **נמוך** (כבוי) | `aiAgents: skip_live` — 0 קריאות API |

### 16.6 API לא זמין

| API | מצב Staging | רמת סיכון | מיטיגציה |
|-----|-------------|-----------|----------|
| **GSC** | snapshot בלבד | **בינוני** | ניתוח מ-crawl + work-plan; חיבור live דרך backend עתידי (לא מ-GH Pages) |
| **GA4** | snapshot | **בינוני** | idem |
| **GBP** | `not_connected` | **נמוך** (מדולג) | `stageSources` מדלג; placeholder ב-dashboard |
| **Google Ads** | `not_connected` | **נמוך** | idem |
| **PageSpeed** | `not_connected` | **בינוני** | זיהוי איטיות מ-`loadTimeMs` ב-crawl-lite אם קיים; API לעתיד |
| **Supabase CRM** | `local_only` | **בינוני** | נתוני CRM מ-work-plan סטטי |
| **AI (OpenAI/Claude/Gemini)** | `skip_live` | **נמוך** | המלצות rule-based |

**עקרון:** הצינור **לא נכשל** כשמקור מנותק — השלב `sources` מסמן `skipped: true` וממשיך.

### 16.7 Google Sheets לא זמין

| סיכון | תיאור | רמת סיכון | מיטיגציה |
|-------|--------|-----------|----------|
| **Webhook URL ריק** | ייצוא ל-Sheets חסום | **בינוני** | CSV download מיידי (`exportHistoryToSheets`); מדריך [SHEETS-WEBHOOK-SETUP-HE.md](../../integrations/SHEETS-WEBHOOK-SETUP-HE.md) |
| **Apps Script down** | POST נכשל | **בינוני** | catch → fallback CSV; שגיאה ב-`lastRunErrors` |
| **מגבלת quota Google** | יותר מדי שורות ביום | **נמוך** | history-lite מוגבל (100); ייצוא ידני |

### 16.8 סיכום מטריצת סיכונים

| קטגוריה | רמה כוללת | הערה |
|---------|-----------|------|
| בטיחות Production | **נמוך** | preview מובנה |
| שלמות נתונים | **בינוני** | LS + snapshot |
| ביצועים UI | **נמוך** (לאחר v2) | batch + yield |
| הרחבה multi-tenant | **בינוני-גבוה** | דורש backend |
| תלות ב-API חיצוני | **בינוני** | graceful skip |

---

## 17. תוכנית עבודה לבוקר מחר — סדר מומלץ

> **זמן משוער:** 25–40 דקות · **סביבה:** Staging בלבד · **ללא Production**

### שלב 1 — Dashboard (5 דק')
1. פתח [Staging URL](https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-2)
2. עבור למסך **Dashboard**
3. בדוק: חיבורים (GSC/GA4 snapshot), סטטוס אתר, מספר פעולות פתוחות (~395)
4. ודא שאין אזהרות חריגות ב-connections

### שלב 2 — סטטוס מנוע (3 דק')
1. עבור למסך **פעולות**
2. בדוק כפתור **«🤖 מצב אוטומטי»** — tooltip: `lastRunAt`, `nextRunAt` (06:00 UTC)
3. אם `טרם רצה` או ריצה מאתמול — המשך לשלב 3
4. אופציונלי: DevTools → `localStorage` → `dalia-auto-mode-v1`

### שלב 3 — סוכנים (2 דק')
1. מסך **סוכנים** — ודא מצב `skip_live` / ללא קריאות חיות (Staging)
2. אין צורך להפעיל AI — המנוע עובד rule-based

### שלב 4 — הרצת מנוע → מטרות חדשות (5 דק')
1. במסך פעולות לחץ **«🤖 מצב אוטומטי»**
2. המתן ל-toast: chunks (6/6 ל-28 עמודים), המלצות, מטרות
3. צפוי: 1–2 מטרות `pending_approval` עם keyword + topic

### שלב 5 — פעולות חדשות (5 דק')
1. סנן פעולות: `act-daily-*` / סטטוס `pending_approval`
2. בדוק שדות: `name`, `sla.dueAt`, `keyword`, `pagePath`, `completionChecklist`
3. ודא מיזוג ב-`coco-claude-data` (טיוטות מופיעות ברשימה)

### שלב 6 — Preview (5 דק')
1. בחר פעולה יומית אחת → **Preview** (לא Approve עדיין)
2. ודא שהשינוי המוצע הגיוני (כותרת/תוכן) — `executionMode: preview`
3. **אין** שינוי באתר חי

### שלב 7 — אישור (3 דק')
1. לאחר בדיקה — **Approve** דרך `CocoActApprove` (Staging preview)
2. עדכן סטטוס פעולה ידנית אם נדרש
3. זכור: אישור ב-Staging ≠ פרסום ל-dalia-c.com

### שלב 8 — דוחות (5 דק')
1. מסך **היסטוריה** — רשומת «מנוע יומי — הושלם»
2. ייצוא: **CSV** מהיסטוריה (או Sheets אם webhook מוגדר)
3. אופציונלי מקומי: `node scripts/daily-marketing-engine.mjs` → `docs/audit-reports/daily-engine/report.json`

### שלב 9 — סוף יום (2 דק')
1. רשום ב-progress log מה אושר / מה נדחה
2. בדוק `nextRunAt` למחר 06:00 UTC
3. אם history > 80 שורות — תכנן ייצוא ל-Sheets

**Checklist מהיר:**
- [ ] Dashboard נבדק
- [ ] מנוע רץ (toast הושלם)
- [ ] מטרות + פעולות טיוטה נראות
- [ ] Preview נבדק
- [ ] אישור סלקטיבי
- [ ] היסטוריה / CSV מעודכן

---

## 18. המלצות כלים לפי קטגוריה

> **עקרון:** העדפת כלים חינמיים · חלופות בתשלום לצמיחה · **חובה** = נדרש לתפעול שוטף · **אופציונלי** = ROI גבוה אך לא חוסם

### 18.1 SEO

| כלי | מטרה | למה להשתמש | מחיר | חובה/אופציונלי | התאמה למערכת |
|-----|------|------------|------|----------------|---------------|
| **Google Search Console** | דירוגים, כיסוי אינדקס, שגיאות | מקור אמת ל-SEO אורגני | חינם | **חובה** (live בעתיד) | כיום snapshot ב-dashboard; יעד: sync ל-work-plan |
| **Screaming Frog** | crawl מקומי, broken links | משלים את `site-crawl-lite` | חינם עד 500 URL | **חובה** (ידני) | 28 עמודים — מתאים; ייצוא ל-JSON לעדכון crawl |
| **Ahrefs** | backlinks, keyword research | עומק תחרותי | בתשלום (~$99/חודש) | אופציונלי | חלופה חינמית: GSC + Ubersuggest |
| **Semrush** | audit, position tracking | דוחות ללקוח | בתשלום | אופציונלי | דומה ל-Ahrefs; לא נדרש ב-POC |
| **Ubersuggest** | מילות מפתח בסיסיות | חינמי מוגבל | freemium | אופציונלי | להעשרת `DEFAULT_KEYWORDS` per client |

### 18.2 AI

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **Claude / GPT / Gemini** (API) | ניסוח תוכן, המלצות חכמות | איכות טקסט | בתשלום per token | אופציונלי (כבוי) | `skip_live` — הפעלה רק אחרי אישור + תקציב |
| **Cursor** | פיתוח מהיר | כבר בשימוש | בתשלום | **חובה** (פיתוח) | תחזוקת daily-engine |
| **GitHub Copilot** | השלמת קוד | חלופה | בתשלום | אופציונלי | — |

### 18.3 Performance

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **PageSpeed Insights / Lighthouse** | Core Web Vitals | זיהוי עמודים איטיים (`>3000ms`) | חינם | **חובה** (ידני) | `pageSpeed: not_connected` — הרצה שבועית ידנית |
| **WebPageTest** | ניתוח עומק | trace מפורט | חינם | אופציונלי | לבעיות ביצועים עקשניות |
| **Cloudflare** | CDN, cache, WAF | האצה + אבטחה | freemium | אופציונלי (מומלץ ל-prod) | לא על GH Pages; רלוונטי ל-dalia-c.com |

### 18.4 Automation

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **GitHub Actions** | cron יומי 06:00 UTC | כבר מיושם | חינם (public repo) | **חובה** | `daily-marketing-engine.yml` — artifact |
| **Google Apps Script** | webhook ל-Sheets | ללא שרת | חינם | **חובה** (לייצוא) | `dalia-actions-sheets-webhook.gs` |
| **Make (Integromat)** | חיבורי API מורכבים | visual automation | freemium | אופציונלי | כש-GSC/GA4 live — sync ל-Sheets |
| **Zapier** | אינטגרציות מהירות | קל להגדרה | בתשלום | אופציונלי | יקר יותר מ-Make לנפח גבוה |
| **n8n** | self-hosted automation | שליטה מלאה | חינם (self-host) | אופציונלי | ל-1000+ clients עם backend |

### 18.5 Monitoring

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **UptimeRobot** | בדיקת זמינות אתר | התראה על down | חינם (50 monitors) | **חובה** | משלים `pagesDown` ב-crawl |
| **Google Analytics 4** | תנועה, המרות | מקור analytics | חינם | **חובה** (live בעתיד) | snapshot ב-dashboard |
| **Sentry** | שגיאות JS | דיבוג production | freemium | אופציונלי | לשלב backend |
| **Better Stack** | logs + uptime | חלופה מקיפה | freemium | אופציונלי | — |

### 18.6 Security

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **GitHub Dependabot** | CVE ב-dependencies | אוטומטי ב-repo | חינם | **חובה** | כבר זמין ב-GitHub |
| **Cloudflare WAF** | הגנה מפני bots | ל-production | freemium | אופציונלי (prod) | לא רלוונטי ל-Staging static |
| **OWASP ZAP** | סריקת אבטחה | בדיקה תקופתית | חינם | אופציונלי | לפני חיבור API keys |

### 18.7 Reports

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **Google Sheets** | דוחות ללקוח, היסטוריה | שיתוף קל | חינם | **חובה** (לאחר webhook) | `exportHistoryToSheets` |
| **Looker Studio** | דשבורדים ויזואליים | מ-GSC/GA4/Sheets | חינם | אופציונלי (מומלץ) | חיבור ל-Sheet של ייצוא |
| **report.json (repo)** | דוח טכני | Node POC | חינם | **חובה** (פיתוח) | `docs/audit-reports/daily-engine/` |

### 18.8 Analytics

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **GA4** | התנהגות משתמשים | כבר במערכת | חינם | **חובה** | snapshot → live |
| **Google Business Profile** | נוכחות מקומית | לקוחות מקומיים | חינם | אופציונלי (dalia-c) | `not_connected` — שלב 2 roadmap |
| **Google Ads** | קמפיינים ממומנים | ROI מדיד | בתשלום (מדיה) | אופציונלי | `not_connected` |
| **Hotjar / Microsoft Clarity** | heatmaps | UX | freemium | אופציונלי | לא קריטי ל-POC |

### 18.9 UI / פלטפורמה

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **GitHub Pages** | hosting Staging | כבר פעיל | חינם | **חובה** | `orin1607-ctrl.github.io` |
| **Figma** | עיצוב (אם נדרש) | לא לשנות עכשיו | freemium | אופציונלי | אין שינוי UI בפרויקט זה |
| **localStorage DevTools** | דיבוג מצב | פיתוח | חינם | **חובה** (תחזוקה) | כל מפתחות `dalia-*` |

### 18.10 DevOps

| כלי | מטרה | למה | מחיר | חובה/אופציונלי | התאמה |
|-----|------|-----|------|----------------|--------|
| **Git + GitHub** | גרסאות, CI | כבר בשימוש | חינם | **חובה** | Orin Staging workflow |
| **Node.js** | הרצת POC מקומי | `daily-marketing-engine.mjs` | חינם | **חובה** | ללא npm server |
| **Supabase** | DB + auth עתידי | multi-tenant scale | freemium | אופציונלי (שלב 3+) | `local_only` כיום |
| **Vercel / Netlify Functions** | API proxy ל-GSC | עקיפת מגבלת GH Pages | freemium | אופציונלי (שלב 2) | נדרש ל-API live |

### 18.11 סיכום ערימת כלים מומלצת (מינימום חינמי)

```
חובה עכשיו:  GSC (snapshot) · GA4 (snapshot) · GitHub Actions · Apps Script+Sheets · Screaming Frog · PageSpeed · UptimeRobot · Git
שבוע 1:      הגדרת Sheets webhook · Looker Studio בסיסי
חודש 1:      GSC/GA4 live via proxy · GBP
חודש 2–3:    Supabase · Make/n8n · AI agents מבוקרים
```

---

## 19. רשימת עדיפויות

### 19.1 חובה השבוע (Must do)

| # | משימה | מאמץ | ROI |
|---|--------|------|-----|
| 1 | **הגדרת Sheets webhook** — לפי [SHEETS-WEBHOOK-SETUP-HE.md](../../integrations/SHEETS-WEBHOOK-SETUP-HE.md) | נמוך | גבוה — גיבוי היסטוריה |
| 2 | **שגרת בוקר יומית** — סעיף 17, 5 ימים רצופים | נמוך | גבוה — habit + אימות מנוע |
| 3 | **עדכון snapshot** — GSC/GA4 ב-`dashboard.json` (ידני) | בינוני | גבוה — המלצות מדויקות יותר |
| 4 | **אימות v2 ב-Staging** — ריצה מלאה 28 עמודים / 6 chunks | נמוך | גבוה — regression |
| 5 | **תיעוד החלטות אישור** — מה אושר / נדחה ב-progress log | נמוך | בינוני |

### 19.2 אפשר אחר כך (Can do later)

| # | משימה | הערה |
|---|--------|------|
| 1 | Looker Studio דשבורד ללקוח | אחרי Sheets פעיל |
| 2 | PageSpeed API אוטומטי | `pagespeedDays: 30` מוכן |
| 3 | חיבור GBP | דורש Google API approval |
| 4 | AI agents מבוקרים | תקציב + guardrails |
| 5 | UptimeRobot להתראות down | משלים crawl |

### 19.3 לדחות (Defer)

| # | משימה | סיבה |
|---|--------|------|
| 1 | Multi-tenant UI | מודל נתונים מוכן; UI לא דחוף ללקוח יחיד |
| 2 | Supabase production | GH Pages מספיק ל-Staging |
| 3 | Ahrefs/Semrush | עלות; Ubersuggest + GSC מספיקים |
| 4 | שינוי עיצוב UI | מפורש אסור בפרויקט |
| 5 | Deploy אוטומטי ל-Production | מחוץ לתחום Orin Staging |

### 19.4 ROI מקסימלי / מאמץ מינימלי (Top picks)

| פעולה | מאמץ | תועלת |
|--------|------|--------|
| Sheets webhook + CSV גיבוי | 30 דק' | היסטוריה לא אובדת |
| שגרת «מצב אוטומטי» בוקר | 5 דק'/יום | פעולות טיוטה עקביות |
| Screaming Frog → עדכון crawl-lite | 1 שעה/חודש | ממצאים אמיתיים |
| `node scripts/daily-marketing-engine.mjs` לפני commit | 2 דק' | report.json מעודכן ב-repo |

---

## 20. Roadmap 90 יום

### Phase 1 — שבוע 1 (ימים 1–7): ייצוב ותפעול

**מטרות:**
- מנוע v2 רץ יומית ללא regression
- Sheets webhook פעיל או CSV שגרתי
- תיעוד תפעול מלא (מסמך זה)

**משימות:**
| יום | משימה |
|-----|--------|
| 1–2 | הגדרת Sheets webhook; בדיקת ייצוא היסטוריה |
| 3–4 | שגרת בוקר (סעיף 17) × 2; תיקון באגים אם יש |
| 5 | עדכון GSC/GA4 snapshot ב-dashboard.json |
| 6 | הרצת Screaming Frog; השוואה ל-crawl-lite |
| 7 | סקירת שבוע — `report.json` + progress log |

**תוצרים:**
- webhook פעיל **או** תהליך CSV מתועד
- 5+ ריצות מנוע מתועדות
- checklist בוקר מאומת

**מדדי הצלחה:**
- 0 שגיאות קריטיות בריצת מנוע
- זמן ריצה בדפדפן < 15 שניות (28 עמודים)
- לפחות 1 ייצוא היסטוריה מוצלח

---

### Phase 2 — חודש 1 (ימים 8–30): נתונים חיים ודוחות

**מטרות:**
- מקורות נתונים מעודכנים (לא רק snapshot ישן)
- דוח לקוח שבועי אוטומטי (Sheets / Looker Studio)
- PageSpeed ידני מתועד

**משימות:**
- שבוע 2: Looker Studio מחובר ל-Sheet ייצוא
- שבוע 3: הערכת proxy (Vercel/Netlify) ל-GSC API — POC
- שבוע 4: PageSpeed לכל 28 עמודים (דגימה); עדכון `loadTimeMs` ב-crawl
- שוטף: cron GitHub Actions + הרצה ידנית בוקר

**תוצרים:**
- דשבורד Looker Studio בסיסי
- מסמך «מקורות נתונים» מעודכן (live vs snapshot)
- POC proxy API (אם feasible)

**מדדי הצלחה:**
- snapshot מתעדכן לפחות פעם בשבוע
- דוח שבועי נשלח ללקוח (PDF מ-Looker או Sheet)
- זיהוי ≥1 עמוד איטי / SEO issue חדש

---

### Phase 3 — חודש 2 (ימים 31–60): הרחבה ואוטומציה

**מטרות:**
- חיבור GBP (אם אושר)
- אוטומציה Make/n8n לסנכרון נתונים
- הכנה ל-tenant שני (נתונים בלבד, לא UI)

**משימות:**
- שבוע 5–6: בקשת/השלמת Google API ל-GBP
- שבוע 7: Make scenario — GSC → Sheets שורה יומית
- שבוע 8: הוספת tenant שני ב-`getDefaultTenants()` + keywords; בדיקת pipeline
- שוטף: `seoRecheckDays: 14` — וידוא דילוג face נכון

**תוצרים:**
- GBP מחובר או מתועד כחסום
- 1 scenario אוטומציה פעיל
- 2 tenants בריצת Node (לא בדפדפן)

**מדדי הצלחה:**
- נתוני GBP ב-dashboard (או תיעוד חסימה)
- אוטומציה רצה 7 ימים ללא כשל
- pipeline מעבד 2 לקוחות ב-Node < 30 שניות

---

### Phase 4 — חודש 3 (ימים 61–90): מדרגיות והכנה לצמיחה

**מטרות:**
- הערכת Supabase כ-backend
- AI agents מבוקרים (אופציונלי, עם תקציב)
- תוכנית מעבר ל-10 / 100 לקוחות

**משימות:**
- שבוע 9–10: POC Supabase — runs + history מרכזי
- שבוע 11: AI agent יחיד — ניסוח תיאור פעולה בלבד, עם אישור
- שבוע 12: מסמך ארכיטקטורה 1000 clients; bottleneck analysis
- סוף: סקירת 90 יום + עדכון roadmap

**תוצרים:**
- Supabase schema + sync POC
- מסמך «ארכיטקטורה multi-tenant»
- החלטה: AI כן/לא ל-production

**מדדי הצלחה:**
- היסטוריה נשמרת מחוץ ל-LS (POC)
- עלות AI מוגבלת < $X/חודש (להגדרה)
- תוכנית ברורה ל-100 לקוחות

---

## 21. הערכה מקצועית — מפתח המערכת

### 21.1 מה לשפר קודם (Top 3)

1. **Sheets webhook + גיבוי היסטוריה** — הסיכון הגבוה ביותר היום הוא אובדן נתונים ב-LS. מאמץ נמוך, תועלת מיידית.
2. **סנכרון נתונים (snapshot → live)** — המלצות המנוע מדויקות רק כשהנתונים טריים. Proxy API קטן ל-GSC/GA4.
3. **בידוד ריצה יומית בדפדפן** — למנוע goals כפולים באותו יום (יישור עם לוגיקת `shouldRunPhase` ב-Node).

### 21.2 מה לחזק

| תחום | פעולה |
|------|--------|
| **Pipeline v2** | כבר חזק — שמור על slim reports, chunking |
| **Preview-only** | להמשיך `enabled: false` עד backend אמיתי |
| **תיעוד** | מסמכים 1–22 — baseline לצוות |
| **Node POC** | להריץ לפני כל commit שמשנה engine |
| **Multi-tenant shape** | לא לשבור שדות `clientId`/`siteId` |

### 21.3 מה לפשט

| תחום | הצעה |
|------|------|
| **מקורות מנותקים** | להסתיר מ-UI או לקבץ תחת «לא מחובר» — פחות רעש |
| **395 פעולות פתוחות** | סינון ברירת מחדל: «היום» / «מנוע» / «דחוף» |
| **שני מסלולי engine** | לטווח ארוך: רק `daily-engine-core.mjs` + bundle לדפדפן (פחות כפילות עם daily-engine.js) |
| **דוחות** | מקור אחד: Sheets; repo JSON לפיתוח בלבד |

### 21.4 מה להאיץ

| תחום | איך |
|------|-----|
| **בוקר יומי** | checklist מודפס / bookmark ל-Staging URL |
| **ייצוא** | webhook אחד ל-actions + history |
| **CI** | GitHub Action שמריץ `daily-marketing-engine.mjs` על PR |
| **עדכון crawl** | סקריפט Node מ-Screaming Frog export |

### 21.5 צווארי בקבוק בשנה הקרובה

| צוואר בקבוק | מתי | פתרון |
|-------------|-----|--------|
| **localStorage** | >3 לקוחות / מכשירים מרובים | Supabase / Sheets כמקור אמת |
| **GH Pages סטטי** | API live | Backend proxy (Vercel/Supabase Edge) |
| **אין multi-tenant UI** | >1 לקוח | מסך בחירה + RBAC |
| **כפילות קוד JS/Node** | תחזוקה | build step אחד מ-core.mjs |
| **אישור ידני בלבד** | >50 פעולות/יום | תור אישורים + batch approve |
| **עלות AI** | הפעלת agents | rate limit + cache + templates |

### 21.6 הכנה ל-1000 / 10000 לקוחות

| שלב | לקוחות | ארכיטקטורה |
|-----|--------|------------|
| **עכשיו** | 1 | GH Pages + LS + JSON |
| **100** | 100 | Supabase (runs, actions, tenants) + API proxy + Sheets per client |
| **1000** | 1000 | Queue (Redis/Bull) לריצות מנוע · workers · row-level security |
| **10000** | 10000 | Kubernetes / serverless workers · sharding per region · CDN לדוחות · billing per tenant |

**עקרונות מדרגיות:**
- מנוע stateless — כל הרצה = input JSON + tenant config → output drafts
- אחסון מרכזי — לא LS
- `PAGE_CHUNK` דינמי לפי גודל אתר
- Rate limits על API חיצוניים (GSC quota)
- `processOneAtATime` → תור אתרים עם concurrency מבוקר

---

## 22. דוח סיכום — סעיפים 16–21

### 22.1 סעיף 16 — סיכונים

| | |
|--|--|
| **מה נבדק** | localStorage, preview mode, API skips, Sheets, ביצועים v2, multi-tenant |
| **מסקנה** | סיכון Production **נמוך**; שלמות נתונים ו-API **בינוני**; ביצועים **נמוך** לאחר v2 |
| **המלצה** | להגדיר Sheets webhook; לא לסמוך על LS כמקור יחיד; לשמור על `enabled: false` |
| **מה לעשות** | השבוע: webhook · גיבוי CSV שבועי · תיוג «Staging only» בכל דוח ללקוח |

### 22.2 סעיף 17 — תוכנית בוקר

| | |
|--|--|
| **מה נבדק** | זרימת Dashboard → מנוע → Preview → Approve → דוחות |
| **מסקנה** | תהליך 25–40 דק' ברור; תלוי בהרצה ידנית (לא רק cron) |
| **המלצה** | checklist יומי קבוע; bookmark ל-Staging URL |
| **מה לעשות** | מחר בבוקר: שלבים 1–9; לתעד ב-progress log |

### 22.3 סעיף 18 — כלים

| | |
|--|--|
| **מה נבדק** | 10 קטגוריות: SEO, AI, Performance, Automation, Monitoring, Security, Reports, Analytics, UI, DevOps |
| **מסקנה** | ערימה חינמית מספיקה ל-POC; תשלום נדרש רק לצמיחה (Ahrefs, AI API) |
| **המלצה** | חובה: GSC, GA4, GitHub Actions, Apps Script, PageSpeed ידני, UptimeRobot |
| **מה לעשות** | השבוע: Sheets · חודש 1: Looker Studio · חודש 2: Make |

### 22.4 סעיף 19 — עדיפויות

| | |
|--|--|
| **מה נבדק** | Must / Later / Defer / ROI |
| **מסקנה** | 5 משימות השבוע; multi-tenant UI ו-Production — לדחות |
| **המלצה** | ROI מקסימלי: webhook + שגרת בוקר + עדכון snapshot |
| **מה לעשות** | טבלת סעיף 19.1 — לסמן ✓ בסוף השבוע |

### 22.5 סעיף 20 — Roadmap 90 יום

| | |
|--|--|
| **מה נבדק** | 4 phases עם מטרות, משימות, תוצרים, מדדים |
| **מסקנה** | שבוע 1 — ייצוב; חודש 1 — נתונים; חודש 2 — אוטומציה; חודש 3 — מדרגיות |
| **המלצה** | לא לדלג על Phase 1 גם אם Phase 3 מפתה |
| **מה לעשות** | לקבוע סקירה שבועית (יום 7, 30, 60, 90) |

### 22.6 סעיף 21 — הערכה מקצועית

| | |
|--|--|
| **מה נבדק** | שיפור, חיזוק, פישוט, האצה, bottlenecks, 1000/10000 clients |
| **מסקנה** | המערכת מתאימה ל-POC ולקוח יחיד; LS ו-GH Pages הם תקרת זכוכית |
| **המלצה** | שמור pipeline v2; תכנן Supabase בחודש 3; אל תפעיל AI ללא תקציב |
| **מה לעשות** | Top 3 מסעיף 21.1 — בסדר עדיפות |

---

### 22.7 שינויי קוד ומסמכים (תיעוד בלבד)

| פריט | ערך |
|------|-----|
| **Commit** | `docs(daily-engine): final report sections 16-22 — risks, roadmap, tools` |
| **קבצים** | `docs/audit-reports/daily-engine/REPORT-HE-FINAL.md` (חדש) · `REPORT-HE-v2.md` (קישור הדדי) |
| **Staging URL** | https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-2 |
| **שינוי קוד מערכת** | **אין** — תיעוד בלבד |

---

### 22.8 מצב מערכת סופי — טבלת אמת

| רכיב | סטטוס | הערה |
|------|--------|------|
| Daily Engine v2 pipeline | ✅ פעיל | 10 שלבים, batch 5 |
| Preview / אישור | ✅ פעיל | אין deploy חי |
| Staging GH Pages | ✅ פעיל | deploy ידני |
| GSC/GA4 | ⚠️ snapshot | לא live |
| Sheets | ⚠️ webhook ריק | CSV עובד |
| GBP/Ads/PageSpeed | ❌ לא מחובר | מדולג |
| AI agents | ❌ skip_live | 0 קריאות |
| Multi-tenant | ⚠️ מודל בלבד | לקוח 1 |
| Production dalia-c.com | 🚫 לא נגע | מחוץ לתחום |

---

*Orin Staging בלבד · ללא Production · ללא שינוי עיצוב UI · תיעוד קבוע v3-daily-engine-2*
