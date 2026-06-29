# Mission 30 — TEST 2 — בדיקת מסירה (29/06/2026)

**תאריך:** 2026-06-29  
**נמען:** `orin1607@gmail.com`  
**סטטוס משימה:** **פתוחה** — עד שהמשתמש מאשר קבלה בתיבת Gmail

---

## סיכום מהיר

נשלח מייל בדיקה **חדש** (לא תבנית v2) דרך Supabase Edge → Resend.  
Resend מדווח **`last_event: delivered`** — **ללא** bounce / complaint / reject.  
**זה לא מוכיח** שהמייל נראה ב-Inbox; המשתמש עדיין לא אישר קבלה.

---

## הוכחת שליחה — TEST 2

| שדה | ערך |
|-----|-----|
| **זמן שליחה (Edge)** | `2026-06-29T16:31:59.061Z` |
| **זמן יצירה (Resend)** | `2026-06-29 16:31:59.91487+00` |
| **Resend Email ID** | `6af0b206-690e-4440-b5bf-e9f4b1f23ae4` |
| **SES Message-ID** | `<0100019f14393078-4db181cd-e046-4c60-9393-33c913ca2880-000000@email.amazonses.com>` |
| **last_event** | `delivered` |
| **bounce** | לא (`last_event` ≠ bounced/failed) |
| **complaint** | לא (`last_event` ≠ complained) |
| **reject / suppressed** | לא (`last_event` ≠ suppressed/failed) |
| **נושא (מדויק)** | `MISSION 30 – TEST 2 – 29/06/2026` |
| **שורת טקסט בגוף** | `אם אתה קורא את השורה הזאת, המייל הגיע בהצלחה.` |
| **שולח** | `דליה מערכות <onboarding@resend.dev>` |
| **נמען** | `orin1607@gmail.com` |
| **Endpoint** | `https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/marketing-notify-email` |
| **Edge HTTP** | 200 |
| **Resend HTTP (send + GET)** | 200 |

**מייל קודם (TEST 1 / v2):** `0ea0cdc6-5f7b-4267-a4e2-8aab1bf26fe8` — גם הוא `delivered`, המשתמש לא דיווח על קבלה.

נתונים מלאים: `test2-delivery.json`

---

## מה Resend מחזיר ב-`GET /emails/{id}`

ה-Edge (`action: get_status`) קורא ל-Resend ומחזיר את כל האובייקט. שדות רלוונטיים:

| שדה | משמעות |
|-----|--------|
| `id` | מזהה Resend |
| `message_id` | Message-ID של Amazon SES |
| `to`, `from`, `subject` | נמען, שולח, נושא |
| `created_at` | זמן יצירה |
| **`last_event`** | סטטוס אחרון: `sent`, `delivered`, `bounced`, `complained`, `failed`, `suppressed`, `opened`, `clicked`, `delivery_delayed`, … |
| `html`, `text` | תוכן שנשלח |

**bounce / complaint / reject:** ב-API של שליפת מייל בודד אין אובייקט `bounce` מפורט — רק `last_event`. פירוט bounce (סוג, הודעת SMTP) מגיע בדרך כלל מ-**webhooks** (`email.bounced`, `email.complained`). ב-TEST 2: `last_event = delivered` בלבד.

---

## איך למצוא את המייל ב-Gmail

1. חפש בדיוק: **`MISSION 30 – TEST 2 – 29/06/2026`**
2. או: `from:onboarding@resend.dev`
3. או Message-ID (ללא סוגריים): `0100019f14393078-4db181cd-e046-4c60-9393-33c913ca2880`
4. בדוק: **Inbox**, **Spam**, **Promotions**, **All Mail**
5. אם מופיע — אשר למערכת: "קיבלתי את TEST 2"

---

## מגבלות `onboarding@resend.dev` (sandbox)

לפי [תיעוד Resend](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain):

| מגבלה | פירוט |
|--------|--------|
| **שולח** | `onboarding@resend.dev` מיועד **לבדיקות בלבד**, לא לפרודקשן |
| **נמענים** | בתיאור הרשמי: רק לכתובת המייל **של חשבון Resend** — שליחה לנמענים אחרים אמורה להחזיר **403** |
| **מציאות ב-TEST 2** | השליחה ל-`orin1607@gmail.com` **עברה** (200) ו-Resend דיווח `delivered` — כנראה שכתובת זו משויכת לחשבון Resend, או שהחשבון כבר עבר שלב שמאפשר שליחה רחבה יותר |
| **Deliverability ל-Gmail** | גם כש-SES מסמן `delivered`, Gmail עלול לסנן ל-**Spam/Promotions** או להסתיר — במיוחד מ-`@resend.dev` (דומיין sandbox, SPF/DKIM לא של העסק) |
| **מכסות** | תוכנית חינמית: מגבלות יומיות/חודשיות (429 אם חורגים) |

**מסקנה:** sandbox מתאים לבדיקת חיווט Edge→Resend, **לא** לאמינות Inbox בפרודקשן.

---

## תיקון: אימות דומיין `dalia-c.com` + `RESEND_FROM`

אם Gmail מסנן מיילים מ-`onboarding@resend.dev` (סביר גם אחרי `delivered`):

### שלב 1 — אימות דומיין ב-Resend

1. היכנס ל-[resend.com/domains](https://resend.com/domains)
2. **Add Domain** → `dalia-c.com` (או subdomain כמו `mail.dalia-c.com`)
3. הוסף רשומות DNS (בדרך כלל):
   - **SPF** (TXT)
   - **DKIM** (CNAME/TXT)
   - **DMARC** (TXT) — מומלץ
4. המתן ל-**Verified** בלוח הבקרה

### שלב 2 — עדכון Supabase Staging

```bash
supabase secrets set RESEND_FROM="דליה מערכות <approvals@dalia-c.com>" --project-ref usfeoerkpcafxxlyuldl
```

(או כתובת אחרת **באותו דומיין מאומת** — חייב להתאים בדיוק לדומיין ב-Resend.)

ה-Edge כבר קורא `RESEND_FROM` מ-env; אם לא מוגדר — נופל ל-`onboarding@resend.dev`.

### שלב 3 — שליחת TEST 3

אחרי אימות — שליחה חוזרת עם אותו נושא/גוף מ-`approvals@dalia-c.com` ובדיקת Inbox.

### למה זה עוזר

- שולח מזוהה עם המותג (דליה / dalia-c.com)
- SPF/DKIM/DMARC תקינים → פחות סיכון לספאם ב-Gmail
- אפשר לשלוח לכל נמען (לא רק מייל חשבון Resend)

---

## קריטריון סיום משימה 30

משימה 30 **נשארת פתוחה** עד:

- המשתמש `orin1607@gmail.com` מאשר **במפורש** שקיבל את המייל (Inbox, או אחרי מציאה בספאם/Promotions)

`delivered` ב-Resend **אינו** מספיק לסגירת המשימה.

---

## הרצה חוזרת

```bash
MARKETING_CRON_SECRET=m30-staging-orin-2026 \
VITE_SUPABASE_URL=https://usfeoerkpcafxxlyuldl.supabase.co \
VITE_SUPABASE_ANON_KEY=... \
node scripts/send-mission30-test2.mjs
```
