
import { CheckCircle, Clock, Plus, Shield, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';

const completedItems = [
  { module: 'דף נחיתה / אודות', desc: 'דף נחיתה מקצועי עם Hero, תכונות, צילומי מסך, Footer – כולל ניווט ו-CTA' },
  { module: 'מערכת התחברות', desc: 'Login, Forgot Password, Reset Password, הרשמה עם אימייל + סיסמה' },
  { module: 'Multi-Tenancy', desc: 'הפרדת חברות מלאה, CompanyScope למנהל-על, סינון אוטומטי בכל המודולים' },
  { module: 'תפקידים והרשאות', desc: 'super_admin / fleet_manager / driver עם RLS, טבלת user_roles נפרדת' },
  { module: 'התחזות (Impersonation)', desc: 'מנהל-על יכול להתחזות למשתמש אחר ולראות את המערכת מנקודת מבטו' },
  { module: 'ניהול רכבים', desc: 'CRUD מלא, שיוך נהג, סטטוס, ביטוח, טסט, מסמכים, קילומטראז\'' },
  { module: 'ניהול נהגים', desc: 'CRUD מלא, פרטי רישיון, סוגי רישיון, סטטוס, שיוך לרכב' },
  { module: 'ניהול לקוחות', desc: 'CRUD, פרטי הסכם, ח.פ., סוג לקוח, מסמכי לקוח' },
  { module: 'מסירות רכב', desc: 'טופס מסירה מלא עם צ\'קליסט מצב, אישור נהג, נהג זמני, מיקום' },
  { module: 'מעקב רכב', desc: 'דיווח + צ\'אט פנימי Realtime + לוג סטטוס + הפניה לספק + שינוע + אישור מנהל' },
  { module: 'תאונות', desc: 'דיווח תאונות, תמונות, צד שלישי, ביטוח, אימייל אוטומטי לדחופות' },
  { module: 'שירותים ותחזוקה', desc: 'טופס מלא, דשבורד ניהולי עם מונים, צ\'אט Realtime, שינוי סטטוס, שינוע' },
  { module: 'היסטוריית שירותים ותחזוקה', desc: 'סינון מתקדם (חברה, רכב, תאריך), ייצוא CSV, דוח חודשי סטטיסטי' },
  { module: 'הוצאות', desc: 'דיווח הוצאה עם קטגוריה, ספק, חשבונית, צילום קבלה' },
  { module: 'מסלולים', desc: 'ניהול מסלולים עם ימי פעילות, מוצא/יעד, תחנות ביניים, שיוך נהג/רכב/לקוח' },
  { module: 'סידורי עבודה', desc: 'יצירה + שיוך + אישור נהג + אישור מנהל + אישור לקוח + צ\'אט + לוג סטטוס' },
  { module: 'התראות', desc: 'מעקב תפוגת טסט, ביטוח, רישיונות עם תזכורות 1/7/30 יום' },
  { module: 'התראות פנימיות', desc: 'DB Triggers אוטומטיים, Toasts בזמן אמת, תיבת התראות לנהג' },
  { module: 'אימייל אוטומטי', desc: 'Edge Functions עם Resend לתאונות, תקלות דחופות, שירותים ותחזוקה' },
  { module: 'צ\'אט פנימי', desc: 'הודעות Realtime בין משתמשי אותה חברה' },
  { module: 'בקשות אישור', desc: 'מנגנון אישורים עם תזכורות אוטומטיות כל 48 שעות' },
  { module: 'דוחות', desc: 'דוחות מתרחבים Inline עם ייצוא CSV, WhatsApp, אימייל' },
  { module: 'ספקים', desc: 'ניהול ספקים עם סוג, טלפון, הערות' },
  { module: 'מלווים', desc: 'ניהול מלווים עם ת.ז., טלפון, שיוך לסידורי עבודה' },
  { module: 'שינוע', desc: 'מעקב בקשות שינוע מתוך תקלות ושירותים ותחזוקה' },
  { module: 'מנויים', desc: 'ניהול מנויי חברות, תוכנית, מחיר, סטטוס תשלום' },
  { module: 'מבצעים', desc: 'ניהול מבצעים ממוקדי חברה עם תאריכים ותמונה' },
  { module: 'תבניות אימייל', desc: 'עמוד ניהול תבניות אימייל' },
  { module: 'ניהול משתמשים', desc: 'יצירת משתמשים, שינוי תפקיד, ביטול, Edge Function ליצירת admin' },
  { module: 'יומן מערכת (System Logs)', desc: 'לוג פעולות בלתי ניתן למחיקה עם סינון' },
  { module: 'הגדרות חברה', desc: 'WhatsApp, תזכורות, אישורים' },
  { module: 'הגדרות חירום', desc: 'קטגוריות חירום מותאמות לחברה עם יעד (טלפון/WhatsApp)' },
  { module: 'דשבורד נהג', desc: 'תצוגת נהג עם הרכב שלו, מסלולים, סידורי עבודה, התראות' },
  { module: 'מסמכים', desc: 'העלאת מסמכים ל-Storage עם קטגוריה, שיוך לרכב/נהג' },
  { module: 'Dark Mode', desc: 'מעבר בין ערכת צבעים בהירה לכהה' },
  { module: 'רספונסיבי', desc: 'תמיכה מלאה במובייל כולל ניווט תחתון' },
  { module: 'RTL', desc: 'תמיכה מלאה בעברית מימין לשמאל' },
  { module: 'איפוס סיסמה', desc: 'Edge Function לשליחת קישור איפוס באימייל' },
  { module: 'הצמדת נהג גמישה', desc: 'הגדרת חובה/אופציונלי להצמדת נהג ומשתמש לרכב ברמת לקוח, מכסת רכבים פטורים' },
  { module: 'ניהול הסכמי לקוח', desc: 'הוספת מספר הסכמים ללקוח עם מספר סידורי, תיאור, סכום לפני/אחרי מע״מ' },
  { module: 'מרכז עזרה', desc: 'מדריך שימוש מקיף עם חיפוש, קטגוריות, גלילה ותצוגה רחבה' },
  { module: 'הגדרות גמישות לרכב', desc: 'ביטול חובת מסמכי ביטוח וחובת העדר תביעות ברמת חברה' },
  { module: 'החלפת רכב בין נהגים', desc: 'טופס מסירה/קבלה מלא עם מיקום GPS, תמונות, חתימות, אישור הדדי, צ\'קליסט מצב רכב' },
  { module: 'החלפת רכב – נהג פרטי', desc: 'גרסה מינימלית לנהג פרטי ללא תמונות – מיקום, קילומטראז\', חתימות' },
];

const QA_MULTIPLIER = 1.3;

const additions = [
  { feature: 'התחזות (Impersonation)', desc: 'מנהל-על מתחזה למשתמש, שמירת realUser, חזרה' },
  { feature: 'מודול מעקב רכב מורחב', desc: 'צ\'אט Realtime, לוג סטטוס, הפניה לספק, שינוע, אישורי מנהל' },
  { feature: 'שירותים ותחזוקה (מודול שלם)', desc: 'טופס, דשבורד ניהולי, צ\'אט Realtime, סטטוסים, שינוע, היסטוריה, CSV, דוח חודשי' },
  { feature: 'מערכת התראות אוטומטית', desc: 'DB Triggers, Toasts בזמן אמת, תיבת התראות, אימייל אוטומטי (3 Edge Functions)' },
  { feature: 'סידורי עבודה', desc: 'יצירה, אישור 3-שלבי (נהג+מנהל+לקוח), צ\'אט, לוג סטטוס, שיוך מלווה' },
  { feature: 'מסירות רכב מורחב', desc: 'צ\'קליסט מצב, אישור נהג, נהג זמני, מיקום GPS' },
  { feature: 'בקשות אישור + תזכורות', desc: 'מנגנון אישורים, תזכורות 48 שעות, היסטוריה' },
  { feature: 'דוחות מתקדמים', desc: 'דוחות Inline מתרחבים, ייצוא CSV/WhatsApp/אימייל, דוח חודשי' },
  { feature: 'צ\'אט פנימי Realtime', desc: 'הודעות בזמן אמת, סינון חברה, סימון נקרא' },
  { feature: 'ניהול ספקים', desc: 'CRUD ספקים עם סוג וטלפון' },
  { feature: 'ניהול מלווים', desc: 'CRUD מלווים עם שיוך לסידורי עבודה' },
  { feature: 'מנויים וחיוב', desc: 'ניהול מנויי חברות, תוכנית, סטטוס תשלום' },
  { feature: 'מבצעים', desc: 'ניהול מבצעים ממוקדי חברה' },
  { feature: 'הגדרות חירום', desc: 'קטגוריות חירום מותאמות, יעדים, תבניות הודעה' },
  { feature: 'יומן מערכת', desc: 'לוג בלתי ניתן למחיקה עם סינון מתקדם' },
  { feature: 'ניהול משתמשים + Edge Function', desc: 'יצירת משתמשים, שינוי תפקידים, Edge Function ליצירת admin' },
  { feature: 'דשבורד נהג', desc: 'תצוגה ייעודית לנהג עם הרכב, מסלולים, סידורים' },
  { feature: 'מסמכים + Storage', desc: 'העלאה ל-Storage, קטגוריות, שיוך לרכב/נהג' },
  { feature: 'איפוס סיסמה באימייל', desc: 'Edge Function עם Resend לשליחת קישור איפוס' },
  { feature: 'RLS Policies מלאות', desc: 'מדיניות אבטחה לכל הטבלאות, has_role, get_user_company' },
  { feature: 'הצמדת נהג גמישה + מכסה', desc: 'הגדרה ברמת לקוח: חובה/לא חובה להצמיד נהג לרכב, מכסת רכבים פטורים, שיוך חלקי' },
  { feature: 'ניהול הסכמי לקוח', desc: 'מודול הסכמים מרובים ללקוח – יצירה, עריכה, מחיקה עם סכומים ומספר סידורי' },
  { feature: 'מרכז עזרה מורחב', desc: 'מדריך שימוש מקיף עם חיפוש, קטגוריות, חלונית רחבה עם גלילה' },
  { feature: 'הגדרות מבנה ארגוני גמישות', desc: 'ביטול חובת מסמכי ביטוח, ביטול חובת העדר תביעות – ברמת חברה בהגדרות' },
  { feature: 'שיפורי דף נחיתה', desc: 'הסרת אזכורי מימון, פישוט טקסטים לנגישות לקוחות' },
  { feature: 'החלפת רכב בין נהגים', desc: 'מודול שלם – טופס מסירה/קבלה, מיקום GPS, 7 תמונות, חתימות דיגיטליות, צ\'קליסט מצב, אישור הדדי, היסטוריה וחיפוש' },
  { feature: 'החלפת רכב – נהג פרטי', desc: 'גרסה מינימלית ללא תמונות עם מיקום, קילומטראז\' וחתימות' },
  { feature: 'עיצוב גלילה אחיד', desc: 'החלפת כל פסי הגלילה במערכת לעיצוב כחול דק ואחיד' },
];

// Periodic hours summary - each period starts after the previous one ends
const hoursPeriods = [
  {
    label: 'תקופה ראשונה',
    endDate: '2026-03-10',
    devHours: 9,
    items: [
      'התחזות, מעקב רכב מורחב, שירותים ותחזוקה, התראות אוטומטיות',
      'סידורי עבודה, מסירות רכב, בקשות אישור, דוחות',
      'צ\'אט פנימי, ספקים, מלווים, מנויים, מבצעים',
      'חירום, יומן מערכת, ניהול משתמשים, דשבורד נהג',
      'מסמכים, איפוס סיסמה, RLS Policies',
    ],
  },
  {
    label: 'תקופה שנייה',
    endDate: '2026-03-17',
    devHours: 4,
    items: [
      'הזמנות עבודה לספקים – מודול שלם עם CRUD, מספור אוטומטי, שיוך ספק',
      'דשבורד אנליטי ספקים – גרפים, מגמות, סינון מתקדם',
      'דוחות ספקים מורחבים – ייצוא CSV, פילטרים',
      'כפתור + צף (FAB) בכל הדפים',
      'לקוח פרטי – תפקיד + דשבורד + Edge Function',
      'תיקוני באגים ושיפורי UX',
    ],
  },
  {
    label: 'תקופה שלישית',
    endDate: '2026-03-18',
    devHours: 1,
    items: [
      'הצמדת נהג גמישה – הגדרה ברמת לקוח (חובה/לא חובה)',
      'מכסת רכבים פטורים מהצמדה – שדה כמותי ברמת חברה',
      'ולידציה דינמית בטופס רכבים לפי מכסה והגדרה',
    ],
  },
  {
    label: 'תקופה רביעית',
    endDate: '2026-03-21',
    devHours: 2,
    items: [
      'ניהול הסכמי לקוח – הוספת מספר הסכמים ללקוח עם פרטים מלאים',
      'מרכז עזרה – עדכון מדריך, חלונית רחבה עם גלילה',
      'הגדרות גמישות – ביטול חובת ביטוח/העדר תביעות ברמת חברה',
      'שיפורי דף נחיתה – הסרת מימון, פישוט טקסטים',
    ],
  },
  {
    label: 'תקופה חמישית',
    endDate: '2026-03-28',
    devHours: 3,
    items: [
      'החלפת רכב בין נהגים – מודול שלם עם טופס, תמונות, חתימות, GPS, צ\'קליסט',
      'החלפת רכב – גרסה מינימלית לנהג פרטי',
      'עיצוב גלילה אחיד בכל המערכת',
      'תיקוני UI ושיפורי עיצוב',
    ],
  },
];

const totalDevHours = hoursPeriods.reduce((sum, p) => sum + p.devHours, 0);
const totalWithQA = Math.round(totalDevHours * QA_MULTIPLIER);

const ProjectSummary = () => {
  const { user } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExportPDF = () => {
    const printContent = contentRef.current;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>דו״ח שעות תכנות</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 30px; direction: rtl; color: #1a1a1a; }
          h1 { font-size: 22px; margin-bottom: 20px; }
          h2 { font-size: 18px; margin: 24px 0 12px; }
          h3 { font-size: 16px; margin: 20px 0 10px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; font-size: 13px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f5f5f5; font-weight: 600; }
          tr:nth-child(even) { background: #fafafa; }
          .summary-box { display: flex; gap: 20px; margin: 16px 0; }
          .summary-item { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 16px; text-align: center; }
          .summary-item .num { font-size: 28px; font-weight: 700; }
          .summary-item .label { font-size: 12px; color: #666; margin-top: 4px; }
          .check { color: green; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
          @media print { body { padding: 15px; } }
        </style>
      </head>
      <body>
        <h1>דו״ח שעות תכנות — דליה</h1>
        
        <h2>תוכנית מקורית</h2>
        <p style="margin-bottom:8px;color:#666;">דף נחיתה / אודות – בוצע במלואו ✅</p>
        
        <h2>כל המודולים שבוצעו (${completedItems.length})</h2>
        <table>
          <tr><th>#</th><th>מודול</th><th>תיאור</th><th>סטטוס</th></tr>
          ${completedItems.map((item, i) => `<tr><td>${i + 1}</td><td>${item.module}</td><td>${item.desc}</td><td class="check">✓</td></tr>`).join('')}
        </table>
        
        <h2>תוספות מעבר לתוכנית (${additions.length})</h2>
        <p style="margin-bottom:8px;color:#666;">סה"כ ${totalDevHours} שעות פיתוח + 30% בדיקות ותיקונים = ${totalWithQA} שעות</p>
        <table>
          <tr><th>#</th><th>תוספת</th><th>פירוט</th></tr>
          ${additions.map((item, i) => `<tr><td>${i + 1}</td><td>${item.feature}</td><td>${item.desc}</td></tr>`).join('')}
        </table>
        
        <h3>סיכום תקופתי</h3>
        <table>
          <tr><th>תקופה</th><th>תאריך סיום</th><th>שעות פיתוח</th><th>כולל QA (30%)</th></tr>
          ${hoursPeriods.map(p => `<tr><td>${p.label}</td><td>${p.endDate}</td><td>${p.devHours}</td><td>${Math.round(p.devHours * QA_MULTIPLIER)}</td></tr>`).join('')}
          <tr style="font-weight:bold;background:#eef"><td>סה"כ</td><td></td><td>${totalDevHours}</td><td>${totalWithQA}</td></tr>
        </table>

        <h3>סיכום שעות</h3>
        <div class="summary-box">
          <div class="summary-item"><div class="num">${totalDevHours}</div><div class="label">שעות פיתוח נטו</div></div>
          <div class="summary-item"><div class="num">30%</div><div class="label">בדיקות ותיקונים</div></div>
          <div class="summary-item"><div class="num">${totalWithQA}</div><div class="label">סה"כ שעות</div></div>
        </div>
        
        <div class="footer">מסמך זה נוצר אוטומטית | ${new Date().toLocaleDateString('he-IL')}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div dir="rtl" className="animate-fade-in" ref={contentRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header flex items-center gap-3 mb-0">
          <Shield size={28} />
          דו״ח שעות תכנות
        </h1>
        <Button onClick={handleExportPDF} variant="outline" className="flex items-center gap-2">
          <Download size={16} />
          ייצוא PDF
        </Button>
      </div>

      <div className="space-y-10">

        {/* Section: Original Plan */}
        <section>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <CheckCircle className="text-green-500 h-6 w-6" />
            תוכנית מקורית – דף נחיתה / אודות
          </h2>
          <p className="text-muted-foreground mb-4">כפי שהוגדר ב-plan.md – בוצע במלואו ✅</p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>Header עם לוגו + ניווט + כפתור כניסה</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>Hero Section עם CTA</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>בעיות שאנחנו פותרים – 6 כרטיסים</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>איך זה עובד – 4 שלבים</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>תכונות המערכת – רשימה מלאה</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>צילומי מסך</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>Footer עם MAO.CO.IL + tweak-soft.com</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>RTL + רספונסיבי + גופן Heebo + צבעי מיתוג</span></div>
            <div className="flex items-start gap-2"><CheckCircle className="text-green-500 h-4 w-4 mt-1 shrink-0" /><span>מערכת Multi-Tenancy מלאה (כלול בתוכנית)</span></div>
          </div>
        </section>

        {/* Section: All completed modules */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle className="text-green-500 h-6 w-6" />
            כל המודולים שבוצעו ({completedItems.length})
          </h2>
          <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-right p-3 font-semibold w-8">#</th>
                  <th className="text-right p-3 font-semibold">מודול</th>
                  <th className="text-right p-3 font-semibold">תיאור</th>
                  <th className="text-center p-3 font-semibold w-16">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {completedItems.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{item.module}</td>
                    <td className="p-3 text-muted-foreground">{item.desc}</td>
                    <td className="p-3 text-center"><CheckCircle className="text-green-500 h-4 w-4 mx-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section: Additions beyond plan */}
        <section>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Plus className="text-blue-500 h-6 w-6" />
            תוספות מעבר לתוכנית המקורית ({additions.length})
          </h2>
          <p className="text-muted-foreground mb-4">
            כל הפיצ'רים הבאים לא היו חלק מהתוכנית המקורית (שכללה דף נחיתה + Multi-Tenancy).
            <br />
            סה"כ {totalDevHours} שעות פיתוח + 30% בדיקות ותיקונים = {totalWithQA} שעות.
          </p>

          <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-right p-3 font-semibold w-8">#</th>
                  <th className="text-right p-3 font-semibold">תוספת</th>
                  <th className="text-right p-3 font-semibold">פירוט</th>
                </tr>
              </thead>
              <tbody>
                {additions.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{item.feature}</td>
                    <td className="p-3 text-muted-foreground">{item.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Periodic hours summary */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Clock className="h-6 w-6 text-orange-500" />
            סיכום תקופתי של שעות
          </h2>
          <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-right p-3 font-semibold">תקופה</th>
                  <th className="text-right p-3 font-semibold">תאריך סיום</th>
                  <th className="text-right p-3 font-semibold">שעות פיתוח</th>
                  <th className="text-right p-3 font-semibold">כולל QA (30%)</th>
                  <th className="text-right p-3 font-semibold">מה נעשה</th>
                </tr>
              </thead>
              <tbody>
                {hoursPeriods.map((period, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="p-3 font-medium">{period.label}</td>
                    <td className="p-3 text-muted-foreground">{period.endDate}</td>
                    <td className="p-3 font-medium">{period.devHours}</td>
                    <td className="p-3 font-medium">{Math.round(period.devHours * QA_MULTIPLIER)}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      <ul className="list-disc list-inside space-y-0.5">
                        {period.items.map((item, j) => <li key={j}>{item}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted font-bold">
                  <td className="p-3">סה"כ</td>
                  <td className="p-3"></td>
                  <td className="p-3">{totalDevHours}</td>
                  <td className="p-3">{totalWithQA}</td>
                  <td className="p-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Summary box */}
        <section className="bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            סיכום שעות כולל
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-background rounded-lg p-4 text-center border border-border">
              <div className="text-3xl font-bold text-primary">{totalDevHours}</div>
              <div className="text-sm text-muted-foreground mt-1">שעות פיתוח נטו</div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center border border-border">
              <div className="text-3xl font-bold text-primary">30%</div>
              <div className="text-sm text-muted-foreground mt-1">בדיקות ותיקונים</div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center border border-border">
              <div className="text-3xl font-bold text-primary">{totalWithQA}</div>
              <div className="text-sm text-muted-foreground mt-1">סה"כ שעות</div>
            </div>
          </div>
        </section>

        <footer className="text-center text-muted-foreground text-sm py-8 border-t border-border">
          מסמך זה נוצר אוטומטית | {new Date().toLocaleDateString('he-IL')}
        </footer>
      </div>
    </div>
  );
};

export default ProjectSummary;
