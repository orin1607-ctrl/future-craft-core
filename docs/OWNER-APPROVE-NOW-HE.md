# Owner — אשר עכשיו (קישורים ישירים)

הסוכן הפעיל את כל מה שבשליטתו. `workflow_dispatch` חסום ל-bot (403) — ההפעלה היא דרך push ל-`main`.

---

## שער A — רוטציית Token (לא GitHub Approve)

**חובה לפני Edge.**

1. קישור: https://supabase.com/dashboard/account/tokens  
2. Generate → העתק  
3. עדכן: https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions → `SUPABASE_ACCESS_TOKEN`  
4. מה מאשרים: חידוש Access Token ל-Management API  
5. אחרי: Edge Staging ייפרס אוטומטית ב-push הבא / בהרצה הבאה; Health יעבור Token  
6. זמן: ~2–3 דק'

---

## שער B — Gupshup ב-Production Edge (Dashboard)

1. Staging secrets: https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions  
2. Production secrets: https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions  
3. העתק: `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`  
4. מה מאשרים: הגדרת WhatsApp ב-Production  
5. אחרי: בדיקות WA לא יחזירו «not configured»  
6. זמן: ~3–5 דק'

---

## שער C — Approve Frontend Production (GitHub Environment)

הרצה ממתינה (או האחרונה אחרי cancel concurrency):

→ https://github.com/orin1607-ctrl/future-craft-core/actions/workflows/deploy-production-vps.yml  

או הרצה הספציפית (אם עדיין waiting):

→ https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29678008354  

1. לחץ **Review deployments** → **Approve**  
2. מה מאשרים: העלאת Frontend ל-https://dalia-car.online  
3. אחרי: build + rsync ל-`/root/future-craft-core/dist` (~3–5 דק')  
4. אם יש הרצה ישנה + חדשה: אשר את **החדשה ביותר** (או Reject לישנה)

---

## שער D — Approve Edge Production (אחרי שער A)

אחרי Token תקף + הרצת Deploy Edge:

→ https://github.com/orin1607-ctrl/future-craft-core/actions/workflows/deploy-edge-incident-notify.yml  

1. **Review deployments** → **Approve** על job Production  
2. מה מאשרים: פריסת `notify-accident-email` ל-Production Supabase  
3. אחרי: Edge חדש חי; אפשר Preflight WA/Email  
4. זמן: ~1–2 דק' אחרי Approve

---

## שער E — אישור שליחה חיה (צ'אט)

רק אחרי Health ירוק + Edge חדש. כתוב בצ'אט:

`מאשר שליחת בדיקה אחת: WhatsApp + Email`

---

## מה הסוכן כבר הפעיל / מפעיל

| פעולה | סטטוס |
|--------|--------|
| Staging Pages | רץ על push (הצליח) |
| Preview CI | רץ על push (הצליח) |
| Environment Health | רץ — נכשל על Token 401 (צפוי עד שער A) |
| Production Frontend queue | ממתינה ל-Approve (שער C) |
| Edge queue | מופעל ב-push (Staging אוטומטי אחרי A; Production = שער D) |
| WA/Email preflight | מופעל ב-push (ללא שליחה) |
