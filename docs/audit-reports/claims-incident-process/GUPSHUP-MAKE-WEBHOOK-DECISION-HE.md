# Gupshup Webhook make.com — בדיקה לפני שינוי (Staging)

**תאריך:** 2026-07-21  
**אין שינוי בפורטל / בקוד עד אישור Owner.**  
**Production:** לא רלוונטי לשלב זה.

---

## 1. האם זה ה-Webhook שהמערכת (דליה) משתמשת בו?

**לא.**

| צד | מצב |
|----|-----|
| Gupshup App `DaliaVehicle` | Webhook פעיל בשם **make.com** → Gupshup שולח לשם אירועים |
| דליה Staging Edge `gupshup-webhook` | קיים ופרוס, אבל **לא רשום** כ-Callback ב-Gupshup |
| הוכחה | שליחות עם Message ID נשארו `submitted` ב-DB — לא התקבל DLR ל-Supabase |

כלומר: המערכת שלנו **לא** מקבלת כיום את אירועי המסירה. מי שמקבל אותם (אם בכלל) הוא היעד של make.com.

---

## 2. האם אפשר להוסיף Webhook נוסף ל-Supabase בלי לפגוע ב-make.com?

**לא ישירות ב-Gupshup — לאירועי Delivery.**

מתיעוד Gupshup הרשמי:

> You can configure only **1 URL** for Delivery Events.  
> Additional webhooks created will **update the URL** and events will be sent to the **latest URL saved**.

משמעות:
- יצירת Webhook חדש עם **API Delivery events** + URL של Supabase → **יחליף** את ה-URL של Delivery (עלול להפסיק את make.com ל-DLR).
- **אל תלחץ** «Create Webhook» עם Delivery אם המטרה לשמור על make.com.

(ייתכן ש-Profile / Template הם קטגוריות נפרדות — אבל ל-**Delivery** יש מגבלה של URL אחד.)

---

## 3. האם צריך לעדכן את ה-Webhook הקיים?

**לא חובה לעדכן/למחוק את make.com.**  
יש 3 אפשרויות — רק אחרי אישורך:

| אפשרות | מה קורה ל-make.com | המלצה |
|--------|---------------------|--------|
| **A** — להחליף בפורטל את ה-URL ל-Supabase | make.com **יפסיק** לקבל Delivery | לא מומלץ אם make.com בשימוש |
| **B** — להשאיר make.com; ב-Make להוסיף מודול HTTP שמעביר ל-Supabase | make.com **נשאר**; דליה מקבלת העתק | **מומלץ** |
| **C** — Proxy שלנו שמפצל ל-make.com + Supabase; בפורטל מחליפים ל-Proxy | make.com ממשיך דרך ה-Proxy | אפשרי, יותר עבודה |

**המלצה:** אפשרות **B** — בלי לגעת ב-Webhook בשם make.com ב-Gupshup.

---

## 4. הוראות מדויקות — רק אחרי שתאשר אפשרות

### לפני הכל — צלם / העתק (בלי לשנות)
1. Gupshup → App **DaliaVehicle** → Integration → Webhooks  
2. פתח את ה-Webhook בשם **make.com**  
3. העתק לכאן / שמור אצלך:
   - Callback URL המלא (כתובת make.com)
   - אילו מודולים מסומנים: Profile / Template / **API Delivery** / אחר  
4. **אל תלחץ Save / Delete / Edit** עדיין

### אם תאשר אפשרות B (מומלץ) — שלבים ב-Make.com בלבד
1. היכנס ל-Make.com → התרחיש שמקבל את ה-Webhook מ-Gupshup  
2. אחרי המודול שמקבל את ה-body, הוסף מודול **HTTP → Make a request**:
   - Method: `POST`
   - URL:
     ```
     https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
     ```
   - Headers: `Content-Type: application/json`
   - Body: אותו JSON/payload שהתקבל מ-Gupshup (forward as-is)  
3. שמור והפעל את התרחיש  
4. **ב-Gupshup — אל תשנה כלום**  
5. כתוב בצ'אט: **«Make מעביר ל-Supabase»**

### אם תאשר אפשרות A (החלפת URL — שובר make.com ל-Delivery)
1. רק אם אתה בטוח ש-make.com לא צריך יותר Delivery  
2. ב-Webhook make.com (או Webhook חדש) שנה Callback URL ל:
   ```
   https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
   ```
3. ודא שמסומן **API Delivery events** (SENT / DELIVERED / READ / FAILED)  
4. Save  
5. כתוב: **«Callback הוחלף ל-Supabase»**

### אפשרות C
דורשת פיתוח Proxy ב-Staging — אבנה רק אם תבחר במפורש.

---

## סיכום תשובות

| # | שאלה | תשובה |
|---|------|--------|
| 1 | האם make.com הוא מה שהמערכת משתמשת בו? | **לא** — Gupshup שולח ל-make.com; דליה לא מחוברת |
| 2 | אפשר Webhook נוסף ל-Supabase בלי לפגוע? | **לא ל-Delivery** (URL אחד בלבד ב-Gupshup) |
| 3 | צריך לעדכן את הקיים? | **לא חובה** — עדיף forward מ-Make |
| 4 | מה לעשות עכשיו? | לצלם את פרטי make.com; לבחור A / B / C; **לא ללחוץ עד אישור** |

---

## מה מחכה לך
כתוב אחת מהאפשרויות:
- **«מאשר B — Make מעביר»**
- **«מאשר A — החלף ל-Supabase»** (יודע ש-make.com ייפגע ב-Delivery)
- **«מאשר C — Proxy»**

עד אז: **אין שינוי בפורטל, אין שינוי בקוד, אין שליחה.**
