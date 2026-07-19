# בדיקת אמת מבוקרת — נעצרה לפני שליחה

**תאריך:** 2026-07-19T16:53Z  
**אתר:** https://dalia-car.online/ (Production)  
**מדיניות:** אין Preview · אין שליחה כפולה · אין דיווח הצלחה חלקי

---

## תוצאת Preflight — לא בוצעה שליחה

נבדקו כל התנאים מסעיף 4. **חסרים קריטיים** — לכן **לא** נוצר אירוע חדש לשליחה, **לא** נשלח WhatsApp, **לא** נשלח Email.

| תנאי | סטטוס | פירוט |
|------|--------|--------|
| Frontend Production | ✅ | `index-Cv0VC1Iz.js` · commit `4edf83a` |
| Migrations / מספר אירוע | ✅ | RPC `allocate_incident_event_number` חי |
| Edge Function **החדש** | ❌ | עדיין גרסה ישנה (`sent` בלבד, אין `dry_run` / WhatsApp / נמעני Dalia) |
| `GUPSHUP_API_KEY` ב-Production | ❌ | `configured: false` |
| Email provider (Resend) | 🟡 | קיים ב-Edge הישן, אבל הנתיב החדש לנמעני Dalia לא פרוס |
| AlertSettings «אילנה אטיאס» | ✅ DB | Email+WA=on · recipients both/dalia |
| WhatsApp פעיל בפועל | ❌ | בגלל GUPSHUP חסר + Edge ישן |
| Email לנמען דליה בפועל | ❌ | Edge ישן → `sent:0` (רק fleet_managers) |
| נהג «יוני אטיאס» קיים | ❌ | לא נמצא ב-`drivers` (236 רשומות נסרקו) |
| רכב משויך לחברה | ❌ | «אילנה אטיאס»: 0 vehicles · 0 drivers |
| `SUPABASE_ACCESS_TOKEN` | ❌ | GitHub Secret קיים · Supabase מחזיר **401 Unauthorized** |
| GUPSHUP על VPS | ❌ | לא נמצא (לא מדפיסים ערכים) |

---

## מה חסר בדיוק (Owner בלבד — בלי Secrets בצ'אט)

### A) Secrets ב-Supabase Production (`qasomfndnjuixgjmjwcm`)
1. Dashboard → **Edge Functions → Secrets**
2. הוסף/ודא: `GUPSHUP_API_KEY`
3. אופציונלי: `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`, `RESEND_API_KEY` / `RESEND_FROM`

### B) טוקן לפריסת Edge
1. https://supabase.com/dashboard/account/tokens → Generate new token  
2. GitHub → Settings → Secrets → Actions → עדכן `SUPABASE_ACCESS_TOKEN`  
3. (מומלץ) גם `/root/dalia-ops/.env` ב-VPS — אותו מפתח, בלי לשלוח לצ'אט

### C) נתוני דמו אמיתיים ב-Production
- נהג בשם **יוני אטיאס** עם טלפון
- רכב קיים עם `license_plate` (+ `internal_number` אם יש)
- שיוך לרכב + לחברה (למשל «אילנה אטיאס» או החברה הנכונה במערכת)
- משתמש נהג / מנהל צי שיכולים לראות בדשבורדים

---

## אחרי שתשלים A+B (+C אם חסר)

כתוב: **«הסודות עודכנו — הרץ דוגמה אחת»**

אז בלבד:
1. פריסת Edge `notify-accident-email` החדש ל-Production  
2. יצירת תקלת פנצ׳ר אחת מבוקרת (רכב+נהג קיימים)  
3. שליחה אחת WhatsApp ל-0534338601 + Email אחד ל-orin1607@gmail.com  
4. דוח 11 הסעיפים + הוכחות  

**לא אריץ שליחה שוב בלי אישור נוסף.**
