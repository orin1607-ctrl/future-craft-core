# חיפוש אחרון — זהות חשבון Gupshup (לפני הגדרה מחדש)

**תאריך:** 2026-07-20  
**מטרה:** למצוא רמז לאיזה חשבון Gupshup שייכת האפליקציה — **לא** את ה-API Key.  
**נתוני מערכת:** `public/project-001/gupshup-account-hunt.json`

## פסק דין

**לא נמצא** אימייל התחברות ל-Gupshup, Workspace ID או Account ID  
בשום מקום: git history, Actions, migrations, docs, README, scripts, deploy/VPS, configs.

**כן נמצאו** מזהי אפליקציה חזקים (מספיקים לפנייה ל-Gupshup Support / חיפוש במייל):

| שדה | ערך |
|-----|------|
| App Name | `DaliaVehicle` |
| App ID | `496709e8-b5fc-4de9-9c75-bc87455482dd` |
| Source (WA) | `972546500305` (= `054-650-0305`) |

## מאיפה זה הגיע

1. **2026-06-10** — `Naeem Dosh <m.naeem.uet.cs@gmail.com>`  
   הכניס לראשונה ב-UI: App=`DaliaVehicle`, Source=`972546500305`  
   (`GupshupWhatsAppSection.tsx`)

2. **2026-07-16** — `orin1607-ctrl <orin1607@gmail.com>` (+ Cursor)  
   הכניס ל-Edge `send-whatsapp-message` את אותם defaults +  
   **App ID** `496709e8-b5fc-4de9-9c75-bc87455482dd`

3. **לפני ה-Git** — ב-Staging כבר הייתה פונקציה + Secret  
   (`nightly-audit-2026-06-10`: secret configured, אבל Gupshup החזיר 401)

## מה כן/לא ב-Secrets (שמות בלבד)

| סביבה | API_KEY | APP_NAME | SOURCE |
|-------|---------|----------|--------|
| Staging | כן | כן | לא |
| Production | לא | לא | לא |

ערכי Secrets **לא קריאים** דרך API — לכן אי אפשר לחלץ מהם אימייל חשבון.

## מה לא נמצא

- אימייל פורטל Gupshup  
- Workspace / Account / Partner ID  
- הקובץ שצוטט ב-FULL-AUDIT: `gupshup-whatsapp-real-send-test.json` (לא קיים ב-git)  
- מפתחות על VPS (`FOUND_COUNT 0`)

## מי כנראה יודע את החשבון

1. **אתה** (`orin1607@gmail.com`) — חפש במייל/סיסמאות:  
   `Gupshup`, `DaliaVehicle`, `496709e8`, `0546500305`
2. **Naeem** (`m.naeem.uet.cs@gmail.com`) — בנה את מסך ההגדרות עם שם האפליקציה והמספר

## אם מחליטים להגדיר מחדש

אין חסימה טכנית מחיפוש זה. אפשר ליצור אפליקציה חדשה ב-Gupshup,  
להגדיר Edge Secrets ב-Staging+Production, ולעדכן defaults / secrets.  
אם המספר `054-650-0305` עדיין בבעלותך — עדיף לשמור אותו כ-Source.
