# חיבור Google Sheets — ייצוא פעולות

## מה חסר כדי לסגור את החיבור

1. **Google Sheet** — גיליון Google (חדש או קיים)
2. **Apps Script** — העתק את `docs/integrations/dalia-actions-sheets-webhook.gs` ל-[script.google.com](https://script.google.com)
3. **Script Property** — ב-Project Settings → Script Properties:
   - `SPREADSHEET_ID` = מזהה הגיליון (מה-URL: `docs.google.com/spreadsheets/d/THIS_ID/edit`)
4. **Deploy** — Deploy → New deployment → Web app:
   - Execute as: Me
   - Who has access: Anyone
5. **הדבק URL** — במסך פעולות, שדה `Google Sheets webhook` (או localStorage `dalia-actions-export-config-v1`)

## בדיקה

1. פתח מסך פעולות → הדבק URL → לחץ ייצוא CSV / Sheets
2. ודא שורה חדשה בגיליון `Actions Export`

## הערה

ללא URL פריסה אמיתי — ייצוא ל-Sheets **חסום**. CSV מקומי עדיין עובד.
