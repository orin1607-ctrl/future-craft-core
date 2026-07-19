# דוח סיום — Incident Alerts על Faults/Accidents (Staging)

**Branch:** `feat/incident-alerts-staging`  
**Staging Supabase:** `usfeoerkpcafxxlyuldl`  
**Production:** לא נגע · לא Deploy · לא Hostinger

## מה בוצע

1. מספר אירוע אוטומטי `FLT-YYYY-######` / `ACC-YYYY-######` (per company+year)  
2. שיוך `vehicle_id`, `driver_id`, `opened_by_role`, `event_number`  
3. סוגי תקלות מורחבים + שדה "אחר"  
4. מסך אישור אחרי שליחה + Preview מייל/WhatsApp (ללא שליחה אמיתית)  
5. תיקון באג `opened` במעקב רכבים → תקלות  
6. הצגת `internal_number` בבחירת רכב / Hub  
7. הגדרות התראות ב-AlertSettings (ערוצים + נמענים)  
8. דשבורד נהג — דיווחים אחרונים  
9. Vehicle Hub — עמודת מספר אירוע  
10. Deep link `?id=` + redirect אחרי login  
11. "לקחתי לטיפול" בתקלות  

## Staging URL

https://orin1607-ctrl.github.io/future-craft-core/

(לאחר merge/deploy ל-GitHub Pages Staging — כרגע הקוד ב-branch בלבד עד push)

## בדיקות Demo (ידני מומלץ אחרי `supabase db push` ל-Staging)

1. כניסה כנהג Demo / יוני אטיאס  
2. דיווח תקלה מסוג פנצ׳ר על רכב Demo  
3. אימות מספר אירוע במסך האישור  
4. בדיקה במעקב רכבים → פילטר תקלות  
5. בדיקה בכרטיס רכב (Hub → תקלות)  
6. בדיקה בדשבורד נהג — דיווחים אחרונים  
7. Preview WhatsApp/Email במסך האישור  

## אישור

**לא בוצע Deploy ל-Production.**  
**לא בוצע Deploy ל-Hostinger.**  
**לא שונו נתוני לקוחות Production.**  
שליחת WhatsApp/Email אמיתית כבויה (`dryRun: true`).
