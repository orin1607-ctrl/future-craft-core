# Gupshup — שחזור חשבון או הגדרה מחדש

## מצב חי (2026-07-20)

בדיקת Staging הצליחה — **האפליקציה חיה והמפתח תקף**:

| בדיקה | תוצאה |
|--------|--------|
| Staging `GUPSHUP_API_KEY` | מוגדר + מאומת (`gupshup_verified: true`, HTTP 202) |
| App Name | `DaliaVehicle` |
| App ID | `496709e8-b5fc-4de9-9c75-bc87455482dd` |
| Source | `972546500305` |
| Templates API | מפתח מתקבל לאפליקציה · תבנית מאושרת ×1 |
| Production Secrets | **חסרים לגמרי** |
| אימייל פורטל בריפו | **לא נמצא** |

הרצה: https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29778527080

**חשוב:** הסוכן / GitHub / Management API **לא יכולים** לקרוא את ערך ה-Secret מ-Staging ולהעתיק ל-Production. גם ב-Dashboard הערך בדרך כלל מוסתר אחרי שמירה. לכן צריך את המפתח מ-**פורטל Gupshup** (או יצירה מחדש).

אחרי סיום כתוב בצ'אט: **«סיימתי Gupshup»**

---

## מסלול A — מומלץ: שחזור פורטל (האפליקציה קיימת)

האפליקציה `DaliaVehicle` **קיימת ועובדת** — מישהו מחובר אליה עם מפתח תקף ב-Staging. חשבון הפורטל קיים.

1. Gmail / סיסמאות: `Gupshup` · `DaliaVehicle` · `496709e8` · `0546500305`
2. או שאלה ל-Naeem: `m.naeem.uet.cs@gmail.com` — «באיזה מייל נוצרה DaliaVehicle?»
3. או Gupshup Support עם App ID: `496709e8-b5fc-4de9-9c75-bc87455482dd`
4. בפורטל → app `DaliaVehicle` → העתק **API Key** (אל תשלח בצ'אט)
5. הדבק בעיקר ב-**Production** (Staging כבר עובד):

https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions  

| Secret | ערך |
|--------|------|
| `GUPSHUP_API_KEY` | מהפורטל |
| `GUPSHUP_APP_NAME` | `DaliaVehicle` |
| `GUPSHUP_SOURCE` | `972546500305` |
| `GUPSHUP_APP_ID` | `496709e8-b5fc-4de9-9c75-bc87455482dd` |

---

## מסלול B — הגדרה מחדש (רק אם אין גישה לפורטל)

1. צור חשבון/אפליקציה חדשה ב-https://www.gupshup.io (עדיף `orin1607@gmail.com`)
2. חבר מספר WA (עדיף `054-650-0305` אם עדיין שלך)
3. הגדר את ארבעת ה-Secrets ב-**Staging וגם Production** (קישורים למטה)
4. אם App ID/Name חדשים — עדכן Secrets בהתאם

קישורים:
- Staging: https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions  
- Production: https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions  

**אל תדביק מפתחות בצ'אט.**

---

## אחרי «סיימתי Gupshup»

1. `check_connection` על Production → `configured: true`  
2. E2E + דוגמה חיה (פנצ׳ר / יוני אטיאס → WA `0534338601` + Email `orin1607@gmail.com`)
