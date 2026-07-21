# תיקון: תרחיש WhatsApp Bot הופסק עקב שגיאה

**סטטוס:** רץ ב-CI · Staging בלבד · לא Production  
**סקריפט:** `scripts/wa-bot-fix-active-58.mjs`  
**תוצאות:** `public/project-001/wa-bot-fix-active-58-summary.json`

## מטרה
1. לאשר אם זו שגיאת מודול **58** (HTTP 400)  
2. לאשר שהתרחיש נעצר בגללה  
3. לתקן ב-Staging כך שהתרחיש **נשאר Active** אחרי הודעות  
4. E2E לאחר התיקון  

## תיקון מתוכנן (רך)
- `handleErrors: false` על מודול 58  
- `builtin:Ignore` כ-error handler על 58  
- הפעלה מחדש + E2E (היי → יוני → בדיקה)  
- **בלי** שינוי AI / Sheets / Production
