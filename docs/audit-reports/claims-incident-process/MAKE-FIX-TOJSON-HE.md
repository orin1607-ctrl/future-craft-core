# תיקון Make — toJSON → createJSON

**סטטוס:** רץ דרך Actions · Staging / Make בלבד · בלי שליחת WA · בלי Production

## מה תוקן
מיפוי HTTP Forward השתמש ב-`{{toJSON(1)}}` — **פונקציה שלא קיימת ב-Make IML** →  
`DataError: Failed to map 'data': Function 'toJSON' not found!`

הוחלף ל-`{{createJSON(1)}}` (פונקציית IML תקינה ליצירת מחרוזת JSON).

## תרחישים
1. **Whatsapp Bot** (`5797671`) — מודול Forward DLR (98)  
2. **CO.CO Dalia DLR → Staging** (`9553017`) — אותו באג במיפוי

## אחרי התיקון
- Whatsapp Bot הופעל (Active)
- אין שליחת WhatsApp נוספת
- בדיקת מספר נוסף — **בוטלה** לפי בקשת Owner

פרטים חיים: `public/project-001/make-fix-tojson-result.json`
