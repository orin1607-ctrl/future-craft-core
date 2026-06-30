# HOW-TO — Foundation Stabilization (Staging בלבד)

## 1) עקרון ארכיטקטורה מחייב
- פלטפורמת דליה = מערכת ניהול בלבד.
- אתר לקוח לא נשאר ב-DOM/hosting של דליה לטווח ארוך.
- בפלטפורמה נשמר רק metadata:
  - clientName
  - previewUrl
  - productionUrl
  - repo
  - commit
  - status

## 2) עבודה ב-Website Builder אחרי הייצוב
1. כניסה ל-`חברות ועסקים` -> השלמת אסטרטגיה.
2. לחיצה על `צור אתר AI`.
3. מעבר שלבים 1-6.
4. בשלב 7 מוצג סיכום מלא לפני בנייה:
   - כמות עמודים
   - שם כל עמוד
   - מטרה לכל עמוד
   - תוכן לכל עמוד
   - מילות מפתח
5. בשלב 8 לחיצה על `צור אתר Preview מלא`.
6. פתיחת `פתח אתר Preview מלא` ובדיקת כל העמודים.
7. סימון אישור preview ורק אז `המשך לעוזרים`.

## 3) Preview זמני לשיתוף
- נתיב לדוגמה ב-Staging:
  - `/client-previews/dalia-c-official/index.html`
- התיקיה מסומנת כ-TEMP בלבד:
  - `public/client-previews/dalia-c-official/TEMP-PREVIEW-NOTICE.md`

## 4) הפרדה לריפו זמני נפרד (אם צריך Git לשיתוף לקוח)
סקריפט ייעודי:

`node scripts/scaffold-client-preview-repo.mjs --out ../temp-client-preview --client dalia-c-official`

מה מתקבל:
- scaffold מלא לריפו preview זמני
- קובץ `preview-metadata.json` עם הדגשת TEMP והפרדת ארכיטקטורה
- `README.md` עם צעדי מעבר לפרודקשן אצל הלקוח

## 5) QA אוטומטי
סקריפט ה-QA החדש:

`node scripts/verify-companies-foundation.mjs`

בודק:
- זרימה מלאה: חברות ועסקים -> עוזרים -> מטרות -> פעולות -> היסטוריה -> חזרה לעוזרים/אסטרטגיה
- מסך סיכום לפני build
- יצירת preview רב-עמודי
- approval gate לפני המשך לעוזרים
- Desktop + iPhone 13

## 6) מעבר ל-production (מחוץ לדליה)
אחרי אישור לקוח:
1. יוצרים repo קבוע בבעלות הלקוח (או ארגון ייעודי ללקוח).
2. מעלים את קבצי האתר לריפו הלקוח.
3. מחברים domain + hosting של הלקוח.
4. מעדכנים בפלטפורמת דליה metadata בלבד (productionUrl/repo/commit/status).
