# Gupshup DLR Webhook — Staging

## מה נבנה
1. Edge `gupshup-webhook` — מקבל sent/delivered/read/failed/rejected/enqueued  
2. טבלת `incident_notification_deliveries` + אינדקס לפי `provider_message_id`  
3. `send-whatsapp-message` רושם `status=submitted` + `messageId` אחרי שליחה  
4. ניסיון רישום Callback URL דרך API (`register_dlr_callback`)

## Callback URL (Staging)
```
https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
```

**Production:** לא נפרס.

## אם API לא מצליח לרשום Callback
Gupshup Console → App `DaliaVehicle` → Webhooks / Callback URL → הדבק את ה-URL למעלה → שמור  
אירועים: Delivery (SENT, DELIVERED, READ, FAILED)

ואז כתוב «Callback הוגדר» להרצה חוזרת של השליחה+סקר DLR.
