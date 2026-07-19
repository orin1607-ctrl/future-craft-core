# עצירה — חסרים עדיין 2 Secrets במקומות הנכונים

נבדק אוטומטית ב-**2026-07-19 ~17:54 UTC** אחרי הודעתך «סיימתי».

| בדיקה | תוצאה |
|--------|--------|
| `SUPABASE_ACCESS_TOKEN` ב-GitHub Actions Secrets | **עדיין 401** (אורך 44 — קיים אבל לא תקף) |
| `SUPABASE_ACCESS_TOKEN` ב-VPS `/root/dalia-ops/.env` | **ריק** (LEN=0) |
| `GUPSHUP_API_KEY` ב-Production Edge Secrets | **לא מוגדר** (`configured: false`) |
| Edge `notify-accident-email` | **ישן** (`edge_looks_old: true`) |
| Frontend Production Approve | **ממתין** — לא אושר עדיין |

**לא בוצעה שליחת WhatsApp/Email** — כי התנאים לא התקיימו.

---

## מה כנראה קרה (טעויות נפוצות)

1. עודכן Secret ב-**Supabase Edge Secrets** במקום ב-**GitHub → Settings → Secrets and variables → Actions**.  
2. עודכן Gupshup ב-**Staging** (`usfeoerkpcafxxlyuldl`) ולא ב-**Production** (`qasomfndnjuixgjmjwcm`).  
3. נוצר Token חדש ב-Supabase אבל **לא נלחץ Update** על Secret בשם המדויק `SUPABASE_ACCESS_TOKEN` ב-GitHub.  
4. אושר משהו אחר — אבל לא לחיצת **Review deployments** על הרצת Production.

---

## פעולה 1 — GitHub Secret (חובה ל-Edge)

1. צור Token חדש: https://supabase.com/dashboard/account/tokens  
2. עדכן **בדיוק כאן** (Repository Secrets, לא Environment, לא Edge):  
   https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions  
   שם: `SUPABASE_ACCESS_TOKEN` → Update → הדבק → Save  
3. בדיקה עצמית: אחרי עדכון כתוב «Token עודכן» — אריץ Health. חייב להיות HTTP 200.

זמן: ~2 דקות.

---

## פעולה 2 — Gupshup ב-Production Edge (חובה ל-WhatsApp)

**פרויקט Production בלבד:** `qasomfndnjuixgjmjwcm`

https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions  

הוסף/עדכן Edge Function Secrets:
- `GUPSHUP_API_KEY`
- `GUPSHUP_SOURCE` (אם יש ב-Staging)
- `GUPSHUP_APP_NAME` (אם יש ב-Staging)

העתק מ-Staging אם צריך:  
https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions  

זמן: ~3 דקות.

---

## פעולה 3 — Approve Frontend (אם עדיין לא)

https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29697711154  

→ Review deployments → Approve and deploy (~3–5 דק' אחרי)

---

## אחרי שתסיים

כתוב בצ'אט בדיוק: **«Token + Gupshup עודכנו»**

אז אריץ אוטומטית:
1. Health  
2. פריסת Edge Staging+Production  
3. אימות Secrets  
4. דוגמה חיה אחת (פנצ׳ר / יוני אטיאס → WA + Email)
