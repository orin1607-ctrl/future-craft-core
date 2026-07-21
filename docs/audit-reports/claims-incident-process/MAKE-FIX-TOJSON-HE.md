# תיקון Make — toJSON → createJSON

**סטטוס:** ✅ הושלם · Staging / Make בלבד · בלי שליחת WA · בלי Production

## מה תוקן
מיפוי HTTP Forward השתמש ב-`{{toJSON(1)}}` — **פונקציה שלא קיימת ב-Make IML** →  
`DataError: Failed to map 'data': Function 'toJSON' not found!`

הוחלף ל-`{{createJSON(1)}}` (פונקציית IML תקינה ליצירת מחרוזת JSON).

| תרחיש | מודול | לפני | אחרי |
|--------|--------|------|------|
| Whatsapp Bot `5797671` | 98 Forward DLR | `{{toJSON(1)}}` | `{{createJSON(1)}}` |
| CO.CO Dalia DLR → Staging `9553017` | 2 Forward | `{{toJSON(1)}}` | `{{createJSON(1)}}` |

## אחרי התיקון
| בדיקה | תוצאה |
|--------|--------|
| Whatsapp Bot Active + linked | ✅ |
| אין `toJSON` ב-blueprint | ✅ |
| אין שגיאות `toJSON` חדשות מאז התיקון | ✅ |
| שליחת WhatsApp | ❌ לא בוצעה |
| בדיקת מספר נוסף | בוטלה |

פרטים: `public/project-001/make-fix-tojson-result.json`
