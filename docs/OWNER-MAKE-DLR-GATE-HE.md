# Make Token — תוצאות חיבור + שער Owner (Staging)

**Production לא נגע.** Gupshup Portal לא שונה אוטומטית.

## מה כבר עבד

| שלב | תוצאה |
|-----|--------|
| `MAKE_API_TOKEN` + `MAKE_ZONE` | Auth OK (Make user id `4245997`) |
| Team | `My Team` (1939972) |
| תרחיש שנבחר | **Whatsapp Bot** (`5797671`) |
| הוספת HTTP → Supabase Staging | PATCH OK (מודול 98) |
| Remap body ל-`{{toJSON(1)}}` | PATCH OK |
| Deploy Edge Staging | OK |
| שליחת WA חיה ל-`0534338601` | Gupshup `202 submitted` |

Message IDs אחרונים (כולם נשארו `submitted` ב-DB):
- `1c3daa04-93f0-4c7d-96e0-75f326b3b364`
- `2ff738df-6731-40c1-928e-1da9f573c100`
- `c63d5951-0c0c-4455-ab48-95d7a4968ce5`

## ממצא קריטי

ב־**כל** ה-Hooks בחשבון Make (12 webhooks) — **0 לוגים** ב־6 השעות האחרונות.  
אחרי שליחה חיה — ה-Hook של Whatsapp Bot **לא** ראה את ה-`message_id`.

מסקנה: Gupshup **לא שולח** כרגע Delivery Events ל-Hooks שבחשבון Make הזה (או שה-Callback URL ב-Gupshup מצביע לכתובת אחרת / חשבון אחר / אירועי DLR כבויים).

לכן Make→Supabase forward **לא יכול** לקבל DLR עד שתיקון בקצה Gupshup.

יעד Supabase (מוכן ומאומת ב-self-test):
```
https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
```

## מה מחכה לך (שער)

בחר **אחת** מהאפשרויות וכתוב בצ'אט:

### 1) `MATCH` — התאמת Hook קיים (שומר על make.com)
1. Gupshup Console → App `DaliaVehicle` → Integration → Webhooks → **make.com**
2. העתק את **8 התווים האחרונים** של Callback URL  
   (או את ה-URL המלא בפרטי)
3. ודא שמסומנים אירועי Delivery: SENT / DELIVERED / READ / FAILED
4. שלח בצ'אט:  
   `MATCH abcd1234` (החלף ב-8 תווים)

### 2) `מאשר A` — החלף ישירות ל-Supabase
מחליף את Delivery URL של make.com ב-Gupshup ל:
```
https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/gupshup-webhook
```
⚠️ make.com **יפסיק** לקבל Delivery מ-Gupshup.

### 3) `מאשר A-Make` — החלף לתרחיש Make ייעודי
הסוכן יוצר/יצר תרחיש **CO.CO Dalia DLR → Staging** (Webhook → Supabase).  
אחרי שה-URL מופיע בלוג Actions / ב-Make UI — הדבק אותו כ-Delivery Callback ב-Gupshup  
(גם כאן: מחליף את make.com ל-Delivery).

---

אחרי `MATCH` / `מאשר A` / `מאשר A-Make` — הסוכן יריץ שליחה חיה אחת + דוח DLR מלא.  
עד אז: **אין** עוד שליחות WA אוטומטיות.
