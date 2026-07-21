# בקשת הרשאה — Make.com API (אפשרות B)

**אין הדבקת Token בצ'אט.**  
**אין שינוי ב-Gupshup / Production עד שהחיבור עובד.**

## מה נדרש ממך (פעם אחת)

### 1) צור API Token ב-Make
1. היכנס ל-https://www.make.com  
2. לחץ על האווטאר (ימין למעלה) → **Profile**  
3. לשונית **API** → **Add token** / Create token  
4. Label: `dalia-cursor-staging`  
5. סמנים (scopes) — מינימום:
   - `scenarios:read`
   - `scenarios:write`
   - `teams:read` (או `organizations:read` אם מופיע)
   - `hooks:read` (אם מופיע ברשימה)
6. Create → **העתק את ה-Token** (מוצג פעם אחת)

### 2) זהה את ה-Zone
בשורת הכתובת בדפדפן אחרי התחברות, למשל:
- `https://eu1.make.com/...` → Zone = **`eu1`**
- `https://eu2.make.com/...` → **`eu2`**
- `https://us1.make.com/...` → **`us1`**
- `https://us2.make.com/...` → **`us2`**

### 3) שמור כ-GitHub Secret (לא בצ'אט)
1. פתח:  
   https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions  
2. **New repository secret** (או Update אם כבר קיים):

| Name | Value |
|------|--------|
| `MAKE_API_TOKEN` | ה-Token שיצרת |
| `MAKE_ZONE` | למשל `eu1` (בלי `.make.com`) |

3. Save

### 4) אשר לי בצ'אט
כתוב בדיוק:

**«Make Token מוכן»**

ואם יודע — הוסף גם: Team/Organization name או קישור ל-Scenario של Gupshup.

---

## מה אעשה אחרי האישור (אוטומטי)
1. אאמת שה-Token עובד (רשימת scenarios — ללא שינוי)  
2. אאתר את ה-Scenario שמקבל Webhook מ-Gupshup  
3. אוסיף מודול HTTP → העברה ל-  
   `https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook`  
   **בלי למחוק** מודולים קיימים  
4. אריץ E2E Staging אחת ל-`0534338601` + דוח DLR מלא  
5. Production — לא ייגע

---

## מה לא נדרש
- סיסמת Make  
- OAuth בדפדפן אל Cursor  
- שינוי Webhook ב-Gupshup  
- הדבקת Token בצ'אט
