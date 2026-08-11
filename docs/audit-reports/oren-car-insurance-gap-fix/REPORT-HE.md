# דוח תיקון — סתירת ביטוח + מתגי הדגשה אדומה (Staging)

**תאריך:** 2026-08-11  
**Branch:** `feat/incident-alerts-staging`  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/  
**Supabase:** `usfeoerkpcafxxlyuldl`  
**Production:** לא נגע

## מה היה לפני

- "ביטוחים ורישיונות" הציג **בתוקף** לפי תאריך בלבד
- "חוסר ביטוח" נדלק גם על **מסמך חסר** (כולל מקיף שלא הוגדר)
- `insurance_alerts_red_enabled` שלט גם ב**קיום** החוסר, לא רק בצבע
- 299 רכבים עם סתירה (בארי + דרכי חיים)

## מה שונה

### לוגיקת ביטוח (`vehicleInsuranceCoverage.ts`)
- הפרדה: **כיסוי/תוקף** מול **מסמך חסר**
- `חוסר ביטוח` = רק בעיית תוקף (לא הוגדר / פג / מתקרב)
- מסמך חסר = `חסר מסמך ביטוח חובה/מקיף` (כש-required fields / require_insurance_docs)
- ביטוח מקיף נבדק רק כש**רלוונטי**
- `insurance_alerts_red_enabled` = צבע בלבד (לא מסתיר חוסר)

### מתגי חברה חדשים (`company_settings`)
- `show_insurance_attention_red` — "הצג 'יש לטפל' באדום"
- `show_gaps_attention_red` — "הצג 'דורש טיפול' באדום"
- per-company, תצוגה בלבד, ב-AlertSettings

## קבצים

| קובץ | שינוי |
|------|--------|
| `src/lib/vehicleInsuranceCoverage.ts` | חדש — לוגיקה מרכזית |
| `src/lib/vehicleInsuranceCoverage.test.ts` | חדש — 6 tests |
| `src/lib/companyAttentionRedSettings.ts` | חדש — טעינת מתגים |
| `src/lib/vehicleDashboardData.ts` | יישור gaps/missing docs |
| `src/components/vehicles/VehicleDashboard.tsx` | תצוגה + מתגים |
| `src/lib/vehicleHistory.ts` | countMissingDocs מיושר |
| `src/pages/AlertSettings.tsx` | UI מתגים + שמירה |
| `src/integrations/supabase/types.ts` | עמודות חדשות |
| `supabase/migrations/20260811120000_...sql` | Migration Staging |
| `scripts/apply-company-attention-red-migration-staging.mjs` | הרצת migration |

## Migration

**כן** — Staging בלבד: `20260811120000_company_attention_red_toggles_staging.sql`  
הוסיף ל-`company_settings`: `show_insurance_attention_red`, `show_gaps_attention_red` (DEFAULT true)

## Build / Tests

- **Build:** PASS — `index-XzenxcjZ.js`
- **Tests חדשים:** 9/9 PASS (insurance coverage + dashboard required fields)
- **Full suite:** 78/79 PASS — כשל יחיד קיים מראש ב-`documentRequestClient.test.ts` (לא קשור למשימה)

## לפני/אחרי — רכבי בדיקה

| UUID | לפני: חוסר ביטוח | אחרי: חוסר ביטוח |
|------|------------------|------------------|
| `928214e8…` (בארי 165) | כן (מסמך חסר) | **אין** (תאריך בתוקף, מסמך לא חובה) |
| `2a0cba63…` (דרכי חיים) | כן (מקיף חסר) | **אין** (חובה מלא, מקיף לא רלוונטי) |

## Regression

- 30/7/1: לא נגע (`vehicleExpiryReminders` — tests PASS)
- accidents `date`: לא נגע
- מתגי ביטוח קיימים: נשמרו

## מסקנה

**PASS** — מוכן לבדיקה ידנית ב-Staging אחרי Deploy.

**Production:** לא נגע.
