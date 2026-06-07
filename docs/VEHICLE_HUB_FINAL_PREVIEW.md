# סגירה סופית — כרטיס רכב (Preview בלבד)

**לא בוצע:** Commit · Merge · Push · Production

## היקף (חשוב)

**כרטיס הרכב החדש (VehicleHub + דשבורד) — נשאר כפי שנבנה. לא נמחק ולא משתנה.**

משלימים **רק** את הזרימות הבאות:

| חלק | סטטוס |
|-----|--------|
| פתיחת רכב חדש — שלב 1 | ✓ מספר רכב · פנימי · רישוי |
| פתיחת רכב חדש — שלב 2 (טופס מלא) | ✓ סעיפים 1–5 · ביטול · מילוי רישוי לסעיף 1 |
| אחרי שמירה → Hub | ✓ |
| משרד הרישוי / התחבורה | ✓ `fetchVehicleFromGov` + מילוי יצרן/דגם/שנה/סוג/טסט |
| יבוא רכבים (מסך + מהכרטיס) | ✓ + רישום בהיסטוריה |
| ארכיון (אישור + היסטוריה) | ✓ |
| מחק רכב (אישור + היסטוריה) | ✓ |
| Preview / צילומים | ✓ `test-results/final-*.png` |

**אישור שדות:** `docs/VEHICLE_FORM_FIELD_AUDIT.md` — השוואה שדה מול שדה מול `VehicleForm` המקורי.

**כן** — אחרי שמירת רכב חדש המערכת פותחת אוטומטית את **VehicleHub** (דשבורד + 4 אזורים).

הטופס עצמו נשאר `VehicleForm` (חובה למשרד הרישוי ולכל השדות) — **אין** מסך ישן אחרי השמירה.

## דשבורד — כרטיסים קטנים

**3 כרטיסים מאוגדים (לחיצים):**

- ביטוחים ורישיונות (חובה, מקיף, צד ג׳, רישיון, טסט)
- מסמכים
- חוסרים והתראות (+ חוסר אחר ידני)

**כרטיסים נפרדים בדשבורד:**

סטטוס · טיפול הבא · טיפול אחרון · בדיקות · ק״מ · התראות · שינוע · ממתין לאישור

**מספר רכב + פנימי** — בכל מקום (דשבורד, היסטוריה, פעולות, כותרות).

## 3 כפתורים קבועים בתחתית כרטיס

יבוא רכב · ארכיון רכב (אישור) · מחק רכב (אישור) — נרשמים בהיסטוריה.

## Preview

| מה | URL |
|----|-----|
| כרטיס דמו | http://localhost:8082/dev/vehicle-card |
| שלב 1 (ויזואלי) | http://localhost:8082/dev/vehicle-new-form |
| **שלב 2 — אותו VehicleForm כמו /vehicles** | http://localhost:8082/dev/vehicle-form-live/full |
| שלב 1 — VehicleForm אמיתי | http://localhost:8082/dev/vehicle-form-live |
| אחרי login | http://localhost:8082/vehicles → רכב חדש |
| מדריך זרימות | http://localhost:8082/dev/vehicle-flows |
| משולב במערכת (HTML) | http://localhost:8082/vehicle-hub-app-preview.html |
| Hub HTML | http://localhost:8082/vehicle-hub-full-preview.html |
| יבוא (התחברות) | http://localhost:8082/vehicle-import |

צילומים (`test-results/`):

| קובץ | תוכן |
|------|------|
| `final-dashboard-desktop.png` | דשבורד — כרטיסים קטנים |
| `final-dashboard-mobile.png` | דשבורד מובייל |
| `final-new-vehicle-form-step1.png` | שלב 1 |
| `final-new-vehicle-form-step1-live.png` | שלב 1 — VehicleForm אמיתי |
| `final-new-vehicle-form-full-live.png` | שלב 2 — סעיפים 1–5 |
| `final-new-vehicle-form-gov-filled.png` | מילוי רישוי בסעיף 1 |
| `final-new-vehicle-form-cancel.png` | ביטול / יציאה |
| `final-bottom-actions.png` | ארכיון · מחק (בכרטיס) |
| `final-gov-registry-preview.png` | משרד הרישוי (HTML משולב) |
| `final-insurance-drilldown.png` | ביטוחים ורישיונות — פירוט |
| `final-gaps-drilldown.png` | חוסרים — Sheet |
| `final-gaps-alerts-preview.png` | חוסרים — HTML |
| `final-details-section.png` | פרטי רכב |
| `final-history-section.png` | היסטוריה |
| `final-bottom-actions.png` | 3 כפתורים תחתית |
| `final-vehicle-import.png` | יבוא רכבים |
| `final-archive-confirm-preview.png` | ארכיון |
| `final-delete-confirm-preview.png` | מחיקה |
| `final-app-integrated-preview.png` | מערכת משולבת |
| `final-flows-guide.png` | מדריך זרימות |

הרצה: `DEV_PORT=8082 node scripts/capture-vehicle-hub-screenshots.mjs`
