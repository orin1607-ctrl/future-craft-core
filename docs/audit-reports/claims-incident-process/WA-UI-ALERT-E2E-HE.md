# E2E התראות דרך ממשק התוכנה — Staging

**זמן:** 2026-07-21 ~17:35 UTC  
**שחקן:** מנהל על — **יוני אטיאס** (`orin1607@gmail.com`)  
**סביבה:** Staging בלבד · **לא Production**  
**שיטה:** Playwright על GitHub Pages — אותם מסכים שמשתמש אמיתי לוחץ  
**לא:** קריאה ישירה ל-Edge / סקריפט שליחה ידנית

מקור: `public/project-001/wa-ui-alert-e2e-summary.json`  
צילומים: `docs/screenshots/ui-alert-e2e/`

---

## מסלול במערכת

1. התחברות כיוני אטיאס (מנהל על)  
2. `/alert-settings` → בחירת חברה **אכבים** → הפעלת In-app + Email + WhatsApp → נמענים **דליה** → שמירה  
3. `/faults` → דיווח תקלה חדשה (פנצ׳ר) → **שלח דיווח**  
4. הדפדפן קרא ל-Edge `notify-accident-email` (לא הסקריפט)

---

## תוצאות לפי שלב

| שלב | סטטוס |
|------|--------|
| 1. נוצרה במערכת (UI) | ✅ |
| 2. נשמרה ב-DB (`faults`) | ✅ `FLT-2026-000003` · id `798d3483-…` |
| 3. WhatsApp ל־0534338601 | ✅ **sent** |
| 4. Email ל־orin1607@gmail.com | ✅ **sent** |
| 5. מופיעה במסכים | ✅ `/faults` |

**כל המסלול:** ✅ `full_path_ok`

---

## Edge Function

| שדה | ערך |
|-----|------|
| Function | **`notify-accident-email`** |
| HTTP | 200 |
| הופעלה מ | הדפדפן (UI) אחרי שלח דיווח |
| sent / failed | **2 / 0** |

---

## WhatsApp (Gupshup)

| שדה | ערך |
|-----|------|
| נמען | `972534338601` (0534338601) |
| Message ID | `f8642799-aea9-4503-aff3-37c04b9ef5cb` |
| Status במערכת | **sent** (submitted→sent) |
| delivered / failed | עדיין אין DLR ב־`incident_notification_deliveries` בזמן הבדיקה |
| התקבלה בפועל בטלפון? | **לאישור Owner** — בדוק בועת WhatsApp עכשיו |

---

## Email (Resend)

| שדה | ערך |
|-----|------|
| נמען | `orin1607@gmail.com` |
| Provider message id | `b64b737e-1897-46f1-8bf2-eb3e5db11fb7` |
| Status | **sent** |
| התקבל בתיבה? | **לאישור Owner** — בדוק Inbox/Spam |

---

## שמירה במערכת

- טבלה `faults`: כן  
- טבלה `incident_notification_deliveries`: שתי רשומות (whatsapp + email)  
- מסך תקלות: כן  

---

## האם הכל דרך המערכת?

**כן.** יצירת התקלה והפעלת השליחה בוצעו דרך ממשק Staging (`/faults` → שלח דיווח). הסקריפט רק מפעיל דפדפן כמו משתמש — **לא** קורא ישירות ל-Gupshup/Resend/Edge כשליחה.

Production לא נגענו.
