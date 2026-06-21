# Project 001 — Owner Gates (GBP + Google Ads)

**Generated:** 2026-06-21T20:26:39.792Z
**Account:** orin1607@gmail.com
**GCP Project:** project001aimarketing

כל ההכנות מצד הפיתוח הושלמו. נשארו רק שני אישורים חיצוניים:

---

## Google Business Profile — Basic API Access

**סטטוס:** 🔴 חסום — נדרש אישור שלך

### 1. קישור ישיר
- **עיקרי:** https://support.google.com/business/contact/api_default
- workflow: https://support.google.com/business/workflow/16726127
- prerequisites: https://developers.google.com/my-business/content/prereqs
- gcp_dashboard: https://console.cloud.google.com/home/dashboard?project=project001aimarketing
- gcp_project_number: https://console.cloud.google.com/home/dashboard?project=project001aimarketing
- enable_account_mgmt_api: https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=project001aimarketing
- enable_business_info_api: https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com?project=project001aimarketing
- enable_performance_api: https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com?project=project001aimarketing
- business_profile: https://business.google.com/
- quota_docs: https://developers.google.com/my-business/content/limits

### 2. מה לעשות (צעד-אחר-צעד)
1. היכנס ל-support.google.com/business/contact/api_default עם orin1607@gmail.com (בעלים/מנהל על הפרופיל).
2. ב-dropdown "What can we help with?" בחר Application for Basic API Access.
3. לחץ Apply for Google Business Profile API access והמשך במסך האשף.
4. בחר את העסק: "דליה פתרונות מימון ותחזוקה לרכב" (חייב להיות מאומת 60+ יום).
5. הזן Project Number: 484351148380 (לא project ID — מספר בלבד).
6. Company website: https://dalia-c.com/
7. Primary reason (דוגמה): "Project 001 — read-only sync of reviews, posts, and performance metrics for our own verified business into internal dashboard and Google Sheets. No third-party SaaS."
8. אשר את תנאי ה-API ושלח.
9. ודא ש-orin1607@gmail.com הוא Owner/Manager ב-business.google.com על המיקום.

### 3. מה לאשר / לספק
אישור Google ל-Basic API Access עבור GCP project 484351148380 (Project001AIMarketing). עד האישור quota=0 QPM וכל קריאה מחזירה 429.

### 4. זמן צפוי
7–14 ימי עסקים (לעיתים 3–5 ימים). אימייל follow-up מ-Google Business Profile API team.

### 5. מה יקרה אחרי האישור
- Quota יעלה ל-~300 QPM ב-Cloud Console → APIs → My Business Account Management → Quotas.
- npm run project-001:gbp-connect יריץ probe + sync + export אוטומטית.
- נתוני GBP (ביקורים, ביקורות, פוסטים, Q&A) יופיעו ב-dashboard.json ובמסך GBP ב-CO.CO.
- שורה חדשה תיכתב ל-gbp_audit ב-Google Sheets.

### 6. איך לוודא שהחיבור הצליח
- `npm run project-001:gbp-probe → ok: true, locations ≥ 1`
- `npm run project-001:gbp-sync → ✓ GBP sync OK`
- `docs/audit-reports/project-001/gbp-sync.json → ok: true, summary.profileViews מספר`
- `public/project-001/dashboard.json → connections.businessProfile.status = connected`

### 7. פקודות מיד לאחר האישור
- `npm run project-001:gbp-connect`
- `npm run project-001:complete`

---

## Google Ads — Developer Token

**סטטוס:** 🔴 חסום — נדרש אישור שלך

### 1. קישור ישיר
- **עיקרי:** https://ads.google.com/aw/apicenter
- ads_api_docs: https://developers.google.com/google-ads/api/docs/first-call/overview
- enable_ads_api: https://console.cloud.google.com/apis/library/googleads.googleapis.com?project=project001aimarketing
- oauth_consent: https://console.cloud.google.com/apis/credentials/consent?project=project001aimarketing
- env_template: .env.ads.example

### 2. מה לעשות (צעד-אחר-צעד)
1. היכנס ל-https://ads.google.com/aw/apicenter עם orin1607@gmail.com (חשבון עם גישה ל-Google Ads).
2. אם אין API Center — פתח חשבון Google Ads או בקש גישת Admin מ-MCC.
3. בחלק Developer token לחץ על Apply for token (אם עדיין אין) או Copy token (אם כבר קיים).
4. רמת Token: Test Account — מיידי; Basic/Standard — דורש בקשה ל-Google (1–5 ימי עסקים).
5. העתק את ה-token (מחרוזת alphanumerical).
6. בשורש הפרויקט: cp .env.ads.example .env.ads
7. מלא: GOOGLE_ADS_DEVELOPER_TOKEN=<ה-token>
8. אופציונלי: GOOGLE_ADS_CUSTOMER_ID=XXX-XXX-XXXX (מספר חשבון ללא מקפים גם OK)
9. אופציונלי: GOOGLE_ADS_LOGIN_CUSTOMER_ID=XXX-XXX-XXXX (אם MCC manager)
10. שמור את הקובץ — אל תעלה ל-git (.env.ads ב-gitignore).

### 3. מה לאשר / לספק
הפקת Developer Token ב-Google Ads API Center + (לפרודקשן) אישור Basic/Standard access מ-Google Ads API team.

### 4. זמן צפוי
העתקת token: 2–5 דקות. Test access: מיידי. Production: 1–5 ימי עסקים.

### 5. מה יקרה אחרי האישור
- npm run project-001:ads-connect יריץ probe → sync → export.
- קמפיינים, מילות מפתח, עלויות והמרות יישמרו ב-ads-sync.json ו-dashboard.json.
- נתונים ייכתבו ל-Google Sheets (טאב ads_daily אם קיים).
- מסך Google Ads ב-CO.CO יציג KPIs חיים במקום placeholder.

### 6. איך לוודא שהחיבור הצליח
- `npm run project-001:ads-probe → ok: true, accessible_customers ≥ 1`
- `npm run project-001:ads-sync → ✓ Ads sync OK`
- `docs/audit-reports/project-001/ads-sync.json → ok: true`
- `public/project-001/dashboard.json → googleAds.ok = true`

### 7. פקודות מיד לאחר האישור
- `npm run project-001:ads-connect`
- `npm run project-001:complete`

---

## Dev prep completed (no action needed)

- OAuth scopes: `business.manage` + `adwords` ב-scopes.json
- GCP APIs: My Business + Business Profile Performance + Google Ads API ב-enable-apis
- Scripts: `gbp-probe`, `gbp-sync`, `gbp-connect`, `ads-probe`, `ads-sync`, `ads-connect`
- Dashboard + CO.CO UI: GBP live slice + Ads live slice (מופעלים אוטומטית לאחר sync)
- Sheets: `gbp_audit` tab; `ads_daily` + `ads_campaigns` on first sync

## One-shot after BOTH gates clear

```bash
npm run project-001:complete
```
