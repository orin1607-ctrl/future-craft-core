# תוכנית רוטציה מלאה — GUPSHUP_API_KEY (ללא ביצוע מחיקה)

**תאריך:** 2026-07-22  
**סטטוס:** תוכנית בלבד · **אין מחיקה · אין עדכון Secrets · אין פריסת Production**  
**App:** `DaliaVehicle` · App ID `496709e8-b5fc-4de9-9c75-bc87455482dd` · Source `972546500305`

---

## 0) עקרונות

1. **בלי ניחושים** — רק מקומות שמוכחים בקוד/בדיקות.
2. **אין שינוי קוד** — הפונקציות קוראות `Deno.env.get('GUPSHUP_API_KEY')`.
3. אחרי שתקבל מפתח חדש: עדכון Secrets (+ Make אם רלוונטי) → אימות → בדיקת שליחה ב-**Staging**.  
   Production **deploy קוד** עדיין דורש `אשר Production` בנפרד; עדכון **Secret** ב-Prod Edge מותר כהכנת תשתית.

---

## 1) כל המקומות לעדכון ה-API Key החדש

### חובה (מערכת שלנו)

| # | מקום | Project / URL | Secret | למה |
|---|------|---------------|--------|-----|
| **A** | Supabase **Staging** Edge Secrets | `usfeoerkpcafxxlyuldl` → [Functions Secrets](https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions) | `GUPSHUP_API_KEY` = **החדש** | `notify-accident-email` + `send-whatsapp-message` קוראים מכאן. Staging חי עכשיו על המפתח הישן. |
| **B** | Supabase **Production** Edge Secrets | `qasomfndnjuixgjmjwcm` → [Functions Secrets](https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions) | `GUPSHUP_API_KEY` = **אותו חדש** | כיום **חסר**; בלי זה WhatsApp Prod לא יישלח אחרי פריסה עתידית. |

### מומלץ באותו מסך (לא ערך המפתח — זהים לקיים/defaults)

| Secret | ערך | Staging | Production |
|--------|------|---------|------------|
| `GUPSHUP_APP_NAME` | `DaliaVehicle` | קיים / לוודא | להוסיף אם חסר |
| `GUPSHUP_SOURCE` | `972546500305` | לרוב default בקוד | להוסיף אם חסר |
| `GUPSHUP_APP_ID` | `496709e8-b5fc-4de9-9c75-bc87455482dd` | אופציונלי (default בקוד) | אופציונלי |

### חובה-מותנה (בוט Make — לא Edge)

| # | מקום | מה לבדוק | מתי חובה |
|---|------|----------|----------|
| **C** | Make · Whatsapp Bot `5797671` · מודולי Gupshup HTTP (**87**, ואם פעיל **58**) | שדה `apikey` בכותרות ה-HTTP | **רק אם** הערך שם הוא אחד ממפתחות ה-App שנמחקים/מוחלפים. אם Make משתמש באותו App key שנמחק — הבוט יישבר עד עדכון. |

> Webhook נכנס (`gupshup-webhook` / Make Hook) **לא** דורש API Key לשליחה.  
> DLR scenario `9553017` — קבלת אירועים, לא שליחת `msg` עם apikey שלנו.

### לא נדרש (אומת בפרויקט)

| מקום | סיבה |
|------|------|
| קוד (`notify-accident-email`, `send-whatsapp-message`, UI) | קורא Secret בלבד · **אין hardcode** של המפתח |
| `.env` / `.env.local` | אין `GUPSHUP_API_KEY` |
| GitHub Actions Secrets | `GUPSHUP_API_KEY` **לא קיים** כיום (אופציונלי לעתיד ל-CI בלבד — לא runtime) |
| VPS / Hostinger | לא נמצא עותק מפתח |
| Frontend build | אין הטמעת מפתח בבילד |
| Redeploy Edge Functions | **לא חובה** אחרי החלפת Secret (Supabase מזריק Secrets לריצות חדשות) |

---

## 2) האם צריך לשנות קוד?

**לא.** רק Secrets (ו־Make `apikey` אם מודול 87/58 מחזיק את המפתח הישן).

---

## 3) סדר פעולות — השבתה מינימלית

שני מסלולים. בחר לפי מה ש-Gupshup מאפשרים.

### מסלול α — מועדף: Create בלי למחוק קודם (שני מפתחות חיים יחד)

השבתה צפויה: **~0** ל-Staging (המפתח הישן נשאר תקף עד שמחליפים ואז מוחקים).

| שלב | מי | פעולה |
|-----|-----|--------|
| α0 | אתה | פתח מראש טאבים: Staging Secrets · Prod Secrets · Make מודול 87 (עריכה) · פורטל Gupshup |
| α1 | אתה | Gupshup → Create API Key → **העתק מיד** → שמור במנהל סיסמאות (**לא בצ׳אט**) |
| α2 | אתה / סוכן אחרי «רוטציה — עדכן» | עדכן **Staging** `GUPSHUP_API_KEY` לחדש → Save |
| α3 | סוכן | Probe: `gupshup_verified: true` על Staging |
| α4 | אתה / סוכן | עדכן **Production** `GUPSHUP_API_KEY` (+ APP_NAME/SOURCE מומלץ) |
| α5 | אתה | אם Make 87 מכיל apikey של מפתח ישן → החלף לחדש → שמור תרחיש |
| α6 | סוכן | בדיקת שליחה Staging (ראה §4) |
| α7 | אתה | **רק אחרי α3+α6 ירוקים** — מחק מפתח(ות) ישנים בפורטל אם צריך מקום |
| α8 | — | Production **קוד/פריסה** — רק אחרי `אשר Production` בנפרד |

### מסלול β — חובה למחוק קודם (מגבלת 2 מפתחות / Create נכשל בלי מקום)

השבתה צפויה: **דקות** ממועד המחיקה עד α2/β3 — אם מחקת את המפתח ש-Staging משתמש בו.

| שלב | מי | פעולה |
|-----|-----|--------|
| β0 | אתה | אותם טאבים מוכנים · מנהל סיסמאות פתוח · **אל תסגור** את מסך Create |
| β1 | אתה | מחק מפתח אחד בפורטל (**בלי ניחוש מספר** — ראה החלטת Pre-Delete; אם אין Last used: קבל סיכון 50/50 ל-Staging לדקות) |
| β2 | אתה | **מיד** Create → העתק ערך |
| β3 | אתה | **מיד** הדבק ב-**Staging** `GUPSHUP_API_KEY` → Save |
| β4 | אתה | **מיד** עדכן Make 87 `apikey` אם היה על המפתח שנמחק |
| β5 | כתוב בצ׳אט | `רוטציה — Staging עודכן` (**בלי** להדביק מפתח) |
| β6 | סוכן | Probe Staging → אם ירוק: בדיקת שליחה |
| β7 | אתה / סוכן | עדכון **Production** Secret לאותו מפתח |
| β8 | אתה | מפתח ישן שני — למחוק רק אחרי Staging ירוק (אם צריך) |

**חלון קריטי במסלול β:** β1 → β3. כל שליחת WA/התראה/בוט בזמן הזה עלולה להיכשל אם נמחק המפתח שבשימוש.

---

## 4) אחרי שתקבל מפתח — מה הסוכן יעשה (כשתכתוב את המשפט)

כתוב אחד מאלה (**בלי** להדביק את המפתח בצ׳אט):

- `רוטציה — Staging עודכן` — אם כבר הדבקת ב-Dashboard  
- או `רוטציה — עדכן` — אם שמרת את המפתח כ-GitHub Secret זמני `GUPSHUP_API_KEY` ואפשר ל-CI להעתיק ל-Edge דרך Management API  

אז הסוכן יבצע:

1. אימות Staging: `check_connection` / identity probe → `gupshup_verified: true`  
2. וידוא Production: שם Secret `GUPSHUP_API_KEY` קיים (ואם חסר APP_NAME/SOURCE — להשלים אם יש ערך זמין ב-CI)  
3. **בדיקת שליחה Staging בלבד** — הודעת בדיקה קצרה לנמען ידוע (למשל WA `0534338601` / מסלול התראת תקלה) · תיעוד `message_id` / status  
4. דיווח: Staging OK / Prod secret OK / האם Make דורש בדיקת «היי» ידנית  
5. **לא** לפרוס Production ולא למחוק מפתחות בפורטל בשם הסוכן  

---

## 5) Checklist קצר (העתק)

```text
[ ] טאבים פתוחים: Gupshup / Staging Secrets / Prod Secrets / Make 87
[ ] מפתח חדש הועתק למנהל סיסמאות (לא לצ׳אט)
[ ] Staging GUPSHUP_API_KEY עודכן
[ ] Probe Staging = verified
[ ] Make 87 apikey עודכן אם היה ישן
[ ] Production GUPSHUP_API_KEY עודכן
[ ] בדיקת שליחה Staging עברה
[ ] מחיקת מפתח ישן בפורטל — רק אחרי הירוקים למעלה
[ ] אשר Production — נפרד, אחרי מוכנות מלאה
```

---

## 6) מה לא עושים בתוכנית זו

- לא מוחקים API Key עכשיו  
- לא משנים קוד  
- לא מפריסים Production  
- לא מדביקים מפתחות בצ׳אט  
