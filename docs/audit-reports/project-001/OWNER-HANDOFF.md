# Owner Handoff — Project 001 / dalia-c.com

**עודכן:** 2026-06-24T16:03:46.706Z  
**שלב:** A — שכבת נתונים (ללא AI API)  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform

---

## מה בוצע (אוטונומי)

- Client ID SSOT — client-id-ssot.js (dalia-c-official + DATA_PATHS)
- Integration Hub — 12 עוזרים, סרגל סטטוס, מודל חיבורים
- dalia-site-config — SSOT dalia-c.com, dashboard.json + site-crawl.json
- Hub KPIs — GSC/GA4 אמיתיים (לא 14,320 / 8,420)
- מסך נכסים — coco-live-assets-grid עם סטטוס חיבור
- עוזרים — GSC/GA4/CMS/Manager מ-dashboard.json
- AI gate — OpenAI/Claude/Gemini: תשתית מחוברת, API חסום
- scrub Demo UI — greentech/FleetOS מוסתרים ב-live mode
- prd-entities.json — רק dalia-c-official, ללא demo-client
- create-admin-user Edge + RLS migrations + marketingProvision.ts
- QA: qa-v4-orincar + qa-staging-live-close לפני כל push

---

## נתונים חיים (dashboard.json)

| מדד | ערך |
|-----|-----|
| GSC קליקים | 0 |
| GSC חשיפות | 2 |
| GA4 סשנים | 250 |
| GA4 צפיות | 410 |
| Sync אחרון | 2026-06-21T20:03:11.748Z |

---

## ממתין לבעלים

### 0. כל חיבורי Google (OAuth / sync)


### 2. בדיקה ידנית — יוני אטיאס
- התחברות ל-Staging
- לקוח עסקי חדש — marketing_only
- לקוח עסקי חדש — fleet_and_marketing
- כרטיס שיווק → מצב נוכחי → GSC/GA4 אמיתיים
- חזרה לדליה (exit)

### 3. Google Business — Basic API Access

- קישור: https://support.google.com/business/contact/api_default
- doc: docs/audit-reports/project-001/owner-gates.json

### 4. Google Ads — Developer Token

- קישור: https://ads.google.com/aw/apicenter
- doc: .env.ads.example

---

## חסום בכוונה

- **OpenAI / Claude / Gemini API** — שלב AI — רק אחרי אישור שלב א׳
- **Production deploy** — אין deploy ללא אישור מפורש

---

## QA אחרון

- v4-orincar: 97/97 (OK)
- staging-live-close: ראה `staging-live-close.json`

---

## Production

**סגור.** אין deploy ל-Production ללא אישור מפורש.
