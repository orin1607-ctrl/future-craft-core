# כרך ה' – מסד הנתונים (Database Due Diligence)
## Security Due Diligence · מערכת דליה · Read Only

| שדה | ערך |
|-----|-----|
| תאריך | 2026-07-24 |
| Production | https://dalia-car.online · Supabase `qasomfndnjuixgjmjwcm` |
| מקורות קוד | `origin/main` · `supabase/migrations` (89 קבצים) · `src/integrations/supabase/types.ts` |
| מצב עבודה | **Read Only** — ללא Migration / ALTER / DML / שינוי Policies / Secrets / Deploy |
| הערת מתודולוגיה | **לא בוצע dump SQL חי מ-Production**. רוב המבנה מבוסס מיגרציות+types (V3). נקודות שאומתו בעקיפין מול Prod מסומנות V1/V2. |

### מקרא ודאות
| קוד | משמעות |
|-----|--------|
| **V1** | מאומת מול Production |
| **V2** | מאומת חלקית מול Production |
| **V3** | מאומת מקוד/מיגרציות/types בלבד |
| **V4** | אזכור |
| **V5** | לא ניתן לאמת |

### כיצד נבדק (כללי)
- קריאת `types.ts` ו-89 מיגרציות SQL (ספירות, CREATE TABLE/INDEX/TRIGGER/FUNCTION/POLICY, Storage).
- הצלבה מול ממצאי E2E קודמים (`incident_notification_deliveries`).
- בדיקות RO מול Prod: Storage `object/list/documents` (POST list); Storage `bucket` list עם anon; ניסיון OpenAPI REST.
- **לא** בוצעו: psql, Dashboard, Management API, DML, DDL, שינוי Policies.

---

# 33. מבנה מסד הנתונים

## מצב קיים
| פריט | ערך שנמצא | מקור | ודאות |
|------|-----------|------|--------|
| סוג מסד | PostgreSQL דרך Supabase (BaaS) | ארכיטקטורת Prod + SDK | V1 לסוג שירות; V3 למנוע |
| גרסת PostgreSQL | לא ניתן לאמת – V5 | אין `db.major_version` ב-config; אין חיבור SQL חי | V5 |
| PostgREST (רמז ב-types) | `"14.1"` ב-`__InternalSupabase.PostgrestVersion` | types.ts | V3 (לא גרסת PG) |
| פרויקט Prod | `qasomfndnjuixgjmjwcm` | bundle חי | V1 |
| פרויקט ב-config.toml | `usfeoerkpcafxxlyuldl` (Staging מתועד) | config.toml | V3 |
| Schemas שנזכרו במיגרציות | `public`, `auth`, `storage`, `extensions`, `cron` | migrations | V3 |
| מספר Schemas ב-Prod | לא ניתן לאמת – V5 (אין catalog חי) | — | V5 |
| Tables ב-types.ts (public) | **57** | types.ts | V3 |
| Tables ב-CREATE TABLE במיגרציות (ייחודי) | **85** | migrations | V3 |
| פער types↔migrations | **28** טבלאות במיגרציות ולא ב-types | השוואה | V3 |
| Views | **0** (אין ב-types; אין CREATE VIEW במיגרציות) | types + migrations | V3 |
| Functions (RPC ב-types) | **5** | types.ts | V3 |
| Functions (CREATE במיגרציות, ייחודי) | **31** | migrations | V3 |
| Triggers (CREATE) | **31** | migrations | V3 |
| Indexes (CREATE INDEX/UNIQUE INDEX) | **64** | migrations | V3 |
| CREATE POLICY | **210** (כולל ~15 על storage.objects) | migrations | V3 |
| ENABLE ROW LEVEL SECURITY | **85** טבלאות ייחודיות | migrations | V3 |
| Extensions במיגרציות | `pg_cron`, `pg_net` | migrations | V3 לקיום בסקריפט; **V5** אם פעיל ב-Prod |
| Enum ב-types | `app_role` (5 ערכים) | types.ts | V3 |
| Enums נוספים במיגרציות | `auth_otp_purpose`, `auth_audit_event` | migrations | V3; לא ב-types |

## ניתוח מקצועי
מבנה הסכמה בקוד רחב (צי, תקלות, מסמכים, Voice, CRM/Marketing, Auth מותאם). קיים **פער מובהק** בין `types.ts` למיגרציות — כולל טבלת `incident_notification_deliveries` שאומתה ב-Prod ב-E2E אך חסרה ב-types (סתירה קוד↔Prod, V1 לקיום הטבלה / V3 להגדרה).

## סיכונים
- תיעוד סכמה לא מעודכן מול Prod → ביקורת ופיתוח על בסיס types חלקי.
- גרסת PG / Extensions ב-Prod לא אומתו.
- אין dump חי → מצב Policies/Indexes בפועל עלול לחרוג מהמיגרציות.

## המלצות / עדיפות
| המלצה | עדיפות |
|--------|--------|
| לייצא schema חי (Dashboard/RO) ולסנכרן types | P0 |
| לאמת Extensions וגרסת PG ב-Prod | P1 |
| לתעד catalog Schemas חי | P1 |

---

# 34. טבלאות

## מצב קיים — טבלה מסכמת
> עמודות: מ-types.ts כשקיים; אחרת אומדן מ-CREATE TABLE במיגרציה. RLS: לפי ENABLE במיגרציות (V3) — מצב Prod החי לא אומת ב-SQL.

| טבלה | מטרה (לפי שם/מודול בקוד) | עמודות | PK | FK עיקריים | Unique | ב-types? | RLS ENABLE במיגרציה | הערות | ודאות מבנה |
|------|---------------------------|--------|----|------------|--------|----------|----------------------|-------|-------------|
| `accidents` | דיווחי תאונות | 15 (types.ts) | id | — | UNIQUE INDEX accidents_company_event_number_uidx(company_name, event_number) | כן | כן | — | V3 |
| `approval_requests` | בקשות אישור | 19 (types.ts) | id | — | — | כן | כן | — | V3 |
| `auth_account_lockouts` | נעילות חשבון Auth מותאם | 5 (מיגרציה, אומדן) | email | — | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `auth_audit_log` | לוג ביקורת Auth | 10 (מיגרציה, אומדן) | id | user_id→profiles(id), actor_user_id→profiles(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `auth_login_challenges` | אתגרי התחברות | 7 (מיגרציה, אומדן) | id | user_id→profiles(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `auth_password_reset_tokens` | טוקני איפוס סיסמה | 7 (מיגרציה, אומדן) | id | user_id→profiles(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `auth_verification_codes` | קודי אימות | 13 (מיגרציה, אומדן) | id | user_id→profiles(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `call_logs` | לוג שיחות Voice | 18 (types.ts) | id | — | — | כן | כן | — | V3 |
| `campaign_customers` | שיוך לקוחות לקמפיין קולי | 3 (types.ts) | campaign_id, customer_id | campaign_id→voice_campaigns(id) | — | כן | כן | — | V3 |
| `companions` | מלווים | 9 (types.ts) | id | — | — | כן | כן | — | V3 |
| `company_settings` | הגדרות חברה | 20 (types.ts) | id | — | company_name | כן | כן | — | V3 |
| `company_subscriptions` | מנויי חברה | 12 (types.ts) | id | — | company_name | כן | כן | — | V3 |
| `crm_activity_log` | לוג פעילות CRM | 9 (מיגרציה, אומדן) | id | customer_id→customers(id), lead_id→crm_leads(id), task_id→crm_tasks(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `crm_ai_insights` | תובנות AI ל-CRM | 9 (מיגרציה, אומדן) | id | customer_id→customers(id), lead_id→crm_leads(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `crm_leads` | לידים CRM | 19 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `crm_tasks` | משימות CRM | 13 (מיגרציה, אומדן) | id | customer_id→customers(id), lead_id→crm_leads(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `custom_alerts` | התראות מותאמות | 12 (types.ts) | id | — | — | כן | כן | — | V3 |
| `customer_agreements` | הסכמי לקוח | 8 (types.ts) | id | customer_id→customers(id) | — | כן | כן | — | V3 |
| `customer_deals` | עסקאות לקוח | 14 (types.ts) | id | customer_id→customers(id) | — | כן | כן | — | V3 |
| `customers` | לקוחות | 23 (types.ts) | id | — | UNIQUE INDEX customers_user_id_unique(user_id) | כן | כן | — | V3 |
| `dalia_form_config` | קונפיג טפסים | 4 (מיגרציה, אומדן) | config_key | updated_by→auth.users(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `declaration_templates` | תבניות הצהרות | 9 (types.ts) | id | — | UNIQUE INDEX declaration_templates_one_default_per_company(company_name) | כן | כן | — | V3 |
| `deploy_runs` | ריצות Deploy | 24 (מיגרציה, אומדן) | id | deployed_by→profiles(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `dev_tasks` | משימות פיתוח פנימיות | 11 (types.ts) | id | created_by→auth.users(id) | — | כן | כן | — | V3 |
| `document_metadata` | מטא-דאטה למסמכים | 11 (types.ts) | id | — | — | כן | כן | — | V3 |
| `document_request_events` | אירועי בקשת מסמך | 7 (מיגרציה, אומדן) | id | request_id→document_requests(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `document_requests` | בקשות מסמכים | 31 (מיגרציה, אומדן) | id | document_type_key→document_type_defs(key) | token_hash | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `document_type_defs` | הגדרות סוגי מסמך | 16 (מיגרציה, אומדן) | id | — | key | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `document_versions` | גרסאות מסמך | 19 (מיגרציה, אומדן) | id | request_id→document_requests(id) | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `driver_declarations` | הצהרות נהג | 19 (types.ts) | id | — | token | כן | כן | — | V3 |
| `driver_health_declarations` | הצהרות בריאות נהג | 11 (types.ts) | id | — | — | כן | כן | — | V3 |
| `driver_notifications` | התראות לנהג | 8 (types.ts) | id | — | — | כן | כן | — | V3 |
| `drivers` | נהגים | 19 (types.ts) | id | — | — | כן | כן | — | V3 |
| `driving_exams` | מבחני נהיגה | 30 (types.ts) | id | — | — | כן | כן | — | V3 |
| `emergency_categories` | קטגוריות חירום | 12 (types.ts) | id | — | — | כן | כן | — | V3 |
| `emergency_logs` | לוג חירום | 15 (types.ts) | id | — | — | כן | כן | — | V3 |
| `expenses` | הוצאות | 15 (types.ts) | id | — | — | כן | כן | — | V3 |
| `fault_messages` | הודעות על תקלה | 7 (types.ts) | id | fault_id→faults(id) | — | כן | כן | — | V3 |
| `fault_referrals` | הפניות תקלה | 16 (types.ts) | id | fault_id→faults(id) | — | כן | כן | — | V3 |
| `fault_status_log` | היסטוריית סטטוס תקלה | 9 (types.ts) | id | fault_id→faults(id) | — | כן | כן | — | V3 |
| `faults` | תקלות | 20 (types.ts) | id | — | UNIQUE INDEX faults_company_event_number_uidx(company_name, event_number) | כן | כן | — | V3 |
| `incident_event_counters` | מוני אירועי תקלה/תאונה | 4 (מיגרציה, אומדן) | company_name, year, prefix | — | — | לא | כן | חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `incident_notification_deliveries` | משלוחי התראות אירוע (WA/Email/DLR) | 16 (מיגרציה, אומדן) | id | — | UNIQUE INDEX incident_notification_deliveries_dedupe_uidx(incident_kind, incident_id, channel, recipient), UNIQUE INDEX incident_notification_deliveries_dedupe_uidx(incident_kind, incident_id, channel, recipient) | לא | כן | אומת קיום ב-Prod ב-E2E; חסר ב-types; חסר ב-types.ts | V1/V3 |
| `inspection_items` | פריטי בדיקה | 6 (types.ts) | id | inspection_id→vehicle_inspections(id) | — | כן | כן | — | V3 |
| `internal_messages` | הודעות פנימיות | 8 (types.ts) | id | — | — | כן | כן | — | V3 |
| `marketing_activity_log` | לוג שיווק | 9 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_ai_setup` | הגדרות AI שיווק | 7 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_api_items` | פריטי API שיווק | 8 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_campaigns` | קמפיינים שיווקיים | 11 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_connections` | חיבורי שיווק | 7 (מיגרציה, אומדן) | id | customer_id→customers(id) | customer_id, provider | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_contacts` | אנשי קשר שיווק | 8 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_domains` | דומיינים שיווק | 7 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_leads` | לידים שיווק | 13 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_metrics` | מדדי שיווק | 8 (מיגרציה, אומדן) | id | customer_id→customers(id) | customer_id, provider, metric_key, period_start | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_profiles` | פרופילי שיווק | 13 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `marketing_sites` | אתרי שיווק | 9 (מיגרציה, אומדן) | id | customer_id→customers(id) | — | לא | כן | RLS ללא CREATE POLICY במיגרציות; חסר ב-types.ts | V3 (מיגרציה בלבד) |
| `pickup_appointments` | תורים לאיסוף | 21 (types.ts) | id | — | — | כן | כן | — | V3 |
| `practical_driving_exams` | מבחני נהיגה מעשיים | 17 (types.ts) | id | — | — | כן | כן | — | V3 |
| `profiles` | פרופילי משתמש | 17 (types.ts) | id | id→auth.users(id) | UNIQUE INDEX profiles_user_number_unique(user_number) | כן | כן | — | V3 |
| `promotions` | מבצעים | 10 (types.ts) | id | — | — | כן | כן | — | V3 |
| `registration_requests` | בקשות הרשמה | 8 (types.ts) | id | reviewed_by→profiles(id) | — | כן | כן | — | V3 |
| `routes` | מסלולים | 27 (types.ts) | id | — | — | כן | כן | — | V3 |
| `service_order_messages` | הודעות הזמנת שירות | 7 (types.ts) | id | order_id→service_orders(id) | — | כן | כן | — | V3 |
| `service_orders` | הזמנות שירות | 30 (types.ts) | id | — | — | כן | כן | — | V3 |
| `supplier_work_orders` | הזמנות עבודה לספק | 18 (types.ts) | id | supplier_id→suppliers(id) | — | כן | כן | — | V3 |
| `suppliers` | ספקים | 17 (types.ts) | id | — | — | כן | כן | — | V3 |
| `system_logs` | לוגים מערכתיים | 13 (types.ts) | id | — | — | כן | כן | — | V3 |
| `temporary_drivers` | נהגים זמניים | 10 (types.ts) | id | — | — | כן | כן | — | V3 |
| `trip_logs` | יומן נסיעות | 15 (types.ts) | id | — | — | כן | כן | — | V3 |
| `user_access_codes` | קודי גישה | 11 (types.ts) | id | user_id→profiles(id), created_by→profiles(id) | — | כן | כן | — | V3 |
| `user_roles` | תפקידי משתמש | 3 (types.ts) | id | user_id→auth.users(id) | user_id, role | כן | כן | — | V3 |
| `vehicle_companions` | שיוך מלווה לרכב | 6 (types.ts) | id | vehicle_id→vehicles(id), companion_id→companions(id) | vehicle_id, companion_id, UNIQUE(vehicle_id, | כן | כן | — | V3 |
| `vehicle_exchanges` | החלפות רכב | 57 (types.ts) | id | — | — | כן | כן | — | V3 |
| `vehicle_handovers` | מסירות רכב | 28 (types.ts) | id | — | — | כן | כן | — | V3 |
| `vehicle_inspections` | בדיקות רכב | 11 (types.ts) | id | — | — | כן | כן | — | V3 |
| `vehicle_insurance_history` | היסטוריית ביטוח | 10 (types.ts) | id | vehicle_id→vehicles(id) | vehicle_id, year, UNIQUE(vehicle_id, | כן | כן | — | V3 |
| `vehicle_tasks` | משימות רכב | 17 (types.ts) | id | inspection_id→vehicle_inspections(id) | — | כן | כן | — | V3 |
| `vehicles` | רכבים | 98 (types.ts) | id | — | — | כן | כן | — | V3 |
| `voice_campaigns` | קמפיינים קוליים | 12 (types.ts) | id | — | — | כן | כן | — | V3 |
| `voice_prompts` | פרומפטים קוליים | 8 (types.ts) | id | — | flow_type | כן | כן | — | V3 |
| `voice_scenario_runs` | הרצות תרחיש קולי | 14 (types.ts) | id | scenario_id→voice_scenarios(id) | — | כן | כן | — | V3 |
| `voice_scenarios` | תרחישים קוליים | 17 (types.ts) | id | — | — | כן | כן | — | V3 |
| `work_assignment_messages` | הודעות שיבוץ | 8 (types.ts) | id | assignment_id→work_assignments(id) | — | כן | כן | — | V3 |
| `work_assignment_status_log` | סטטוס שיבוץ | 9 (types.ts) | id | assignment_id→work_assignments(id) | — | כן | כן | — | V3 |
| `work_assignments` | שיבוצי עבודה | 32 (types.ts) | id | companion_id→companions(id) | — | כן | כן | — | V3 |

### סתירה מאומתת
`incident_notification_deliveries` — קיימת ב-Prod (E2E deliveries, V1) ומוגדרת במיגרציות (V3), **אינה** מופיעה ב-`types.ts` (V3).

## כיצד נבדק / מקור
סריקת types.ts + CREATE TABLE/ENABLE RLS/REFERENCES/UNIQUE במיגרציות; הצלבה ל-E2E.

## סיכונים
- 28 טבלאות ללא types → SDK לא משקף מלאי.
- טבלאות CRM/Marketing עם RLS ללא Policies מפורשות במיגרציות — ב-Postgres משמעותן דחייה כברירת מחדל ל-roles כפופי RLS; **לא אומת** אם כך ב-Prod או אם נוספו Policies מחוץ ל-repo (V5).
- Tenancy מבוסס `company_name` בטבלאות ליבה (לפי מיגרציות/דוחות קודמים) — חוזק לא אומת ב-SQL חי.

## המלצות / עדיפות
| המלצה | עדיפות |
|--------|--------|
| רענון `supabase gen types` מול Prod | P0 |
| Audit Policies חי לטבלאות ללא Policy בקוד | P0 |
| מיפוי tenancy חי (בדיקות חוצות-חברה מבוקרות) | P0 |

---

# 35. קשרים

## מצב קיים
- Relationships / FK לטבלאות שב-types: **17** (types.ts).
- REFERENCES במיגרציות: טבלאות עם FK מפורש ב-CREATE: **45**.

### קשרי One-to-Many לטבלאות שב-types (V3)
| מקור | עמודה | יעד |
|------|--------|-----|
| `campaign_customers` | `campaign_id` | `voice_campaigns` |
| `customer_agreements` | `customer_id` | `customers` |
| `customer_deals` | `customer_id` | `customers` |
| `fault_messages` | `fault_id` | `faults` |
| `fault_referrals` | `fault_id` | `faults` |
| `fault_status_log` | `fault_id` | `faults` |
| `inspection_items` | `inspection_id` | `vehicle_inspections` |
| `service_order_messages` | `order_id` | `service_orders` |
| `supplier_work_orders` | `supplier_id` | `suppliers` |
| `vehicle_companions` | `companion_id` | `companions` |
| `vehicle_companions` | `vehicle_id` | `vehicles` |
| `vehicle_insurance_history` | `vehicle_id` | `vehicles` |
| `vehicle_tasks` | `inspection_id` | `vehicle_inspections` |
| `voice_scenario_runs` | `scenario_id` | `voice_scenarios` |
| `work_assignment_messages` | `assignment_id` | `work_assignments` |
| `work_assignment_status_log` | `assignment_id` | `work_assignments` |
| `work_assignments` | `companion_id` | `companions` |

### קשרים נוספים ממיגרציות (טבלאות שלא ב-types) — V3
| מקור | עמודה | יעד |
|------|--------|-----|
| `auth_audit_log` | `user_id` | `profiles(id)` |
| `auth_audit_log` | `actor_user_id` | `profiles(id)` |
| `auth_login_challenges` | `user_id` | `profiles(id)` |
| `auth_password_reset_tokens` | `user_id` | `profiles(id)` |
| `auth_verification_codes` | `user_id` | `profiles(id)` |
| `crm_activity_log` | `customer_id` | `customers(id)` |
| `crm_activity_log` | `lead_id` | `crm_leads(id)` |
| `crm_activity_log` | `task_id` | `crm_tasks(id)` |
| `crm_ai_insights` | `customer_id` | `customers(id)` |
| `crm_ai_insights` | `lead_id` | `crm_leads(id)` |
| `crm_leads` | `customer_id` | `customers(id)` |
| `crm_tasks` | `customer_id` | `customers(id)` |
| `crm_tasks` | `lead_id` | `crm_leads(id)` |
| `dalia_form_config` | `updated_by` | `auth.users(id)` |
| `deploy_runs` | `deployed_by` | `profiles(id)` |
| `document_request_events` | `request_id` | `document_requests(id)` |
| `document_requests` | `document_type_key` | `document_type_defs(key)` |
| `document_versions` | `request_id` | `document_requests(id)` |
| `marketing_activity_log` | `customer_id` | `customers(id)` |
| `marketing_ai_setup` | `customer_id` | `customers(id)` |
| `marketing_api_items` | `customer_id` | `customers(id)` |
| `marketing_campaigns` | `customer_id` | `customers(id)` |
| `marketing_connections` | `customer_id` | `customers(id)` |
| `marketing_contacts` | `customer_id` | `customers(id)` |
| `marketing_domains` | `customer_id` | `customers(id)` |
| `marketing_leads` | `customer_id` | `customers(id)` |
| `marketing_metrics` | `customer_id` | `customers(id)` |
| `marketing_profiles` | `customer_id` | `customers(id)` |
| `marketing_sites` | `customer_id` | `customers(id)` |

*שורות נוספות בטבלה לעיל: 29.*

### Many-to-Many
| טבלת קשר | צד א | צד ב | ודאות |
|----------|------|------|--------|
| `vehicle_companions` | `vehicles` | `companions` | V3 (types Relationships) |
| `campaign_customers` | `voice_campaigns` | לקוח (לפי מודל) | V3 חלקי |

### קשרים חסרים / חלשים (זיהוי בקוד, לא dump חי)
| ממצא | פירוט | ודאות |
|-------|--------|--------|
| שיוך חברה טקסטואלי | שימוש נרחב ב-`company_name` במקום FK לטבלת חברות | V3 |
| פרופיל↔Auth | `profiles.id` / `handle_new_user` על `auth.users` — קשר אפליקטיבי | V3 |
| FK לא ב-types לטבלאות חדשות | CRM/Marketing/Documents/Auth מותאם | V3 |
| קשרים ב-Prod שנוספו ידנית | לא ניתן לאמת – V5 | V5 |

### תרשים ER טקסטואלי (ליבה — לפי ראיות קוד)
```
auth.users
   │
   ▼
profiles ◄── user_roles
   │
   ├── drivers / temporary_drivers
   ├── customers ──┬── customer_deals
   │               ├── customer_agreements
   │               └── (crm_*/marketing_* במיגרציות, לא ב-types)
   │
vehicles ──┬── vehicle_inspections ── inspection_items
           ├── vehicle_tasks
           ├── vehicle_insurance_history
           ├── vehicle_exchanges / vehicle_handovers
           └── vehicle_companions ── companions

faults ──┬── fault_messages / fault_referrals / fault_status_log
accidents
service_orders ── service_order_messages
work_assignments ── messages / status_log
suppliers ── supplier_work_orders

incident_event_counters / allocate_incident_event_number()
incident_notification_deliveries   [Prod V1 · חסר ב-types]

voice_campaigns ── campaign_customers
voice_scenarios ── voice_scenario_runs
document_metadata + storage.objects (bucket documents)
```

## סיכונים / המלצות
- תלות ב-`company_name` מחלישה שלמות ייחוס — P1 לתכנון מודל ארגוני.
- סנכרון ER חי מול Prod — P0.

---

# 36. Views

## מצב קיים
| View | מטרה | שימוש | הרשאות | סטטוס | ודאות |
|------|------|-------|--------|--------|--------|
| — | לא נמצאו Views ב-types (`Views: never`) ולא `CREATE VIEW` במיגרציות | — | — | אין Views מתועדים בקוד | V3 להיעדר בקוד; **V5** אם קיימים Views שנוצרו ידנית ב-Prod |

## ניתוח
המערכת מסתמכת על טבלאות + RPC/Edge ולא על Views מתועדים ב-repo.

## סיכונים
Views לא מתועדים ב-Prod לא ייכללו בביקורת — יש לאמת ב-catalog חי.

## המלצות / עדיפות
| המלצה | עדיפות |
|--------|--------|
| שאילתת `pg_views` ב-Prod (RO) | P1 |

---

# 37. Functions

## מצב קיים — מלאי ממיגרציות
| Function | מטרה | ב-types RPC? | SECURITY | search_path בכותרת (מיגרציה) | מי מפעיל (לפי קוד/מיגרציה) | סיכונים אפשריים | ודאות |
|----------|------|--------------|----------|----------------------------------|------------------------------|------------------|--------|
| `allocate_incident_event_number` | הקצאת מספר אירוע לפי חברה | כן | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `crm_can_access_lead` | בדיקת גישה לליד CRM | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `crm_can_access_row` | בדיקת גישה לשורת CRM | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `crm_touch_updated_at` | updated_at ל-CRM | לא | לא צוין במפורש בכותרת שנסרקה | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | נמוך יחסית / לא ניתן לאמת | V3 |
| `driver_assigned_plates` | לוחיות רכב משויכות לנהג | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `driver_can_view_document_metadata` | האם נהג רשאי לצפות במטא-דאטה | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `driver_may_register_document_metadata` | האם נהג רשאי לרשום מטא-דאטה | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `driver_profile_names` | שמות פרופיל נהג | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `ensure_single_default_declaration_template` | תבנית הצהרה ברירת מחדל יחידה | לא | לא צוין במפורש בכותרת שנסרקה | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | נמוך יחסית / לא ניתן לאמת | V3 |
| `export_schema_ddl` | ייצוא DDL של הסכמה | כן | DEFINER | כן | RPC — GRANT EXECUTE ל-authenticated (מיגרציה) | חשיפת מבנה סכמה למשתמש authenticated אם נגיש ב-Prod | V3 |
| `get_user_company` | החזרת שם חברת המשתמש | כן | DEFINER | כן | מדיניות RLS / קריאות אפליקציה | הרשאות מורחבות (DEFINER) | V3 |
| `get_user_role` | החזרת תפקיד משתמש | כן | DEFINER | כן | מדיניות RLS / קריאות אפליקציה | הרשאות מורחבות (DEFINER) | V3 |
| `handle_new_user` | טיפול במשתמש חדש מ-auth.users | לא | DEFINER | כן | Trigger על auth.users | הרשאות מורחבות (DEFINER) | V3 |
| `has_role` | בדיקת תפקיד | כן | DEFINER | כן | מדיניות RLS / קריאות אפליקציה | הרשאות מורחבות (DEFINER) | V3 |
| `marketing_can_access_customer` | בדיקת גישה ללקוח בשיווק | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `marketing_touch_leads_updated_at` | updated_at ללידי שיווק | לא | לא צוין במפורש בכותרת שנסרקה | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | נמוך יחסית / לא ניתן לאמת | V3 |
| `marketing_touch_updated_at` | updated_at לשיווק | לא | לא צוין במפורש בכותרת שנסרקה | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | נמוך יחסית / לא ניתן לאמת | V3 |
| `notify_driver_on_exam` | התראת נהג על מבחן | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `notify_driver_on_pickup_assignment` | התראת נהג על שיבוץ איסוף | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `notify_managers_on_accident` | התראת מנהלים על תאונה | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `notify_managers_on_fault` | התראת מנהלים על תקלה | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `notify_managers_on_service_order` | התראת מנהלים על הזמנת שירות | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `notify_managers_on_service_order_urgent` | התראה על דחיפות | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `queue_voice_scenarios_on_fault` | תור תרחישי קול על תקלה | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `queue_voice_scenarios_on_service_order` | תור תרחישי קול על הזמנת שירות | לא | DEFINER | כן | Triggers על INSERT/UPDATE | הרשאות מורחבות (DEFINER) | V3 |
| `set_deal_number` | מספר עסקה | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `set_declaration_templates_updated_at` | עדכון updated_at לתבניות | לא | לא צוין במפורש בכותרת שנסרקה | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | נמוך יחסית / לא ניתן לאמת | V3 |
| `set_exchange_number` | מספר החלפת רכב | לא | DEFINER | כן | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `set_supplier_number` | מספר ספק | לא | DEFINER | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `set_work_order_number` | מספר הזמנת עבודה | לא | DEFINER | לא זוהה בכותרת / לא ניתן לאמת – V5 | RLS/Triggers/RPC לפי שימוש בקוד | הרשאות מורחבות (DEFINER) | V3 |
| `update_updated_at_column` | עדכון עמודת updated_at | לא | לא צוין במפורש בכותרת שנסרקה | כן | RLS/Triggers/RPC לפי שימוש בקוד | נמוך יחסית / לא ניתן לאמת | V3 |

### פעילות ב-Production
| Function / התנהגות | ראיה | ודאות |
|--------------------|------|--------|
| משלוחי התראות / counters | E2E יצר deliveries; מיגרציות `allocate_incident_event_number` | V1 לעקיף; V3 לפונקציה עצמה |
| יתר הפונקציות | לא ניתן לאמת פעילות חיה – V5 | V5 |

## סיכונים
- ריבוי SECURITY DEFINER — דורש ביקורת גוף הפונקציות והרשאות EXECUTE ב-Prod.
- `export_schema_ddl` מול authenticated — סיכון מידע אם קיים ב-Prod.
- פער: 31 פונקציות במיגרציות מול 5 ב-types.

## המלצות / עדיפות
| המלצה | עדיפות |
|--------|--------|
| Inventory חי של routines + privileges | P0 |
| סקירת DEFINER + ביטול GRANT עודף ל-`export_schema_ddl` אם לא נדרש | P1 |

---

# 38. Triggers

## מצב קיים
| Trigger | טבלה | מועד | מטרה (לפי שם/קישור לפונקציה) | סטטוס בקוד | ודאות |
|---------|-------|------|----------------------------------|------------|--------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | יצירת פרופיל/טיפול במשתמש חדש | מוגדר במיגרציה | V3 |
| `on_fault_notify_managers` | `faults` | AFTER INSERT | התראה על תקלה | מוגדר במיגרציה | V3 |
| `on_accident_notify_managers` | `accidents` | AFTER INSERT | התראה על תאונה | מוגדר במיגרציה | V3 |
| `on_service_order_created` | `service_orders` | AFTER INSERT | התראה על הזמנת שירות | מוגדר במיגרציה | V3 |
| `on_service_order_urgency_change` | `service_orders` | AFTER UPDATE | התראה על דחיפות | מוגדר במיגרציה | V3 |
| `trg_set_supplier_number` | `suppliers` | BEFORE INSERT | מספור ספק | מוגדר במיגרציה | V3 |
| `trg_set_work_order_number` | `supplier_work_orders` | BEFORE INSERT | מספור הזמנה | מוגדר במיגרציה | V3 |
| `set_deal_number_trigger` | `customer_deals` | BEFORE INSERT | מספור עסקה | מוגדר במיגרציה | V3 |
| `set_exchange_number_trigger` | `vehicle_exchanges` | BEFORE INSERT | מספור החלפה | מוגדר במיגרציה | V3 |
| `update_driving_exams_updated_at` | `driving_exams` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_notify_driver_on_exam` | `driving_exams` | AFTER INSERT | התראת נהג על מבחן | מוגדר במיגרציה | V3 |
| `trg_call_logs_updated` | `call_logs` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_voice_campaigns_updated` | `voice_campaigns` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_voice_prompts_updated` | `voice_prompts` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `update_voice_scenarios_updated_at` | `voice_scenarios` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_voice_scenarios_fault` | `faults` | AFTER INSERT | תור תרחיש קול | מוגדר במיגרציה | V3 |
| `trg_voice_scenarios_service_order_ins` | `service_orders` | AFTER INSERT | תור תרחיש קול | מוגדר במיגרציה | V3 |
| `trg_voice_scenarios_service_order_upd` | `service_orders` | AFTER UPDATE OF treatment_status | תור תרחיש קול | מוגדר במיגרציה | V3 |
| `update_practical_exams_updated_at` | `practical_driving_exams` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `update_pickup_appointments_updated_at` | `pickup_appointments` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_notify_driver_pickup_insert` | `pickup_appointments` | AFTER INSERT | התראת נהג | מוגדר במיגרציה | V3 |
| `trg_notify_driver_pickup_update` | `pickup_appointments` | AFTER UPDATE OF driver_id | התראת נהג | מוגדר במיגרציה | V3 |
| `trg_marketing_profiles_updated` | `marketing_profiles` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_marketing_connections_updated` | `marketing_connections` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_marketing_ai_setup_updated` | `marketing_ai_setup` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_crm_leads_updated` | `crm_leads` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_crm_tasks_updated` | `crm_tasks` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_crm_ai_updated` | `crm_ai_insights` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_marketing_leads_updated` | `marketing_leads` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |
| `trg_declaration_templates_single_default` | `declaration_templates` | BEFORE INSERT OR UPDATE OF is_default | אכיפת ברירת מחדל יחידה | מוגדר במיגרציה | V3 |
| `trg_declaration_templates_updated_at` | `declaration_templates` | BEFORE UPDATE | עדכון חותמת זמן | מוגדר במיגרציה | V3 |

## הערות
- סטטוס פעיל ב-Prod: **לא ניתן לאמת – V5** ללא catalog חי.
- חלק מה-Triggers קוראים לפונקציות NOTIFY/QUEUE — תלות ב-Extensions/`pg_net` אם רלוונטי (פעילות Extension ב-Prod = V5).

## סיכונים / המלצות
| סיכון | עדיפות |
|--------|--------|
| Trigger כבוי/חסר ב-Prod מול קוד → התראות לא נשלחות | P1 — אימות חי |
| כפילויות/סדר הרצה לא מתועד | P2 |

---

# 39. Indexes

## מצב קיים — מלאי ממיגרציות
| Index | טבלה | עמודות | Unique? | מטרה משוערת | שימוש בפועל | ודאות |
|-------|-------|---------|---------|---------------|-------------|--------|
| `idx_driver_notifications_user_id` | `driver_notifications` | `user_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_driver_notifications_created_at` | `driver_notifications` | `created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `profiles_user_number_unique` | `profiles` | `user_number` | כן | ייחודיות | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_driving_exams_driver_id` | `driving_exams` | `driver_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_driving_exams_token` | `driving_exams` | `token` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_driving_exams_company` | `driving_exams` | `company_name` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_scenario_runs_pending` | `voice_scenario_runs` | `status, scheduled_at` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_practical_exams_driver` | `practical_driving_exams` | `driver_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_practical_exams_company` | `practical_driving_exams` | `company_name` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_pickup_company` | `pickup_appointments` | `company_name` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_pickup_driver` | `pickup_appointments` | `driver_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_pickup_date` | `pickup_appointments` | `scheduled_date` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `customers_user_id_unique` | `customers` | `user_id` | כן | ייחודיות | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `user_access_codes_user_id_idx` | `user_access_codes` | `user_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `user_access_codes_active_idx` | `user_access_codes` | `user_id, is_active` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `registration_requests_status_idx` | `registration_requests` | `status, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_verification_codes_email_purpose_idx` | `auth_verification_codes` | `email, purpose, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_verification_codes_active_idx` | `auth_verification_codes` | `email, purpose` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_login_challenges_active_idx` | `auth_login_challenges` | `id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_account_lockouts_locked_idx` | `auth_account_lockouts` | `locked_until` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_audit_log_created_idx` | `auth_audit_log` | `created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_audit_log_user_idx` | `auth_audit_log` | `user_id, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_audit_log_email_idx` | `auth_audit_log` | `email, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_audit_log_event_idx` | `auth_audit_log` | `event_type, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `auth_password_reset_tokens_active_idx` | `auth_password_reset_tokens` | `token_hash` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `deploy_runs_created_at_idx` | `deploy_runs` | `created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `deploy_runs_commit_sha_idx` | `deploy_runs` | `commit_sha` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `deploy_runs_status_idx` | `deploy_runs` | `status` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_profiles_customer` | `marketing_profiles` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_contacts_customer` | `marketing_contacts` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_sites_customer` | `marketing_sites` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_campaigns_customer` | `marketing_campaigns` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_customers_service_type` | `customers` | `service_type` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_leads_customer` | `crm_leads` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_leads_status` | `crm_leads` | `status` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_leads_created` | `crm_leads` | `created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_tasks_customer` | `crm_tasks` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_tasks_lead` | `crm_tasks` | `lead_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_tasks_status` | `crm_tasks` | `status` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_activity_customer` | `crm_activity_log` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_activity_created` | `crm_activity_log` | `created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_crm_ai_customer` | `crm_ai_insights` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_leads_customer` | `marketing_leads` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_leads_status` | `marketing_leads` | `status` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_metrics_customer` | `marketing_metrics` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_activity_customer` | `marketing_activity_log` | `customer_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_marketing_activity_created` | `marketing_activity_log` | `created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_requests_entity` | `document_requests` | `entity_type, entity_id, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_requests_company` | `document_requests` | `company_name, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_requests_status` | `document_requests` | `status` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_requests_token_hash` | `document_requests` | `token_hash` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_request_events_request` | `document_request_events` | `request_id, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_versions_entity` | `document_versions` | `entity_type, entity_id, document_type_key, version_no DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_document_versions_current` | `document_versions` | `entity_type, entity_id, document_type_key` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `faults_company_event_number_uidx` | `faults` | `company_name, event_number` | כן | ייחודיות מספר אירוע בחברה | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `accidents_company_event_number_uidx` | `accidents` | `company_name, event_number` | כן | ייחודיות מספר אירוע בחברה | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `incident_notification_deliveries_dedupe_uidx` | `incident_notification_deliveries` | `incident_kind, incident_id, channel, recipient` | כן | מניעת כפילויות משלוח | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `incident_notification_deliveries_incident_idx` | `incident_notification_deliveries` | `incident_kind, incident_id, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `incident_notification_deliveries_dedupe_uidx` | `incident_notification_deliveries` | `incident_kind, incident_id, channel, recipient` | כן | מניעת כפילויות משלוח | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `incident_notification_deliveries_incident_idx` | `incident_notification_deliveries` | `incident_kind, incident_id, created_at DESC` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `incident_notification_deliveries_provider_message_id_idx` | `incident_notification_deliveries` | `provider_message_id` | לא | חיפוש DLR / message id | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_declaration_templates_company` | `declaration_templates` | `company_name` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `declaration_templates_one_default_per_company` | `declaration_templates` | `company_name` | כן | ייחודיות | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |
| `idx_driver_declarations_template_id` | `driver_declarations` | `template_id` | לא | ביצועים / אילוץ | לא ניתן לאמת – V5 (`pg_stat_user_indexes`) | V3 להגדרה / V5 לשימוש |

## Indexes חסרים / מיותרים
| שאלה | מסקנה | ודאות |
|-------|--------|--------|
| האם חסרים Indexes? | **לא ניתן לאמת – V5** בלי תוכניות שאילתה / סטטיסטיקות Prod | V5 |
| האם יש Indexes מיותרים? | **לא ניתן לאמת – V5** | V5 |
| המלצות ביצועים | אין המלצת שינוי מבני בלי ראיית עומס — רק אימות חי של אינדקסי DLR/event_number מול שאילתות אמת | V5 |

## סיכונים / המלצות
- להריץ RO ב-Prod: רשימת אינדקסים + `pg_stat_user_indexes` — P1.

---

# 40. Storage

## מצב קיים
| Bucket | Public/Private | Policies (מיגרציות) | קריאה | כתיבה | מחיקה | סוגי קבצים (מיגרציית staging) | שימוש בפועל | הערות | ודאות |
|--------|----------------|----------------------|-------|-------|-------|-------------------------------|--------------|-------|--------|
| `documents` | במיגרציית staging: `public=true`; ב-Prod **לא ניתן לאמת דגל public** (API bucket list החזיר `[]` ל-anon) | ~15 מדיניות על `storage.objects` לאורך מיגרציות (היסטוריית שינויים) | SELECT ל-public/`authenticated` לפי גרסאות policy | INSERT ל-authenticated (ולעיתים anonymous להצהרות) | DELETE מוגבל לבעלים/מנהלים לפי path | jpeg/png/webp/gif/pdf/msword/docx; limit 50MB במיגרציית staging | list תחת `documents` עם anon החזיר תיקיית UUID — **נוכחות אובייקטים/תיקיות ב-Prod** | מיגרציה `20260608130000_...` מסומנת "staging ONLY"; מצב Prod המדויק של policies — V5 | V2 לנוכחות; V3 למיגרציות; V5 ל-policies חיים |

### Buckets נוספים
לא נמצאו INSERT ל-buckets אחרים במיגרציות. מלאי buckets מלא ב-Prod: **לא ניתן לאמת – V5** (list עם anon ריק / ללא Dashboard).

### כיצד נבדק
- קריאת מיגרציות Storage.
- RO: `GET /storage/v1/bucket` → `[]` עם anon.
- RO: `POST /storage/v1/object/list/documents` → תשובה עם שם תיקייה.
- לא בוצעו upload/delete.

## סיכונים
- Bucket `public=true` בסקריפט staging + policy `documents_read_public` — אם זהה ב-Prod, מסמכים עלולים להיות קריאים פומבית לפי path ידוע.
- Anonymous upload policies להצהרות — סיכון ניצול אם פעיל ב-Prod.
- אי-ודאות מלאי buckets/policies חיים.

## המלצות / עדיפות
| המלצה | עדיפות |
|--------|--------|
| ייצוא buckets+policies מ-Dashboard Prod | P0 |
| אימות שאין קריאה פומבית למסמכים רגישים | P0 |
| סקירת anonymous upload | P1 |

---

# Database Risk Summary

| מזהה | סיכון | ראיה | ודאות | חומרה | עדיפות |
|------|--------|------|--------|--------|--------|
| DR-01 | פער types.ts מול מיגרציות/Prod (28 טבלאות + deliveries) | השוואת מלאי; E2E | V1/V3 | גבוה | P0 |
| DR-02 | אין dump חי — Policies/Indexes/Triggers ב-Prod לא מאומתים | מתודולוגיה | V5 | גבוה | P0 |
| DR-03 | טבלאות CRM/Marketing עם RLS ללא Policies בקוד | migrations | V3 | גבוה (או lockdown או שכחה) | P0 |
| DR-04 | Storage `documents` — חשש public read / anon upload | migrations + list RO | V2/V3 | גבוה | P0 |
| DR-05 | ריבוי SECURITY DEFINER | migrations | V3 | בינוני-גבוה | P1 |
| DR-06 | `export_schema_ddl` ל-authenticated | GRANT במיגרציה | V3 | בינוני | P1 |
| DR-07 | Tenancy מבוסס `company_name` ללא FK ארגוני | מבנה טבלאות | V3 | גבוה ל-Enterprise | P1 |
| DR-08 | Extensions `pg_cron`/`pg_net` — מצב Prod לא מאומת | migrations | V5 | בינוני | P2 |
| DR-09 | גרסת PostgreSQL לא ידועה | — | V5 | נמוך-בינוני | P2 |
| DR-10 | שימוש באינדקסים לא מאומת | אין pg_stat | V5 | נמוך | P2 |
| DR-11 | Views ידניים אפשריים לא מתועדים | היעדר בקוד | V5 | נמוך | P3 |

---

# Database Health Score

**שיטה (מתוך 100, ציון זמני):** מבנה/שלמות תיעוד 25 · אבטחה(RLS/Storage/DEFINER) 25 · עקביות קוד↔Prod 20 · ביצועים/אינדקסים 10 · תפעול/Extensions/גרסה 10 · מוכנות ביקורת 10.

| רכיב | ניקוד | נימוק קצר |
|------|--------|-----------|
| מבנה/תיעוד | 12/25 | מלאי מיגרציות עשיר אך types חסר ואין catalog חי |
| אבטחה | 10/25 | RLS מוגדר בהרחבה בקוד; Storage/Policies חיים ו-DEFINER לא אומתו |
| עקביות קוד↔Prod | 8/20 | סתירת deliveries/types; OpenAPI לא נגיש ב-anon |
| ביצועים | 4/10 | אינדקסים קיימים בקוד; שימוש לא מאומת |
| תפעול | 4/10 | Extensions/גרסה/גיבויים V5 |
| מוכנות ביקורת | 3/10 | חסר dump, DPA/גיבויים מחוץ להיקף אך קריטי ל-DB |

### **Database Health Score: 41 / 100**
**ציון זמני עקב פערי מידע (V5) — אינו מחליף ביקורת SQL חיה.**

---

# Database Readiness Score

מוכנות ללקוחות Enterprise (מתוך 100, זמני):

| קריטריון | ניקוד |
|----------|--------|
| סכמה מתועדת ומסונכרנת | 6/20 |
| RLS/Tenancy מאומת חי | 5/20 |
| Storage מאובטח ומאומת | 4/15 |
| גיבויים/שחזור מאומתים | 0/15 (V5) |
| ניטור/ביצועים | 3/10 |
| הפרדת סביבות DB | 8/10 (פרויקטי Prod/Staging נפרדים מתועדים/מאומתים חלקית) |
| בקרת שינויים/מיגרציות | 7/10 |

### **Database Readiness Score: 33 / 100**
**ציון זמני.** מסקנה: **לא מוכן להצהרת Enterprise** על אבטחת נתונים לפני אימות חי של Policies, Storage, גיבויים וסנכרון types.

---

# רשימת פערי מידע (V5)

| נושא | מה חסר לאימות |
|------|----------------|
| גרסת PostgreSQL | חיבור RO / Dashboard |
| מספר Schemas חי | `information_schema` / Dashboard |
| מלאי טבלאות/עמודות חי ב-Prod | dump או OpenAPI מורשה |
| Policies חיות | `pg_policies` export |
| Triggers פעילים חי | `pg_trigger` |
| Functions+privileges חי | `information_schema.routines` + grants |
| שימוש באינדקסים | `pg_stat_user_indexes` |
| Indexes חסרים/מיותרים | ניתוח שאילתות |
| Extensions פעילות | `\dx` / Dashboard |
| Buckets מלא + דגל public | Dashboard / service role RO |
| Storage policies חיות | Dashboard |
| Views ידניים | `pg_views` |
| גיבויים/PITR/RPO | Dashboard Supabase |
| תוכן/נפח טבלאות | שאילתות ספירה מאושרות |

---

# מסקנות כרך ה'

מסד הנתונים בקוד הוא PostgreSQL/Supabase עם סכמה רחבה (85 טבלאות במיגרציות, 57 ב-types), RLS נרחב, Triggers/Functions רבים, ו-Storage `documents`. **אין אימות catalog חי מלא מול Production**; קיימת סתירה מאומתת סביב `incident_notification_deliveries`. בריאות ומוכנות Enterprise נמוכות-בינוניות **בגלל פערי אימות**, לא בהכרח בגלל כשל מבני שהוכח.

### פעולות דחופות
1. Export schema/policies/buckets מ-Prod (RO).
2. סנכרון `types.ts`.
3. Audit Storage public/anon.
4. בדיקת טבלאות RLS ללא Policies.

### אישור מתודולוגיה
| בדיקה | תוצאה |
|--------|--------|
| סעיפים 33–40 | כן |
| אין שינוי במסד/תשתית/קוד מערכת | כן — מסמך בלבד |
| כל פער מסומן V5 | כן |

**סוף כרך ה' – מסד הנתונים**
