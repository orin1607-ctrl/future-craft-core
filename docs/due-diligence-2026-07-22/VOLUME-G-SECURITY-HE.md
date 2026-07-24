# כרך ז' – אבטחת מידע (Security Due Diligence)
## מערכת דליה · Read Only · ראיות בלבד · ללא ציונים

| שדה | ערך |
|-----|-----|
| תאריך | 2026-07-24 |
| Production | https://dalia-car.online · Supabase `qasomfndnjuixgjmjwcm` |
| מקורות | קוד `main` · מיגרציות · Edge · כרכים ד'/ה'/ו' · דוח מלא · בדיקות RO חיות היום |
| מצב עבודה | **Read Only** — ללא Deploy / שינוי Policies / Secrets / DB / קוד מערכת |
| עקרון | לתעד את מצב האבטחה כפי שהוא — לא להוכיח שהמערכת מאובטחת |

### מקרא
| סטטוס | משמעות |
|--------|--------|
| 🟢 מאומת | ראיה מול Production / בדיקה חיה |
| 🟡 דורש אימות | ראיה בקוד/תיעוד; מצב Prod חלקי או לא מלא |
| 🔴 לא ניתן לאמת – V5 | אין ראיה מספקת |

### ודאות V1–V5
V1 Prod · V2 חלקי Prod · V3 קוד/מיגרציות · V4 אזכור · V5 לא ניתן לאמת

---

# 50. Authentication

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| ספק Auth | Supabase Auth | 🟢 קיום מערכת Auth ב-Prod | V1/V3 |
| התחברות אימייל | מסלול challenge + OTP (`auth-login-challenge` / `auth-send-otp` / `auth-verify-otp`) ב-Login | 🟡 קוד · 🔴 כמה משתמשים ב-Prod | V3/V5 |
| התחברות טלפון | `signInWithPassword` ישיר ב-Login | 🟡 | V3 |
| הרשמה | `supabase.auth.signUp` | 🟡 | V3 |
| איפוס סיסמה | OTP reset + דף recovery ישן של Supabase | 🟡 | V3 |
| Edge Auth ציבוריים | `verify_jwt=false` לפונקציות auth ב-config | 🟡 | V3 |
| נעילת חשבון | `auth_account_lockouts` — 5 כשלונות / 15 דק' (בקוד) | 🟡 קוד · 🔴 פעיל ב-Prod | V3/V5 |
| MFA | ראו §55 | — | — |

## כיצד נבדק / מקור הראיה
`Login.tsx`, `AuthContext.tsx`, `authOtpClient.ts`, `supabase/functions/auth-*`, `config.toml`, מיגרציית `auth_otp_staging`.

## מה ניתן / לא ניתן לאמת
| ניתן | לא ניתן |
|------|---------|
| קיום מנגנוני התחברות בקוד | שיעור שימוש ב-OTP מול password ב-Prod — V5 |
| | הגדרות Auth Dashboard (MFA ספק, password policy) — V5 |

## סיכונים
- מסלולי auth ציבוריים (`verify_jwt=false`) דורשים הגנה פנימית חזקה — לא אומתה ב-Prod.
- `handle_new_user` קורא role מ-metadata (ראו §52) — סיכון הרשמה.

## המלצות
- לאמת ב-Dashboard ובלוגים איזה מסלול התחברות פעיל למשתמשים אמיתיים.

---

# 51. Authorization

## מצב קיים
| שכבה | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| לקוח (UI) | שער ראשי `isAuthenticated`; `RouteGuard`/`canAccessRoute` קיימים אך **לא מיושמים באופן גורף** ב-`App.tsx` | 🟡 | V3 |
| לקוח | בדיקות role מקומיות בדפים מסוימים | 🟡 | V3 |
| שרת DB | RLS + `has_role` / `get_user_company` במיגרציות | 🟡 קוד · 🔴 אכיפה חיה | V3/V5 |
| שרת Edge | `requireAuth` / בדיקות מותאמות בחלק מהפונקציות | 🟢 חלק אומת ב-Prod · 🟡 כיסוי חלקי | V1/V3 |
| Impersonation | החלפת `user` ב-UI בלבד; JWT נשאר של המשתמש האמיתי | 🟡 | V3 |
| הפרדת חברות | מבוססת `company_name` + RLS בקוד | 🔴 מבחן חוצה-חברות חי | V5 |

## כיצד נבדק / מקור הראיה
`App.tsx`, `RouteGuard.tsx`, `routeAccess.ts`, `edgeAuth.ts`, כרך ה', בדיקות Edge היום.

## סיכונים
- הסתמכות כבדה על RLS בזמן ש-UI לא חוסם routes לפי role.
- Impersonation עלול ליצור תחושת הרשאה שגויה בצד לקוח.

## המלצות
- למפות אילו מסכים באמת חשופים לכל authenticated.
- לבצע מבחן tenancy חי (RO) לפני הבטחות הפרדה.

---

# 52. Roles

## מצב קיים
| Role | מטרה (לפי מודל/UI) | רמת גישה (בקוד) | מקור | סטטוס | ודאות |
|------|---------------------|-----------------|------|--------|--------|
| `super_admin` | ניהול מערכתי חוצה חברות | הרחב בקוד/RLS/Edge | `app_role` + `user_roles` | 🟡 | V3 |
| `fleet_manager` | ניהול צי/חברה | CRUD חברה לפי policies | types + מיגרציות | 🟡 | V3 |
| `driver` | נהג | גישה מוגבלת לרכב/הצהרות | types + מיגרציות | 🟡 | V3 |
| `private_customer` | לקוח פרטי | מוגבל | types | 🟡 | V3 |
| `business_customer` | לקוח עסקי | מוגבל | types + מיגרציית staging | 🟡 | V3 |

הערת סיכון: `handle_new_user` מזין role מ-`raw_user_meta_data` (עם `is_active` false בגרסאות מאוחרות לרוב) — **לא אומת** מה קורה ב-Prod היום.

## כיצד נבדק / מקור הראיה
`types.ts` Enums; מיגרציות role; `UserManagement.tsx`.

## סיכונים / המלצות
- לא להסתמך על role שנבחר בהרשמה בלי אישור מנהל מאומת ב-Prod.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 53. Sessions

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| אחסון Session | `localStorage` דרך Supabase JS | 🟡 | V3 |
| Persist | `persistSession: true` | 🟡 | V3 |
| Refresh | `autoRefreshToken: true` | 🟡 | V3 |
| האזנה | `onAuthStateChange` + `getSession` ב-AuthContext | 🟡 | V3 |
| Cookies ל-Auth | לא נמצא שימוש באפליקציה | 🟡 להיעדר בקוד · 🔴 הגדרות ספק | V3/V5 |
| Logout | קיים בממשק (signOut) — התנהגות revocation מול Auth | 🟡 קוד · 🔴 revocation מלא | V3/V5 |
| תוקף Session מדויק | — | 🔴 הגדרות JWT expiry ב-Dashboard | V5 |

## כיצד נבדק / מקור הראיה
`src/integrations/supabase/client.ts`, `AuthContext.tsx`.

## סיכונים
- Session ב-`localStorage` חשוף ל-XSS אם יימצא XSS (אין CSP חי — §62).

## המלצות
- לאמת JWT expiry ב-Supabase Auth settings.

---

# 54. JWT

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| שימוש | JWT של Supabase מצורף ל-REST/Edge ע"י הלקוח | 🟢 anon JWT ב-bundle חי | V1 |
| אימות ב-Edge | `requireAuth` → `auth.getUser(token)` אחרי סינון anon/service | 🟡 קוד · 🟢 חלק מפונקציות דוחות 403/401 | V1/V3 |
| פענוח מקומי | `edgeAuth` מפענח payload (base64) לזיהוי role בלבד — **לא** אימות חתימה עצמאי | 🟡 | V3 |
| חתימה | מנוהלת ע"י Supabase Auth | 🔴 אלגוריתם/סיבוב מפתחות ב-Dashboard | V5 |
| Refresh | `autoRefreshToken: true` | 🟡 | V3 |
| סיכון | שליחת anon JWT לפונקציות שלא דוחות אותו | 🟢 מאומת בחלק מהפונקציות היום | V1 |

### בדיקת Prod היום (anon JWT)
| Function | תוצאה | סטטוס |
|----------|--------|--------|
| `notify-accident-email` | 403 user session required | 🟢 מוגן |
| `send-whatsapp-message` | 401 missing sub claim | 🟢 דוחה anon |
| `backup-data` / `full-supabase-export` | 401 | 🟢 דוחה anon |
| `gupshup-webhook` | 200 | 🟡 ציבורי במכוון? |
| `check-driver-availability` | **200 + נתונים** | 🔴 פער אבטחה מול `main` (שם יש `requireAuth`) |
| `vehicle-lookup` | 400 (ולידציה) — לא 401/403 | 🟡/🔴 אין דחיית anon ברורה ב-Prod |
| `help-ai-chat` / `paypal-charge` | 500 על גוף ריק | 🟡 לא הוכחה דחיית anon לפני פרסור |

## כיצד נבדק / מקור הראיה
`edgeAuth.ts`; בדיקות GET/קריאה עם anon מול Prod היום; bundle חי.

## סיכונים
- **סתירה Prod↔main**: פונקציות עם `requireAuth` ב-`main` שמגיבות ב-200 ל-anon ב-Prod.

## המלצות
- להשוות גרסת Edge ב-Prod מול `main` (בחלון שינוי מבוקר — מחוץ לכרך זה).

---

# 55. MFA

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| MFA/2FA במוצר | Email OTP אופציונלי לפי `profiles.two_factor_approved` | 🟡 קוד/UI | V3 |
| TOTP / Authenticator | לא נמצא | 🟡 להיעדר בקוד | V3 |
| SMS MFA | לא נמצא כ-MFA | 🟡 | V3 |
| MFA חובה לכל המשתמשים | לא נמצא | 🟡 | V3 |
| MFA בחשבונות ספקים (Hostinger/Supabase/…) | — | 🔴 לא ניתן לאמת – V5 | V5 |
| האם 2FA אומת כפעיל ב-Prod למשתמש אמיתי | — | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
`UserManagement.tsx`, `Login.tsx` (`login_2fa`), מיגרציית OTP, חיפוש TOTP/MFA.

## סיכונים / המלצות
- אין להצהיר על MFA מערכתי מלא — רק OTP אופציונלי בקוד, לא מאומת חי.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 56. RLS

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| ENABLE RLS | 85 טבלאות ייחודיות במיגרציות | 🟡 | V3 |
| CREATE POLICY | ~210 כולל Storage | 🟡 | V3 |
| כיסוי | רוב טבלאות הליבה עם policies; CRM/Marketing עם RLS **ללא** CREATE POLICY במיגרציות | 🟡 | V3 |
| חריגים | `USING (true)` / גישת anon להצהרות/מבחנים בנתיבים מסוימים | 🟡 | V3 |
| מצב Prod חי | אין dump `pg_policies` | 🔴 לא ניתן לאמת – V5 | V5 |
| Tenancy | `company_name` ב-policies | 🔴 אכיפה חיה | V5 |

## כיצד נבדק / מקור הראיה
כרך ה'; מיגרציות RLS, חיפוש `USING (true)`.

## סיכונים
- Policies חיים עלולים להיות שונים מה-repo.
- טבלאות עם RLS בלי policy = deny כברירת מחדל **או** פער אם נוספו policies מחוץ ל-repo.

## המלצות
- ייצוא `pg_policies` מ-Prod (RO).

---

# 57. Storage Security

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Bucket | `documents` בקוד; list RO חלקי ב-Prod | 🟡/🟢 חלקי | V2/V3 |
| Public/Private | מיגרציות כוללות `public=true` ו-`documents_read_public` | 🔴 דגל חי ב-Prod | V5 |
| Policies | היסטוריית ~15 policies במיגרציות; כולל anonymous ל-`declarations/` | 🔴 מצב חי | V5 |
| App | `getPublicUrl` בשימוש נרחב | 🟡 | V3 |
| Access control | תלוי path + RLS metadata | 🟡 | V3 |

## כיצד נבדק / מקור הראיה
כרכים ה'/ו'; מיגרציות Storage, `uploadDocument.ts`, בדיקת list RO קודמת.

## סיכונים / המלצות
- אם public read פעיל ב-Prod — מסמכים רגישים עלולים להיות נגישים לפי URL.
- חובה לייצא buckets+policies מ-Dashboard.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 58. API Security

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Authentication API | JWT Supabase ל-REST/Edge | 🟢 | V1 |
| Authorization API | RLS + Edge auth חלקי | 🟡/🔴 | V1/V5 |
| Rate limiting כללי ל-API | לא נמצא שכבה כללית | 🟡 להיעדר בקוד · 🔴 ברמת ספק | V3/V5 |
| CORS | `Access-Control-Allow-Origin: *` ב-Edge | 🟢 מאומת ב-OPTIONS ל-webhook היום | V1 |
| Validation | דוגמה: `vehicle-lookup` מחזיר 400 למספר לא תקין | 🟢 | V1 |
| Error handling | חלק מהפונקציות מחזירות JSON שגיאה; חלק 500 על גוף ריק | 🟡 | V1/V3 |

## כיצד נבדק / מקור הראיה
בדיקות Edge היום; `edgeCorsHeaders`; קוד פונקציות.

## סיכונים
- CORS פתוח (`*`) מגדיל משטח התקפת דפדפן אם יש XSS/טוקן גנוב.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 59. Edge Function Security

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| `requireAuth` | קיים ב-shared; בשימוש בפונקציות רבות ב-`main` | 🟡 | V3 |
| פונקציות מוגנות ב-Prod (מדגם) | notify-accident-email 403; backup/export 401; WA 401 | 🟢 | V1 |
| פונקציות לא מוגנות / חלשות ב-Prod | `check-driver-availability` 200 ל-anon; `gupshup-webhook` 200; `vehicle-lookup` ללא 401 | 🟢 ממצא שלילי מאומת | V1 |
| `verify_jwt=false` | auth-*, gupshup-webhook, document-request, marketing-notify-email | 🟡 | V3 |
| Secrets ב-Edge | service_role, ספקי הודעות וכו' (שמות) | 🟡 | V3 |
| Rate limits ב-Edge | בעיקר בנתיבי auth OTP | 🟡 | V3 |
| סתירה main↔Prod | `requireAuth` ב-main מול התנהגות 200 ב-Prod | 🟢 סתירה מאומתת | V1 |

## כיצד נבדק / מקור הראיה
בדיקות RO היום מול `qasomfndnjuixgjmjwcm`; `edgeAuth.ts`; `config.toml`.

## סיכונים
- חשיפת לוגיקת זמינות נהגים ל-anon ב-Prod.
- Webhook ציבורי ללא אימות שנמדד ב-GET.

## המלצות
- לטפל בפער `check-driver-availability` / יישור Edge ל-`main` (מחוץ לכרך זה).
- לאמת אימות חתימה/סוד ב-`gupshup-webhook` ל-POST.

---

# 60. Secrets

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| ניהול | GitHub Actions secrets + Supabase Edge secrets + VPS env (מתועד) | 🟡 | V3 |
| שמות שנמצאו (ללא ערכים) | `SUPABASE_*`, `RESEND_*`, `GUPSHUP_*`, `PAYPAL_*`, `TWILIO_*`, `ELEVENLABS_*`, `LOVABLE_API_KEY`, `DALIA_EDGE_INTERNAL_SECRET`, `VPS_*`, `GITHUB_PAT`, מפתחות marketing/Google | 🟡 | V3 |
| Secrets חסרים ב-Prod | Twilio credentials; ElevenLabs API key — תשובות Edge מפורשות | 🟢 | V1 |
| Secrets לא בשימוש | מפתחות marketing בקוד לפונקציות 404 | 🟡 | V1/V3 |
| רשימה מלאה ב-Prod | `gh secret list` היה 403 בסשנים קודמים | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
כרך ד', קוד Edge, תשובות Prod Twilio/EL, workflows.

## סיכונים / המלצות
- מלאי secrets לא שלם לביקורת.
- אין לחשוף ערכים; יש לבצע inventory לבעלים בלבד.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 61. Encryption

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| HTTPS אתר | TLS Let's Encrypt; תוקף עד 2026-10-04 | 🟢 נבדק היום | V1 |
| HTTPS ל-Supabase | `https://*.supabase.co` | 🟢 | V1 |
| Encryption in Transit | HTTPS מאומת לערוצים שנבדקו | 🟢 | V1 |
| Encryption at Rest | — | 🔴 לא ניתן לאמת – V5 | V5 |
| הצפנת שדות (ת.ז. וכו') | לא נמצאה בקוד | 🟡 להיעדר · 🔴 Prod | V3/V5 |

## כיצד נבדק / מקור הראיה
`openssl` היום; curl HTTPS; כרך ו'.


## סיכונים
- ראו ממצאים בטבלאות לעיל; פירוט מרוכז ב-Security Risk Register.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 62. Security Headers

## מצב קיים — בדיקה חיה היום מול `dalia-car.online`
| Header | נמצא ב-Prod? | סטטוס | ודאות |
|--------|----------------|--------|--------|
| Content-Security-Policy | לא | 🟢 היעדר מאומת | V1 |
| Strict-Transport-Security | לא | 🟢 היעדר מאומת | V1 |
| X-Frame-Options | לא | 🟢 היעדר מאומת | V1 |
| X-Content-Type-Options | לא | 🟢 היעדר מאומת | V1 |
| Referrer-Policy | לא | 🟢 היעדר מאומת | V1 |
| Permissions-Policy | לא | 🟢 היעדר מאומת | V1 |
| Cache-Control | כן (`no-store, no-cache, must-revalidate`) | 🟢 | V1 |
| Server | `nginx` | 🟢 | V1 |

`nginx.conf` ב-repo מגדיר בעיקר Cache-Control — **לא** את ה-headers החסרים לעיל.

## כיצד נבדק / מקור הראיה
`curl -sI https://dalia-car.online/` היום; קריאת `nginx.conf`.

## סיכונים / המלצות
- היעדר CSP/HSTS/XFO מגדיל סיכון XSS/clickjacking/downgrade.
- ליישר headers ב-Nginx החי (שינוי מבוקר מחוץ לכרך).


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 63. Rate Limiting

## מצב קיים
| היכן | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Auth OTP / login | ניסיונות, cooldown, lockout בקוד | 🟡 | V3 |
| Edge כללי | לא נמצא middleware אחיד | 🟡 | V3 |
| API Gateway / Cloudflare לדליה | — | 🔴 לא ניתן לאמת – V5 | V5 |
| Supabase פלטפורמה | — | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
`authOtp.ts`, חיפוש rate limit, כרך ד' על Cloudflare.


## סיכונים
- ראו ממצאים בטבלאות לעיל; פירוט מרוכז ב-Security Risk Register.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 64. Logging

## מצב קיים
| סוג | ממצא | סטטוס | ודאות |
|-----|--------|--------|--------|
| Application / audit UI | `system_logs` (קריאה ל-SA) | 🟡 | V3 |
| Auth audit | `auth_audit_log` + פאנל UI | 🟡 קוד · 🔴 Prod | V3/V5 |
| משלוחי התראות | `incident_notification_deliveries` | 🟢 קיום ב-Prod (E2E) | V1 |
| Error logs תשתית | Nginx/Supabase logs | 🔴 לא ניתן לאמת – V5 | V5 |
| Security logs מרוכזים | לא נמצא SIEM | 🟡 להיעדר · 🔴 | V3/V5 |
| PII בלוגי CI | הופיעו פרטי קשר ב-E2E (כרך ד') | 🟢 | V1 |

## כיצד נבדק / מקור הראיה
`SystemLogs.tsx`, Auth audit panel, כרכים ד'/ו', E2E קודם.


## סיכונים
- ראו ממצאים בטבלאות לעיל; פירוט מרוכז ב-Security Risk Register.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 65. Monitoring

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Sentry/Datadog וכד' | לא נמצא ב-package/קוד (לפי דוח מלא + חיפוש קודם) | 🟡 | V3 |
| Health scripts/workflows | `check-environment-health.mjs`, workflow health | 🟡 קיום בקוד · 🔴 ניטור חי 24/7 | V3/V5 |
| Alerts תפעוליים | — | 🔴 לא ניתן לאמת – V5 | V5 |
| Uptime חיצוני | — | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
דוח מלא; scripts/workflows.


## סיכונים
- ראו ממצאים בטבלאות לעיל; פירוט מרוכז ב-Security Risk Register.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 66. Backup

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Edge `backup-data` / `full-supabase-export` | קיימים; דוחים anon (401 היום) | 🟢 דחיית anon · 🟡 הרשאות SA בקוד | V1/V3 |
| גיבוי אוטומטי Supabase | — | 🔴 לא ניתן לאמת – V5 | V5 |
| תדירות / PITR | — | 🔴 לא ניתן לאמת – V5 | V5 |
| שחזור שבוצע בפועל | — | 🔴 לא ניתן לאמת – V5 | V5 |
| גיבוי VPS/Hostinger | — | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
בדיקת Edge היום; קוד backup functions; כרכים ה'/ו'.


## סיכונים
- ראו ממצאים בטבלאות לעיל; פירוט מרוכז ב-Security Risk Register.


## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

---
# 67. Disaster Recovery

## מצב קיים
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| מסמך DR / Runbook | לא נמצא כמסמך מאומת בתיק | 🔴 לא ניתן לאמת – V5 | V5 |
| RTO / RPO | — | 🔴 לא ניתן לאמת – V5 | V5 |
| Failover | אין חלופה פעילה ל-Supabase/Hostinger (כרך ד') | 🟡 היעדר חלופה מאומת · 🔴 DR | V1/V5 |
| תרגיל התאוששות | — | 🔴 לא ניתן לאמת – V5 | V5 |

## כיצד נבדק / מקור הראיה
חיפוש בתיעוד התיק; כרך ד' על SPOF.

---

# Security Findings Summary

| מזהה | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| SF-01 | Security Headers חסרים באתר החי (CSP/HSTS/XFO/…) | 🟢 | V1 |
| SF-02 | TLS תקין (Let's Encrypt) עד 2026-10-04 | 🟢 | V1 |
| SF-03 | `check-driver-availability` מחזיר 200 ל-anon ב-Prod למרות `requireAuth` ב-`main` | 🟢 | V1 |
| SF-04 | `notify-accident-email` / backup/export דוחים anon | 🟢 | V1 |
| SF-05 | `gupshup-webhook` נגיש ב-GET 200; CORS `*` | 🟢 | V1 |
| SF-06 | Session ב-`localStorage` + auto refresh | 🟡 | V3 |
| SF-07 | RouteGuard לא מיושם גורף; `/dev/*` ב-bundle | 🟡/🟢 | V3/V1 |
| SF-08 | MFA מלא לא מאומת; OTP 2FA אופציונלי בקוד בלבד | 🟡/🔴 | V3/V5 |
| SF-09 | RLS רחב במיגרציות; מצב חי לא dump | 🟡/🔴 | V3/V5 |
| SF-10 | Storage public/policies חיים לא אומתו | 🔴 | V5 |
| SF-11 | Twilio/ElevenLabs secrets חסרים ב-Prod | 🟢 | V1 |
| SF-12 | אין גיבוי/PITR/DR מאומתים | 🔴 | V5 |
| SF-13 | אין ניטור אבטחה חיצוני מאומת | 🔴 | V5 |
| SF-14 | Impersonation קוסמטי (JWT לא מתחלף) | 🟡 | V3 |
| SF-15 | PII בלוגי GitHub Actions (ממצא קודם) | 🟢 | V1 |

---

# Security Risk Register

| מזהה | סיכון | ראיה | ודאות | חומרה (הערכה) |
|------|--------|------|--------|----------------|
| SR-01 | Edge לא מוקשח ב-Prod (זמינות נהגים ל-anon) | SF-03 | V1 | גבוהה |
| SR-02 | היעדר Security Headers | SF-01 | V1 | בינונית-גבוהה |
| SR-03 | XSS→גניבת Session מ-localStorage | SF-01+SF-06 | V1/V3 | גבוהה אם XSS |
| SR-04 | דליפת מסמכים אם Storage public | SF-10 | V5/V3 | גבוהה פוטנציאלית |
| SR-05 | כשל tenancy לא מאומת | §51/56 | V5 | גבוהה ל-Enterprise |
| SR-06 | היעדר MFA מחייב | SF-08 | V3/V5 | בינונית-גבוהה |
| SR-07 | היעדר גיבוי/DR מאומת | SF-12 | V5 | גבוהה |
| SR-08 | Webhook ציבורי / CORS פתוח | SF-05 | V1 | בינונית |
| SR-09 | פער גרסאות Edge מול main | SF-03 | V1 | גבוהה |
| SR-10 | הרשמה/role מ-metadata | §52 | V3 | בינונית |
| SR-11 | היעדר ניטור/התראות אבטחה | SF-13 | V5 | בינונית |
| SR-12 | חשיפת PII בלוגי CI | SF-15 | V1 | בינונית |

---

# רשימת פערי V5

| נושא | מה חסר |
|------|--------|
| MFA חשבונות ספקים + 2FA חי למשתמשים | Dashboard / בדיקת משתמש |
| JWT expiry / Auth settings | Supabase Auth settings |
| `pg_policies` חי | SQL/Dashboard export |
| Storage public + policies חיים | Storage Dashboard |
| מלאי Secrets מלא | גישת Owner ל-secrets |
| Encryption at rest | אישור ספק/Dashboard |
| Rate limit ברמת פלטפורמה | תיעוד ספק |
| לוגים תשתית / SIEM | גישת לוגים |
| ניטור Uptime/Alerts | פורטל ניטור |
| Backup schedule / PITR / restore | Dashboard + תרגיל |
| DR RTO/RPO / Failover | מסמך DR |
| Tenancy חי בין חברות | מבחן שני משתמשים |
| האם OTP 2FA בשימוש אמיתי | לוגים/מדגם משתמשים |

---

# פעולות דחופות
1. לטפל בחשיפת `check-driver-availability` (ופונקציות דומות) ל-anon ב-Prod — יישור ל-`requireAuth`.
2. להוסיף Security Headers ב-Nginx החי (CSP בסיסי/HSTS/XFO/… ) בחלון שינוי מבוקר.
3. לייצא ולבדוק Storage buckets+policies מול אפשרות קריאה פומבית.
4. לאמת/לחזק אימות `gupshup-webhook` ל-POST.

# פעולות ל-30 יום
1. Dump RLS policies + מבחן tenancy מבוקר.
2. Inventory Secrets + MFA לחשבונות ספקים.
3. Redaction ללוגי CI; צמצום `/dev` ב-Prod bundle.
4. הגדרת ניטור Uptime בסיסי + התראות.
5. אימות הגדרות Auth (JWT expiry, password policy).

# פעולות ל-90 יום
1. תוכנית גיבוי/PITR + תרגיל שחזור מתועד.
2. מסמך DR (RTO/RPO) ל-Supabase/Hostinger.
3. יישום RouteGuard גורף / חיזוק הרשאות בצד לקוח כהגנה נוספת.
4. מדיניות MFA למשתמשים רגישים.
5. סגירת פערי V5 ברשימה לעיל.

---

# מסקנה מרכזית
קיימים מנגנוני אבטחה חלקיים בקוד (Supabase Auth, RLS במיגרציות, `edgeAuth`, TLS). ב-Production אומתו **גם חוזקות** (דחיית anon בחלק מה-Edge, TLS) ו**גם פערים ממשיים** (היעדר Security Headers; פונקציית זמינות נהגים פתוחה ל-anon; סתירת Edge מול `main`). גיבוי, DR, MFA מחייב, ו-RLS חי — **לא ניתן לאמת**. אין להציג את המערכת כמאובטחת מקצה לקצה על בסיס הכרך הזה.

## אישור מתודולוגיה
| בדיקה | תוצאה |
|--------|--------|
| סעיפים 50–67 | כן |
| ללא הנחות כעובדות | כן |
| פערי V5 מסומנים | כן |
| ללא שינוי מערכת | כן — מסמך בלבד |

**סוף כרך ז' – אבטחת מידע**

## סיכונים
- ראו ממצאים בטבלאות לעיל; פירוט מרוכז ב-Security Risk Register.

## המלצות
- להשלים אימות RO לנושאים המסומנים 🔴/🟡 בסעיף זה.

