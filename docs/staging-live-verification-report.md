# דוח בדיקה חיה — dalia-staging

**תאריך:** 2026-06-08  
**פרויקט:** `usfeoerkpcafxxlyuldl` (dalia-staging)  
**Production:** לא נגע

---

## מה בוצע

| שלב | סטטוס | פירוט |
|-----|--------|--------|
| **Push ל-staging** | ✅ | `main` → `5e6ab06` על `orin1607-ctrl/future-craft-core` |
| **GitHub Pages deploy** | ⏳ | מופעל אוטומטית ב-push ל-`main` |
| **Migration `vehicle_color`** | ✅ | `supabase db query --linked` |
| **Migration `end_or_scrap_date`** | ✅ | אותו קובץ SQL |
| **Migration `documents` bucket** | ✅ | bucket `documents` קיים ב-DB (`public: true`) |
| **בדיקת סכימה** | ✅ | `vehicle_color` + `license_plate` — `audit-staging-schema` OK |
| **בדיקה חיה מלאה (דפדפן)** | ⏸ | חסר `TEST_EMAIL` + `TEST_PASSWORD` |

---

## קישור staging

https://orin1607-ctrl.github.io/future-craft-core/

(המתן 2–5 דקות אחרי Push לסיום ה-deploy)

---

## הוכחות DB (לאחר Migration)

```json
// storage.buckets
{ "id": "documents", "name": "documents", "public": true }

// vehicles columns probe
vehicleCols.ok = true
includes: vehicle_color, license_plate, ...
```

דוח: `test-results/staging-migrations-report.json`

---

## בדיקה חיה — השלמה נדרשת

הסקריפט `scripts/capture-staging-live.mjs` מבצע:

1. רכב בדיקה אמיתי  
2. Save → Reload → Edit → Hub  
3. מסמכים scoped  
4. חזרה לכרטיס  
5. בידוד (faults scoped)  
6. צילומי מסך → `docs/screenshots/staging-live/`  
7. הוכחת DB ב-`report.json`

**להרצה (מחוץ לצ'אט):**

הוסף ל-`.env.local`:

```
TEST_EMAIL=...
TEST_PASSWORD=...
```

ואז:

```bash
node scripts/capture-staging-live.mjs
```

או מול localhost אחרי build:

```bash
npm run build && npm run preview
node scripts/capture-staging-live.mjs http://localhost:4173/future-craft-core/
```

---

## מה לא בוצע / למה

| פריט | סיבה |
|------|------|
| צילומים חיים | אין credentials בסביבה |
| E2E insert | `e2e-dalia-save.json` → SKIP |
| `gh run list` | `gh` לא מחובר |

---

## אישורי בטיחות

- ❌ לא נגע ב-`dalia-car.online`
- ❌ לא נגע ב-`qasomfndnjuixgjmjwcm` (dalia-new)
- ✅ Migrations רק על `usfeoerkpcafxxlyuldl`
- ✅ Push רק ל-repo staging (GitHub Pages → staging Supabase)
