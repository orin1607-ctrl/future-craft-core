# Documents Bucket — המלצה מקצועית (ללא שינוי)

**Bucket:** `documents`  
**מצב נוכחי:** `public = true` + policy `documents_read_public` (SELECT ל-`public`)

## האם Public הכרחי?

**לא.** אין דרישה טכנית שה-bucket יהיה Public לצורך העלאת קבצים.

| פעולה | מצב נוכחי | נדרש Public? |
|--------|-----------|--------------|
| Upload (authenticated) | `documents_upload_authenticated` | לא |
| View / Download | URL ציבורי ישיר | **לא** — Signed URLs מספיק |
| Delete own | `documents_delete_own` | לא |

## סיכון במצב הנוכחי

- כל מי שמכיר/מנחש path (`documents/company/plate/file.pdf`) יכול לגשת **ללא login**.
- מסמכים רגישים: רישיונות, ביטוח, תאונות, בחינות נהיגה.

**חומרה:** גבוה (לפני Production)

## המלצה

1. **הפוך bucket ל-private:** `public = false`
2. **הסר** policy `documents_read_public`
3. **הוסף** policies ל-SELECT ל-`authenticated` עם RLS לפי חברה/role (כמו `document_metadata`)
4. **Frontend:** השתמש ב-`createSignedUrl()` (TTL 1–24 שעות) במקום `getPublicUrl()`
5. **Migration:** קיים `20260608130000_documents_bucket_staging.sql` — יידרש migration חדש ל-Staging בלבד (באישור)

## יתרונות Signed URLs

- גישה זמנית ומבוקרת
- אין leakage של URLs קבועים
- תואם RLS + company scope

## השפעה על UX

- DocumentViewer כבר תומך ב-URLs — יש לעדכן ל-signed URLs ב-load
- ביצועים: negligible (cache signed URL עד expiry)

**סטטוס:** המלצה בלבד — **לא בוצע שינוי** במסגרת משימה זו.
