בוקר טוב מיקי 👋

זה שינוי גדול מאוד — מבנה של 14 קטגוריות עם עשרות שדות חדשים, כולל בלוקים דינמיים (ליסינג/מימון/שעבוד), שעבודים, מסלולי בעלות, ציוד ייעודי, התראות וייבוא. כדי לעשות את זה נכון בלי לשבור את הקיים, הנה תוכנית בשלבים.

## מה כבר קיים בטבלת `vehicles`
שדות בסיסיים (מספר רכב, מספר פנימי, יצרן, דגם, שנתון, ק"מ, סוג דלק, חברה, סטטוס, ביטוח בסיסי, טסט, תאריך רכישה/גריעה, מסמכי רישיון). חסרים רוב השדות החדשים.

## תכולה מוצעת

### שלב 1 — סכימת DB (Migration גדולה אחת)
הוספת עמודות ל-`vehicles`:
- **פרטי רכב**: `vin`, `engine_number`, `vehicle_type`, `usage_type`, `segment`, `nickname`, `ownership_type`
- **שיוך ומיקום**: `department`, `vehicle_manager`, `current_location`, `work_site`
- **תאריכים**: `road_entry_date`, `sale_date`
- **בעלות/מסלול**: `finance_track` (enum: operational_leasing/financial_leasing/loan/self_maintenance/service_maintenance/company_owned/private_owned/rental/other) + JSONB `finance_details` לכל סוג
- **שעבוד**: `is_pledged` bool + JSONB `pledge_details`
- **ביטוחים**: JSONB `insurances` (חובה/מקיף/צד ג׳ + כיסויים נוספים)
- **תסקירים**: JSONB `inspections_certificates`
- **ציוד ייעודי**: `equipment_type`, `horsepower`, `engine_volume`, `weight_tons`, `kva`, `engine_hours`, `equipment_serial`
- **תחזוקה**: `maintenance_method`, JSONB `maintenance_details`, `next_service_km`, `next_service_hours`
- **מקור ייבוא**: `import_source`, `import_file_name`, `import_date`, `imported_by`, `import_status`

טבלה חדשה `departments` (מחלקות לפי חברה) לבחירה מתוך רשימה.

### שלב 2 — UI: עמוד כרטיס רכב מחדש
החלפת מבנה הטאבים ב-`Vehicles.tsx` (תצוגת VehicleDetail) ל-14 טאבים/אקורדיון:
1. פרטי רכב (כולל תת-קטגוריות: עריכה, שיוך, תאריכים)
2. בעלות, ליסינג ומימון (בלוקים דינמיים לפי `finance_track` + שעבוד מותנה)
3. ביטוחים ורישיונות
4. ציוד וכלים מיוחדים
5. טיפולים ותחזוקה
6. מסמכים וקבצים (מחובר ל-`document_metadata`)
7. בדיקות רכב (מחובר ל-`vehicle_inspections`)
8. תקלות ותיקונים (מחובר ל-`faults`)
9. שירותי רכב (מחובר ל-`service_orders`)
10. התראות (מחובר ל-`custom_alerts`)
11. היסטוריה ומעקב (ה-VehicleFilePanel הקיים)
12. מעקב רכב
13. בקרה — 4 כפתורי מודולים (ביקורות/ליקויים/מעקב/התראות) עם סינון לפי vehicle_id
14. מידע מערכת וייבוא

### שלב 3 — כפתור השבת/הפעל
טוגל בראש הכרטיס שמעדכן `status` בין active/inactive.

### שלב 4 — חיבור מחלקות
Combobox במקום שדה חופשי, נשלף מטבלת `departments` של החברה הנוכחית.

## מה לא בתוך התוכנית הזו
- **ייבוא רכבים בפועל** מאקסל/CSV — זה פיצ'ר נפרד גדול. אפשר לעשות בשלב הבא אחרי שהסכימה מוכנה.
- **בדיקת סתירות לפני ייבוא** — חלק מפיצ'ר הייבוא.
- **שינוי טבלאות `faults`/`service_orders`/`insurances`** — נשאיר אותן כמו שהן ונקשר אליהן מהכרטיס.

## טכני
- Migration אחת גדולה עם כל העמודות + טבלת `departments` + RLS.
- פיצול ה-UI לקומפוננטות נפרדות תחת `src/components/vehicle-card/` (Category1.tsx … Category14.tsx) כדי שהקובץ הראשי לא יתפוצץ.
- JSONB לבלוקים שיכולים להשתנות (ליסינג/מימון/ביטוחים) במקום עשרות עמודות שטוחות — יותר גמיש לייבוא.

## שאלות לפני שמתחילים
1. **טבלת `departments`**: ליצור חדשה? או שיש לך כבר רשימת מחלקות במקום אחר?
2. **JSONB מול עמודות שטוחות**: לבלוקים כמו ליסינג/ביטוחים — JSONB גמיש יותר אבל פחות נוח לדוחות. מעדיף JSONB או שטוח?
3. **גודל ביצוע**: לעשות הכל בפעם אחת (יקח זמן, צ׳אט ארוך), או לפצל לשלבים — קודם סכימה+קטגוריות 1-2, ואז להמשיך?

אחרי שתאשר את התוכנית ותענה על השאלות — מתחיל לעבוד.