# אבחון: Meta=sent אבל לא הגיע לטלפון

**תאריך:** 2026-07-21  
**Message ID:** `346d6d28-9266-42ae-a0c3-6e4f0bd0a06f`  
**Production:** חסום — Owner לא קיבל הודעה במכשיר.

## תשובות קצרות

### 1. האם נשלח למספר הנכון?
**כן.**  
שליחה / DB / Make DLR — כולם: `972534338601` (= `0534338601`).

### 2. האם החשבון 0546500305 מוגבל/חסום?
**לא נראה חסימה מלאה.**  
Gupshup `verified` + Meta החזיר `sent` עם שיחת `service`.  
אי אפשר לשלול quality soft-limit מתוך API בלבד — לבדוק ב-Gupshup/WhatsApp Manager.

### 3. האם Session Message תקינה?
**כן מבחינת Meta.**  
`conversation.origin=service`, `free_customer_service`, בלי `131047`.  
זו לא כשלון חלון 24 שעות.

### 4. בעיה במספר שלך או בחשבון העסקי?
**הכי סביר: צד המכשיר / אי-מסירה אחרי `sent`.**  
Meta לא החזיר `failed`. גם לא `delivered`/`read`.  
לפי תיעוד Meta: `sent` ≠ הגיע למסך; `delivered` = הגיע למכשיר.

גורמים נפוצים ל-`sent` בלי `delivered`:
- המכשיר לא היה זמין ל-WhatsApp (כבוי / אין רשת / Doze)
- חסימת מספר העסק אצלך
- WhatsApp לא רשום על ה-SIM הזה / חשבון אחר
- שיחה בארכיון / מסוננת

### 5. האם רואים בפורטל Gupshup / Meta?
| מקור | נראה? |
|------|--------|
| Make Hook logs | ✅ `sent` + wamid |
| Supabase Staging | ✅ שורה (עדיין `submitted` ב-DB) |
| Gupshup Console | הסוכן לא נכנס ל-UI — חפש `346d6d28-…` |
| Meta / WhatsApp Manager | חפש wamid למטה |

**wamid:**  
`wamid.HBgMOTcyNTM0MzM4NjAxFQIAERgSRDQwQTgzMkI1RDU2QkY1NDY5AA==`

## מסקנה
המסלול הטכני עד Meta תקין.  
הפער הוא **בין `sent` ל-`delivered`** — לא בין המערכת ל-Gupshup.

## Production
**לא מאושר. לא לבצע.**

## בדיקות Owner (בלי שליחה נוספת מאיתנו)
1. בטלפון `0534338601` → WhatsApp → צ׳אט עם `054-650-0305` (ארכיון / Spam)  
2. הגדרות WhatsApp → Account → Phone = `0534338601`?  
3. האם העסק חסום אצלך?  
4. Gupshup → DaliaVehicle → חיפוש ה-message id למעלה  

כשתקבל הודעה אמיתית במכשיר — נמשיך. עד אז Production נשאר חסום.
