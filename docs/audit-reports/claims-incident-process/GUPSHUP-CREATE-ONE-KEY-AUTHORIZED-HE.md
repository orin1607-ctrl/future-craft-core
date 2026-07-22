# הנחיה: יצירת App API Key חדש ל-DaliaVehicle

**תאריך:** 2026-07-22  
**סטטוס:** Owner אישר App ID נכון · אין מפתח גלוי ב-UI · **מותר ליצור מפתח אחד חדש**  
**Production deploy:** עדיין אסור עד אימות + «אשר Production»

---

## למה מותר עכשיו

| בדיקה | תוצאה |
|--------|--------|
| App ID | `496709e8-b5fc-4de9-9c75-bc87455482dd` ✓ |
| App Name | `DaliaVehicle` ✓ |
| שדה App API Key מחוץ לטבלה | לא |
| טבלת API Keys | No Data |
| מפתח Staging | עדיין פעיל בשרת — אבל **לא ניתן להעתיק** ל-Prod |

אין דרך טכנית אחרת להשיג ערך להדבקה ב-Production. לכן **מאשר במפורש: צור API Key אחד חדש.**

---

## מה לעשות (בסדר הזה)

### 1) בפורטל Gupshup (עכשיו)

1. הישאר ב-`DaliaVehicle` (אותו App ID)
2. Settings → API Keys → **Create** / Generate (מפתח **אחד** בלבד)
3. **העתק מיד** את הערך — אחרי סגירה הוא עלול לא להיות ניתן לצפייה שוב
4. **אל תשלח** את המפתח בצ׳אט

### 2) הדבק ב-Production בלבד (עדיין)

https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions

| Secret | ערך |
|--------|------|
| `GUPSHUP_API_KEY` | המפתח החדש שהעתקת |
| `GUPSHUP_APP_NAME` | `DaliaVehicle` |
| `GUPSHUP_SOURCE` | `972546500305` |
| `GUPSHUP_APP_ID` | `496709e8-b5fc-4de9-9c75-bc87455482dd` |

שמור. **אל תריץ deploy של קוד.**

### 3) (מומלץ, לא חובה) עדכן גם Staging לאותו מפתח

https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions  

כך Staging ו-Prod משתמשים באותו מפתח גלוי/שמור אצלך.  
אם משאירים את Staging כמו שהוא — בדרך כלל המפתח הישן ממשיך לעבוד; אין חובה לדרוס אותו עכשיו.

### 4) חזרה לצ׳אט

כתוב בדיוק: **«סיימתי Gupshup»**

אז נריץ אימות Prod (שמות Secrets + פרוב WA) — **בלי** פריסת Production.  
רק אחרי `ready_for_production_deploy: true` תוכל לכתוב **«אשר Production»**.

---

## אל תעשה

- אל תיצור שני מפתחות
- אל תמחק אפליקציה / אל תשנה מספר WA
- אל תדביק מפתח בצ׳אט
- אל תאשר Production לפני האימות
