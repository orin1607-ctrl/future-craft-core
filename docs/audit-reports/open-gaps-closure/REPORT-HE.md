# דוח סגירת פערים — מערכת ניהול שיווק (Orin Staging)

**תאריך:** 2026-06-29  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-open-gaps-3  
**Commits:** `69efecd`, `821591f`, *(עדכון scroll)*  
**Cache:** `v3-open-gaps-3`

---

## 1. מובייל (11 מסכים)

### איך בדקת
Playwright iPhone 13 (390×844) — `node scripts/open-gaps-closure.mjs`: ניווט לכל 11 המסכים, לחיצה על hub-card, בדיקת overflow, כניסה חוזרת לפעולות אחרי גלילה, workbench + accordion.

**לא בוצעה בדיקה ידנית על מכשיר פיזי** — רק סימולציית מובייל ב-Playwright.

### מה בדיוק עשית
- `goScreen`: ללא `scrollTo(0,0)` במובייל ל-`screen-actions`; שמירת/שחזור `scrollTop` ב-`sessionStorage` (`coco-actions-scroll-m`) ביציאה/כניסה.
- `refreshPendingDom`: שמירת scroll לפני rerender + `restoreInlineFields`.
- Boot: הסתרת מסכים עד `coco-ready`; הסרת `.active` בטעינה.

### מה הייתה התוצאה
- **11/11** מסכים פעילים, **ללא overflowX**.
- Boot: `cocoReady=true`, `bootActive=false`.
- גלילה בפעולות: נבדק שוב ב-`v3-open-gaps-3` (שחזור scroll בחזרה ממטרות).
- כפתור hub נלחץ; CRM/מודאלים — לא נלחץ כל כפתור בכל מסך (מגבלת אוטומציה).

### מה תיקנת
קפיצה לראש בפעולות, flash ב-boot, איבוד scroll ב-rerender.

### מה עדיין חסר
אימות **ידני** על טלפון אמיתי (מומלץ מחר בבוקר).

### קבצים
`coco-claude-main.js`, `actions-workbench.js`, `coco-claude-integration.css`, `ai-marketing-platform.html`

---

## 2. הדבקת קוד

### איך בדקת
Playwright: `fill()` ל-`[data-demo-inline="html"]` עם HTML+CSS; בדיקה אחרי 500ms.

### מה בדיוק עשית
- Textareas ריקים ב-HTML + `restoreInlineFields()` אחרי rerender (מונע שבירת `</textarea>` ו-entity escape).
- `paste` + `input` listeners; `user-select: text`, `touch-action: manipulation`.

### מה הייתה התוצאה
`paste.ok=true`, `afterWait=true` — תוכן נשמר אחרי rerender.

### מה תיקנת
הדבקה שנמחקה/נשברה בגלל rerender ו-escapeHtml.

### מה עדיין חסר
בדיקת הדבקה **ידנית** מ-Claude/ChatGPT על iOS/Android.

### קבצים
`actions-demo-code.js`, `actions-workbench.js`, `coco-claude-integration.css`

---

## 3. מצב אוטומטי

### איך בדקת
Playwright במסך פעולות — חיפוש `[data-act-auto-mode]` ו-`.coco-act-lite-export-bar`.

### מה בדיוק עשית
הוספת `renderExportBar()` גם ל**תצוגת רשימה** (לא רק workbench).

### מה הייתה התוצאה
`inList=true`, `exportBar=true` — כפתור **🤖 מצב אוטומטי** בראש מסך הפעולות (תשתית בלבד, לא פעיל).

### מה תיקנת
כפתור שלא היה גלוי ברשימה — היה רק בתוך workbench.

### מה עדיין חסר
הפעלת מצב אוטומטי אמיתי (מכוון כתשתית).

### קבצים
`actions-workbench.js`

---

## 4. Google Sheets

### איך בדקת
בדיקת `localStorage` + שדה webhook במסך פעולות על Staging live.

### מה בדיוק עשית
- תבנית Apps Script: `docs/integrations/dalia-actions-sheets-webhook.gs`
- מדריך: `docs/integrations/SHEETS-WEBHOOK-SETUP-HE.md`

### מה הייתה התוצאה
`sheetsWebhookUrl` **ריק** — `canExport=false`. **לא בוצעה שליחה אמיתית לגיליון.**

### מה תיקנת
תיעוד + תבנית script (לא webhook פרוס).

### מה עדיין חסר (נדרש ממך)
1. Google Sheet + `SPREADSHEET_ID` ב-Script Properties  
2. Deploy Web App → URL  
3. הדבקה בשדה במסך פעולות  

---

## 5. CRM — עריכה ושמירה

### איך בדקת
Playwright: `DaliaCrm.openEditCustomer`, `submitEditCustomer`, `modal-edit-customer`; יצירת ליד בדיקה.

### מה בדיוק עשית
- מודאל `modal-edit-customer` + כפתור **✏️ ערוך** בכרטיס לקוח.
- `updateCustomer` / `updateLead` עם fallback ל-localStorage על GH Pages.

### מה הייתה התוצאה
`hasEdit=true`, `hasSave=true`, `modal=true`, `saveTest=true` (יצירת ליד).  
`editBtn=false` ברשימה — כפתור עריכה מופיע **רק אחרי פתיחת לקוח** (`cc-edit-btn`).

### מה תיקנת
עריכה/שמירה שלא היו קיימים.

### מה עדיין חסר
סנכронização Supabase CRM ב-production credentials; בדיקה ידנית: פתיחת לקוח → ערוך → שמור.

### קבצים
`dalia-crm-app.js`, `dalia-crm-screens.html`, `crm-api.js`

---

## 6. עוזרי AI — מצב אמיתי

### איך בדקת
קריאת `AGENT_DATA` ב-runtime על Staging.

### סיכום (20 עוזרים)

| סטטוס | עוזרים |
|--------|--------|
| **DEMO_STATIC_UI** — UI + נתוני דמו, **לא API חי** | gsc, ga4, pagespeed, project001, cms, seotools, ads, meta, cursor, manager |
| **PARTIAL_UI_ONLY** | gbp (סריקה "running", ללא העברה) |
| **STUB_INFRASTRUCTURE** — כרטיס + dashboard, **דורש API** | chatgpt, claude, gemini, youtube, tiktok, linkedin, xtwitter, pinterest, whatsapp |

**אף עוזר לא מחובר ל-API חי על Staging static.**

---

## 7. זרימת עבודה אמיתית

### איך בדקת
Playwright E2E: agents → goals → actions → workbench → work-card → demo → preview → approve → history → reports → agents.

### מה הייתה התוצאה
**11/11 שלבים עברו** (ראה `report.json` → `tasks.7-workflow`).

### מה תיקנת
(במסגרת משימות 2–3 — paste + scroll)

---

## 8. מעבר לדשבורד דליה

### איך בדקת
Playwright: לחיצה על `showDaliaToast()` (🏠).

### מה בדיוק עשית
- `showDaliaToast` → `PrdDaliaNav.exitToDalia()` או `admin-home`.

### מה הייתה התוצאה
`navigated=true` → `https://orin1607-ctrl.github.io/future-craft-core/admin-home`

**זה המצב הרצוי** — לא toast בלבד.

### קבצים
`coco-claude-main.js`, `prd-dalia-nav.js`

---

## 9. דוח זה

דוח זה מבוסס על `docs/audit-reports/open-gaps-closure/report.json` + בדיקות Playwright ב-2026-06-29.

---

## 10. סיום — Git & Deploy

| פריט | ערך |
|------|-----|
| Commits | `69efecd`, `821591f`, *(pending: scroll fix v3-open-gaps-3)* |
| Staging | https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-open-gaps-3 |
| Deploy | push ל-`main` → GitHub Pages |

### קבצים שהשתנו (סיכום)
`ai-marketing-platform.html`, `actions-demo-code.js`, `actions-workbench.js`, `coco-claude-main.js`, `coco-claude-integration.css`, `dalia-crm-app.js`, `dalia-crm-screens.html`, `crm-api.js`, `scripts/open-gaps-closure.mjs`, `docs/integrations/*`, `docs/audit-reports/open-gaps-closure/*`

### פתוח לפני עבודה מחר
1. **Google Sheets** — webhook URL מהמשתמש  
2. **מובייל ידני** על מכשיר אמיתי  
3. **עוזרי AI** — חיבור API (9 stubs + 10 demo UI)  
4. **Supabase CRM** — credentials לסנכרון מרוחק  
