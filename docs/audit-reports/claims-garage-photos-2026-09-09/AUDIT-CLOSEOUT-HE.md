# Audit — צילומי מוסך (Staging בלבד)

**תאריך:** 2026-09-09  
**ענף חי:** `feat/incident-alerts-staging`  
**SHA שנבדק באתר:** `99673cb1`  
**Production:** לא לגעת

## אישור מפורש שניתן (Phase 1)

1. טבלת שיוך ייעודית, migration ל־Staging בלבד. לא `row_data`. לא `assigned_to`.
2. מחזור Auth קיים. בלי מערכת משתמשים חדשה / login משותף / role enum חדש.
3. סיווג אמיתי `garage_photo` / `garage_photos` בגלריה הקיימת כ־«תמונות מוסך».
4. פעולות צרות ב־`claims-docs`, אכיפה בשרת, בלי RLS רחב לעובד על `claims_records`.
5. **אין** Review / Approval / Reject (`pending / ok / needs_update`) לתמונות מוסך.

## מצב Schema / RLS / Auth / Storage (בלי שינוי חדש)

| רכיב | מצב | הערה |
|---|---|---|
| `claims_garage_assignments` | קיים ב־Staging | `pending / in_progress / completed` על **השיוך**, לא על כל תמונה |
| RLS על הטבלה | staff `claims_can_work_claim` בלבד | עובד לא עושה SELECT על Claims דרך PostgREST |
| `assigned_to` | לא בשימוש לצלם | נשאר מטפל דלפק |
| Auth | `driver` קיים + `job_title=garage_photographer` | בלי `claims_access` |
| Storage | באקט `claims-docs` הקיים, private | path `{claimId}/staff/...` |
| `claims_documents` | מקור האמת | `doc_kind=garage_photo`, `doc_meta.staff_type=garage_photos` |
| גלריה / שיתוף | קיימים | אין מערכת מקבילה |

## מיפוי המסלול שביקשת מול מה שחי

| שלב | סטטוס | פירוט |
|---|---|---|
| Claim קיים | **חי** | תיק קיים / TEST |
| שיוך עובד | **חי** | «שייך עובד לצילומי מוסך» + סוג משתמש «עובד צילומי מוסך» |
| פורטל עובד מוגבל | **חי** | `/garage` — רק תיקים ששויכו. בלי Gmail / Notes / History / Treatment / תביעות אחרות |
| תמונות מוסך | **חי** | סיווג `garage_photos` |
| העלאה לאותו Claim | **חי** | `garage_upload` → אותו `claim_id` |
| התקבל — לבדיקה | **לא במסלול מוסך** | התווית הזו שייכת ל־בקשה ללקוח / טיפול. לא אושרה לתמונות מוסך |
| אישור / דחייה אצלנו | **לא מיושם · לא אושר** | האישור המקורי אוסר `pending/ok/needs_update` על תמונות מוסך |
| תמונות מוסך בגלריה | **חי** | «תמונות מוסך» בגלריית מסמכים ותמונות |
| שיתוף מאובטח לשמאי | **חי** | `create_share` הקיים + כפתור «תמונות מוסך» |

## מה יידרש אם רוצים אישור/דחייה פורמלי (לא מבוצע)

שינוי משמעותי ב־Schema ו/או בסטטוס `claims_documents`, פעולות חדשות ב־`claims-docs`, ו־UI חדש.  
זה מרחיב Scope מול אישור #5. **לא מתחיל בלי אישור מפורש חדש.**

## גבולות שנשמרים

- PUBLIC STAGING בלבד
- `claims-docs` bucket נשאר private
- אין Cross-Claim leakage (אכיפה בשרת על `claim_id` + `file_ids`)
- עובד רואה רק שיוכים שלו דרך edge actions
