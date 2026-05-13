## סקירה
שינוי שמות שני מודולים, איחוד הזמנת עבודה לספק בין תקלות ושירותים, חיפוש לפי מספר פנימי, ייבוא היסטוריה מ-Excel ושיפור מסכי התראות וליקויים.

## שינויי מסד נתונים
- הוספת עמודה `vehicle_id` לטבלת `faults` ול-`service_orders` (כדי לפתוח את כרטיס הרכב הנכון).
- הוספת דגל `imported` ושדות `imported_source`, `imported_at` לטבלת `service_orders`.
- מילוי `vehicle_id` מהרשומות הקיימות לפי `vehicle_plate + company_name`.

## שינויי קוד

### 1. שינוי שמות מודולים
- "הזמנת שירות / הזמנות שירות" → "שירותים ותחזוקה" בכל הקבצים: `BottomNav`, `Dashboard`, `DriverDashboard`, `Alerts`, `History`, `ServiceOrders`, `ServiceOrderHistory`, `Roadmap`, `Reports`, `EmailTemplates`, `ApprovalSettings`, `SystemLogs`, `useHiddenButtons`, `HelpButton`, `About`, `ProjectSummary`, `voice/ScenariosTab`, `PrivateCustomerDashboard`, `Towing`.
- "תקלות" → "מעקב רכב" בכותרות של `Faults`, `BottomNav`, `useHiddenButtons`, `EmailTemplates`, `ProjectSummary`, `DriverDashboard`. שמות פנימיים בקוד (faults, fault_type) נשארים.

### 2. הזמנת עבודה לספק משותפת
- אין כפילות במסד. ב-Service Orders נוסיף לשונית/חלק "הזמנות עבודה לספק" שמושך מ-`work_orders` כשה-`fault_id` מקושר לתקלה של אותו רכב/הזמנה. אותה רשומה מוצגת בשני המסכים.

### 3. חיפוש לפי מספר פנימי
- בכל מסך עם חיפוש לפי רכב נטען מיפוי `plate → internal_number` ונרחיב את `matchSearch` כך שיתפוס גם מספר פנימי. רלוונטי ל: `Faults`, `Alerts`, `ServiceOrders`, `ServiceOrderHistory`, `Accidents`, `Expenses`, `History`, `VehicleHandover`, `WorkOrders`, `VehicleTasks`.

### 4. ייבוא היסטוריה מ-Excel/CSV
- במסך `History`: כפתור "ייבוא Excel". פותח דיאלוג עם קלט קובץ + בחירת רכב.
- פרסור עם `xlsx` (כבר בפרויקט אם קיים, אחרת נוסיף). מיפוי עמודות חופשי (תאריך, קטגוריה, תיאור, ספק, סכום).
- שמירה כ-`service_orders` עם `imported=true`, `treatment_status='completed'`, `vehicle_plate` מהבחירה.
- תצוגה ב-History כבר מציגה service_orders → יופיעו אוטומטית בקטגוריית "שירותים ותחזוקה".

### 5. התראות וליקויים – מספר פנימי + ניווט מדויק
- ב-`Alerts` וב-`VehicleTasks`: ב-subtitle נציג גם מספר פנימי לצד מספר רכב.
- ב-`Alerts`, התראות מסוג fault ו-defect ינווטו ל-`/vehicles?vehicleId=<id>` במקום `/faults`/`/vehicle-tasks`.
- ב-`Vehicles`: קריאת `vehicleId` מ-querystring ופתיחה אוטומטית של ה-VehicleDetail המתאים.
- בתוך מסך תקלות עצמו: בלחיצה על כרטיס תקלה (אם יש vehicle_id) – כפתור "פתח כרטיס רכב" שמנווט לאותו URL.

## סדר ביצוע
1. מיגרציית DB (vehicle_id + imported flags + backfill).
2. שינויי שמות (רנדומלי לפי קובץ).
3. תמיכה במספר פנימי בחיפושים + תצוגה.
4. פתיחת רכב מ-Alerts + Vehicle ID ב-faults/service_orders חדשים.
5. ייבוא Excel ב-History.
6. הצגת work_orders של תקלה גם במסך שירותים.

## הערות
- שמות פנימיים בקוד (`/faults`, `/service-orders`, `service_order` event types) נשארים — רק תוויות תצוגה משתנות.
- `imported` רק מסמן רשומות שיובאו ולא מפעיל טריגרים של התראות חדשות.