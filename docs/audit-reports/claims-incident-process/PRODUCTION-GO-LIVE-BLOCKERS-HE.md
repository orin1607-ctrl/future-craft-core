# Production Go-Live — סטטוס אמת

**פריסת Frontend:** 2026-07-19T15:43:51Z  
**Commit שפורסם:** `4edf83a33f3e95317c5608a000c236f64b478816`  
**Bundle:** `assets/index-Cv0VC1Iz.js`  
**אתר:** https://dalia-car.online/  
**PRODUCTION-DEPLOY.txt:** על השרת

---

## מה עובד עכשיו באתר הפעיל

| רכיב | סטטוס |
|------|--------|
| Frontend חדש (לא BlJXIgah) | ✅ |
| Migrations (event_number, counters, deliveries, alert settings) | ✅ |
| הגדרות התראות לחברת «אילנה אטיאס» (Email+WA+both/dalia) | ✅ DB |
| Edge `notify-accident-email` גרסה חדשה | ❌ 401 על ACCESS_TOKEN |
| GUPSHUP_API_KEY ב-Production | ❌ לא מוגדר → WhatsApp לא יכול לצאת |
| Email דרך Edge ישן לנמעני Dalia | ❌ Edge ישן שולח רק ל-fleet_managers (בדיקה החזירה `sent:0`) |

---

## שני חסמים Owner — חובה לפני אישור 9 הסעיפים

### 1. GUPSHUP_API_KEY
Supabase → `qasomfndnjuixgjmjwcm` → Edge Functions → Secrets → הוסף `GUPSHUP_API_KEY`

### 2. SUPABASE_ACCESS_TOKEN תקף
1. https://supabase.com/dashboard/account/tokens → Generate  
2. GitHub Secret `SUPABASE_ACCESS_TOKEN` = טוקן חדש  
3. אופציונלי: `/root/dalia-ops/.env`  
4. לאחר מכן: push ל-`main` / הרצת Owner Go-Live / Deploy Edge

אחרי שני אלה הסוכן ישלים: פריסת Edge החדש + בדיקת פנצ׳ר אמיתית (WA+Email+קישור+לוגים) + דוח 9 סעיפים מלא.
