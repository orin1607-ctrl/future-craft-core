# סטטוס פרסום Production — Incident Alerts

**זמן עדכון:** 2026-07-19T07:23:09Z  
**Commit ב-main:** `21a5a97` (`21a5a977c90e8390329891420d22ed13e2a3bc9b`)

## מה הושלם

| שלב | סטטוס |
|-----|--------|
| מימוש WhatsApp+Email אמיתי בקוד | ✅ |
| מתג WhatsApp נפרד מחירום | ✅ |
| לוג שליחות + anti-dup | ✅ migration + Edge |
| Build ללא שגיאות | ✅ |
| Merge ל-main | ✅ |
| Deploy Staging GitHub Pages | ✅ https://orin1607-ctrl.github.io/future-craft-core/ |
| CI Preview | ✅ (רץ על push) |
| Deploy Production Hostinger | ⏳ ממתין לאישור Environment `production` |
| Deploy Edge Staging/Production | ⚠️ דורש `SUPABASE_ACCESS_TOKEN` ב-GitHub Secrets |
| בדיקת WA/Email אמיתית מבוקרת | ⛔ חסום עד Edge+Secrets+הפעלת הגדרות |

## מה Owner חייב לאשר עכשיו (דחוף)

1. **אשר את Deploy Production שממתין:**  
   https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29678008354  
   (GitHub → Review deployments → Approve)

2. **ודא Secret:** `SUPABASE_ACCESS_TOKEN` קיים ב-GitHub Secrets (לפריסת Edge + migrations)

3. **הפעל Edge ידנית אם צריך:**  
   Actions → Deploy Edge — incident notify → staging ואז production

4. **ב-AlertSettings (אחרי Production עולה):** עבור חברת Demo הפעל Email+WhatsApp, נמענים=דליה  
   WA: 0534338601 · Email: orin1607@gmail.com

5. **בדיקת Demo אחת:** יוני אטיאס / פנצ׳ר — ואז אישור להמשך

## קישורים

- Staging: https://orin1607-ctrl.github.io/future-craft-core/
- Demo: https://orin1607-ctrl.github.io/future-craft-core/dev/incident-alerts-proof
- Production (אחרי אישור): https://dalia-car.online/
- Rollback: workflow `rollback-production-vps.yml`

## בטיחות

- אין שליחה כפולה: unique index על incident×channel×recipient
- כישלון notify לא מבטל שמירת אירוע
- WhatsApp incidents ≠ emergency whatsapp_enabled
