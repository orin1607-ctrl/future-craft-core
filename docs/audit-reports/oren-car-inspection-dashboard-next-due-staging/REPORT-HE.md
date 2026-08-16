# Oren Car Staging — תיקון מועד בדיקת תלת/חצי בכרטיס הרכב

תאריך: 16.08.2026  
סביבה: Oren Car Staging בלבד  
גרסת בדיקה: `1584cc8`

## סיבת הבאג

טופס הבדיקה שמר נכון:

- תאריך ביצוע: `vehicle_inspections.inspection_date`
- מועד הבא: `vehicle_inspections.next_due_date`
- העתק מועד הבא בכרטיס הרכב: `vehicles.next_inspection_date`

כרטיס הדשבורד ביצע שאילתה נפרדת ל־`vehicle_inspections`, אך בחר רק
`inspection_type, inspection_date` והציג את `inspection_date`. לכן תאריך
הביצוע הוצג כמועד הבא ולעיתים סומן בטעות כ־`פג`.

## התיקון

הכרטיס קורא כעת את הבדיקה האחרונה של הרכב שיש לה
`vehicle_inspections.next_due_date`, לפי `vehicle_id`, ומציג את התאריך הזה.
הכותרת נגזרת מהמרווח שכבר נשמר:

- 3 חודשים: `בדיקה תלת חודשית`
- 6 חודשים: `בדיקה חצי שנתית`

אין שינוי במנגנון השמירה, במסד הנתונים, ב־RLS או ב־Storage.

## QA חי ב־Staging

- 3 חודשים: `16.11.2026`, ללא `פג` — PASS
- 6 חודשים: `16.2.2027`, ללא `פג` — PASS
- מועד עבר: `1.2.2025 (פג)` — PASS
- רכב ללא בדיקה: `לא הוגדר` — PASS
- רענון — PASS
- כניסה מחדש — PASS
- Desktop — PASS
- Mobile — PASS
- כמה רכבים — PASS
- שגיאות Supabase/Console — 0
- ניקוי נתוני QA — PASS; נותרו 0 רכבים, 0 בדיקות ו־0 התראות של חברת ה־QA

## Regression

- שמירת `next_due_date` — PASS
- קילומטראז׳ — PASS (`85030`)
- תקלה והערה — PASS
- יצירת משימת טיפול — PASS
- התראת קצין רכב — PASS
- פרטי ביקורת ודוחות — PASS
- יתר כרטיסי הדשבורד — PASS
- 124 בדיקות אוטומטיות ו־build — PASS

Evidence: `qa/report.json` ו־`qa/screenshots/`.
