# User Management — ביקורת DB (לפני שינוי)

**תאריך:** 2026-06-09 · **סביבה:** dalia-staging · **ללא ביצוע migration**

---

## מצב טבלאות קיימות (רלוונטי ל-User Management)

### `profiles`
| עמודה | קיים |
|--------|------|
| id, full_name, phone, company_name, is_active | ✅ |
| user_number (מזהה ייחודי) | ✅ |
| nickname, address, job_title, notes | ❌ |
| approval_status, contact_email | ❌ |
| קישור ל-customers | ❌ |

### `auth.users` (דרך edge function)
| עמודה | קיים |
|--------|------|
| email, encrypted_password | ✅ |
| raw_user_meta_data (full_name, role, company_name) | ✅ |

### `user_roles` + `app_role`
| ערך | קיים |
|-----|------|
| driver, fleet_manager, super_admin, private_customer | ✅ |
| **business_customer** | ❌ |

### `customers`
| עמודה | קיים |
|--------|------|
| name, company_name, contact_person, phone, email, address, notes | ✅ |
| business_id, customer_number, customer_type, status, fax | ✅ |
| contact_role, activity_field | ❌ |
| user_id (קישור למשתמש auth) | ❌ |

### `drivers` (רק לתפקיד נהג)
| עמודה | קיים | מחובר ב-wizard |
|--------|------|----------------|
| id (= auth user id), full_name, phone, email, company_name | ✅ | ✅ |
| license_number, notes | ✅ | ✅ (עדכון אחרי יצירה) |
| id_number, license_expiry, license_types, city, street | ✅ | ❌ (לא בטופס) |
| assigned_vehicle | דרך `vehicles.assigned_driver_id` | ❌ (לא מחובר) |

### טבלאות שלא קיימות
- `user_access_codes` — קוד גישה / רוטציה
- `registration_requests` — הרשמה עצמאית עתידית
- `user_permissions` — הרשאות granular (רק `user_roles` היום)

### טבלאות קיימות לשימוש עתידי (ללא שינוי)
- `approval_requests` — workflow אישורים כללי (אפשר לרשום `entity_type=user`)
- `system_logs` — audit
- `send-password-reset` edge function — תשתית מייל (Resend)

---

## מטריצה לפי סוג משתמש

### 1. לקוח פרטי (`private_customer`)

| שדה UI | בעמודה DB | נשמר היום? | הערה |
|--------|-----------|------------|------|
| שם מלא | profiles.full_name | ✅ | edge function |
| טלפון | profiles.phone | ✅ | |
| אימייל (יצירת קשר) | — | ❌ | אין עמודה; רק auth.email |
| אימייל התחברות | auth.users.email | ✅ | |
| סיסמה | auth | ✅ | |
| כינוי | — | ❌ | **באג:** נשלח בטעות ל-user_number |
| כתובת | — | ❌ | |
| הערות | — | ❌ | אין notes ב-profiles |

### 2. לקוח עסקי (`business_customer`)

| שדה UI | בעמודה DB | נשמר היום? | הערה |
|--------|-----------|------------|------|
| כל השדות | customers + auth + profiles | ❌ | **חסום** — אין תפקיד ב-enum |
| שם חברה, איש קשר, ח.פ, כתובת, טלפון, אימייל, הערות | customers.* | קיים ב-DB | לא מחובר ליצירה |
| תפקיד איש קשר, תחום פעילות, כינוי | — | ❌ | חסר ב-DB |
| אימייל התחברות + סיסמה | auth | — | לא נוצר |

### 3. מנהל צי (`fleet_manager`)

| שדה UI | בעמודה DB | נשמר היום? |
|--------|-----------|------------|
| שם, טלפון, חברה | profiles | ✅ |
| אימייל התחברות, סיסמה | auth | ✅ |
| אימייל (נוסף) | — | ❌ |
| תפקיד, הרשאות, הערות | — | ❌ |

### 4. נהג (`driver`)

| שדה UI | בעמודה DB | נשמר היום? |
|--------|-----------|------------|
| שם, טלפון, חברה | profiles + drivers | ✅ |
| סיסמה / קוד | auth.password | ✅ |
| אימייל | drivers.email | ⚠️ רק מ-login email |
| רישיון, הערות | drivers | ✅ |
| רכב משויך | vehicles.assigned_driver_id | ❌ קיים, לא מחובר |

### 5. קוד גישה (כל הסוגים)

| יכולת UI | DB / שליחה | סטטוס |
|----------|-------------|--------|
| קוד ידני / אוטומטי | — | תצוגה בלבד |
| שליחה לאימייל | — | לא מחובר (אין edge function) |
| אימות קוד | — | לא קיים |
| רוטציה 3 חודשים | — | תכנון בלבד |

---

## שדות קיימים ב-DB שלא שמנו לב / לא בטופס

| שדה | טבלה | המלצה |
|-----|------|--------|
| user_number | profiles | כבר בטופס ישן — **לא** כינוי; לשמור נפרד |
| id_number (ת.ז.) | drivers | לשקול הוספה לטופס נהג |
| license_expiry, license_types | drivers | שלב 2 |
| customer_number, fax | customers | ללקוח עסקי — אופציונלי |
| is_active | profiles | מחובר — מנהל מפעיל ידנית |

---

## הצעת שינויי DB (לאישורך)

### A. עדכון enum
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'business_customer';
```

### B. הרחבת `profiles`
| עמודה חדשה | סוג | למה |
|------------|-----|-----|
| nickname | text | כינוי תצוגה |
| address | text | כתובת (לקוח פרטי) |
| contact_email | text | אימייל יצירת קשר ≠ login |
| job_title | text | תפקיד (מנהל צי) |
| notes | text | הערות כלליות |
| approval_status | text DEFAULT 'pending' | pending / approved / rejected |
| approval_updated_at | timestamptz | |
| approved_by | uuid → profiles.id | |
| customer_id | uuid → customers.id NULL | קישור לקוח עסקי |

> **לא** לשנות `user_number` — נשאר מזהה ייחודי נפרד מכינוי.

### C. הרחבת `customers`
| עמודה חדשה | סוג | למה |
|------------|-----|-----|
| user_id | uuid → profiles.id UNIQUE | בעל עסק = משתמש מערכת |
| contact_role | text | תפקיד איש קשר |
| activity_field | text | תחום פעילות |

### D. טבלה חדשה `user_access_codes`
| עמודה | סוג | למה |
|--------|-----|-----|
| id | uuid PK | |
| user_id | uuid → profiles | |
| code_hash | text | לא לשמור plain text |
| mode | text | manual / auto |
| created_at | timestamptz | |
| expires_at | timestamptz | |
| verified_at | timestamptz | |
| sent_to_email_at | timestamptz | |
| next_rotation_at | timestamptz | רוטציה 3 חודשים |
| is_active | boolean | |

### E. טבלה חדשה `registration_requests` (עתיד login)
| עמודה | סוג | למה |
|--------|-----|-----|
| id | uuid PK | |
| requested_role | app_role | |
| payload | jsonb | כל שדות הטופס |
| status | text | pending / approved / rejected |
| created_at | timestamptz | |
| reviewed_by | uuid | |
| reviewed_at | timestamptz | |
| rejection_reason | text | |

### F. שינויי קוד (לא DB) — אחרי migration
- `create-admin-user`: שמירת שדות profiles חדשים, יצירת customers+user_id לעסקי
- edge function חדש: `send-user-access-code` (Resend)
- Wizard: תיקון כינוי ≠ user_number, חיבור רכב ל-`vehicles.assigned_driver_id`

---

## סיכום מספרי

| קטגוריה | כמות |
|---------|------|
| שדות חסרים לגמרי ב-DB | 11 |
| שדות קיימים ב-DB אך לא מחוברים לשמירה | 14 |
| טבלאות לעדכון | profiles, customers, app_role |
| טבלאות חדשות מוצעות | user_access_codes, registration_requests |

**לא מוצע לגעת:** vehicles (מעבר לעדכון assigned_driver_id ביצירת נהג), מודולי רכב אחרים.
