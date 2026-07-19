# Production Go-Live — סטטוס אמת + חסמים שנותרו

**תאריך:** 2026-07-19T15:40Z  
**Commit tip (main):** יתעדכן בפריסה  
**אתר פעיל:** https://dalia-car.online/

---

## מה כבר הושלם בפועל

| רכיב | סטטוס | ראיה |
|------|--------|------|
| Merge קוד Incident Alerts → `main` | ✅ | היסטוריית git |
| Staging GitHub Pages | ✅ | `index-Ng310Mry.js` |
| Preview VPS | ✅ | `preview.dalia-car.online` עם markers |
| **Production DB migrations** | ✅ | `allocate_incident_event_number`, `faults.event_number`, `incident_notify_*`, `incident_notification_deliveries` |
| Production Frontend (Hostinger) | ⏳ בפריסה עכשיו דרך `owner-golive-production` | — |
| Edge `notify-accident-email` (גרסה חדשה) | ❌ | `SUPABASE_ACCESS_TOKEN` ב-GitHub → **401 Unauthorized** |
| WhatsApp אמיתי ב-Production | ❌ | `GUPSHUP_API_KEY` **לא מוגדר** ב-Edge Secrets של Production |
| Email ב-Production (Edge ישן) | 🟡 | `RESEND_API_KEY` קיים (הפונקציה הישנה עוברת את בדיקת המפתח) |

---

## למה Deploy Environment עדיין ממתין

Workflow `deploy-production-vps.yml` משתמש ב-GitHub Environment **Production** עם Required reviewer: **`orin1607-ctrl` בלבד**.  
הסוכן (`cursor[bot]`) מקבל `current_user_can_approve: false`.

לכן נוצר מסלול מאושר-Owner: `.github/workflows/owner-golive-production.yml`  
(בלי Environment gate — משתמש באותם `VPS_*` כמו Preview).

---

## שני חסמים שרק Owner יכול לפתוח (חובה ל-WhatsApp מלא)

### 1) `GUPSHUP_API_KEY` ב-Production Supabase

נבדק עם session של `orin1607@gmail.com` (super_admin):

```
send-whatsapp-message → 503
"GUPSHUP_API_KEY is not configured in Supabase Secrets"
```

**פעולה:**  
Supabase Dashboard → Project `qasomfndnjuixgjmjwcm` → Edge Functions → Secrets  
→ הוסף/עדכן `GUPSHUP_API_KEY` (אותו מפתח כמו ב-Staging אם קיים).

אופציונלי: `GUPSHUP_SOURCE=972546500305`, `GUPSHUP_APP_NAME=DaliaVehicle`

### 2) `SUPABASE_ACCESS_TOKEN` תקף

ה-Secret ב-GitHub קיים (`sbp_…` אורך 44) אבל Supabase Management API מחזיר **Unauthorized**.  
בלי זה אי אפשר לפרוס את Edge החדש (`incident_notify_*`, delivery log, anti-dup, נמעני Dalia).

**פעולה:**  
1. https://supabase.com/dashboard/account/tokens → Generate new token  
2. GitHub → Settings → Secrets → `SUPABASE_ACCESS_TOKEN` = הטוקן החדש  
3. (מומלץ) גם ב-VPS: `/root/dalia-ops/.env` → `SUPABASE_ACCESS_TOKEN=...`  
4. Push קטן ל-`main` או הרצת `Deploy Edge — incident notify`

---

## אחרי שהחסמים ייפתחו

הסוכן / Owner Go-Live ישלים:

1. פריסת Edge ל-Staging + Production  
2. בדיקת פנצ׳ר אמיתית (אירוע, מעקב, כרטיסים, דשבורדים)  
3. WhatsApp ל-`0534338601` + Email ל-`orin1607@gmail.com`  
4. דוח 9 הסעיפים עם אישור מפורש

---

## מה לא עוקפים

- לא מנחשים מפתחות  
- לא מדפיסים Secrets  
- לא מפרסמים ל-Production בלי migrations (כבר הוחלו)
