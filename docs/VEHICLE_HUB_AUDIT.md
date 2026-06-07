# דוח בדיקה — כרטיס רכב (VehicleHub)

תאריך: 2026-06-03  
סטטוס: לפני אישור סופי · **ללא Commit / Push**

## קבצים שנוגעו בכרטיס הרכב

| קובץ | תפקיד |
|------|--------|
| `src/components/vehicles/VehicleHub.tsx` | מסך כרטיס ראשי — דשבורד + 4 אזורים |
| `src/components/vehicles/VehicleDashboard.tsx` | דשבורד רכב בודד |
| `src/components/vehicles/VehicleDetailsPanel.tsx` | סעיפים 1–5 (תצוגה מלאה) |
| `src/components/vehicles/VehicleActionModal.tsx` | פתיחת פעולה (מודל) |
| `src/components/vehicles/VehicleSupplierOrderModal.tsx` | הזמנה לספק |
| `src/lib/vehicleHubData.ts` | טעינת טאבים |
| `src/lib/vehicleHistory.ts` | היסטוריה מאוחדת |
| `src/pages/Vehicles.tsx` | רשימה + VehicleForm + חיבור Hub |
| `public/vehicle-hub-full-preview.html` | HTML לבדיקה |

**לא שונה:** `VehicleForm` (עריכה/ייבוא), סכימת Supabase, RLS.

---

## 1. עיצוב — כחול ולבן

| בדיקה | תוצאה |
|--------|--------|
| צבעי Future Craft (`--primary` כחול, `--background` לבן) | ✅ ב-React: `card-elevated`, `bg-primary`, ללא gradient כהה |
| HTML Preview | ✅ `vehicle-hub-full-preview.html` — רקע בהיר, כפתורים כחולים |
| אין עיצוב "דליה כהה" מה-HTML המקורי | ✅ |

---

## 2. סעיפים 1–5 — השוואת שדות

### מקור: `VehicleDetail` (HEAD) + `VehicleForm` (`Vehicles.tsx`)

| אזור | במקור | ב-VehicleDetailsPanel | חסר? |
|------|--------|------------------------|------|
| **פרטי רכב** | plate, internal, manufacturer, model, year, type, status, km, driver, company | ✅ כל השדות + approval_status | לא |
| **בעלות/ניהול** | management_type + 3 בלוקים מותנים | ✅ אותם שדות DB | לא |
| **ביטוחים ורישיונות** | test, insurance/comp dates, ExpiryRow, insurance_history table | ✅ + insurance_cost אם קיים | לא |
| **ציוד וכלים** | לא ב-vehicles | ✅ מ-`vehicle_exchanges.extra_equipment` (אחרון) | אין שדה ב-vehicles — **מוגבל כמו במערכת** |
| **טיפולים ותחזוקה** | last_service_date, next_service_date | ✅ | לא |
| **מסמכים** | 3 קישורי URL | ✅ DocLink | לא |
| **הערות/שינוע** | needs_transport, notes | ✅ | לא |
| **עריכה/ייבוא** | VehicleForm מלא | ✅ כפתור "עריכה מלאה" → אותו Form | לא |

### רשימת שדות `vehicles` — כולם נשמרים ב-Form

`license_plate`, `internal_number`, `manufacturer`, `model`, `year`, `vehicle_type`, `status`, `odometer`, `assigned_driver_id`, `company_name`, `test_expiry`, `insurance_start`, `insurance_expiry`, `comprehensive_insurance_start`, `comprehensive_insurance_expiry`, `last_service_date`, `next_service_date`, `needs_transport`, `approval_status`, `license_doc_url`, `insurance_doc_url`, `comprehensive_insurance_doc_url`, `management_type`, `monthly_leasing_cost`, `leasing_end_date`, `vehicle_return_date`, `monthly_loan_payment`, `loan_end_date`, `planned_replacement_date`, `has_loan`, `is_leasing`, `insurance_cost`, `notes`, `created_by`, `created_at`

**מסקנה סעיפים 1–5:** אין מחיקת שדה · אין שינוי binding · ייבוא/שמירה דרך `VehicleForm` ללא שינוי.

---

## 3. סעיפים 6–14 — פעולות

| פעולה | במקור (ניווט) | ב-Hub (מודל + DB) | הערה |
|--------|----------------|-------------------|------|
| ליקוי | `/vehicle-tasks` | ✅ `vehicle_tasks` insert | |
| תקלה | `/faults` | ✅ `faults` insert | |
| טיפול | `/service-orders` | ✅ `service_orders` | |
| תאונה | `/accidents` | ✅ `accidents` | |
| בדיקה | `/vehicle-inspections` | ✅ `vehicle_inspections` (פשוט) | ללא checklist מלא כמו בעמוד בדיקות |
| שינוע | towing / handover | ✅ `service_orders` + towing flag | |
| הזמנת שירות | `/service-orders` | ✅ מודל + קיצור | |
| מסמך פעולה | `/documents` / Form | ⚠️ מפנה ל-**עריכת רכב** (אותם uploads) | לא insert ל-document_metadata מהמודל |
| הערה | notes ב-vehicle | ✅ update `vehicles.notes` | |
| התראה | CreateAlertModal | ✅ | **לא מקושר ל-plate** (מגבלת טבלה) |
| הזמנה לספק | ServiceOrders | ✅ `service_orders` + wizard | |
| צ'אט | — | ❌ לא קיים במערכת | הוסר מטאב פעולות |

---

## 4. היסטוריה

| מקור נתונים | מסונן ל-plate? | מופיע ב-history? |
|-------------|---------------|------------------|
| faults | ✅ | ✅ |
| vehicle_tasks (ליקוי) | ✅ | ✅ |
| service_orders | ✅ | ✅ |
| accidents | ✅ | ✅ |
| vehicle_inspections | ✅ | ✅ |
| vehicle_handovers | ✅ | ✅ |
| vehicle_exchanges | ✅ | ✅ |
| expenses | ✅ | ✅ |
| document_metadata | ✅ | ✅ + קישור |

**שדות בתצוגה:** תאריך, סוג, תיאור, סטטוס, מספר רכב, פנימי, משתמש (כשיש בשדה), מסמך (URL).

| פעולה | מופיעה אוטומטית בהיסטוריה? |
|--------|---------------------------|
| ליקוי / תקלה / טיפול / בדיקה / תאונה / שינוע / הזמנת שירות | ✅ אחרי refresh (טבלאות קיימות) |
| הערה (notes) | ⚠️ לא — רק שינוי בשדה notes |
| שינוי סטטוס מניהול | ⚠️ לא — אין activity log |
| התראה custom_alerts | ⚠️ לא מסונן לרכב |
| העלאת מסמך ב-Form | ✅ אחרי document_metadata / URLs |

---

## 5. רכב חדש → מבנה חדש

| בדיקה | תוצאה |
|--------|--------|
| אחרי יצירה → `handleFormDone` → detail | ✅ `VehicleHub` (לא VehicleDetail ישן) |
| `viewMode === 'detail'` | ✅ רק Hub |

---

## 6. דשבורד — רק רכב זה

| פריט | מקור נתון | רכב ספציפי? |
|------|-----------|-------------|
| סטטוס, ק"מ, ביטוח, טסט, טיפול | שורת `vehicles` | ✅ |
| בדיקות חצי/תלת | `vehicle_inspections` WHERE plate | ✅ |
| חברת ביטוח | `vehicle_insurance_history` | ✅ |
| התראות פתוחות | ספירת faults+tasks ל-plate | ✅ |
| חוסר מסמכים | 3 URLs ברכב | ✅ |
| תזכורות מנהלים | approval / needs_transport | ✅ |

**לא** מוצגים סיכומי חברה או רכבים אחרים.

---

## 7–8. בדיקות יציבות (אוטומטיות)

| בדיקה | תוצאה |
|--------|--------|
| `npm run build` | להריץ בסיום |
| `npm run test` | להריץ בסיום |
| ESLint על קבצי vehicles | להריץ בסיום |

בדיקות ידניות (דורשות התחברות): העלאת מסמך, מחיקה, ייבוא — **מומלץ אצלכם** לפני פרודקשן.

---

## באגים שתוקנו בסבב זה

1. חסר מבנה 4 כפתורים + דשבורד — **תוקן** ב-VehicleHub  
2. סעיפים 1–5 מקוצרים — **תוקן** ב-VehicleDetailsPanel  
3. היסטוריה כפולה בטאב פעולות — **הוסר** (רק במסך היסטוריה)  
4. חסר קיצורי הזמנת שירות / מסמך — **נוסף**  
5. מסמך פעולה ללא מסלול — **מפנה לעריכת רכב**

---

## מה עדיין חסר / מוגבל (לא באג — מגבלת מוצר)

1. צ'אט לרכב  
2. התראות `custom_alerts` ללא `vehicle_plate`  
3. מסמך פעולה ישיר מהמודל (ללא עריכת רכב)  
4. בדיקה עם checklist מלא (כמו VehicleInspections)  
5. היסטוריה לשינוי סטטוס / הערה בלבד  
6. שם `created_by` מפרופיל (רק שדות טקסט קיימים כמו driver_name)

---

## איך לבדוק

```bash
npm run dev
# רכבים → בחר רכב
# Preview: /vehicle-hub-full-preview.html
```

צילומים: `test-results/vehicle-hub-full-*.png` (להריץ capture אחרי dev)
