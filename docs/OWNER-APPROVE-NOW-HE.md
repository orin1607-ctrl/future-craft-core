# Owner — אשר עכשיו (קישורים ישירים)

הסוכן הפעיל את כל מה שבשליטתו.  
`workflow_dispatch` חסום ל-bot (403) — ההפעלה היא דרך push ל-`main`.

**אחרי שתסיים שער — כתוב בצ'אט «אושר» / «סיימתי» ואמשיך אוטומטית לשלב הבא.**

---

## שער A — רוטציית Token (Dashboard — לא GitHub Approve)

**חובה לפני Edge.**

1. **קישור:** https://supabase.com/dashboard/account/tokens  
2. Generate → העתק  
3. **עדכון Secret:** https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions → `SUPABASE_ACCESS_TOKEN`  
4. **מה מאשרים / מה עושים:** חידוש Access Token ל-Management API (הנוכחי מחזיר 401)  
5. **מיד אחרי:** כתוב «Token עודכן» — אפרוס Edge Staging אוטומטית ואפתח Approve ל-Edge Production  
6. **זמן:** ~2–3 דקות

---

## שער B — Gupshup ב-Production Edge (Dashboard)

1. **Staging secrets:** https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions  
2. **Production secrets:** https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions  
3. העתק: `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`  
4. **מה זה:** הגדרת WhatsApp ב-Production (כרגע `configured: false`)  
5. **מיד אחרי:** Preflight WA יעבור; מוכן לשליחת בדיקה אחרי Edge חדש  
6. **זמן:** ~3–5 דקות

---

## שער C — Approve Frontend Production (GitHub) ← ממתינים עכשיו

**קישור ישיר (יעודכן בהרצה האחרונה אחרי התיקון):**

→ https://github.com/orin1607-ctrl/future-craft-core/actions/workflows/deploy-production-vps.yml  

בחר את ההרצה במצב **Waiting** → **Review deployments** → **Approve and deploy**

1. **מה מאשרים:** העלאת Frontend ל-https://dalia-car.online  
2. **מיד אחרי:** build + rsync (~3–5 דק') — אמשיך לאימות שהאתר עלה  
3. **זמן Approve:** ~30 שניות

> מעתה: שינויי docs בלבד **לא** מבטלים Approve ממתין.

---

## שער D — Approve Edge Production (אחרי שער A)

יופיע אחרי Token תקף + הרצת Deploy Edge:

→ https://github.com/orin1607-ctrl/future-craft-core/actions/workflows/deploy-edge-incident-notify.yml  

1. **Review deployments** → **Approve** על job Production  
2. **מה מאשרים:** פריסת `notify-accident-email` ל-Production  
3. **מיד אחרי:** Edge חדש; מריץ Health + Preflight WA/Email  
4. **זמן:** ~1–2 דק' אחרי Approve

---

## שער E — אישור שליחה חיה (צ'אט בלבד)

רק אחרי Health ירוק. כתוב:

`מאשר שליחת בדיקה אחת: WhatsApp + Email`

---

## מה כבר רץ (בשליטת הסוכן)

| פעולה | תוצאה |
|--------|--------|
| Staging Pages | ✅ success |
| Preview CI | ✅ רץ / הצליח |
| Environment Health | ❌ Token 401 (צפוי עד שער A) |
| Edge deploy | ❌ נחסם עד Token (שער A) — אז Staging אוטומטי + Approve ל-Prod |
| Production Frontend | ⏳ Waiting — שער C |
| WA/Email preflight | ✅ רץ (ללא שליחה): Edge ישן, GUPSHUP לא מוגדר ב-Prod |
