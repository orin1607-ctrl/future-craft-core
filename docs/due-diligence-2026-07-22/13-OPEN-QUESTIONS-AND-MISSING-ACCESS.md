# 13 — פערי מידע וגישות חסרות + מסקנות סיווג

## א. פערי מידע
| מידע חסר | מדוע חסר | מערכת | גישת RO דרושה | מי מחזיק | בדיקה בלי שינוי? | החלטה שתקועה |
|----------|----------|--------|----------------|----------|-------------------|---------------|
| רשימת כל ה-Policies החיות | אין SQL/Management | Supabase | psql RO או Dashboard export | Owner/Dev | כן | חומרת R5–R7/R16 סופית |
| Auth URL redirects | אין Dashboard | Supabase Auth | Dashboard RO | Owner | כן | אבטחת reset links |
| Secrets inventory רשמי | gh secrets 403; אין token | GitHub+Supabase | secrets:read / Dashboard | Owner | כן | השלמת R1 PayPal secrets |
| nginx פעיל ב-VPS | SSH denied | Hostinger VPS | SSH RO key | Owner | כן | למה headers לא מופיעים |
| מצב backups Supabase | אין Dashboard | Supabase | Dashboard RO | Owner | כן | הצהרות גיבוי |
| האם documents bucket קיים | anon ריק/404 | Storage | service_role RO list | Owner | כן | R4 |
| Make DLR target URL נוכחי | אין Make token | Make.com | Make RO | Owner | כן | DLR Prod vs Staging |
| Gupshup portal message logs | אין portal session | Gupshup | Owner login | Owner | כן | delivered vs submitted |
| DPA/הסכמים | לא הוצגו | משפטי | שיתוף מסמכים | הנהלה/עו״ד | כן | ציות ספקים |
| מספר נושאי מידע | לא נספר | DB | count RO | Owner | כן | רישום מאגר |
| ביטוח סייבר | לא הוצג | הנהלה | מסמך | הנהלה | כן | שאלון enterprise |

## ב. חיפושים שבוצעו לפני "לא ניתן לאימות"
- MCP catalog מלא → רק cursor-cloud.
- `which supabase/psql`; `supabase projects list`.
- `ls ~/.ssh`; SSH ל-VPS.
- `gh secret list` + REST secrets → 403.
- curl ל-Management-like endpoints לא זמינים בלי token.
- חיפוש Gupshup בכל ה-remotes אחרי תיקון המתודולוגיה → נמצא ב-`main` וב-Prod החי.

## ג. מסקנות נדרשות (מבוססות ראיות; אינן ייעוץ משפטי)

1. **האם לצרף לקוחות חדשים כיום?**  
   **רק במגבלות:** לקוחות קטנים, מודולים ליבה, בלי PayPal חי, בלי הבטחות אבטחה מוחלטות, עם גילוי ספקי הודעות. ראיות: F-PAY-01, F-MAIL-01, פערי RLS לא מאומתים חיים.

2. **חובה לפני הרחבה:** R1/F-PAY-01, R2/F-MAIL-01, אימות RLS חי, Storage, signup role, headers, סיסמאות נהגים.

3. **מודולים שניתן להפעיל בבקרה:** ניהול רכבים/נהגים בסיסי, דיווחים פנימיים, WA/Email ל-Owner לפי allowlist (Gupshup מאומת).

4. **להגביל/לכבות:** PayPal charge ציבורי, ממסרי מייל פתוחים, Voice/Twilio עד auth+secrets מבוקרים, ייצוא מלא עם מפתחות.

5. **הבטחות מותרות:** ניסוחים שמרניים ב-07.

6. **הבטחות אסורות:** מאובטח לחלוטין, תואם חוק, גיבוי מלא, הפרדה מלאה, 24/7 מאויש.

7. **מסמכים משפטיים חסרים:** Privacy, TOU, DPA, SLA, נוהל אירוע, נספח ספקים.

8. **החלטות לעו״ד:** תפקידי צדדים, מאגר, העברה לחול, רגישות הצהרות/תאונות, ניסוחי שיווק.

9. **ספקים להסדרה:** Supabase, Hostinger, Gupshup, Resend, Make, PayPal (אם פעיל), AI/Voice אם יופעלו.

10. **ראיות חסרות להצהרת רמת אבטחה:** dump policies, backups+restore, pen-test, MFA, DR drill.

11. **סדר עדיפות:** שלב 0→1 ב-10.

12. **סיכון שנותר גם אחרי תיקונים:** תלות ספקים, טעויות הרשאה אנושיות, תוכן הודעות אצל Gupshup/Resend, אזור ענן מחוץ לישראל — דורש מסגרת חוזית וניטור מתמשך.

---

### הצהרת ביצוע
לא בוצעו שינויי Policies/RLS/Secrets/Deploy/Migration/שליחות חדשות/חיובים במסגרת משימה זו מעבר לקריאות בדיקה לא-מזיקות שתועדו (GET/OPTIONS/POST unknown/empty שאינם שולחים הודעה או מחייבים).
