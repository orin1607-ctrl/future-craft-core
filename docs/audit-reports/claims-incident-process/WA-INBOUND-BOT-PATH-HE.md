# דוח — מסלול בוט WhatsApp נכנס (Make) · ללא שליחות · ללא Production

**זמן בדיקה:** 2026-07-21 ~13:46 UTC  
**מקור נתונים:** `public/project-001/wa-inbound-bot-path-result.json`  
**תרחיש:** Whatsapp Bot `5797671` · Hook `2567320`

---

## תשובות קצרות (1–7)

### 1. האם Whatsapp Bot פעיל כרגע?
**לא.** `isActive=false`, `islinked=false`.  
תזמון מוגדר `immediately`, אבל בלי Active אין ריצה.

### 2. האם ההודעה הנכנסת מגיעה ל-Webhook בזמן אמת?
**כן.** Gupshup → Make Hook עובד.  
ב־24ש׳ האחרונות: **5 הודעות נכנסות** מ-`972534338601`, כולל «היי» ב-`2026-07-21T13:41:51Z`.

### 3. האם התרחיש רץ מיד או נכנס לתור?
**נכנס לתור כשהתרחיש כבוי.**  
עכשיו: `queueCount=3` / `list_count=3` (אחד מהם = «היי» 13:41).  
כש-Active+linked ותור ריק — אמור לרוץ מיד (`scheduling=immediately`).

### 4. באיזה מודול נעצר / נכשל?
**מודול 98 — «Forward DLR to Supabase Staging»** (`http:ActionSendData`).  
שגיאה חוזרת:

`DataError: Failed to map 'data': Function 'toJSON' not found!`

המודול יושב מיד אחרי ה-Webhook, ולכן **כל ריצה נופלת לפני** Router / AI Agent / שליחת Gupshup.

### 5. למה הבוט לא מחזיר תשובה?
שלוש שכבות:

1. **עכשיו כבוי** → ההודעה שלך ממתינה בתור, לא מעובדת.  
2. **כשהיה פעיל** → כשל `toJSON` במודול 98 עוצר לפני מסלול התשובה.  
3. **מוקדם יותר היום** → 4 הודעות Owner נמחקו עם ניקוי 15 פריטי התור → לא קיבלו תשובה.

יש מודולי תשובה במערכת (AI Agent + `api.gupshup.io/wa/api/v1/msg`) — אבל הם **downstream** של הכשל.

### 6. האם `E2E clean-queue Staging 2026-07-21T12:55:37.518Z` היא בדיקה ישנה מהתור?
**לא.** זו **שליחת E2E יוצאת** של Staging (msgid `346d6d28-9266-42ae-a0c3-6e4f0bd0a06f`) דרך Edge→Gupshup — **לא** תשובת בוט ולא שחרור מתור Make.  
הופעה מאוחרת בטלפון = בעיית `sent`≠`delivered` שכבר אבחנו.

### 7. מה לתקן כדי שהבוט יענה תוך שניות?
1. להשאיר את Whatsapp Bot **Active + linked** כל עוד Gupshup מצביע ל-Hook הזה.  
2. **לתקן/להזיז מודול 98** — להחליף `{{toJSON(1)}}` במיפוי תקף ב-Make, או להעביר DLR לתרחיש נפרד.  
3. **Router מוקדם:** `statuses` → forward DLR בלבד; `messages` → AI/Gupshup. כשל DLR לא יהרוג תשובות.  
4. לא למחוק incomings של הודעות נכנסות אם מצפים לתשובה.  
5. אחרי תיקון: `queueCount=0` + «היי» → תשובה תוך שניות (Staging בלבד; **אין Production** עד הוכחה).

---

## מפת מסלול (מצב נוכחי)

```text
Owner WA 0534338601
  → Gupshup business 0546500305
    → Make Hook 2567320          ✅ מגיע בזמן אמת
      → אם Scenario OFF          ❌ נכנס לתור (עכשיו 3)
      → אם Scenario ON
          → Module 98 HTTP forward  ❌ toJSON DataError → STOP
          → (לא מגיעים) Sheets / Router / AI Agent / Gupshup msg
```

---

## Production
לא בוצע שום שינוי ב-Production. לא נשלחו הודעות בדיקה נוספות.
