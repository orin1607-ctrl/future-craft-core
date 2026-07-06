# בקשות חיבור — 13 מנועי בניית אתרים (מסודר)

תאריך: 2026-07-06  
סביבה: Orin Staging בלבד — **לא Production / Hostinger**

העתק כל מפתח לקובץ `.env.build` בשורש הפרויקט, ואז הרץ:
`node scripts/upload-marketing-edge-secrets.mjs`

---

## ✅ הושלם אוטונומית (ללא פעולה ממך)

| מנוע | סטטוס |
|------|--------|
| **c13** מנוע פנימי | Blueprint + HTML multi-page + הורדה |
| **c3** HTML סטטי | `ClientSiteTemplate` מחובר + הורדה |
| **c10** תוכן AI | rule-based + Claude Edge כשמחוברים ל-Orin |
| **c6 + c11** תמונות | Edge `marketing-site-build` (DALL·E) — **OpenAI כבר קיים** |

---

## 🔑 בקשה #1 — Vercel v0 (c1) — אופציונלי

| | |
|---|---|
| **שירות** | Vercel v0 |
| **קישור ישיר** | https://v0.dev/chat/settings/keys |
| **מה לפתוח** | Settings → API Keys |
| **מה ללחוץ** | Create API Key |
| **מה להעתיק** | המפתח המלא |
| **לאן** | `.env.build` → `V0_API_KEY=...` |

---

## 🔑 בקשה #2 — WordPress Staging (c8)

| | |
|---|---|
| **שירות** | WordPress **staging בלבד** (לא dalia-c.com production) |
| **קישור** | https://wordpress.com/support/application-passwords/ |
| **מה לפתוח** | WP Admin → Users → Profile → Application Passwords |
| **מה ללחוץ** | Add Application Password → שם: `CO.CO Staging` |
| **מה להעתיק** | URL האתר + שם משתמש + סיסמת האפליקציה |
| **לאן** | `.env.build`: |
| | `WORDPRESS_SITE_URL=https://your-staging-site.com` |
| | `WORDPRESS_USERNAME=your-user` |
| | `WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx` |

---

## 🔑 בקשה #3 — Figma (c5)

| | |
|---|---|
| **קישור** | https://www.figma.com/settings → Security → Personal access tokens |
| **מה ללחוץ** | Generate new token |
| **מה להעתיק** | Token |
| **לאן** | `.env.build` → `FIGMA_ACCESS_TOKEN=...` |
| **אופציונלי** | `FIGMA_FILE_KEY=...` (מזהה קובץ Figma) |

---

## 🔑 בקשה #4 — Gemini Credits (c4 Stitch)

| | |
|---|---|
| **קישור** | https://aistudio.google.com/apikey (מפתח כבר קיים) |
| **Billing** | https://ai.studio/projects → טען credits |
| **הערה** | המנוע משתמש ב-Gemini כ-fallback לעיצוב עד Stitch API רשמי |

---

## 🔑 בקשה #5 — Webflow (c9)

| | |
|---|---|
| **קישור** | https://webflow.com/dashboard → Site → Integrations → API Access |
| **מה ללחוץ** | Generate API Token |
| **מה להעתיק** | Token + Site ID |
| **לאן** | `.env.build`: `WEBFLOW_API_TOKEN=...` `WEBFLOW_SITE_ID=...` |

---

## 🔑 בקשה #6 — Builder.io (c7)

| | |
|---|---|
| **קישור** | https://builder.io/account/space |
| **מה לפתוח** | Space Settings → API Keys |
| **מה להעתיק** | Public API Key |
| **לאן** | `.env.build` → `BUILDER_IO_API_KEY=...` |

---

## 🔑 בקשה #7 — Plasmic (c2)

| | |
|---|---|
| **קישור** | https://studio.plasmic.app → Project → Settings |
| **מה להעתיק** | API Token + Project ID |
| **לאן** | `.env.build`: `PLASMIC_API_TOKEN=...` `PLASMIC_PROJECT_ID=...` |

---

## 🔑 בקשה #8 — Runway (c12) — שלב מאוחר

| | |
|---|---|
| **קישור** | https://app.runwayml.com/account |
| **מה לפתוח** | API section |
| **מה להעתיק** | API Key |
| **לאן** | `.env.build` → `RUNWAY_API_KEY=...` |

---

## איפה לראות במערכת

**v5 → סביבת עבודה (🗂️):** פאנל "מנועי בניית אתרים (13)" + כפתור **הרץ את כל המנועים**

Preview: https://orin1607-ctrl.github.io/future-craft-core/ai-marketing/ai-control-center-v5-STANDALONE.html
