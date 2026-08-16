# משימה 3 — STOP (Schema)

**תאריך:** 2026-08-16  
**סביבה:** Oren Car Staging בלבד (`usfeoerkpcafxxlyuldl`)  
**Production:** לא נגענו

## מה נבדק ב-Staging DB (`accidents`)

עמודות קיימות כוללות בין היתר:
- `event_number` — מספר אירוע פנימי שמוקצה אוטומטית ע״י `allocate_incident_event_number` (לא מספר תביעה ביטוחי)
- `date` — תאריך האירוע
- `notes`, `images`, `vehicle_plate`, `driver_name`, `company_name`, `vehicle_id`, `driver_id`
- **אין** `claim_number`
- **אין** `accident_number` נפרד ממספר האירוע

## `document_metadata` (קיים)

עמודות: `file_path`, `category`, `company_name`, `vehicle_plate`, `driver_name`, `manufacturer`, `model`, `original_name`, `display_name`, `document_date`, `uploaded_by`, `created_at`  
**אין** `accident_id` / `claim_number` / שיוך תאונה מפורש.

מנגנון העלאה קיים: `src/lib/uploadDocument.ts` → storage `documents` + שורת `document_metadata`.

## למה אי אפשר להשתמש בקיים למספר תביעה

| שדה קיים | למה לא מתאים |
|---|---|
| `event_number` | מוקצה אוטומטית למערכת התראות/מספור אירועים; לא קלט משתמש של מספר תביעה |
| `notes` | שדה הערות חופשי; לא מאפשר חובה/חיפוש אמין/שיוך מסמכים |
| `images` | תמונות JSON בלבד — לא מסמכי PDF/תביעה |

## הצעה מינימלית (ממתינים לאישור Owner)

1. **טבלה:** `public.accidents`  
2. **עמודה:** `claim_number text NOT NULL DEFAULT ''`  
   - או nullable + CHECK באפליקציה; מומלץ `text` עם ולידציה באפליקציה (חובה בשמירה חדשה)  
3. **אינדקס (אופציונלי לחיפוש):**  
   `(company_name, claim_number)` WHERE claim_number <> ''  
4. **מסמכים (בלי עותק כפול):**  
   - שימוש ב-`uploadDocument` עם `category: 'accident'` (או קטגוריה קיימת דומה)  
   - `document_date` = תאריך האירוע  
   - `display_name` / `original_name` יכולים לכלול את מספר התביעה לחיפוש  
   - אם נדרש שיוך חזק לתאונה: עמודה מינימלית נוספת ב-`document_metadata`: `related_entity_id uuid` + `related_entity_type text`  
     **או** רק הרחבת חיפוש על `display_name`/`vehicle_plate`/`document_date` בלי schema — פחות מדויק

## סטטוס ביצוע

- משימות 1–2: בוצעו בקוד Staging (ענף `feat/incident-alerts-staging`)  
- משימה 3: **לא בוצעה** — ממתין לאישור schema לפני migration ב-Staging בלבד  
- Production / Hostinger / GAS: **NO**
