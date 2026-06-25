# פעולות בעלים — חיבורים שנותרו (מנהל השיווק)

עודכן: 25 ביוני 2026 · גרסה `v3-unified-3j`

---

## 1. Gemini

| שדה | ערך |
|-----|-----|
| **חשבון** | `orin1607@gmail.com` (או חשבון Google עם גישה ל-AI Studio) |
| **אתר** | https://aistudio.google.com/apikey |
| **מה ליצור** | API Key חדש (Create API key) → בחר פרויקט `project001aimarketing` אם מוצע |
| **מפתח** | `GEMINI_API_KEY` (או `GOOGLE_AI_API_KEY`) |
| **איפה לשמור מקומית** | `.env.openai` בשורש הפרויקט (שורה `GEMINI_API_KEY=...`) |
| **Supabase Staging** | `npx supabase secrets set GEMINI_API_KEY=YOUR_KEY --project-ref usfeoerkpcafxxlyuldl` |
| **או אוטומטי** | `node scripts/upload-marketing-edge-secrets.mjs` (אחרי מילוי `.env.openai`) |
| **אימות** | דליה → ניהול שיווק → שאלת AI עם ספק Gemini · או Edge: `marketing-gemini-chat` מחזיר `ok: true` |

---

## 2. Claude (Anthropic)

| שדה | ערך |
|-----|-----|
| **חשבון** | חשבון Anthropic (אימייל נפרד מ-Google) — https://console.anthropic.com/sign_up |
| **אתר** | https://console.anthropic.com/settings/keys |
| **מה ליצור** | Create Key → שם: `dalia-marketing-staging` |
| **מפתח** | `ANTHROPIC_API_KEY` (מתחיל ב-`sk-ant-...`) |
| **איפה לשמור מקומית** | `.env.openai` → `ANTHROPIC_API_KEY=...` |
| **Supabase Staging** | `npx supabase secrets set ANTHROPIC_API_KEY=YOUR_KEY --project-ref usfeoerkpcafxxlyuldl` |
| **או אוטומטי** | `node scripts/upload-marketing-edge-secrets.mjs` |
| **אימות** | ניהול שיווק → AI עם Claude · Edge `marketing-claude-chat` לא מחזיר 503 |

---

## 3. Google Business Profile

| שדה | ערך |
|-----|-----|
| **חשבון** | `orin1607@gmail.com` — Owner/Manager בפרופיל העסק |
| **אתר בקשה** | https://support.google.com/business/contact/api_default |
| **אשף חלופי** | https://support.google.com/business/workflow/16726127 |
| **פרופיל עסק** | https://business.google.com/ → **דליה פתרונות מימון ותחזוקה לרכב** |
| **GCP APIs** | https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=project001aimarketing |
| **מה לאשר** | **Application for Basic API Access** → Project Number: `484351148380` → אתר: `https://dalia-c.com/` |
| **סיבה לדחייה נוכחית** | Quota=0 עד אישור Google (שגיאת 429) |
| **זמן משוער** | 7–14 ימי עסקים |
| **אימות אחרי אישור** | `npm run project-001:gbp-probe` → `ok: true`, locations ≥ 1 |
| **במערכת** | יוצג **ממתין לחיבור** עד אישור — ללא Demo |

---

## 4. Google Ads

| שדה | ערך |
|-----|-----|
| **חשבון** | `orin1607@gmail.com` |
| **API Center** | https://ads.google.com/aw/apicenter |
| **GCP API** | https://console.cloud.google.com/apis/library/googleads.googleapis.com?project=project001aimarketing |
| **מצב נוכחי** | Developer Token קיים · 3 חשבונות נגישים · **403 Permission** — Token ברמת **Test** |
| **מה לעשות** | ב-API Center → **Apply for Basic Access** (או Standard) → המתן 1–5 ימי עסקים |
| **אם MCC** | הוסף ל-`.env.ads`: `GOOGLE_ADS_LOGIN_CUSTOMER_ID=XXX-XXX-XXXX` (מנהל MCC) |
| **חשבון לקוח** | `GOOGLE_ADS_CUSTOMER_ID=8957638890` (כבר מוגדר) — או השאר ריק לבחירה אוטומטית |
| **מפתחות ב-.env.ads** | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| **Supabase** | כבר הועלו דרך `upload-marketing-edge-secrets.mjs` |
| **אימות** | `npm run project-001:ads-sync` → ✓ Ads sync OK (ללא שגיאות 403) |
| **תיקון קוד שבוצע** | שדרוג API מ-v18 ל-**v24** (v18 הוחלף — גרם ל-HTML במקום JSON) |

---

## 5. Google Tag Manager

| שדה | ערך |
|-----|-----|
| **חשבון** | `orin1607@gmail.com` |
| **הפעל API** | https://console.cloud.google.com/apis/library/tagmanager.googleapis.com?project=project001aimarketing |
| **OAuth מחדש** | בטרמינל: `npm run project-001:auth -- --force` (מוסיף scope `tagmanager.readonly`) |
| **בדיקה** | `npm run project-001:gtm-probe` |
| **סנכרון** | `npm run project-001:export-dashboard` (אחרי probe מוצלח) |
| **מצב נוכחי** | קוד sync מוכן (`scripts/project-001/_lib/gtm.mjs`) · חסר scope ב-token הקיים |
| **אימות** | `docs/audit-reports/project-001/gtm-probe.json` → `ok: true`, containers ≥ 1 |
| **במערכת** | **ממתין לחיבור** עד OAuth מחדש |

---

## פקודות מהירות (אחרי מילוי מפתחות)

```bash
node scripts/upload-marketing-edge-secrets.mjs
npx supabase functions deploy marketing-google-sync marketing-gemini-chat marketing-claude-chat marketing-ai-chat --project-ref usfeoerkpcafxxlyuldl
npm run project-001:sync
npm run project-001:ads-probe
npm run project-001:export-dashboard
```
