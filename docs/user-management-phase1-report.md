# User Management — Phase 1 (תצוגה מקומית בלבד)

**אזור עבודה:** Dalia Settings → `/user-management`  
**סטטוס:** מוכן לבדיקה במסך · **ללא Deploy / Merge / שינוי DB**

---

## מה נוסף

| קובץ | תיאור |
|------|--------|
| `src/pages/UserManagement.tsx` | כפתור "פתיחת משתמש חדש" + פאנל מבנה DB |
| `src/components/user-management/CreateUserWizardDialog.tsx` | אשף 4 שלבים |
| `src/components/user-management/AccessCodePanel.tsx` | קוד גישה (ידני/אוטומטי/אימייל) |
| `src/lib/userManagementSchema.ts` | שדות לפי סוג משתמש + פערי DB |
| `src/lib/accessCodeTypes.ts` | מבנה רוטציה 3 חודשים (עתידי) |

**לא נגענו:** רכבים, נהגים, דשבורד, מודולי שירות, edge function, migrations.

---

## תצוגה מקומית

```bash
npm run dev
```

התחבר כ-**super_admin** →  
**מרכז ניהול** → **משתמשים** (`/user-management`)

---

## 4 סוגי משתמשים

1. **לקוח פרטי** — יצירה פעילה (תפקיד `private_customer`)
2. **לקוח עסקי** — UI מלא · יצירה חסומה עד אישור תפקיד `business_customer` ב-DB
3. **מנהל צי** — יצירה פעילה (`fleet_manager`)
4. **נהג** — יצירה פעילה (`driver`) + רישיון/הערות ב-drivers

כל משתמש נוצר **לא פעיל** — ממתין לאישור מנהל (כמו היום).

---

## פערי DB — דורש אישור לפני שמירה מלאה

| שדה | טבלה מוצעת | הערה |
|-----|------------|------|
| כינוי | `profiles.nickname` | חדש |
| כתובת (לקוח פרטי) | `profiles.address` | חדש |
| תפקיד איש קשר | `customers.contact_role` | חדש |
| תחום פעילות | `customers.activity_field` | חדש |
| תפקיד מנהל צי | `profiles.job_title` | חדש |
| הרשאות מפורטות | קישור ל-`/permissions` | לוגיקה קיימת |
| רכב משויך (ביצירה) | `vehicle_assignments` | קיים ב-attach-car |
| **לקוח עסקי** | `app_role` → `business_customer` | **enum חדש** |
| ממתין לאישור | `profiles.approval_status` | מומלץ לצד `is_active` |
| קודי גישה | `user_access_codes` | טבלה חדשה + רוטציה 3 חודשים |
| הרשמה עצמאית | `registration_requests` | טבלה חדשה |

---

## המלצות

1. להוסיף `business_customer` ל-`app_role` + הרחבת `create-admin-user`
2. טבלת `user_access_codes` עם `expires_at`, `rotation_policy`
3. `approval_status`: `pending` | `approved` | `rejected` — חובה לפני self-registration
4. לא לאפשר `is_active=true` אוטומטית לעולם ביצירה עצמית
5. לקוח עסקי: ליצור רשומת `customers` + `profiles` מקושרים באותו `user_id`
