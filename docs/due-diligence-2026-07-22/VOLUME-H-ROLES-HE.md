# כרך ח' – הרשאות (Roles & Permissions Due Diligence)
## מערכת דליה · Read Only · ראיות בלבד

| שדה | ערך |
|-----|-----|
| תאריך | 2026-07-24 |
| Production | https://dalia-car.online · Supabase `qasomfndnjuixgjmjwcm` |
| מקורות | `types.ts` · מיגרציות · `routeAccess.ts` · `App.tsx` · `AuthContext` · Edge · כרך ז' |
| מצב עבודה | **Read Only** — ללא שינוי RLS/Policies/הרשאות/קוד מערכת |
| עקרון | תיעוד מנגנוני הרשאה כפי שנמצאו; אין מבחן tenancy חי במסגרת כרך זה |

### מקרא
| סטטוס | משמעות |
|--------|--------|
| 🟢 מאומת | ראיה מול Production / בדיקה חיה מתועדת |
| 🟡 דורש אימות | ראיה בקוד/מיגרציות; אכיפה חיה לא מלאה |
| 🔴 לא ניתן לאמת – V5 | אין ראיה מספקת |

---

# 68. Roles

## מצב קיים
| Role | תיאור (לפי מודל/UI) | מקור המידע | סביבת שימוש | סטטוס | ודאות |
|------|---------------------|------------|-------------|--------|--------|
| `super_admin` | מנהל על מערכתי | `app_role` ב-types + מיגרציה ראשונית + UI | אפליקציה / RLS / Edge (בקוד) | 🟡 | V3 |
| `fleet_manager` | מנהל צי/חברה | types + מיגרציה + UI | אפליקציה / RLS / Edge | 🟡 | V3 |
| `driver` | נהג | types + מיגרציה + UI | אפליקציה / RLS חלקי / Edge חלקי | 🟡 | V3 |
| `private_customer` | לקוח פרטי | types + מיגרציה 20260316 + UI | אפליקציה (routeAccess צר) | 🟡 | V3 |
| `business_customer` | לקוח עסקי | types + מיגרציית **staging** עם הערה "Do NOT apply to production" + UI | קוד/UI; **נוכחות enum ב-Prod** | 🔴 Prod enum | V3/V5 |

### סתירות במודל Roles
| סתירה | פירוט | ודאות |
|--------|--------|--------|
| `routeAccess.ts` | מגדיר 4 Roles בלבד — בלי `business_customer` | V3 |
| `edgeAuth.ts` `AppRole` | בלי `business_customer` | V3 |
| `AuthContext` / `UserManagement` | כוללים 5 Roles | V3 |
| Fallback ב-`canAccessRoute` | `return true` ל-role לא מזוהה | V3 |

## כיצד נבדק / מקור הראיה
`types.ts` Enums; מיגרציות `app_role`; `routeAccess.ts`; `AuthContext.tsx`; `edgeAuth.ts`; `user_management_staging.sql`.

## סיכונים
- `business_customer` עלול לקבל גישת מסכים רחבה אם role קיים בריצה (fallback `true`).
- אי-ודאות אם enum קיים ב-Prod.

## המלצות
- לאמת ב-Prod את ערכי `app_role` ואת התנהגות `business_customer`.
- ליישר טיפוסי Role בין AuthContext / routeAccess / edgeAuth.

---

# 69. הרשאות משתמשים

## מצב קיים — שכבות אכיפה שנמצאו
| שכבה | כיצד מוקצה / נאכף | חריגים שנמצאו | סטטוס | ודאות |
|------|-------------------|---------------|--------|--------|
| טבלת `user_roles` | שורה per user; נטען ב-AuthContext | fallback ל-`driver` אם חסר | 🟡 | V3 |
| `profiles.is_active` | חוסם התחברות אם לא פעיל | — | 🟡 | V3 |
| `approval_status` | יצירה כ-pending; הפעלה ע"י SA | מיגרציית staging | 🟡/🔴 Prod | V3/V5 |
| UI `canAccessRoute` + `RouteGuard` ב-`Layout` | חסימת נתיבים לפי role | `/dev/*`, `/ai-marketing`, `/dalia-crm` מחוץ ל-Layout; RouteGuard לא על כל ה-App | 🟡 | V3 |
| בדיקות role מקומיות בדפים | עשרות דפים עם `user?.role === ...` | לא אחיד | 🟡 | V3 |
| RLS | `has_role` / `get_user_company` / `company_name` | CRM/Marketing ללא policies במיגרציות (כרך ה') | 🟡/🔴 חי | V3/V5 |
| Edge `requireAuth` / בדיקות role | רשימות roles לפונקציות | Prod: חלק מהפונקציות לא מיושרות ל-main (כרך ז') | 🟢 חלקי · 🟡 | V1/V3 |
| Impersonation | מחליף user ב-React בלבד | JWT נשאר של המשתמש האמיתי | 🟡 | V3 |

### הקצאת הרשאות (מי יכול להקצות)
| פעולה | מי (בקוד) | סטטוס | ודאות |
|--------|-----------|--------|--------|
| יצירת משתמש | SA או FM דרך `create-admin-user` (FM מוגבל לחברה שלו + inactive) | 🟡 | V3 |
| `update-role` / `toggle-active` / 2FA approve / list-users | **super_admin בלבד** ב-Edge | 🟡 | V3 |
| UI UserManagement | נחסם אם לא SA | 🟡 | V3 |

## כיצד נבדק / מקור הראיה
`AuthContext`, `RouteGuard`, `Layout`, `create-admin-user`, כרכים ז'/ה'.

## סיכונים
- אכיפה מפוצלת (UI + RLS + Edge) — כשל באחת השכבות עלול לא להיחסם באחרת.
- מסלולים מחוץ ל-RouteGuard.

## המלצות
- למפות נתיבים מחוץ ל-Layout כחריגי גישה.
- לאמת אכיפת RLS חיה לפני הבטחות הפרדה.

---

# 70. Fleet Manager

## מצב קיים
| תחום | ממצא בקוד | סטטוס | ודאות |
|------|-----------|--------|--------|
| מסכים (`routeAccess`) | כל הנתיבים תחת Layout פרט ל-`SUPER_ADMIN_ONLY`; כולל `/fleetos-ai` | 🟡 | V3 |
| מסכים חסומים | `/user-management`, `/permissions`, `/system-logs`, `/ai-marketing`, `/dalia-crm`, הגדרות SA וכו' | 🟡 | V3 |
| נתונים (RLS דגימה) | ניהול/צפייה לפי `company_name = get_user_company()` בטבלאות ליבה (vehicles/drivers/faults/customers/profiles) | 🟡 קוד · 🔴 אכיפה חיה | V3/V5 |
| Edge | גישה לפונקציות כמו notify, twilio (אם מוגדר), send-password-reset, document-request, check-driver-availability (ב-main) | 🟡 · Prod חלקי | V3/V1 |
| יצירת משתמשים | יכול לקרוא create-admin-user; נכפה `is_active=false` וחברה = חברת הקורא | 🟡 | V3 |
| פעולות אסורות (בקוד Edge) | update-role, toggle-active, list-users, backup/export, deploy, send-whatsapp (SA only) | 🟡 | V3 |
| Impersonation UI | קיים בדפי ניהול — JWT לא מתחלף | 🟡 | V3 |

## כיצד נבדק / מקור הראיה
`routeAccess.ts`; מיגרציות RLS לדוגמה; `create-admin-user/index.ts`.

## סיכונים / המלצות
- לא להניח ש-FM חסום מנתוני חברה אחרת בלי מבחן חי — **V5**.

---

# 71. Driver

## מצב קיים
| תחום | ממצא בקוד | סטטוס | ודאות |
|------|-----------|--------|--------|
| מסכים | חסום מ-`MANAGER_PREFIXES` (רכבים/נהגים/לקוחות/דוחות/התראות/ניהול…) דרך RouteGuard | 🟡 | V3 |
| ניווט | BottomNav מצומצם: dashboard, notifications, faults, expenses | 🟡 | V3 |
| Dashboard | `DriverDashboard` | 🟡 | V3 |
| רכב | `useDriverVehicle` — רכבים משויכים; בטפסי תקלה/תאונה מוגבל לשיוך | 🟡 | V3 |
| מסמכים | סינון לנהג/רכב משויך; אין expense docs | 🟡 | V3 |
| RLS דגימה | select רכבים לפי חברה או `assigned_driver_id`; עדכון ק"מ ברכב משויך; faults insert לחברה | 🟡/🔴 חי | V3/V5 |
| Edge | `notify-accident-email` כולל driver ברשימת roles ב-main | 🟡 | V3 |
| מגבלות UI | דף Drivers מסתיר פעולות מנהל מנהגים | 🟡 | V3 |

## כיצד נבדק / מקור הראיה
`routeAccess`, `BottomNav`, `Dashboard`, `Faults`/`Accidents`/`Documents`, מיגרציות vehicles/faults.

## סיכונים / המלצות
- האם נהג רואה כל רכבי החברה ב-select RLS (לא רק משויך) תלוי ב-policy — דורש אימות חי.

---

# 72. Customer

## מצב קיים — `private_customer`
| תחום | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| מסכים מותרים | רק `/dashboard`, `/service-orders`, `/driver-notifications`, `/settings` | 🟡 | V3 |
| Dashboard | `PrivateCustomerDashboard` | 🟡 | V3 |
| יצירה | company ריק ב-payload; `is_active=false` בהתחלה | 🟡 | V3 |
| RLS ייעודי ל-role | לא נמצא `has_role('private_customer')` בדגימות ליבה — גישה דרך authenticated + company אם קיים | 🟡/🔴 | V3/V5 |

## מצב קיים — `business_customer`
| תחום | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Enum ב-Prod | מיגרציה מסומנת staging-only | 🔴 | V5 |
| `routeAccess` | לא מוגדר; fallback `return true` | 🟡 סיכון בקוד | V3 |
| Dashboard | נופל ל-`HomeDashboard` (אין ענף ייעודי) | 🟡 | V3 |
| יצירה | יוצר/מקשר שורת `customers` + `profiles.customer_id` | 🟡 | V3 |
| Marketing/CRM policies | גישה ל-SA/FM — לא ללקוח עסקי | 🟡 | V3 |

## פעולות מותרות/אסורות (לפי קוד UI בלבד)
- Private: ניווט מצומצם; אין גישת מנהל צי במסכים.
- Business: **לא ניתן לקבוע התנהגות Prod** בלי אימות enum ו-routeAccess.

## כיצד נבדק / מקור הראיה
`routeAccess`, `Dashboard`, `BottomNav`, `CreateUserWizardDialog`, `create-admin-user`, מיגרציות.

## סיכונים / המלצות
- לתקן טיפול ב-`business_customer` ב-`routeAccess` לפני שימוש.
- לאמת האם role קיים ב-Prod.

---

# 73. Super Admin

## מצב קיים
| תחום | ממצא בקוד | סטטוס | ודאות |
|------|-----------|--------|--------|
| מסכים | `canAccessRoute` → true לכל path | 🟡 | V3 |
| ניהול משתמשים | UI + Edge: roles, active, 2FA approve, list-users, סיסמאות | 🟡 | V3 |
| ניהול חברות | בחירת חברה ב-UI (למשל Vehicles); פרופילים לפי RLS SA | 🟡 | V3 |
| הגדרות מערכת | WhatsApp settings, alert/approval/email templates, modules, emergency, required-fields | 🟡 | V3 |
| לוגים | `system_logs` — SA בלבד ב-UI | 🟡 | V3 |
| DB via RLS | policies עם bypass ל-`has_role(..., super_admin)` בדגימות | 🟡/🔴 חי | V3/V5 |
| Edge רגיש | backup-data, full-supabase-export, deploy-control, send-whatsapp, paypal (בקוד), marketing-* | 🟢 דחיית anon ל-backup היום · 🟡 שימוש SA | V1/V3 |
| תשתיות Hostinger/SSH/Secrets | לא נמצא שהאפליקציה נותנת ל-SA גישת תשתית ישירה | 🔴 גישת בעלים מחוץ לאפליקציה | V5 |
| Impersonation | יכול להציג משתמש אחר ב-UI; JWT נשאר SA | 🟡 | V3 |

## כיצד נבדק / מקור הראיה
`routeAccess`, `UserManagement`, `Settings`, Edge functions, כרך ז'.

## סיכונים / המלצות
- הרשאות SA רחבות בקוד — תלות בחשבון יחיד לא אומתה (V5).

---

# 74. הפרדת חברות

## מצב קיים
| שאלה | ממצא | סטטוס | ודאות |
|-------|--------|--------|--------|
| האם קיים מנגנון בקוד? | כן — `profiles.company_name` + `get_user_company` + RLS לפי התאמת חברה | 🟡 | V3 |
| האם מבוסס RLS? | כן במיגרציות שנדגמו | 🟡 | V3 |
| חריגים | SA עוקף לפי חברה; Impersonation לא מחליף JWT; tenancy טקסטואלי לא FK | 🟡 | V3 |
| האם אומת בפועל בין שתי חברות? | **לא בוצע מבחן חי** | 🔴 לא ניתן לאמת – V5 | V5 |
| האם policies ב-Prod = repo? | אין dump | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
מיגרציות `get_user_company`/vehicles/drivers/faults/customers; כרך ז' SR-05.

## סיכונים / המלצות
- אין להצהיר על הפרדת חברות מלאה בלי מבחן שני משתמשי FM.

---

# 75. הפרדת מידע

## מצב קיים — לפי שאלות (ללא הסקת מסקנות מעבר לראיה)
| שאלה | מה נמצא | האם אומת חי? | סטטוס |
|------|----------|---------------|--------|
| משתמש למידע שאינו שלו? | בקוד: אמור להיחסם ע"י RLS/UI לפי role+חברה; **לא נבדק חי** | לא | 🔴 V5 |
| הפרדה בין נהגים? | UI מגביל טפסים לרכב משויך; RLS עשוי לאפשר select רחב יותר בחברה | לא | 🟡/🔴 |
| הפרדה בין מנהלי צי? | מבוססת `company_name` במיגרציות | לא | 🔴 V5 |
| הפרדה בין לקוחות? | טבלת customers לפי חברה; לקוח פרטי — מסכים צרים | לא | 🟡/🔴 |
| הפרדה בין חברות? | מנגנון בקוד כן; אימות חי לא | לא | 🔴 V5 |

## כיצד נבדק / מקור הראיה
דגימות RLS + UI נהג/לקוח; היעדר מבחן חי מתועד.

## סיכונים / המלצות
- כל טענת "משתמש לא יכול לגשת ל־X" דורשת ראיה חיה — כרגע V5.

---

# Roles Inventory

| # | Role | ב-types | ב-routeAccess | ב-edgeAuth | ב-UI ניהול | הערת Prod |
|---|------|---------|---------------|------------|------------|-----------|
| 1 | `super_admin` | כן | כן | כן | כן | 🟡 |
| 2 | `fleet_manager` | כן | כן | כן | כן | 🟡 |
| 3 | `driver` | כן | כן | כן | כן | 🟡 |
| 4 | `private_customer` | כן | כן | כן | כן | 🟡 |
| 5 | `business_customer` | כן | **לא** | **לא** | כן | 🔴 enum Prod |

**מספר Roles שתועדו:** 5 (מהם 1 עם אי-ודאות Prod).

---

# Permissions Matrix

> מבוסס קוד בלבד (V3) אלא אם צוין אחרת. ✅ מותר בקוד · ❌ חסום בקוד · ◐ חלקי/תלוי הקשר · ? לא ניתן לאמת

| יכולת | SA | FM | Driver | Private Cust. | Business Cust. |
|--------|----|----|--------|---------------|----------------|
| גישה לכל מסכי Layout | ✅ | ◐ (לא SA-only) | ◐ (לא manager prefixes) | ◐ 4 מסכים | ? (fallback true בקוד) |
| `/user-management` | ✅ | ❌ | ❌ | ❌ | ? |
| `/system-logs` | ✅ | ❌ | ❌ | ❌ | ? |
| `/vehicles` ניהול | ✅ | ✅ (UI+RLS חברה) | ❌ מסך | ❌ | ? |
| דיווח תקלה/תאונה | ✅ | ✅ | ✅ (מוגבל שיוך) | ? | ? |
| מסמכים | ✅ | ✅ חברה | ◐ משויך | ? | ? |
| יצירת משתמש | ✅ | ✅ מוגבל+inactive | ❌ | ❌ | ❌ |
| שינוי role / הפעלה | ✅ | ❌ Edge | ❌ | ❌ | ❌ |
| WhatsApp עסקי send | ✅ Edge | ❌ | ❌ | ❌ | ❌ |
| backup/export/deploy | ✅ Edge | ❌ | ❌ | ❌ | ❌ |
| PayPal charge (קוד) | ✅ | ❌ | ❌ | ❌ | ❌ |
| חציית חברות בפועל | ? | ? | ? | ? | ? |

**מספר יכולות שתועדו במטריצה:** 12 שורות × 5 Roles (כולל סימני ?).

---

# Access Control Summary

| מנגנון | תיאור קצר | סטטוס |
|---------|-----------|--------|
| Auth session | Supabase JWT + `user_roles` | 🟡 |
| UI RouteGuard | על Layout בלבד דרך `canAccessRoute` | 🟡 |
| UI role checks | בדפים רבים | 🟡 |
| RLS + company_name | במיגרציות | 🟡/🔴 חי |
| Edge role gates | requireAuth / בדיקות ייעודיות | 🟢 חלקי ב-Prod |
| Impersonation | UI בלבד | 🟡 |
| `/dev` routes | מחוץ ל-RouteGuard; ב-bundle Prod (כרך ז') | 🟢 ממצא קודם |

---

# Separation of Duties Review

| עיקרון | ממצא | סטטוס |
|---------|--------|--------|
| הפרדת SA מ-FM | כן במסכים ו-Edge רגישים (בקוד) | 🟡 |
| הפרדת FM מנהג | כן במסכים; נתונים תלוי RLS | 🟡/🔴 |
| לקוח מצומצם | private כן ב-routeAccess | 🟡 |
| business_customer | לא מוגדר היטב ב-routeAccess | 🟡 סיכון |
| אותו אדם יוצר ומאשר | FM יוצר משתמשים אך לא מפעיל (SA מפעיל) — בקוד | 🟡 |
| SoD תשתיות | לא מאומת מחוץ לאפליקציה | 🔴 V5 |

---

# רשימת פערי V5

| נושא | חסר |
|------|------|
| מבחן tenancy חי בין חברות | שני משתמשי FM |
| `pg_policies` / RLS חי = repo | Dashboard/SQL |
| האם `business_customer` ב-Prod enum | DB/Dashboard |
| האם נהג רואה כל רכבי החברה ב-select | שאילתה חיה |
| האם לקוח ניגש לנתוני חברה אחרת | מבחן חי |
| גישת SA לתשתיות מחוץ לאפליקציה | ראיון Owner |
| אכיפת RouteGuard ב-bundle חי מול כל הנתיבים | בדיקת ניווט חיה |

---

# פעולות דחופות
1. לאמת/לתקן טיפול ב-`business_customer` ב-`routeAccess` (fallback `true`).
2. לבצע מבחן tenancy מבוקר (שני FM) ולתעד תוצאה.
3. לצמצם/לחסום `/dev/*` ב-Production bundle.

# פעולות ל-30 יום
1. ייצוא policies חי והשוואה ל-repo.
2. יישור טיפוסי Role בכל השכבות.
3. מיפוי כל הנתיבים מחוץ ל-Layout.
4. תיעוד SoD לאישור משתמשים (FM יוצר / SA מאשר).

# פעולות ל-90 יום
1. חיזוק RBAC ברמת Router לכל המסכים.
2. בדיקות רגרסיה אוטומטיות להרשאות לפי role.
3. מעבר מ-`company_name` טקסטואלי למזהה ארגוני יציב (תכנון).

---

# מסקנה מרכזית
במערכת מוגדרים לפחות ארבעה Roles פעילים במודל הקוד (`super_admin`, `fleet_manager`, `driver`, `private_customer`), ועוד `business_customer` עם חוסר עקביות וספק לגבי Prod. בקרת גישה מפוצלת בין UI, RLS ו-Edge. **הפרדת חברות מיושמת בקוד באמצעות `company_name`+RLS אך לא אומתה במבחן חי — 🔴 V5.** אין להציג הפרדת מידע מלאה כעובדה מאומתת.

## אישור מתודולוגיה
| בדיקה | תוצאה |
|--------|--------|
| סעיפים 68–75 | כן |
| Roles Inventory + Permissions Matrix | כן |
| ללא שינוי מערכת | כן |

**סוף כרך ח' – הרשאות**
