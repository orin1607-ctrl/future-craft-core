# דוח ותוכנית — מעקב מסירה Gupshup (Staging בלבד)

**תאריך:** 2026-07-21  
**Production:** אין שינוי · אין פריסה  
**שליחת WhatsApp חיה בשלב זה:** לא (ממתינים לאישור Owner)

---

## 1. מצב נוכחי (מה כבר קיים)

| רכיב | סטטוס Staging |
|------|----------------|
| Edge `gupshup-webhook` | פרוס · GET בריא |
| טבלת `incident_notification_deliveries` | קיימת + סטטוסי DLR |
| קישור לפי `provider_message_id` (= Message ID) | כן |
| רישום `submitted` אחרי שליחה | כן (ב-`send-whatsapp-message`) |
| היסטוריית מעברים `status_history` | מתווסף עכשיו |
| Callback URL בפורטל Gupshup | **לא** — API נכשל; דורש Owner |
| Production | לא נגע |

**Callback URL (Staging):**
```
https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
```

---

## 2. תוכנית (בלי שליחות בפיתוח)

### שלב A — השלמת Webhook (סוכן, עכשיו)
1. עמודת `status_history` (jsonb) — כל מעבר: at / status / dlr_event / error_code / error_message  
2. Webhook מעדכן לפי Message ID ומוסיף להיסטוריה  
3. סטטוסים: submitted · enqueued · sent · delivered · read · failed · rejected  
4. בדיקת סימולציה: POST מדומה ל-Webhook (בלי Gupshup send) → וידוא happy path + failed path  

### שלב B — חיבור Gupshup (Owner)
1. פורטל → App `DaliaVehicle` → Webhooks / Callback  
2. הדבק את ה-URL למעלה  
3. הפעל Delivery: SENT · DELIVERED · READ · FAILED  
4. כתוב «Callback הוגדר» (אופציונלי) או ישר אשר שליחה  

### שלב C — שליחה חיה אחת (רק אחרי אישור מפורש)
1. שליחה אחת ל-`0534338601` דרך Gupshup  
2. המתנה ל-DLR  
3. דוח סופי:

| שדה | מקור |
|-----|------|
| Message ID | תשובת Gupshup + `provider_message_id` |
| כל מעבר סטטוס | `status_history[]` |
| סטטוס סופי | `status` |
| קוד + סיבת כשל | `dlr_error_code` + `error_message` |

---

## 3. מה הדוח הסופי ייראה (אחרי שליחה מאושרת)

```
Message ID: <uuid>
Transitions:
  1. submitted   @ …
  2. sent        @ …
  3. delivered   @ …
  (או failed @ … code=… reason=…)
Final: delivered | failed | rejected | …
Error: code / message אם יש
```

---

## 4. בקשת אישור

ה-Webhook מוכן לבדיקת סימולציה ב-Staging.  
**לא אבצע שליחה חיה** עד שתכתוב במפורש:

**«אשר שליחה חיה אחת»**

(מומלץ קודם להגדיר Callback בפורטל — אחרת שוב נישאר על `submitted` בלי DLR.)
