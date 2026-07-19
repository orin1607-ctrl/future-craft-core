# סטטוס Production Go-Live — עכשיו

## פריסת Frontend — הושלמה

| שדה | ערך |
|-----|-----|
| אתר | https://dalia-car.online/ |
| זמן פריסה | 2026-07-19T15:43:51Z |
| Commit | `4edf83a33f3e95317c5608a000c236f64b478816` |
| Bundle | `assets/index-Cv0VC1Iz.js` (הישן `BlJXIgah` הוסר) |
| Migrations | ✅ הוחלו על Production DB |
| מספר אירוע | ✅ `FLT-2026-000002` נוצר בבדיקה |
| תקלת פנצ׳ר לדוגמה | `ccc98e03-3831-4c85-a613-d1bec77da5a3` |

Deep link: https://dalia-car.online/faults?id=ccc98e03-3831-4c85-a613-d1bec77da5a3

## מה עדיין לא עובד (חסמי Owner)

### 1) WhatsApp — GUPSHUP_API_KEY חסר ב-Production
```
configured: false
"GUPSHUP_API_KEY is not configured in Supabase Secrets"
```
פעולה: Supabase project `qasomfndnjuixgjmjwcm` → Edge Functions → Secrets → הוסף `GUPSHUP_API_KEY`

### 2) Edge חדש — SUPABASE_ACCESS_TOKEN לא תקף
GitHub Secret קיים אבל Supabase מחזיר 401 Unauthorized.  
בלי זה אין: נמעני Dalia, delivery log, anti-dup, מתג incident_notify_whatsapp בפועל.

פעולה: צור Access Token חדש ב-Supabase Account → Tokens, עדכן GitHub Secret `SUPABASE_ACCESS_TOKEN`, ואז push / Owner Go-Live.

### 3) Email אמיתי ל-orin1607
Edge הישן החזיר `sent: 0` (אין fleet_managers בחברה).  
אחרי פריסת Edge החדש עם `incident_email_recipients=both` — יישלח גם ל-Dalia.

## אישור GitHub Environment Production
עדיין דורש Approve מ-`orin1607-ctrl` ל-workflow הישן.  
הפריסה בפועל בוצעה דרך `owner-golive-production.yml` (מאושר בצ'אט Owner).
