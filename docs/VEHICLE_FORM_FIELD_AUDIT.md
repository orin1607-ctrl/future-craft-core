# השוואת שדות — VehicleForm (שדה מול שדה)

**מקור:** `src/pages/Vehicles.tsx` — `VehicleForm`  
**שינוי:** חלוקה ויזואלית ל־5 סעיפים בלבד. **אין** שדות חדשים, **אין** שינוי binding / Supabase / payload.

## שלב 1 (לפני הטופס המלא)

| שדה | state / פעולה | שונה? |
|-----|----------------|-------|
| מספר רכב (רישוי) | `licensePlate` | לא |
| מספר פנימי | `internalNumber` | לא |
| משרד הרישוי / התחבורה | `handleGovLookup` | לא |
| המשך לטופס | `goToFullForm` | UI בלבד |
| ביטול פתיחת רכב | `handleCancelFlow` + היסטוריה | UI + לוג |
| יבוא רכבים | קישור `/vehicle-import` | לא (נגישות) |

## חלון משרד הרישוי (דיאלוג — ללא שינוי)

מוצג: מספר רכב, יצרן, דגם, כינוי מסחרי, שנת ייצור, צבע, סוג דלק, בעלות, תוקף רישיון, טסט אחרון, צמיג קדמי/אחורי, רמת גימור, דגם מנוע, מס׳ שלדה, עלייה לכביש.

**מילוי לטופס (`applyGovData`) — כמו מקור:**

| שדה מאגר | → state |
|----------|---------|
| `tozeret_nm` | `manufacturer` |
| `kinuy_mishari` / `degem_nm` | `model` |
| `shnat_yitzur` | `year` |
| `tokef_dt` | `testExpiry` |

לא ממולאים בטופס (רק בדיאלוג): צבע, דלק, בעלות, שלדה, צמיגים וכו'.

---

## סעיף 1 — פרטי רכב

| שדה | state | payload key |
|-----|-------|-------------|
| מספר רכב | `licensePlate` | `license_plate` |
| מספר פנימי | `internalNumber` | `internal_number` |
| יצרן | `manufacturer` | `manufacturer` |
| דגם | `model` | `model` |
| שנה | `year` | `year` |
| סוג רכב | `vehicleType` | `vehicle_type` |
| סוג אחר | `vehicleTypeCustom` | `vehicle_type` (אם אחר) |
| סטטוס | `status` | `status` (עריכה בלבד) |
| ק"מ | `odometer` | `odometer` |
| נהג משויך | `assignedDriver` | `assigned_driver_id` |

---

## סעיף 2 — בעלות וסוג ניהול רכב

| שדה | state | payload |
|-----|-------|---------|
| סוג ניהול | `managementType` | `management_type`, `is_leasing`, `has_loan` |
| ליסינג תפעולי — עלות חודשית | `monthlyLeasingCost` | `monthly_leasing_cost` |
| סיום ליסינג | `leasingEndDate` | `leasing_end_date` |
| החזרת רכב | `vehicleReturnDate` | `vehicle_return_date` |
| ליסינג מימוני — החזר חודשי | `monthlyLoanPayment` | `monthly_loan_payment` |
| סיום הלוואה | `loanEndDate` | `loan_end_date` |
| החלפה מתוכננת | `plannedReplacementDate` | `planned_replacement_date` |
| תחזוקה עצמאית — ללא/יש הלוואה | `hasLoan` | `has_loan` |

---

## סעיף 3 — ביטוחים ורישיונות

| שדה | state | payload / טבלה |
|-----|-------|----------------|
| תוקף טסט | `testExpiry` | `test_expiry` |
| ביטוח חובה — התחלה/תוקף | `insuranceStart`, `insuranceExpiry` | `insurance_start`, `insurance_expiry` |
| ביטוח מקיף — התחלה/תוקף | `compInsStart`, `compInsExpiry` | `comprehensive_insurance_*` |
| היסטוריית ביטוחים | `insuranceHistory[]` | `vehicle_insurance_history` |
| הוסף שנה / שנה / הדר / חברה / עלויות | כמו מקור | כמו מקור |

---

## סעיף 4 — מסמכים וקבצים

| שדה | state | payload |
|-----|-------|---------|
| צילום רישיון | `licenseDocUrl` | `license_doc_url` |
| פוליסת חובה | `insuranceDocUrl` | `insurance_doc_url` |
| פוליסת מקיף | `compInsDocUrl` | `comprehensive_insurance_doc_url` |

`ImageUpload` — העלאה / צפייה / שמירה / מחיקה לפי הקומפוננטה המקורית.  
חובה לפי `company_settings.require_insurance_docs` — ללא שינוי.

---

## סעיף 5 — טיפולים ותחזוקה

| שדה | state | payload |
|-----|-------|---------|
| טיפול אחרון | `lastServiceDate` | `last_service_date` |
| טיפול הבא | `nextServiceDate` | `next_service_date` |
| שינוע | `needsTransport` | `needs_transport` |
| הערות | `notes` | `notes` |

---

## מחוץ לסעיפים (כמו מקור)

| רכיב | תפקיד |
|------|--------|
| סיכום ולידציה | `basicFieldsFilled`, `allDocsFilled`, `isValid` |
| כפתור שמור | `handleSubmit` — payload זהה |
| `generateVehicleAlerts` | אחרי יצירה |
| `logVehicleEvent` | הוספה / רישוי / ביטול / עדכון |

---

## לא בטופס (לפי מקור)

- ציוד וכלים — **לא** היה ב-VehicleForm המקורי (רק בכרטיס Hub מ-exchange).
- שדות נוספים ב-payload: `approval_status`, `company_name`, `created_by` — נשארים ב-`handleSubmit`.

---

## יבוא רכבים

`src/pages/VehicleImport.tsx` — **לא שונה**. כפתור בעמוד רכבים + בטופס (קישור).

## כרטיס רכב (VehicleHub)

**לא נגע** — ארכיון / מחק בתחתית + היסטוריה.

---

**אישור:** כל השדות מהטופס המקורי קיימים. לא נוספו שדות טופס ממשרד הרישוי מעבר ל-`applyGovData` המקורי.
