# חקירת Message ID — Staging בלבד (ללא שליחה חוזרת)

**Message ID:** `506fe683-4b07-4752-9301-a9ab2afa2e3c`  
**זמן שליחה מקורית:** 2026-07-21T06:56:04Z  
**חקירה:** https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29809278888  
**Production:** לא נגע · **שליחה נוספת:** לא בוצעה

## תשובות

| # | שאלה | תשובה |
|---|------|--------|
| 1 | סטטוס סופי | **pending** (לא delivered / לא failed מאומת) — ידוע רק `submitted` מ-Gupshup |
| 2 | delivery callback? | **לא** — אין webhook receiver ל-Gupshup ב-Staging; אין רשומות DB ל-message_id |
| 3 | קוד שגיאה / הודעה | **אין** — השליחה התקבלה ע״י ה-API; אין DLR של כשל |
| 4 | Session או Template? | **Session Message** (`/wa/api/v1/msg`) — לא Template |
| 5 | האם 053-433-8601 רשום ב-WhatsApp? | **לא ידוע** ממערכותינו |
| 6 | נשלח למספר אחר? | **לא** — היעד בתשובה: `972534338601` בלבד |

## מה כן ידוע מהשליחה המקורית

- Edge HTTP 200 · Gupshup HTTP 202 · `status: submitted`
- App `DaliaVehicle` · Source `972546500305`
- יעד מבוקש `0534338601` → מנורמל `972534338601`

## למה `submitted` ≠ מסירה

לפי תיעוד Gupshup: תשובת ה-API מאשרת קבלה לתור אסינכרוני.  
אירועי מסירה (`enqueued` / `sent` / `delivered` / `failed` / `read`) מגיעים **רק** ל-callback URL של האפליקציה.

במערכת דליה Staging:
- אין Edge `marketing-whatsapp-inbound` / webhook ל-DLR
- אין טבלאות `gupshup_events` / `whatsapp_delivery_events`
- `document_requests` ללא שורות עם ה-message_id הזה

לכן **אי אפשר** לאשר delivered או failed מהמערכת — רק pending אחרי submitted.

## השערות לאי-הגעה (לא מוכחות בלי DLR)

1. Session מחוץ לחלון 24 שעות (המשתמש לא כתב קודם ל-`DaliaVehicle`)  
2. Callback לא מוגדר בפורטל Gupshup — אירועי כשל אבדו  
3. המספר ללא WhatsApp — היה אמור להופיע כ-`failed` ב-callback

## לפני ניסיון נוסף (המלצה בלבד — לא בוצע)

- להגדיר webhook DLR ב-Gupshup → Edge שישמור אירועים  
- או לשלוח **Template** מאושר (`main_menu` קיים) במקום Session  
- לא לשלוח שוב עד שתחליט
