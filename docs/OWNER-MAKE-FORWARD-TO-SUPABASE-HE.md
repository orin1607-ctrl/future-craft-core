# Make.com → Supabase — הוראות מדויקות (אפשרות B)

**אין שינוי ב-Gupshup.**  
**אין שינוי ב-Production.**  
הסוכן **לא** יכול להיכנס ל-Make.com (אין API Token / session) — הצעד הבא אצלך (~2 דק').

## מטרה
Gupshup ממשיך לשלוח ל-Webhook הקיים **make.com** כמו היום.  
Make מוסיף שלב שמעתיק את אותו payload ל-Supabase Staging.

**יעד ההעברה:**
```
https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
```

---

## שלבים ב-Make.com (בלי לגעת ב-Gupshup)

1. היכנס ל-https://www.make.com והתחבר לחשבון שמחובר ל-Webhook של `DaliaVehicle`.
2. מצא את **התרחיש (Scenario)** שמקבל את ה-Webhook מ-Gupshup  
   (בדרך כלל המודול הראשון הוא **Webhooks → Custom webhook** / Custom Webhook).
3. **אל תמחק** מודולים קיימים. אל תשנה את כתובת ה-Webhook של Make.
4. אחרי המודול הראשון (שמקבל את ה-body), לחץ **+** והוסף מודול:
   - **HTTP → Make a request**
5. הגדר את המודול החדש:
   - **URL:**  
     `https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook`
   - **Method:** `POST`
   - **Body type:** `Raw` או `JSON`
   - **Content type / Headers:**  
     `Content-Type` = `application/json`
   - **Request content:** העבר את **כל** ה-body שהתקבל מ-Gupshup  
     (ב-Make: בדרך כלל `{{1}}` / Body / Data — אותו מבנה JSON/טקסט שנכנס לתרחיש, **as-is**).
6. ודא שהמודולים הישנים (מה שהתרחיש עשה קודם) **נשארים** אחרי או לפני — הסדר המומלץ:
   - 1) Webhook (קבלת Gupshup)  
   - 2) HTTP → Supabase (חדש)  
   - 3) … שאר הלוגיקה הקיימת של make.com …
7. **Save** → **Run once** / הפעל את התרחיש (ON).
8. (אופציונלי) ב-Run once שלח בדיקה ידנית מה-Webhook — לא חובה.

### מה לא לעשות
- לא לשנות / למחוק את ה-Webhook בשם **make.com** ב-Gupshup  
- לא לשנות את URL של Custom Webhook ב-Make  
- לא ליצור Webhook Delivery חדש ב-Gupshup (יחליף את ה-URL)

---

## אחרי שסיימת

כתוב בצ'אט בדיוק:

**«Make מעביר ל-Supabase»**

אז הסוכן יריץ **שליחה חיה אחת** ב-Staging ל-`0534338601` + דוח DLR מלא.  
עד אז — **אין שליחת WhatsApp**.
