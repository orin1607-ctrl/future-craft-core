# תכנון צר — תמונות מוסך: התקבל לבדיקה / אשר / דרוש השלמה

**סטטוס:** Audit + תכנון בלבד. **אין Migration עד אישור מפורש של המסמך הזה.**  
**סביבה:** PUBLIC STAGING (`usfeoerkpcafxxlyuldl`) בלבד. Production אסור.  
**בסיס חי:** `99673cb1` על `feat/incident-alerts-staging`.

העובד ממשיך: Claim משויך → `/garage` → העלאה לאותו Claim → «תמונות מוסך» בגלריה הקיימת.  
השינוי הוא **רק אחרי** «סיימתי צילום»: סטטוס בדיקה אצלנו + אשר / דרוש השלמה.

---

## המלצה (שאלה 2)

**לא עמודה ב-`claims_documents`.**  
**לא טבלת מסמכים חדשה.**  
**כן: הרחבה צרה של `claims_garage_assignments` הקיימת** + רשומות ב-`claims_history` הקיים.

| אפשרות | למה לא / כן |
|---|---|
| עמודה/ות על `claims_documents` | מסוכן. הופך בקלות ל-workflow כללי לכל המסמכים. סותר דרישה 5. נוגע ב-Storage-adjacent source of truth של כל סוגי הקבצים. |
| טבלת `claims_garage_reviews` נפרדת | בטוחה, אבל מיותרת לשלב הזה. הסטטוס הוא **על מנת הצילום** (אחרי «סיימתי צילום»), לא על כל JPEG בנפרד. |
| **עמודות review_* על `claims_garage_assignments`** | הכי בטוח. הטבלה כבר Staging-only, כבר מוסך-בלבד, RLS כבר staff `claims_can_work_claim`, העובד לא עושה עליה SELECT. אין נגיעה ב-`claims_documents`. |

בדיקה היא ברמת **השיוך / הסבב**, לא ברמת קובץ. התמונות נשארות שורות `claims_documents` עם `doc_kind=garage_photo` בלי שינוי סטטוס עליהן.

---

## 1. Schema המדויק (מוצע, לא מיושם)

קובץ עתידי בלבד (אחרי אישור):  
`supabase/migrations/20260909200000_claims_garage_review_staging.sql`  
+ rollback תואם.  
בתוך הקובץ: הערת `usfeoerkpcafxxlyuldl` / `dalia-staging`. **אסור** אזכור `qasomfndnjuixgjmjwcm` / `dalia-new` / `main`.

```sql
-- Staging ONLY. Do not apply to Production.
-- Garage-photo review on the existing assignment row. Does not alter claims_documents.

ALTER TABLE public.claims_garage_assignments
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.claims_garage_assignments
  DROP CONSTRAINT IF EXISTS claims_garage_review_status_chk;

ALTER TABLE public.claims_garage_assignments
  ADD CONSTRAINT claims_garage_review_status_chk
  CHECK (review_status = ANY (ARRAY[
    '',
    'awaiting_review',
    'approved',
    'needs_update'
  ]));

COMMENT ON COLUMN public.claims_garage_assignments.review_status IS
  'Garage photos only. Empty until worker completes a send. Not a claims_documents workflow.';
```

**אין** שינוי ל-CHECK של `status` הקיים: `pending | in_progress | completed`.  
**אין** ALTER על `claims_documents`.  
**אין** באקט / path / RLS חדש על Storage.  
**אין** backfill אוטומטי לשיוכים ישנים עם `status=completed` — הם נשארים `review_status=''` (סבא: «צילום הושלם» בלי תור בדיקה). רק «סיימתי צילום» חדש יכניס `awaiting_review`.

Rollback:

```sql
ALTER TABLE public.claims_garage_assignments
  DROP CONSTRAINT IF EXISTS claims_garage_review_status_chk;
ALTER TABLE public.claims_garage_assignments
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by_name,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS review_status;
```

---

## 3. ערכי הסטטוס המדויקים

שתי שכבות נפרדות על **אותה שורת שיוך**:

### `status` (קיים, לא משנים את רשימת הערכים)

| ערך | מתי |
|---|---|
| `pending` | שויך, עוד אין העלאה |
| `in_progress` | הועלו תמונות, או אחרי «דרוש השלמה» |
| `completed` | העובד לחץ «סיימתי צילום» (סבב נוכחי נשלח) |

### `review_status` (חדש, מוסך בלבד)

| ערך | תווית אצלנו | תווית אצל העובד |
|---|---|---|
| `''` | אין תור בדיקה (טרם נשלח / שיוך ישן) | לפי `status` כהיום |
| `awaiting_review` | **התקבל — לבדיקה** | נשלח לבדיקה |
| `approved` | אושר | אושר |
| `needs_update` | נדרשת השלמה | **נדרש להשלים** |

מעברים המותרים (רק ב-`claims-docs`, לא מ-PostgREST של העובד):

```
(any upload)                    → status=in_progress
garage_complete                 → status=completed, review_status=awaiting_review
                                  review_note='', reviewed_* cleared for the new round
garage_review_approve           → רק מ-awaiting_review → approved
                                  reviewed_by / name / at = staff
garage_review_needs_update      → רק מ-awaiting_review → needs_update
                                  status=in_progress
                                  review_note = סיבה (עד 400 תווים)
                                  reviewed_by / name / at = staff
(upload again after needs_update) → נשאר needs_update עד complete
garage_complete (שוב)           → awaiting_review (סבב חדש)
```

אין `rejected` כמחיקה. «דחה / דרוש השלמה» = `needs_update`. התמונות נשארות.

---

## 4. RLS / Edge — מדויק

### RLS

- **אין** שינוי RLS על `claims_documents`.
- **אין** GRANT חדש לעובד.
- `claims_garage_assignments`: נשאר `claims_garage_assignments_staff` עם `claims_can_work_claim` בלבד. העובד **לא** מקבל SELECT/UPDATE על הטבלה.
- באקט `claims-docs` נשאר private. Path לא משתנה.

### Edge (`claims-docs` בלבד, Staging deploy)

פעולות עובד **קיימות** — שינוי נקודתי:

- `garage_complete`  
  בנוסף להיום: `review_status='awaiting_review'`, `review_note=''`, איפוס `reviewed_*`.  
  History: «צילומי מוסך נשלחו לבדיקה».
- `garage_list_jobs` / `garage_get_job`  
  מחזירים גם `review_status`, `review_note` (העובד רואה את התווית והסיבה בלבד — לא History מלא).

פעולות staff **חדשות** (אחרי `hasClaimsAccess` + `canWork` על אותו `claim_id`):

- `garage_review_approve` `{ claim_id }`  
  רק אם יש שיוך פעיל ו-`review_status=awaiting_review`.  
  לא נוגע בקבצים. לא נוגע ב-Secure Share.
- `garage_review_needs_update` `{ claim_id, note }`  
  `note` חובה, trim, מקסימום 400.  
  אותם תנאי שיוך. לא מוחק documents.

שתי הפעולות מסרבות אם אין `garage_photo` בשיוך / אם התיק soft-deleted.

**לא** נפתחות פעולות: list_docs לעובד, Gmail, Treatment, Customer Upload, create_share.

---

## 5. איך העובד רואה «נדרש להשלים»

ב-`/garage` בלבד (אותו פורטל, בלי מסכים חדשים של תביעות):

- ברשימה: תווית על הכרטיס `נדרש להשלים`.
- בתוך התיק: באנר עם `review_note`.
- כפתורי צילום/העלאה + «סיימתי צילום» נשארים פעילים.
- תמונות ישנות נשארות ברשימת «תמונות מוסך» של אותו Claim.
- אין גישה ל-Gmail / Notes / Treatment / History / תביעות אחרות.

---

## 6. איך אנחנו רואים «התקבל — לבדיקה»

1. **סרגל צילומי מוסך** בגלריה (אותו `GarageAssignBar`):  
   `סטטוס: התקבל — לבדיקה` + כפתורים `אשר` / `דחה / דרוש השלמה` (עם שדה סיבה).
2. **שבב בטבלת התביעות** (חיבור נקודתי ל-`claimWorkAlerts`, לא Treatment Center ולא בקשה ללקוח):  
   מפתח נפרד `garage_review` → תווית `התקבל — לבדיקה`.  
   **לא** משתמשים ב-`customerRequestModel` / `received` של הלקוח.
3. Preview + Download בגלריה הקיימת — בלי שינוי.

אחרי `approved`: התווית יורדת. הסרגל מציג `אושר` + מי/מתי (`reviewed_by_name`, `reviewed_at`).

---

## 7. איך Approve / Reject נשמרים ב-History

רק `claims_history` הקיים (אותה פונקציית `history()` ב-`claims-docs`). העובד לא קורא את הטבלה.

| פעולה | `action` | `note` |
|---|---|---|
| complete | צילומי מוסך נשלחו לבדיקה | עובד {name} · {N} תמונות |
| approve | צילומי מוסך אושרו | אושר ע״י {staff} |
| needs_update | צילומי מוסך — נדרשת השלמה | {staff}: {note} |

בנוסף השדות על שורת השיוך: `reviewed_by`, `reviewed_by_name`, `reviewed_at`, `review_note` (הסבב הנוכחי).  
סבב קודם נשמר ב-History, לא נמחק.

---

## 8. איך השינוי חל רק על תמונות מוסך

- עמודות רק על `claims_garage_assignments` (אין שיוך כזה לדוחות/לקוח/שמאי).
- פעולות חדשות בשמות `garage_review_*` בלבד.
- תמונות ממשיכות `doc_kind=garage_photo` + `doc_meta.staff_type=garage_photos`. אין `set_doc_kind` / `status` כללי על documents.
- Secure Share / Customer Upload / Gmail / Treatment — לא ב-diff.
- תווית הטבלה `garage_review` נפרדת מ-`התקבל — לבדיקה` של בקשת לקוח.

---

## 9. Regression risks

| סיכון | הגנה |
|---|---|
| E2E ישן מצפה `status=completed` אחרי סיימתי צילום | `status` נשאר `completed`; review בשדה נפרד |
| שיתוף מאובטח נשבר | אין שינוי ב-`create_share` / public share |
| עובד מקבל גישת מסמכים | אין שינוי RLS; עובד נשאר על `garage_*` |
| תווית כפולה עם בקשת לקוח | מפתח alert נפרד |
| שיוכים ישנים הופכים לתור בדיקה | בלי backfill |
| דחייה מוחקת קבצים | אין DELETE על `claims_documents` במסלול הזה |
| Production | migration Staging-only + deploy `claims-docs` ל-`usfeoerkpcafxxlyuldl` בלבד |
| Preview מנהל מעלה/מאשר בשם העובד | approve/reject רק staff; upload/complete רק `worker_id === jwt` |

לא נדרש שינוי Auth / Storage architecture.

---

## 10. Production

אין שינוי ב-Production במסמך הזה.  
לא `main`. לא `dalia-new`. לא `qasomfndnjuixgjmjwcm`. לא Hostinger.  
אחרי אישור התכנון בלבד: migration + edge על `dalia-staging`, ואז Pages מ-`feat/incident-alerts-staging`.

---

## מה לא בתכנון (בכוונה)

- Workflow כללי ל-`claims_documents`
- אישור/דחייה per-file
- מחיקת תמונות
- באקט שני / מערכת שיתוף שנייה
- חסימת Secure Share לפני אישור (אפשר אחר כך אם תבקש)
- טיפול ב-Treatment Center
- שינוי Customer Upload / Gmail

---

## ממתינים לאישור שלך

אם התכנון מאושר במפורש, הצעד הבא (רק אז):

1. Migration Staging + rollback כמדויק למעלה.  
2. `garage_complete` + שתי פעולות staff ב-`claims-docs`.  
3. תוויות בסרגל + `/garage` + שבב טבלה.  
4. E2E חי ב-PUBLIC STAGING כולל Mobile והרשאות.

עד אז: **אין Migration.**
