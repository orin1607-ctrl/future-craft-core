# UX Redesign — Phase 1 (dalia-staging)

**סביבה:** dalia-staging · `usfeoerkpcafxxlyuldl`  
**סטטוס:** מוכן לבדיקה · **ללא Deploy / Migration / Production**

---

## Wireframe — דשבורד ראשי (Desktop + Mobile)

```
┌─────────────────────────────────────────────────────────────┐
│  דליה — מרכז שליטה                                          │
│  [שם משתמש] · [חברה]                                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ 🚗 רכבים │  │ 👤 נהגים │  │ 📡 מעקב  │                  │
│  │   [N]    │  │   [N]    │  │  [!N]    │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ 🏢 מנהלי │  │ 📊 דוחות │  │ ⚙️ מנהל  │  (super_admin)  │
│  │    צי    │  │          │  │    על    │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│  פעולות מתבצעות מתוך כרטיס הרכב / נהג / מנהל צי            │
└─────────────────────────────────────────────────────────────┘

Mobile: אותם כרטיסים — עמודה אחת, כרטיסים גדולים (min-h 132px)
Bottom nav: רק "בית" → /dashboard
```

## Wireframe — מעקב רכבים

```
/vehicle-tracking
├─ סיכום (14 כרטיסי סינון)
├─ פאנל סינון מתקדם
└─ רשימת צי (טבלה desktop / כרטיסים mobile)
     ↓ לחיצה על רכב
/vehicle-tracking?vehicleId=UUID
├─ פרטי רכב (קריאה בלבד)
├─ טאבים: מצב נוכחי · פתוח · היסטוריה
└─ [כניסה לכרטיס הרכב] → /vehicles?vehicleId=&view=hub
```

## Wireframe — סרגל צדדי (רזה)

```
ניווט
  בית
  רשימת רכבים
  רשימת נהגים
  מעקב רכבים
  מנהלי צי
  התראות
  דוחות
  לקוחות
  חירום
  צ'אט

מנהל על (super_admin בלבד)
  מנהל על → /admin-home
```

---

## קבצים שנוצרו

| קובץ | תיאור |
|------|--------|
| `src/components/home/HomeWorldCard.tsx` | כרטיס עולם גדול (Dalia) |
| `src/components/home/HomeDashboard.tsx` | דשבורד 6 כרטיסים |
| `src/pages/AdminHome.tsx` | מרכז מנהל על |
| `src/pages/FleetManagers.tsx` | רשימה + כרטיס מנהל צי |
| `src/pages/VehicleTracking.tsx` | מסך מעקב רכבים |
| `src/lib/vehicleTrackingData.ts` | אגרגציית נתוני מעקב |
| `src/components/vehicle-tracking/TrackingSummaryGrid.tsx` | כרטיסי סיכום |
| `src/components/vehicle-tracking/TrackingFilterPanel.tsx` | סינון |
| `src/components/vehicle-tracking/TrackingFleetList.tsx` | רשימת צי |
| `src/components/vehicle-tracking/TrackingVehicleDetail.tsx` | פרטי רכב + קישור ל-Hub |

## קבצים ששונו

| קובץ | שינוי |
|------|--------|
| `src/pages/Dashboard.tsx` | הוחלף ב-HomeDashboard (נהג/לקוח פרטי ללא שינוי) |
| `src/App.tsx` | Routes חדשים |
| `src/components/BottomNav.tsx` | סרגל רזה + מובייל בית בלבד |
| `src/hooks/useHiddenButtons.ts` | MANAGEABLE_BUTTONS מעודכן |
| `src/index.css` | `.home-world-card`, `.filter-input` |

## Routes שנוספו

| Route | קומפוננטה |
|-------|-----------|
| `/vehicle-tracking` | VehicleTracking |
| `/admin-home` | AdminHome |
| `/fleet-managers` | FleetManagers |

**לא נמחק אף Route קיים.**

## מה לא נגענו

- 291 שדות · VehicleNewFormDalia · daliaVehiclePersist · daliaVehicleLoad
- מנגנון שמירה · Vehicle Hub · פתיחה/עריכת רכב
- מסמכים · תקלות · טיפולים · ביטוחים · DB

## בדיקת 291 שדות

```
inNewForm: 291 | inEditForm: 291 | saved: 291 | loaded: 291
hubDisplayCapable: 291 | roundTripCapable: 291
anyFieldNotInHub: false | anyRoundTripFail: false
```

## השפעות

| נושא | השפעה |
|------|--------|
| דשבורד מנהל צי/על | הוסר עומס (~900 שורות); 6 כרטיסי עולמות במקום עשרות כפתורים |
| סרגל צדדי | ניווט בלבד; פעולות תפעוליות דרך כרטיסי ישויות |
| מובייל מנהל | תחתית: "בית" בלבד; ניווט דרך כרטיסי הדשבורד |
| מעקב רכבים | מסך חדש — צפייה/סינון בלבד; חיבור ל-Vehicle Hub |
| מנהלי צי | דף חדש — רשימה + כרטיס עם קישורי פעולה |
| מנהל על | דף חדש — 6 כרטיסים לניהול מערכת |
| DB / Supabase | **ללא שינוי** — אין migration חדש |

## Preview

להרצה מקומית:

```bash
npm run dev
```

לאחר התחברות ל-staging:
- `/dashboard` — דשבורד חדש
- `/vehicle-tracking` — מעקב צי
- `/fleet-managers` — מנהלי צי
- `/admin-home` — מנהל על (super_admin)

**לא בוצע Deploy.**
