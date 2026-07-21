# Staging DLR E2E — תוצאה (עצירה על Callback)

**Production:** לא נפרס.  
**הרצה:** https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29810478157

## מה הושלם ב-Staging
| פריט | סטטוס |
|------|--------|
| Migration `incident_notification_deliveries` + DLR | ✅ |
| Edge `gupshup-webhook` | ✅ GET 200 |
| Edge `send-whatsapp-message` (רישום submitted) | ✅ |
| רישום Callback ב-Gupshup דרך API | ❌ דורש Owner |
| שליחה חיה אחת ל-0534338601 | ✅ `submitted` |
| DLR delivered/failed תוך 120ש׳ | ❌ לא התקבל |

## שליחה
- Message ID: `24b2ab98-284f-466f-868c-43435a0ba8a9`
- Gupshup HTTP 202 · status `submitted`
- נרשם ב-DB: `status=submitted` לפי messageId

## מסלול סופי
**submitted → (אין DLR) נשאר submitted**  
אין קוד כשל מ-Gupshup — כי אירוע מסירה לא הגיע ל-Webhook.

## מה מחכה לך (חובה לפני שליחה נוספת)
1. היכנס לפורטל Gupshup של `DaliaVehicle`  
2. Webhooks / Callback URL → הדבק:

```
https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
```

3. הפעל אירועי Delivery: SENT · DELIVERED · READ · FAILED  
4. כתוב בצ'אט: **«Callback הוגדר»**

אז אריץ שליחה חיה **אחת** נוספת + המתנה ל-DLR ואדווח:  
`submitted → delivered` או `submitted → failed` (+ קוד/סיבה).
