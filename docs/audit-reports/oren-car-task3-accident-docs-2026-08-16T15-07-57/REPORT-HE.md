# Oren Car Staging — משימה 3: מספר תביעה ומסמכי תאונה

תאריך QA: 2026-08-16  
סביבה: `https://orin1607-ctrl.github.io/future-craft-core/`  
Supabase Staging: `usfeoerkpcafxxlyuldl`  
Production: **לא נגעו**

## תוצאה

**PASS**

## Schema — Staging בלבד

Migration: `20260816152000_accident_claim_documents_staging.sql`

- `accidents.claim_number text NOT NULL DEFAULT ''`
- `document_metadata.claim_number text NOT NULL DEFAULT ''`
- אינדקס חלקי `(company_name, claim_number)` בשתי הטבלאות
- ללא DROP / TRUNCATE / מחיקת נתונים
- ללא שינוי RLS או Policies
- migration version `20260816152000` נרשם ב-`supabase_migrations.schema_migrations`

תאריך האירוע ממשיך להשתמש בשדה הקיים `document_metadata.document_date`.
שיוך התאונה ממשיך להשתמש במנגנון הקיים `document_versions`:
`entity_type='accident'`, `entity_id=<accident.id>`, `metadata_id=<document_metadata.id>`.
הקובץ הפיזי נשמר פעם אחת בלבד ב-bucket הקיים `documents`.

## QA חי

רשומת QA סינתטית ב-Staging:

- accident id: `a3a47db3-618e-4d48-b08f-8ef2712e9c54`
- claim: `QA-CLAIM-20260816-1507`
- company: `אכבים`
- vehicle: `36806603`
- event date: `2026-08-16`
- PDF: `qa-claim-20260816.pdf`
- image: `qa-accident-photo.png`

| בדיקה | תוצאה |
|---|---|
| מסלול כרטיס נהג → מבחנים ותאונות → דווח על תאונה | PASS |
| שמירה ללא מספר תביעה חסומה | PASS — כפתור שמירה disabled והודעת חובה מוצגת |
| שמירה עם מספר תביעה | PASS |
| פתיחה מחדש לאחר refresh | PASS |
| מספר תביעה בפרטים ובעריכה | PASS |
| העלאת תמונה קיימת | PASS — object זמין HTTP 200 `image/png` |
| העלאת PDF תאונה | PASS — object זמין HTTP 200 `application/pdf` |
| מסמך בתוך התאונה | PASS |
| מסמך בכלל המסמכים | PASS |
| חיפוש לפי claim | PASS |
| חיפוש לפי תאריך `16.8.2026` | PASS |
| צפייה במסמך | PASS |
| קישור מהמסמך חזרה לתאונה | PASS |
| שיוך יחיד לתאונה הנכונה | PASS — `link_count=1`, אין entity id אחר |
| company / vehicle / driver metadata | PASS |
| Desktop | PASS |
| Mobile 390×844 | PASS |
| build + TypeScript | PASS |

במהלך יצירת רשומת ה-QA נחסמה בדפדפן רק קריאת Edge Function של התראות חיצוניות,
כדי שלא לשלוח Email/WhatsApp בזמן בדיקת Staging. שמירת התאונה, התמונה, המסמך
והמטא-דאטה בוצעו בפועל ב-Staging.

## Regression

- רשימת תאונות ופתיחת תאונות קיימות: PASS
- תמונות תאונה קיימות: PASS
- קטגוריות מסמכים קיימות וספירות: PASS
- צפייה/הורדה במסמכים: PASS
- build: PASS
- `npx tsc --noEmit`: PASS

## Commit

Implementation: `64062e37` — `feat(oren-car): add claim-linked accident documents on Staging`
