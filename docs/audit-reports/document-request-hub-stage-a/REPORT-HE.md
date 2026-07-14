# Document Request Hub — Stage A Delivery Report (Staging only)

**תאריך:** 2026-07-14  
**סטטוס:** שלב A הושלם ב־Staging — ממתין לבדיקה שלך לפני שלב B / Production  
**Production:** לא נגענו

| | |
|--|--|
| Staging Supabase | `usfeoerkpcafxxlyuldl` |
| Edge Function | `document-request` (deployed to Staging only) |
| Local UI לבדיקה | `http://127.0.0.1:5173/` (Vite + `.env.local` Staging) |
| Production proof | `document_type_defs` ו־`document-request` ב־`qasomfndnjuixgjmjwcm` → **HTTP 404** |

---

## 1. קישור לבדיקה

### א. דף העלאה ציבורי (בלי login)
צור בקשה מממשק המנהל או השתמש בקישור שנוצר ב־E2E (מתעדכן בכל ריצה):  
קובץ: `docs/audit-reports/document-request-hub-stage-a/LIVE-UPLOAD-URL.txt`

תבנית:
```
http://127.0.0.1:5173/upload-request?t=<TOKEN>
```

### ב. ממשק מנהל (Staging מקומי)
1. הרץ Vite מול Staging (כבר הוגדר ב־`.env.local` → `usfeoerkpcafxxlyuldl`).  
2. היכנס כמנהל על.  
3. **נהגים** → כרטיס נהג → **בקש מסמך** / פאנל היסטוריה.  
4. **רכבים** → כרטיס רכב → אותו פאנל.

> קישור GH Pages Staging (`https://orin1607-ctrl.github.io/future-craft-core/upload-request?t=…`) יעבוד רק אחרי push לקוד ה־UI ל־`main` (Deploy Staging Pages). **לא** בוצע push ל־Production. אם תרצה — אאשר commit רק לקבצי Stage A ואז אדחוף ל־Staging Pages.

---

## 2. טבלאות שנוצרו (Staging)

| טבלה | תפקיד |
|------|--------|
| `document_type_defs` | קטלוג 20 סוגי מסמך + הגדרות (scopes, expiry, MIME, max size, multi, approval, active) |
| `document_requests` | בקשות אוניברסליות: `entity_type` + `entity_id` |
| `document_request_events` | היסטוריית אירועים |
| `document_versions` | גרסאות בלי מחיקה (`is_current`) |

Migration file: `supabase/migrations/20260714090000_document_request_hub_stage_a.sql`  
יושם ב־Staging ב־`supabase db query --linked` (לא על Production).

---

## 3. Edge Function

| | |
|--|--|
| שם | `document-request` |
| פרויקט | **רק** `usfeoerkpcafxxlyuldl` |
| Actions | `list_types`, `create`, `list_for_entity`, `get`, `open`, `upload` |
| הגנה | `assertStagingOnly()` — מסרב ל־`qasomfndnjuixgjmjwcm` |
| Public | `get` / `open` / `upload` עם token (hash ב־DB) |
| Auth | `create` / `list_*` דורשים JWT מנהל |

---

## 4. UI שנוסף

| קובץ | |
|------|--|
| `src/pages/UploadDocumentRequest.tsx` | דף ציבורי `/upload-request` |
| `src/components/documents/RequestDocumentDialog.tsx` | דיאלוג בחירת סוג + יצירת קישור |
| `src/components/documents/EntityDocumentRequestsPanel.tsx` | כפתור + היסטוריה |
| `src/lib/documentRequestClient.ts` | לקוח API + סירוב Production |
| `Drivers.tsx` / `VehicleDetailsPanel.tsx` | שילוב כפתור «בקש מסמך» |
| `App.tsx` | route ציבורי `/upload-request` |

---

## 5. תוצאות E2E (נהג + רכב)

קובץ: `docs/audit-reports/document-request-hub-stage-a/E2E-REPORT.json`  
**`ok: true`**

### נהג
- create → `sent` + `sent_at` + `requested_by_name`
- open → `opened`
- upload → `pending_approval` + version 1
- events: `created → sent → opened → uploaded → pending_approval`
- `drivers.license_image_url` עודכן
- `document_metadata.category = driver-license`
- העלאה שנייה נחסמה (`already_uploaded`)

### רכב
- אותה זרימה ל־`vehicle_license`
- `vehicles.license_doc_url` עודכן
- events מלאים

### Production
- `document_type_defs` → 404  
- `document-request` function → 404  

---

## 6. סטטוסים אמיתיים (שלב A)

| סטטוס | מתי |
|--------|-----|
| נוצרה בקשה (`created`) | insert |
| נשלח (`sent`) | מיד אחרי יצירת קישור (שלב A = קישור; WhatsApp = שלב B) |
| נפתח (`opened`) | טעינת דף ההעלאה |
| הועלה + ממתין לאישור (`pending_approval`) | אחרי upload כש־`requires_manager_approval=true` |

---

## 7. WhatsApp Secrets (Staging) — לפני שלב B

קיימים ב־Staging (שמות בלבד, ללא ערכים):
- `GUPSHUP_API_KEY`
- `GUPSHUP_APP_NAME`
- `RESEND_API_KEY`

**לא** הועתקו Secrets מ־Production.  
שלב B יישלח הודעה עם **קישור בלבד** (בלי קבלת קבצים ב־WA).

---

## 8. צילומי מסך

תיקייה: `docs/audit-reports/document-request-hub-stage-a/shots/`
- `01-mobile-upload-page.png` — דף העלאה לנייד
- `02-driver-card-request-panel.png` — כרטיס נהג + פאנל בקשות
- `03-request-dialog.png` — דיאלוג «בקש מסמך»
- `04-documents-screen.png` — מסך מסמכים

---

## 9. עצירה כאן

שלב A הושלם ב־Staging בלבד.  
**לא** בוצע Deploy ל־`dalia-car.online`.  
ממתין לאישורך לפני:
- שלב B (WhatsApp אמיתי עם קישור בלבד)
- ו/או push ל־GitHub Pages Staging לקישור ציבורי קבוע
- ו/או מעבר ל־Production (רק אחרי אישור מפורש נפרד)
