# Gupshup — שחזור חשבון או הגדרה מחדש

**מזהים ידועים (מהריפו):**
- App Name: `DaliaVehicle`
- App ID: `496709e8-b5fc-4de9-9c75-bc87455482dd`
- Source: `972546500305` (`054-650-0305`)

**לא נמצא בריפו:** אימייל פורטל · Workspace ID · Account ID

בחר **מסלול אחד**. אחרי סיום כתוב בצ'אט: **«סיימתי Gupshup»**

---

## מסלול A — שחזור (אם מוצאים את החשבון)

1. Gmail / סיסמאות: `Gupshup` · `DaliaVehicle` · `496709e8` · `0546500305`
2. או שאלה ל-Naeem: `m.naeem.uet.cs@gmail.com`
3. או Gupshup Support עם App ID למעלה
4. בפורטל: פתח app `DaliaVehicle` → העתק **API Key** (אל תשלח בצ'אט)
5. הדבק ב-**שני** פרויקטי Supabase → Edge Functions → Secrets:

| Secret | ערך |
|--------|------|
| `GUPSHUP_API_KEY` | מהפורטל |
| `GUPSHUP_APP_NAME` | `DaliaVehicle` |
| `GUPSHUP_SOURCE` | `972546500305` |
| `GUPSHUP_APP_ID` | `496709e8-b5fc-4de9-9c75-bc87455482dd` |

קישורים:
- Staging: https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions  
- Production: https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions  

אם Staging כבר מוגדר ועובד — מספיק **להעתיק מ-Staging UI ל-Production UI** (הסוכן לא יכול לקרוא ערכים).

---

## מסלול B — הגדרה מחדש (אם «Currently no apps» / אין גישה)

1. היכנס / צור חשבון ב-https://www.gupshup.io (עדיף `orin1607@gmail.com`)
2. צור WhatsApp app חדש (שם מומלץ: `DaliaVehicle` או `DaliaVehicle2`)
3. חבר מספר WA Business (עדיף אותו `054-650-0305` אם עדיין שלך)
4. העתק: **API Key**, **App Name**, **App ID**, **Source**
5. הגדר את ארבעת ה-Secrets ב-**Staging וגם Production** (טבלה למעלה)
6. אם App ID/Name/Source חדשים — עדכן גם את ה-Secrets (הקוד משתמש ב-defaults רק כשאין Secret)

**אל תדביק מפתחות בצ'אט.**

---

## אחרי «סיימתי Gupshup»

הסוכן יריץ אוטומטית:
1. `check_connection` על Production → חייב `configured: true`
2. E2E + דוגמה חיה אחת (פנצ׳ר / יוני אטיאס → WA `0534338601` + Email `orin1607@gmail.com`)

---

נתונים: `public/project-001/gupshup-account-hunt.json`  
בדיקת Staging חיה: workflow `probe-staging-gupshup-identity.yml`
