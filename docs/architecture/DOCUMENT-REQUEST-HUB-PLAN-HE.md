# מנגנון מסמכים מרכזי — תכנון ארכיטקטורה (Staging בלבד)

**תאריך:** 2026-07-14  
**סטטוס:** תכנון בלבד — ללא מימוש עד אישור מפורש  
**סביבת פיתוח:** Staging / Super Boss בלבד  
**אסור:** שינוי / Deploy ל־Production (`dalia-car.online`, Supabase `qasomfndnjuixgjmjwcm`)

| Staging | ערך |
|---------|-----|
| Supabase | `usfeoerkpcafxxlyuldl` |
| אפליקציה | `https://orin1607-ctrl.github.io/future-craft-core/` |
| Production (לא לגעת) | `dalia-car.online` · `qasomfndnjuixgjmjwcm` |

---

## 1. מטרה

מנגנון אחד כללי לـ**בקשה → שליחה → קישור מאובטח → העלאה → שיוך → היסטוריה**, לכל סוגי המסמכים:

- רישיון נהיגה, רישיון רכב, ת.ז., ביטוח, הצהרת בריאות, אישור רפואי, מסמכי רכב, ואחרים דרך קטלוג הגדרות בלבד.

**עקרון WhatsApp (מחייב):**  
הודעה יוצאת ממספר העסק עם הסבר + קישור בלבד.  
**אין** קבלת קבצים ב־WhatsApp.  
**אין** תלות בתשובת הנהג בצ׳אט.  
כל העלאה **רק** דרך דף הקישור.

---

## 2. מה כבר קיים (Reuse)

| רכיב | שימוש חוזר |
|------|------------|
| `uploadDocument` + bucket `documents` | העלאה מאומתת למנהל; לוגיקת MIME/גודל |
| `Documents.tsx` categories | בסיס לקטלוג סוגי מסמך (להרחיב לטבלת הגדרות) |
| `/sign-declaration?token=` + `driver_declarations` | דפוס: קישור ציבורי + טוקן (לחקות, לא להרחיב בצורה רופפת) |
| `/take-exam?t=` + `driving_exams` | דפוס שליחה + מעקב sent |
| `send-whatsapp-message` (Gupshup) | שליחה יוצאת מ־Staging (לאחר בדיקת secrets) |
| Resend edges (`notify-*`, `send-password-reset`) | דפוס מייל |
| `driver_notifications` | התראת אפליקציה |
| `system_logs` + `notificationLogService` | בסיס ליומן (להחליף Mock) |
| `PLAN-HE.md` (remote approval) | דפוס tokens / gateway בלי login |

### Partial / Mock — לא להסתמך כמנוע

- `whatsappUiMock`, `WhatsAppSendMenu`, `AddNotificationDialog` — UI בלבד  
- Email templates ב־localStorage  
- `wa.me` / `sms:` מהמכשיר — לא API ארגוני  

### חסר לחלוטין

- טבלת בקשות מסמך אוניברסלית  
- דף העלאה ציבורי לפי טוקן לכל סוגי מסמך  
- גרסאות מסמך (אין מחיקת ישנים)  
- מעקב delivered / opened / uploaded / approved  
- תבנית WhatsApp ייעודית עם קישור + איסור תשובה בקובץ  
- כפתור «בקש מסמך» בכרטיס ישות  

---

## 3. ארכיטקטורה מוצעת

```
[כרטיס נהג / רכב / עובד]
        │  «בקש מסמך»
        ▼
┌───────────────────────┐
│  DocumentRequestDialog │  סוג מסמך + ערוץ שליחה
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ Edge: doc-request-create │  (Staging only assert)
│  · יוצר request + token  │
│  · שולח WhatsApp/Email/… │  ← הודעה עם קישור בלבד
│  · כותב events + logs    │
└───────────┬───────────┘
            │
            │  קישור: {STAGING_ORIGIN}/upload-request?t=…
            ▼
┌───────────────────────┐
│ דף ציבורי (בלי login)   │
│  · mark opened          │
│  · צילום / העלאה        │
│  · אין שליחה ל-WA       │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ Edge: doc-request-upload │
│  · Storage (גרסה חדשה)   │
│  · metadata + versions   │
│  · קישור לישות אוטומטי   │
│  · עדכון current על הישות│
│  · סטטוס uploaded        │
└───────────────────────┘
```

**חוק ברזל:** אין webhook / אין listener לקבצי WhatsApp נכנסים. תשובות בצ׳אט מתעלמים מהן מבחינת תהליך המסמכים.

---

## 4. מודל נתונים

### 4.1 `document_type_defs` — קטלוג גמיש

| שדה | תיאור |
|-----|--------|
| `key` | מזהה יציב (`driver_license`, `vehicle_insurance`, …) |
| `label_he` | תווית לתצוגה |
| `entity_scopes` | `driver` / `vehicle` / `employee` / `company` |
| `storage_folder` | תיקייה ב־bucket |
| `category` | תואם `document_metadata.category` |
| `message_template_he` | טקסט ברירת מחדל (כולל הנחיית «רק דרך הקישור») |
| `requires_expiry` | האם לבקש תאריך תוקף |
| `is_active`, `sort_order` | ניהול |

סוג חדש בעתיד = שורה בהגדרות (או seed migration), **בלי** לשנות את מנוע הבקשות.

### 4.2 `document_requests`

| שדה | תיאור |
|-----|--------|
| `id`, `company_name` | |
| `document_type_key` | FK לוגי לקטלוג |
| `entity_type`, `entity_id` | שיוך אוטומטי ליעד |
| `recipient_*` | שם / טלפון / אימייל / user_id |
| `requested_by` | מי שלח |
| `channel` | `whatsapp` \| `sms` \| `email` \| `app` |
| `token_hash` | hash של הטוקן (לא מאוחסן ב־plaintext אם אפשר) |
| `token_expires_at` | חד־פעמי / מוגבל בזמן |
| `status` | ראה §5 |
| `outbound_message_id` | מזהה ספק (Gupshup וכו') |
| `sent_at`, `delivered_at`, `opened_at`, `uploaded_at` | |
| `approved_by`, `approved_at`, `rejection_reason` | |
| `current_version_id` | מצביע לגרסה העדכנית |

### 4.3 `document_request_events` — היסטוריה מלאה

כל אירוע בשורה: `created`, `sent`, `delivery_update`, `opened`, `upload_started`, `uploaded`, `approved`, `rejected`, `expired`, `resent`, `cancelled`  
עם `actor_id`, `payload` (json), `created_at`.

### 4.4 `document_versions` — בלי מחיקת ישנים

| שדה | תיאור |
|-----|--------|
| `entity_type`, `entity_id`, `document_type_key` | |
| `version_no` | עולה אוטומטית |
| `is_current` | גרסה פעילה לתצוגה בכרטיס |
| `file_path`, `public_url` | |
| `source` | `request_link` \| `manager_upload` \| `import` |
| `request_id` | אם הגיע מבקשה |
| `uploaded_by` | nullable לקישור ציבורי |
| `metadata_id` | קישור ל־`document_metadata` |

**מדיניות:** אין `DELETE` לגרסאות בזרימה הרגילה. «החלפה» = גרסה חדשה + `is_current`.

---

## 5. סטטוסים

```
draft → sent → delivered → opened → uploaded → approved
                              ↘ rejected
              ↘ expired / cancelled
```

מיפוי לדרישות:

| דרישה | שדה / אירוע |
|--------|-------------|
| מי שלח | `requested_by` + event `created`/`sent` |
| למי | `recipient_*` |
| סוג מסמך | `document_type_key` |
| תאריך שליחה | `sent_at` |
| נמסר | `delivered_at` (+ webhook ספק אם זמין; אחרת best-effort) |
| נפתח הקישור | `opened_at` בעת טעינת דף ההעלאה |
| הועלה | `uploaded_at` + `document_versions` |
| מי אישר | `approved_by` / `approved_at` |
| סטטוס מסמך | `status` + תוויות UI |

> הערת מציאות: Gupshup delivery receipts דורשים webhook נפרד. בשלב A: `sent` + `opened` + `uploaded` חובה; `delivered` אופציונלי כשה־webhook יחובר ב־Staging.

---

## 6. אבטחת קישור

1. טוקן אקראי 32+ bytes; נשמר כ־**hash** ב־DB.  
2. תוקף מוגבל (ברירת מחדל 72 שעות, ניתן להגדרה).  
3. חד־פעמי להעלאה מוצלחת (או חדש ב־resend).  
4. Edge Function ב־service role מבצעת העלאה — הטוקן לא נותן הרשאת Storage כללית.  
5. RLS: מנהלים לפי חברה; anon **לא** קורא את טבלת הבקשות ישירות.  
6. דף ההעלאה מציג רק שם ישות + סוג מסמך (מינימום PII).  
7. Staging assert: סירוב אם project ref ≠ `usfeoerkpcafxxlyuldl`.

---

## 7. נוסח WhatsApp (עקרון)

```
שלום {שם},

ביקשנו ממך להעלות: {סוג_מסמך}.

נא להעלות אך ורק דרך הקישור הבטוח (לא לשלוח קבצים בתשובה להודעה זו):
{קישור}

הקישור אישי ויפוג ב־{תאריך}.
מערכת דליה
```

- מספר עסק = מקור השליחה (Gupshup Source).  
- אין הזמנה ל«שלחו צילום לכאן».  
- אין עיבוד media inbound.

---

## 8. UI (Staging)

| מסך | תפקיד |
|-----|--------|
| כפתור **בקש מסמך** | בכרטיס נהג / רכב (ואחר כך עובד) |
| דיאלוג בחירה | סוג מסמך מהקטלוג + ערוץ |
| היסטוריית בקשות בישות | סטטוסים + resend |
| `/upload-request` | דף ציבורי לנייד (מצלמה / קובץ) |
| מסמכים | הצגת current + קישור לגרסאות |
| הגדרות סוגי מסמך | CRUD לקטלוג (super_admin) |

---

## 9. שלבי מימוש ב־Staging בלבד

| שלב | תוכן | Definition of Done |
|-----|------|-------------------|
| **A** | Schema + seed קטלוג + Edge create/upload + דף העלאה + כפתור בנהג | E2E: יצירה → קישור → העלאה → מופיע בכרטיס + מסמכים + events |
| **B** | שליחת WhatsApp אמיתית מ־Staging (תבנית/קישור בלבד) + סימון sent | הודעה מגיעה עם קישור Staging; אין inbound |
| **C** | אימייל Resend + התראת אפליקציה; SMS רק אם יש ספק Staging | אותו flow בערוצים נוספים |
| **D** | אישור/דחייה מנהל + UI גרסאות + כפתור ברכב | היסטוריה מלאה כפי שפורט |
| **E** | דוח E2E + צילומי מסך + קישור Staging לבדיקה שלך | **עצירה — ממתין לאישורך לפני Production** |

---

## 10. מה לא ייעשה

- אין Deploy ל־`dalia-car.online`  
- אין migrations / secrets על `qasomfndnjuixgjmjwcm`  
- אין webhook לקבלת קבצי WhatsApp  
- אין שימוש ב־Mock UI כמנוע אמיתי  
- אין מחיקת מסמכים ישנים בזרימה הרגילה  

---

## 11. החלטות לאישור לפני קוד

1. **אישור הארכיטקטורה** (טבלאות + זרימה + WhatsApp outbound-only).  
2. **התחלת שלב A ב־Staging** אחרי אישור מפורש.  
3. ערוץ ראשון לפיתוח: **WhatsApp קישור** (+ העלאה בדף); מייל/SMS/אפליקציה בשלב C.  
4. ישויות בשלב A: **נהג + רכב**; עובד בהרחבה אחרי מודל employee ברור.

---

**אין כתיבת קוד עד שתאשר במפורש להתחיל שלב A ב־Staging.**
