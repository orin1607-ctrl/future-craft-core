# הצעד הבא — אין API Key מהפורטל

**תאריך:** 2026-07-22  
**מצב:** App ID תקין · אין מפתחות גלויים · Create = Authentication Failed · תפריט API key לא פותח מסך אחר  
**Production:** לא בוצע · **Create נוסף בפורטל:** לא מבוקש

---

## פסק דין

אין מסלול טכני מהסוכן / Supabase / GitHub להעתיק את `GUPSHUP_API_KEY` מ-Staging ל-Production.  
הפורטל אצלך גם לא מאפשר חשיפה או יצירה.  
**הצעד הבא הוא שחזור גישת Owner / המפתח הקיים מחוץ ל-Create ב-UI.**

---

## סדר פעולות (עשה לפי הסדר)

### צעד 1 — Naeem (הכי סביר שיודע)

שלח ל-`m.naeem.uet.cs@gmail.com`:

```text
DaliaVehicle App ID 496709e8-b5fc-4de9-9c75-bc87455482dd
באיזה מייל Gupshup נוצרה האפליקציה?
מי Owner?
האם נשמר אצלך API Key / סיסמת פורטל?
Create API Key מחזיר Authentication Failed — צריך את המפתח ל-Production Secrets.
אל תשלח מפתח בצ'אט הציבורי — רק ליוני / מנהל סיסמאות.
```

אחרי שיש מפתח: הדבק ב-Prod Edge Secrets → כתוב **«סיימתי Gupshup»**.

### צעד 2 — Gupshup Support (אם Naeem לא פותר)

מייל ל-`dev-support@gupshup.io` / Support:

```text
App Name: DaliaVehicle
App ID: 496709e8-b5fc-4de9-9c75-bc87455482dd
WABA / source: 972546500305
Issue: Settings → API Keys shows No Data; Create returns Authentication Failed.
Logged-in user can view the app but cannot create/view API keys.
Request: identify account Owner email and restore Owner access so we can obtain an App API Key
(or regenerate and send securely to Owner).
```

### צעד 3 — חיפוש מקומי (בלי Create)

- מנהל סיסמאות / מייל: `Gupshup`, `DaliaVehicle`, `496709e8`, `0546500305`
- אם מוצאים **מפתח שמור** (לא מהפורטל) — זה מספיק ל-Prod; Staging כבר מוכיח שמפתח מהסוג הזה עובד

### צעד 4 — רק אם 1–3 נכשלו (החלטה עסקית נפרדת)

אפליקציה/חשבון Gupshup חדש תחת המייל שלך + חיבור מספר WA מחדש + עדכון Secrets ב-Staging **וגם** Production.  
זה **לא** לחיצה על Create באפליקציה הנוכחית. דורש אישור Owner מפורש לפני ביצוע.

---

## מה הסוכן יעשה אחרי «סיימתי Gupshup»

1. אימות Secrets ב-Prod (שמות + פרוב WA)  
2. דיווח `ready_for_production_deploy: true/false`  
3. **רק אז** תוכל לכתוב **«אשר Production»**

---

## אל תעשה עכשיו

- אל תלחץ Create שוב בפורטל  
- אל תמחק את `DaliaVehicle`  
- אל תאשר Production  
- אל תשלח מפתחות בצ׳אט
