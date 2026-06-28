# דוח סגירת פערים — מערכת ניהול שיווק (Orin Staging)

**תאריך:** 2026-06-29  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-open-gaps-1  
**Commit:** `69efecd`  
**Cache:** `v3-open-gaps-1`

---

## 1. באגים במובייל (390px)

### איך בדקת
Playwright iPhone 12 Pro / viewport 390×844 (`scripts/open-gaps-closure.mjs`) על שרת מקומי לפני deploy; בדיקות ידניות-סגנון: כניסה לפעולות, workbench, accordion, overflow.

### מה בדיוק עשית
- `goScreen`: ביטול `scrollTo(0,0)` בכניסה ל-`screen-actions` במובייל (≤767px).
- `refreshPendingDom`: שמירה/שחזור `scrollTop` של `.content` לפני/אחרי rerender.
- `syncDemoFieldsFromDom` לפני rerender — מונע איבוד תוכן שדות.
- Boot: הסרת `.active` ממסכים בטעינה + `#coco-claude-root:not(.coco-ready) > .screen { display:none }` + מחלקה `coco-ready` בסיום boot.

### מה הייתה התוצאה
- Boot: `cocoReady=true`, מסך פעיל יחיד `screen-hub`, ללא flash של מסכים אחרים.
- Overflow אופקי: לא זוהה (`overflow: true`).
- כפתורים / modals / workbench: נפתחים; paste ו-auto-mode נבדקו (ראו משימות 2–3).
- גלילה: כניסה ראשונה ממסך אחר מאפסת scroll של מסך הפעולות (צפוי); rerender פנימי משחזר scroll.

### מה תיקנת
קפיצה לראש בכניסה (mobile), flash ב-boot, איבוד scroll ב-rerender.

### מה עדיין חסר
אימות חוזר על GH Pages live אחרי deploy (לא רק localhost).

---

## 2. הדבקת קוד (Demo Code)

### איך בדקת
Playwright: `fill()` ל-`[data-demo-inline="html"]` עם HTML מ-Claude-style; בדיקת אורך ותוכן.

### מה בדיוק עשית
- CSS: `user-select: text`, `touch-action: manipulation` על `.coco-act-code-input`, `.coco-act-lite-editor`, `.coco-act-fb-input`.
- `paste` listener ב-workbench + modal ב-`actions-demo-code.js`.
- `syncDemoFieldsFromDom` לפני rerender.

### מה הייתה התוצאה
`paste.ok=true`, `valueLen=49`, תוכן `<div class="qa-paste">` נשמר.

### מה תיקנת
הדבקה/מילוי לשדה HTML inline ו-modal.

### מה עדיין חסר
בדיקת paste אמיתי מ-clipboard במכשיר físי (Playwright משתמש ב-fill).

---

## 3. כפתור מצב אוטומטי `[data-act-auto-mode]`

### איך בדקת
Playwright: חיפוש DOM ב-workbench וברשימה אחרי "חזרה לרשימה".

### מה בדיוק עשית
הוספת `renderExportBar()` גם ל-`renderWorkbenchView` (לפני היה רק ב-list view — המשתמש ב-workbench לא ראה את הכפתור).

### מה הייתה התוצאה
`inWorkbench: true`, `inList: true`.

### מה תיקנת
נראות הכפתור בשולחן עבודה (באג mount — לא redesign).

### מה עדיין חסר
—

---

## 4. Google Sheets

### איך בדקת
חיפוש repo: `dalia-actions-export-config-v1`, `[data-act-sheets-url]`, `exportActionsCsv`; אין webhook URL ב-env/docs.

### מה בדיוק עשית
- יצירת תבנית Apps Script: `docs/integrations/dalia-actions-sheets-webhook.gs`
- שדה webhook + export CSV קיימים ב-`actions-workbench.js` (לא שונה).

### מה הייתה התוצאה
**לא ניתן לבדוק POST חי** — `sheetsWebhookUrl` ריק.

### מה תיקנת
תבנית + תיעוד deployment (לא URL אמיתי).

### מה עדיין חסר (חוסם)
1. **Sheet ID** — ליצור Google Sheet או להשתמש בקיים  
2. **Script Properties:** `SPREADSHEET_ID`  
3. **Deploy** Web App → URL  
4. **הדבקה** בשדה `[data-act-sheets-url]` או `localStorage.dalia-actions-export-config-v1`

---

## 5. CRM — עריכה / שמירת לקוח

### איך בדקת
Playwright: `DaliaCrm.openEditCustomer`, `submitEditCustomer`, `#modal-edit-customer` אחרי `goScreen('screen-crm')`.

### מה בדיוק עשית
- מודאל `modal-edit-customer` ב-`dalia-crm-screens.html`
- כפתור "✏️ ערוך" בכרטיס לקוח
- `openEditCustomer` / `submitEditCustomer` → `MarketingApi.updateCustomer` (+ `CrmApi.updateLead` להערות)
- `CrmApi.updateCustomer` wrapper; `updateLead` עם localStorage fallback

### מה הייתה התוצאה
`hasEdit: true`, `hasSave: true`, `modal: true`.

### מה תיקנת
עריכה/שמירה מינימלית (שם, איש קשר, טלפון, אימייל, הערות).

### מה עדיין חסר
E2E מלא create→edit→save על GH Pages עם localStorage (לא רץ ב-playwright script — רק presence).

---

## 6. מלאי AI Agents (AGENT_DATA)

### איך בדקת
קריאת `coco-claude-main.js` — `AGENT_DATA`, `_platformAgentStub`, `openAgentDashboard`.

| Agent | סטטוס | הערה |
|-------|--------|------|
| gsc | INFRASTRUCTURE | דשבורד סטטי AGENT_DATA, ללא GSC API חי |
| ga4 | INFRASTRUCTURE | סטטי |
| pagespeed | INFRASTRUCTURE | סטטי |
| project001 | INFRASTRUCTURE | סטטי |
| cms | INFRASTRUCTURE | סטטי |
| seotools | INFRASTRUCTURE | סטטי |
| gbp | INFRASTRUCTURE | סטטי (status running מדומה) |
| ads | INFRASTRUCTURE | סטטי |
| meta | INFRASTRUCTURE | סטטי |
| cursor | INFRASTRUCTURE | סטטי |
| manager | INFRASTRUCTURE | אggregation סטטי |
| chatgpt | STUB | `_platformAgentStub` |
| claude | STUB | `_platformAgentStub` |
| gemini | STUB | `_platformAgentStub` |
| youtube | STUB | `_platformAgentStub` |
| tiktok | STUB | `_platformAgentStub` |
| linkedin | STUB | `_platformAgentStub` |
| xtwitter | STUB | `_platformAgentStub` |
| pinterest | STUB | `_platformAgentStub` |
| whatsapp | STUB | `_platformAgentStub` |

**אין סוכן שסומן WORKING** — אין חיבור API חי ב-GH Pages Staging.

---

## 7. Workflow E2E

### איך בדקת
Playwright script: agents → goals → actions → workbench → work card → demo code → history → reports.

### מה בדיוק עשית
—

### מה הייתה התוצאה
**8/8 שלבים עברו** (preview/approve לא נכללו בלולאה הקצרה — approve דורש אינטראקציה נוספת).

### מה תיקנת
—

### מה עדיין חסר
שלב approve + preview modal ב-E2E אוטומטי מלא.

---

## 8. ניווט דליה ראשית (🏠)

### איך בדקת
Playwright: `showDaliaToast()` + בדיקת `PrdDaliaNav.exitToDalia`.

### מה בדיוק עשית
`showDaliaToast()` קורא ל-`PrdDaliaNav.exitToDalia()` (או `index.html` fallback) אחרי toast — לא toast בלבד.

### מה הייתה התוצאה
`toast: true`, `hasPrdNav: true`.

### מה תיקנת
ניווט אמיתי ל-`admin-home` / index (staging path).

### מה עדיין חסר
Production auth URL — לא נדרש ל-Orin Staging.

---

## 9. דוח זה

נוצר `REPORT-HE.md` + `report.json` + `scripts/open-gaps-closure.mjs`.

---

## 10. Commit / Push / Deploy

**Commit:** `69efecd`  
**Push:** origin/main (GH Pages deploy)  
**Staging URL:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-open-gaps-1

### קבצים שהשתנו
- `public/ai-marketing-platform.html`
- `public/ai-marketing/coco-claude-main.js`
- `public/ai-marketing/actions-workbench.js`
- `public/ai-marketing/actions-demo-code.js`
- `public/ai-marketing/coco-claude-integration.css`
- `public/crm/dalia-crm-app.js`
- `public/crm/dalia-crm-screens.html`
- `public/crm/crm-api.js`
- `docs/integrations/dalia-actions-sheets-webhook.gs`
- `scripts/open-gaps-closure.mjs`
- `docs/audit-reports/open-gaps-closure/report.json`
- `docs/audit-reports/open-gaps-closure/REPORT-HE.md`
