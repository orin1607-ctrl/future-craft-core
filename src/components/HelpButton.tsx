import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, X, Car, AlertTriangle, RefreshCw, FileText, Phone, Shield, Users, BarChart3, Truck, ClipboardList, MapPin, Settings, Bell, UserCheck, Building2, UserPlus, Wrench, Scale, Upload, Search, HeartPulse, CheckSquare, MessageCircle, CalendarDays, Receipt, Megaphone, ShieldAlert, History, BookOpen, Briefcase, ExternalLink, PhoneCall, Bot, Key, ListChecks } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AIChatAssistant } from '@/components/AIChatAssistant';

interface HelpSection {
  icon: React.ReactNode;
  title: string;
  content: string[];
  link?: string;
}

interface HelpCategory {
  label: string;
  sections: HelpSection[];
}

function getDriverHelp(): HelpCategory[] {
  return [
    {
      label: 'נהיגה ודיווחים',
      sections: [
        {
          icon: <Car className="h-5 w-5 text-primary" />,
          title: 'נהיגה יומית',
          link: '/dashboard',
          content: [
            'וודא שהרכב תקין לפני כל נסיעה',
            'בדוק שמנים, צמיגים ומראות לפני יציאה',
            'דווח על כל תקלה מיד דרך המערכת',
            'עדכן קריאת מד-אוץ בכל תדלוק',
          ],
        },
        {
          icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
          title: 'דיווח תאונה',
          link: '/accidents',
          content: [
            'עצור במקום בטוח והפעל אורות חירום',
            'וודא שאין נפגעים – אם יש, התקשר למד"א 101',
            'צלם את הנזק, לוחיות הרכב והסביבה',
            'דווח במערכת דרך "דיווח תאונה" עם כל הפרטים',
            'אל תודה באשמה בשום שלב',
            'קבל פרטי ביטוח מהצד השני',
          ],
        },
        {
          icon: <RefreshCw className="h-5 w-5 text-info" />,
          title: 'החלפת רכב (מסירה/קבלה)',
          link: '/vehicle-handover',
          content: [
            'שני הנהגים חייבים לבצע את תהליך ההחלפה במערכת',
            'הנהג המוסר: מתעד את מצב הרכב, קריאת מד-אוץ וצילומים',
            'הנהג המקבל: בודק את הרכב ומאשר את קבלתו',
            'דווח על כל נזק קיים לפני קבלת הרכב',
            'וודא שכל המסמכים (רישיון רכב, ביטוח) נמצאים ברכב',
          ],
        },
        {
          icon: <FileText className="h-5 w-5 text-warning" />,
          title: 'דיווח תקלות',
          link: '/faults',
          content: [
            'דווח על כל תקלה מיד – גם אם נראית קטנה',
            'תאר את התקלה בצורה ברורה',
            'צרף תמונות במידת האפשר',
            'סמן דחיפות: נמוכה / בינונית / גבוהה / קריטית',
            'ניתן לבקש גרירה דרך המערכת',
            'עקוב אחרי עדכוני סטטוס בצ\'אט התקלה',
          ],
        },
        {
          icon: <HeartPulse className="h-5 w-5 text-destructive" />,
          title: 'הצהרת בריאות',
          link: '/health-declaration',
          content: [
            'מלא הצהרת בריאות דרך תפריט "הצהרת בריאות"',
            'ההצהרה כוללת: שם, ת.ז, מספר רישיון, תאריך',
            'ניתן לצרף צילום רישיון נהיגה',
            'חתום דיגיטלית על ההצהרה',
          ],
        },
      ],
    },
    {
      label: 'סידור עבודה ומסלולים',
      sections: [
        {
          icon: <CalendarDays className="h-5 w-5 text-primary" />,
          title: 'סידור עבודה שבועי',
          link: '/driver-weekly-schedule',
          content: [
            'צפה בסידור העבודה השבועי שלך',
            'אשר או דחה שיבוצים שהוקצו לך',
            'צפה בפרטי המסלול, השעות והרכב המשויך',
            'קבל התראות על שיבוצים חדשים',
          ],
        },
        {
          icon: <MapPin className="h-5 w-5 text-success" />,
          title: 'מסלולים ונסיעות',
          link: '/routes',
          content: [
            'בדוק את המסלול המתוכנן לפני יציאה',
            'התחל ועצור נסיעה דרך המערכת',
            'דווח על עיכובים או שינויים במסלול',
            'צפה בתחנות ביניים לאורך המסלול',
          ],
        },
        {
          icon: <Phone className="h-5 w-5 text-destructive" />,
          title: 'מצב חירום',
          link: '/emergency',
          content: [
            'לחץ על "חירום" בתפריט לגישה מהירה',
            'משטרה: 100 | מד"א: 101 | כיבוי אש: 102',
            'השתמש בכפתורי החיוג המהיר המוגדרים לחברה שלך',
            'דווח למנהל הצי מיד לאחר הטיפול הראשוני',
          ],
        },
        {
          icon: <CheckSquare className="h-5 w-5 text-info" />,
          title: 'בדיקת רכב תקופתית',
          link: '/private-vehicle-inspection',
          content: [
            'בצע בדיקת רכב תלת/חצי שנתית דרך המערכת',
            'עבור על 19 סעיפי הבדיקה וסמן תקין/לא תקין',
            'הוסף הערות לכל סעיף במידת הצורך',
            'ליקויים שנמצאו ייפתחו כמשימות טיפול אוטומטית',
          ],
        },
        {
          icon: <MessageCircle className="h-5 w-5 text-primary" />,
          title: 'הודעות והתראות',
          link: '/driver-notifications',
          content: [
            'צפה בהודעות מהמנהל ב"התראות"',
            'קבל עדכונים על שיבוצים, תקלות ומשימות',
            'סמן הודעות כנקראו',
          ],
        },
      ],
    },
  ];
}

function getFleetManagerHelp(): HelpCategory[] {
  return [
    {
      label: 'ניהול צי',
      sections: [
        {
          icon: <Users className="h-5 w-5 text-primary" />,
          title: 'ניהול נהגים',
          link: '/drivers',
          content: [
            'הוסף וערוך פרטי נהגים מתפריט "נהגים"',
            'עקוב אחרי תוקף רישיונות ועדכן בהתאם',
            'שייך נהגים לרכבים ולמסלולים',
            'צפה בהתראות על רישיונות שעומדים לפוג',
            'נהגים שהוסרו עוברים לארכיון (לא נמחקים)',
          ],
        },
        {
          icon: <Truck className="h-5 w-5 text-info" />,
          title: 'ניהול רכבים',
          link: '/vehicles',
          content: [
            'נהל את צי הרכבים מתפריט "רכבים"',
            'בחר סוג ניהול: ליסינג תפעולי, ליסינג מימוני או תחזוקה עצמאית',
            'עקוב אחרי טסטים, ביטוחים ותוקפי רישוי',
            'עדכן קריאות מד-אוץ ומצב הרכב',
            'שייך רכבים לנהגים דרך "הצמדת רכב"',
            'רכבים שהוסרו עוברים לארכיון ולא נמחקים',
            'הגדר מספר פנימי לכל רכב לזיהוי ארגוני',
          ],
        },
        {
          icon: <Upload className="h-5 w-5 text-success" />,
          title: 'יבוא רכבים',
          link: '/vehicle-import',
          content: [
            'ייבא רכבים מקובץ CSV דרך "יבוא רכבים"',
            'הורד תבנית CSV לדוגמה והשלם את הנתונים',
            'המערכת מזהה כפילויות לפי מספר רכב',
            'ניתן לייבא עשרות רכבים בפעולה אחת',
          ],
        },
        {
          icon: <Search className="h-5 w-5 text-primary" />,
          title: 'בדיקת רכב ממשלתי',
          link: '/vehicle-lookup',
          content: [
            'בדוק פרטי רכב מול מאגר משרד התחבורה',
            'הזן מספר רכב וקבל: יצרן, דגם, שנה, בעלות, דלק, צבע',
            'הנתונים נשמרים במטמון ל-24 שעות',
            'גישה דרך "בדיקת רכב ממשלתי" בתפריט',
          ],
        },
        {
          icon: <CheckSquare className="h-5 w-5 text-warning" />,
          title: 'ביקורות רכב ומשימות טיפול',
          link: '/vehicle-inspections',
          content: [
            'בצע ביקורות תקופתיות עם Checklist של 14 סעיפים',
            'ליקויים שנמצאו נפתחים כמשימות ב"מרכז ליקויים"',
            'עקוב אחרי סטטוס ליקויים: פתוח 🔴, בטיפול 🟡, טופל 🟢',
            'בדיקות תלת/חצי שנתיות כוללות 19 סעיפים',
          ],
        },
        {
          icon: <ClipboardList className="h-5 w-5 text-warning" />,
          title: 'הוראות שירות',
          link: '/service-orders',
          content: [
            'צור הוראות שירות לטיפולים ותיקונים',
            'עקוב אחרי סטטוס הטיפולים',
            'אשר או דחה בקשות מנהגים',
            'צפה בהיסטוריית שירותים ותחזוקה',
          ],
        },
      ],
    },
    {
      label: 'לקוחות ומסלולים',
      sections: [
        {
          icon: <Building2 className="h-5 w-5 text-primary" />,
          title: 'ניהול לקוחות והסכמים',
          link: '/customers',
          content: [
            'צור לקוחות חדשים מתפריט "לקוחות"',
            'הוסף מספר הסכמים לכל לקוח בלחיצה על "+"',
            'כל הסכם כולל: מספר סידורי, פירוט, סכום לפני ואחרי מע"מ',
            'ניתן לערוך ולמחוק הסכמים בכל עת',
            'הדפס הסכם בודד בלחיצה על כפתור ההדפסה',
          ],
        },
        {
          icon: <Briefcase className="h-5 w-5 text-success" />,
          title: 'עסקאות וסיכומי עבודה',
          link: '/customers',
          content: [
            'צור עסקאות מדף הלקוח – כפתור "עסקאות"',
            'כל עסקה מקבלת מספור אוטומטי (DL-00001)',
            'עקוב אחרי סטטוס: בביצוע, הושלם, בוטל',
            'הגדר סכומים, תאריכי יעד וסוג עבודה',
          ],
        },
        {
          icon: <MapPin className="h-5 w-5 text-info" />,
          title: 'ניהול מסלולים',
          link: '/routes',
          content: [
            'צור מסלולים עם מספר מסלול, מוצא ויעד',
            'הגדר תמחור שונה לכל סוג רכב (פרטי, מסחרי, מונית, מיניבוס, אוטובוס)',
            'קבע טווח תאריכי תוקף (valid from/to) למסלול',
            'שייך לקוח, נהג ורכב לכל מסלול',
            'הוסף תחנות ביניים וימי פעילות',
            'לאחר תאריך ביצוע – לא ניתן לשנות/למחוק מסלול',
          ],
        },
        {
          icon: <CalendarDays className="h-5 w-5 text-primary" />,
          title: 'סידור עבודה',
          link: '/work-orders',
          content: [
            'צור שיבוצים לנהגים מ"סידור עבודה"',
            'שייך נהג, רכב, מסלול ולקוח לכל שיבוץ',
            'נהל אישורים: אישור מנהל ואישור נהג',
            'עקוב אחרי סטטוס: ממתין, מאושר, בביצוע, הושלם',
            'צפה בצ\'אט שיבוץ לתקשורת עם נהג',
          ],
        },
      ],
    },
    {
      label: 'דוחות ומעקב',
      sections: [
        {
          icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
          title: 'טיפול בתאונות ותקלות',
          link: '/faults',
          content: [
            'צפה בדיווחי תאונות ותקלות מנהגים',
            'עדכן סטטוס ותיעוד לכל אירוע',
            'נהל גרירות והפניות לספקים בתוך התקלה',
            'צפה בצ\'אט תקלה וביומן שינויי סטטוס',
            'הפק דוחות לפי תקופה',
          ],
        },
        {
          icon: <BarChart3 className="h-5 w-5 text-success" />,
          title: 'דוחות וניתוח',
          link: '/reports',
          content: [
            'צפה בדוחות הוצאות וניתוחי עלויות',
            'דוחות זמינים: כספיים, רכבים, טיפולים, נהגים, הפסד/רווח',
            'הפק דוחות לפי נהג, רכב או תקופה',
            'ייצא נתונים ל-CSV',
          ],
        },
        {
          icon: <Bell className="h-5 w-5 text-primary" />,
          title: 'התראות',
          link: '/alerts',
          content: [
            'המערכת מייצרת התראות אוטומטיות על: טסט, ביטוח חובה, ביטוח מקיף, רישיון',
            'הגדר התראות מותאמות אישית (חד-פעמיות או חוזרות)',
            'קבל התראות על דיווחים חדשים מנהגים',
            'עקוב אחרי משימות פתוחות',
          ],
        },
        {
          icon: <Receipt className="h-5 w-5 text-warning" />,
          title: 'הוצאות',
          link: '/expenses',
          content: [
            'רשום הוצאות לפי רכב: דלק, חניה, שטיפה, קנסות ועוד',
            'צרף צילום חשבונית לכל הוצאה',
            'עקוב אחרי הוצאות לפי קטגוריה ותקופה',
          ],
        },
        {
          icon: <RefreshCw className="h-5 w-5 text-info" />,
          title: 'מסירות וקבלות רכב',
          link: '/vehicle-handover',
          content: [
            'תעד מסירת/קבלת רכב עם Checklist מצב',
            'צרף צילומים ותיאור נזקים',
            'הנהג המקבל מאשר דיגיטלית',
            'צפה בהיסטוריית מסירות לכל רכב',
          ],
        },
      ],
    },
  ];
}

function getSuperAdminHelp(): HelpCategory[] {
  return [
    {
      label: 'ניהול כללי',
      sections: [
        {
          icon: <Shield className="h-5 w-5 text-primary" />,
          title: 'סקירה כללית',
          link: '/dashboard',
          content: [
            'מסך הדשבורד מציג סיכום של כל הפעילות במערכת',
            'ניתן לנווט בין כל המסכים דרך התפריט הצדדי',
            'כמנהל על יש לך גישה מלאה לכל הנתונים',
            'ניתן לסנן נתונים לפי חברה מבורר החברות בתפריט',
          ],
        },
        {
          icon: <Users className="h-5 w-5 text-info" />,
          title: 'ניהול משתמשים',
          link: '/user-management',
          content: [
            'צור משתמשים חדשים מתפריט "ניהול משתמשים"',
            'הגדר תפקידים: נהג, מנהל צי, מנהל על או לקוח פרטי',
            'שייך משתמשים לחברות',
            'הפעל או השבת משתמשים לפי הצורך',
            'שנה סיסמא למשתמש קיים',
          ],
        },
        {
          icon: <Settings className="h-5 w-5 text-muted-foreground" />,
          title: 'הגדרות מערכת',
          link: '/alert-settings',
          content: [
            'נהל הגדרות כלליות מ"הגדרות חברות"',
            'הגדר לכל חברה בנפרד: חובת הצמדת נהג, מכסת רכבים פטורים',
            'שלוט בנראות כפתורי התפריט (Navigation) לכל חברה',
            'הגדר חובת העלאת מסמכי ביטוח והדר תביעות',
            'נהל תבניות מייל אוטומטיות מ"תבניות מייל"',
            'הגדר הרשאות ותפקידים מ"הרשאות"',
          ],
        },
        {
          icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
          title: 'הגדרות אישורים',
          link: '/approval-settings',
          content: [
            'הגדר אילו פעולות דורשות אישור מנהל',
            'צפה בבקשות אישור ממתינות',
            'אשר או דחה בקשות עם הערות',
          ],
        },
        {
          icon: <BarChart3 className="h-5 w-5 text-success" />,
          title: 'דוחות ונתונים',
          link: '/reports',
          content: [
            'צפה בדוחות מקיפים על כל הפעילות',
            'סוגי דוחות: כספיים, רכבים, טיפולים, נהגים, הפסד/רווח',
            'נתח ביצועים לפי חברה, נהג או רכב',
            'ייצא נתונים ל-CSV בלחיצת כפתור',
          ],
        },
        {
          icon: <History className="h-5 w-5 text-muted-foreground" />,
          title: 'לוג מערכת',
          link: '/system-logs',
          content: [
            'צפה ביומן פעולות המערכת מ"לוג מערכת"',
            'סנן לפי סוג פעולה, משתמש או תאריך',
            'כל שינוי סטטוס, יצירה ומחיקה מתועדים אוטומטית',
          ],
        },
      ],
    },
    {
      label: 'ניהול רכבים וביטוחים',
      sections: [
        {
          icon: <Truck className="h-5 w-5 text-primary" />,
          title: 'פתיחת רכב חדש',
          link: '/vehicles',
          content: [
            'לך ל"רכבים" → לחץ "רכב חדש"',
            'בחר סוג ניהול: ליסינג תפעולי / ליסינג מימוני / תחזוקה עצמאית',
            'ליסינג תפעולי: מועד סיום, עלות חודשית, מועד החזרה',
            'ליסינג מימוני: החזר חודשי, תאריך סיום הלוואה, מועד החלפה',
            'תחזוקה עצמאית: אפשרות לציין הלוואה, החזר חודשי, מועד החלפה',
            'כל השדות אופציונליים – ניתן להשלים מאוחר יותר',
          ],
        },
        {
          icon: <Shield className="h-5 w-5 text-info" />,
          title: 'ביטוחים והדר תביעות',
          link: '/vehicles',
          content: [
            'בליסינג מימוני ותחזוקה עצמאית – נפתח אזור ביטוחים',
            'טבלת ביטוחים לפי שנים: חברת ביטוח, עלות חובה, עלות מקיף',
            'סימון הדר תביעות לכל שנה',
            'הוספת שנים חדשות בלחיצה על "הוסף שנה"',
            'התראות אוטומטיות על: טסט, ביטוח חובה, ביטוח מקיף',
          ],
        },
        {
          icon: <Upload className="h-5 w-5 text-success" />,
          title: 'יבוא רכבים',
          link: '/vehicle-import',
          content: [
            'ייבא רכבים מקובץ CSV דרך "יבוא רכבים" בתפריט',
            'הורד תבנית CSV לדוגמה והשלם את הנתונים',
            'המערכת מזהה כפילויות לפי מספר לוחית',
            'ניתן לייבא עשרות רכבים בפעולה אחת',
          ],
        },
        {
          icon: <Search className="h-5 w-5 text-primary" />,
          title: 'בדיקת רכב ממשלתי',
          link: '/vehicle-lookup',
          content: [
            'בדוק פרטי רכב מול מאגר משרד התחבורה',
            'הזן מספר רכב וקבל: יצרן, דגם, שנה, בעלות, דלק, צבע, תוקף רישוי',
            'הנתונים נשמרים במטמון ל-24 שעות',
            'גישה דרך "בדיקת רכב ממשלתי" בתפריט ניהול צי',
          ],
        },
        {
          icon: <CheckSquare className="h-5 w-5 text-warning" />,
          title: 'ביקורות רכב ומשימות טיפול',
          link: '/vehicle-inspections',
          content: [
            'ביקורת תקופתית: Checklist של 14 סעיפים',
            'בדיקה תלת/חצי שנתית: 19 סעיפים (לרכב פרטי)',
            'ליקויים שנמצאו נפתחים אוטומטית כמשימות ב"מרכז ליקויים"',
            '3 סטטוסים: פתוח 🔴, בטיפול 🟡, טופל 🟢',
            'ניתן לסנן ולחפש ליקויים לפי רכב',
          ],
        },
        {
          icon: <HeartPulse className="h-5 w-5 text-destructive" />,
          title: 'הצהרות בריאות',
          link: '/health-declaration',
          content: [
            'צפה בהצהרות בריאות שמילאו הנהגים',
            'ההצהרה כוללת: שם, ת.ז, רישיון, חתימה דיגיטלית',
            'צרף צילום רישיון נהיגה',
            'גישה דרך "הצהרת בריאות" בתפריט',
          ],
        },
      ],
    },
    {
      label: 'לקוחות, הסכמים ומסלולים',
      sections: [
        {
          icon: <Building2 className="h-5 w-5 text-primary" />,
          title: 'ניהול לקוחות',
          link: '/customers',
          content: [
            'צור לקוח חדש מתפריט "לקוחות"',
            'מלא פרטי לקוח: שם, טלפון, מייל, כתובת, ח.פ',
            'בחר סוג לקוח: עסקי או פרטי',
            'ניתן לנהל מסמכי לקוח מדף "מסמכי לקוח"',
          ],
        },
        {
          icon: <FileText className="h-5 w-5 text-success" />,
          title: 'הסכמים',
          link: '/customers',
          content: [
            'בתוך דף עריכת/הקמת לקוח – לחץ "+ הוסף הסכם"',
            'כל הסכם כולל: מספר סידורי, פירוט, סכום לפני ואחרי מע"מ',
            'ניתן להוסיף מספר בלתי מוגבל של הסכמים לכל לקוח',
            'מחק הסכם בלחיצה על X, הדפס הסכם בודד בלחיצה על אייקון ההדפסה',
          ],
        },
        {
          icon: <Briefcase className="h-5 w-5 text-warning" />,
          title: 'עסקאות וסיכומי עבודה',
          link: '/customers',
          content: [
            'צור עסקאות מדף הלקוח – כפתור "עסקאות"',
            'כל עסקה מקבלת מספור אוטומטי ייחודי (DL-00001)',
            'סטטוסים: בביצוע, הושלם, מבוטל',
            'הגדר סכום, תאריך יעד וסוג עבודה',
            'סנן עסקאות בדוחות הכנסות',
          ],
        },
        {
          icon: <MapPin className="h-5 w-5 text-info" />,
          title: 'ניהול מסלולים',
          link: '/routes',
          content: [
            'צור מסלולים עם מספר מסלול, מוצא ויעד',
            'הגדר תמחור דינמי שונה לכל סוג רכב (פרטי, מסחרי, מונית, מיניבוס, אוטובוס, אחר)',
            'קבע טווח תאריכי תוקף למסלול',
            'שייך לקוח, נהג ורכב לכל מסלול',
            'הוסף תחנות ביניים וימי פעילות',
            'לאחר תאריך ביצוע – לא ניתן לשנות/למחוק',
          ],
        },
        {
          icon: <UserPlus className="h-5 w-5 text-primary" />,
          title: 'יצירת לקוח פרטי',
          link: '/user-management',
          content: [
            'לך ל"ניהול משתמשים" ולחץ "משתמש חדש"',
            'בחר תפקיד "לקוח פרטי"',
            'לקוח פרטי לא חייב להיות משויך לחברה',
            'ניתן ליצור לקוח עם טלפון בלבד (ללא אימייל)',
          ],
        },
        {
          icon: <UserCheck className="h-5 w-5 text-success" />,
          title: 'שיוך רכב ללקוח פרטי',
          link: '/attach-car',
          content: [
            'לך לדף "הצמדת רכב" (בתפריט)',
            'בחר רכב מהרשימה',
            'בחר את הלקוח מרשימת "בחר משתמש" (לא מרשימת הנהגים!)',
            'לחץ "שמור הצמדה"',
            'הרכב יופיע בדשבורד של הלקוח הפרטי',
          ],
        },
        {
          icon: <Car className="h-5 w-5 text-info" />,
          title: 'מה הלקוח הפרטי רואה?',
          content: [
            'דשבורד עם פרטי הרכב המשויך',
            'דיווח תקלות ותאונות',
            'הזמנת טיפולים ושירותים',
            'שינוע רכב, חידוש ביטוח והשוואת מחירים',
            'היסטוריית טיפולים ומבצעים',
          ],
        },
      ],
    },
    {
      label: 'הצמדת נהגים ורכבים',
      sections: [
        {
          icon: <UserCheck className="h-5 w-5 text-primary" />,
          title: 'הצמדת רכב לנהג',
          link: '/attach-car',
          content: [
            'לך לדף "הצמדת רכב"',
            'בחר רכב → בחר נהג מרשימת הנהגים',
            'לחץ "שמור הצמדה"',
            'ניתן לשנות או להסיר הצמדה מהרשימה בתחתית הדף',
          ],
        },
        {
          icon: <Building2 className="h-5 w-5 text-warning" />,
          title: 'הגדרת חובת הצמדה לחברה',
          link: '/alert-settings',
          content: [
            'לך ל"הגדרות חברות"',
            'בחר את החברה הרלוונטית מהבורר',
            'סמן "חובה להצמיד נהג/משתמש לרכב" → כל רכב חדש יחייב הצמדה',
            'בטל סימון → ניתן להוסיף רכבים ללא הצמדה, עד למכסה שנקבעה',
            'מכסה 0 = ללא הגבלה (כל הרכבים פטורים)',
          ],
        },
        {
          icon: <Users className="h-5 w-5 text-success" />,
          title: 'ניהול מלווים',
          link: '/companions',
          content: [
            'הוסף מלווים מתפריט "מלווים"',
            'שייך מלווים לרכבים',
            'ניתן לבקש מלווה בשיבוץ עבודה',
          ],
        },
      ],
    },
    {
      label: 'תפעול ושירות',
      sections: [
        {
          icon: <Wrench className="h-5 w-5 text-primary" />,
          title: 'שירותים ותחזוקה',
          link: '/service-orders',
          content: [
            'צור קריאת שירות ותחזוקה חדשה מ"הוראות שירות"',
            'מלא פרטי רכב, נהג, ספק וסוג טיפול',
            'הזמנות דחופות מקבלות התראה אוטומטית למנהלים',
            'עקוב אחרי סטטוס הטיפול עד לסגירה',
            'צפה בהיסטוריית שירותים ותחזוקה',
          ],
        },
        {
          icon: <Scale className="h-5 w-5 text-info" />,
          title: 'ניהול ספקים',
          link: '/suppliers',
          content: [
            'הוסף ספקים קבועים או חד-פעמיים מ"ספקים"',
            'כל ספק מקבל מספר ספק אוטומטי',
            'צור הזמנות עבודה לספקים וקבל אישור',
            'שלח הזמנות עבודה במייל ישירות מהמערכת',
          ],
        },
        {
          icon: <CalendarDays className="h-5 w-5 text-success" />,
          title: 'סידור עבודה',
          link: '/work-orders',
          content: [
            'צור שיבוצים לנהגים מ"סידור עבודה"',
            'שייך נהג, רכב, מסלול ולקוח לכל שיבוץ',
            'נהל אישורים: אישור מנהל ואישור נהג',
            'סטטוסים: ממתין, מאושר מנהל, מאושר נהג, בביצוע, הושלם, נדחה',
            'צ\'אט פנימי בכל שיבוץ לתקשורת עם נהג',
            'יומן שינויי סטטוס מלא',
          ],
        },
        {
          icon: <RefreshCw className="h-5 w-5 text-warning" />,
          title: 'שינועים ומסירות',
          link: '/vehicle-handover',
          content: [
            'צור טופס מסירה/קבלה מ"שינועים"',
            'תעד מצב הרכב עם Checklist ותמונות',
            'הנהג המקבל מאשר דיגיטלית',
            'הגדר נהג זמני (חד-פעמי) לשינוע',
          ],
        },
        {
          icon: <Phone className="h-5 w-5 text-destructive" />,
          title: 'מספרי חירום',
          link: '/emergency-settings',
          content: [
            'הגדר מספרי חירום לכל חברה מ"מספרי חירום"',
            'צור קטגוריות חירום עם אייקונים וכפתורי חיוג/WhatsApp',
            'הגדר הודעת WhatsApp אוטומטית לכל קטגוריה',
            'צפה ביומן פניות חירום',
          ],
        },
        {
          icon: <Megaphone className="h-5 w-5 text-primary" />,
          title: 'מבצעים',
          link: '/promotions',
          content: [
            'צור מבצעים ופרסומים מ"מבצעים"',
            'הגדר תאריכי התחלה וסיום',
            'בחר חברות יעד למבצע',
            'צרף תמונה ותיאור',
          ],
        },
        {
          icon: <MessageCircle className="h-5 w-5 text-info" />,
          title: 'צ\'אט פנימי',
          link: '/internal-chat',
          content: [
            'שלח הודעות ישירות למשתמשים מ"צ\'אט פנימי"',
            'בחר נמען מרשימת המשתמשים',
            'צפה בהיסטוריית הודעות',
          ],
        },
        {
          icon: <BookOpen className="h-5 w-5 text-muted-foreground" />,
          title: 'משימות פיתוח תוכנה',
          link: '/completed-tasks',
          content: [
            'נהל משימות פיתוח מ"משימות פיתוח תוכנה"',
            'כל משימה כוללת: מספור אוטומטי, דחיפות, גודל (S/M/L)',
            'S = 1-2 שעות, M = 3-5 שעות, L = יום+',
            'ניתן לערוך משימות קיימות (מסומנות ✏️)',
            'אשר ביצוע משימות כמנהל על',
          ],
        },
        {
          icon: <Receipt className="h-5 w-5 text-warning" />,
          title: 'מנויים וחיוב',
          link: '/subscriptions',
          content: [
            'נהל מנויי חברות מ"מנויים וחיוב"',
            'הגדר תוכנית, מחיר חודשי ואמצעי תשלום',
            'עקוב אחרי תאריכי חיוב ותשלומים',
          ],
        },
      ],
    },
    {
      label: 'סוכן קולי (Flow Maker)',
      sections: [
        {
          icon: <Bot className="h-5 w-5 text-primary" />,
          title: 'מה זה Flow Maker?',
          link: '/voice',
          content: [
            'מרכז ניהול שיחות אוטומטיות עם סוכן קולי בעברית (ElevenLabs + Twilio)',
            'מאפשר לסוכן AI להתקשר ללקוחות, נהגים וספקים בשם המערכת',
            'משמש לתיאום טיפולים, אישור שיבוצים, אימות נתונים ושיחות יוצאות יזומות',
            'כל שיחה נשמרת ביומן השיחות עם תמליל והקלטה',
          ],
        },
        {
          icon: <ListChecks className="h-5 w-5 text-success" />,
          title: '✅ מה כבר מוגדר במערכת',
          content: [
            '✓ חשבון Twilio עם מספר ישראלי פעיל (+972)',
            '✓ סוכן ElevenLabs Conversational AI מוגדר עם קול עברי',
            '✓ Phone Number ID מקושר בין Twilio ל-ElevenLabs',
            '✓ Edge Function: twilio-outbound-call (יציאת שיחות)',
            '✓ Edge Function: elevenlabs-conversation-token (שיחה מהדפדפן)',
            '✓ Edge Function: book-pickup-slot (כלי לסוכן לקבוע פגישות)',
            '✓ טבלאות DB: call_logs, voice_campaigns, campaign_customers',
            '✓ סודות מוגדרים: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID',
          ],
        },
        {
          icon: <Key className="h-5 w-5 text-warning" />,
          title: 'הגדרות חיצוניות נדרשות (חד-פעמי)',
          content: [
            '1️⃣ Twilio: רכוש מספר ישראלי בקונסולה והפעל SMS Geo Permissions',
            '2️⃣ ElevenLabs: צור Conversational Agent (https://elevenlabs.io/app/conversational-ai)',
            '3️⃣ ב-ElevenLabs: הגדר Voice בעברית, System Prompt בסיסי ו-First Message',
            '4️⃣ ב-ElevenLabs: שייך את מספר ה-Twilio תחת Phone Numbers וקבל Phone Number ID',
            '5️⃣ הפעל Overrides: agent.prompt, agent.firstMessage, agent.language, dynamic_variables',
            '6️⃣ הוסף Client Tools במידת הצורך (book_pickup_slot, transfer_to_human)',
            '7️⃣ ודא שכל הסודות מוגדרים בענן (Settings → Secrets)',
          ],
        },
        {
          icon: <PhoneCall className="h-5 w-5 text-info" />,
          title: 'הגדרת תסריט (Scenario)',
          link: '/voice',
          content: [
            'לך ל"סוכן קולי" → לשונית "תסריטים"',
            'לחץ "תסריט חדש" והגדר שם, מטרה וקהל יעד (לקוח/נהג/ספק)',
            'כתוב System Prompt בעברית: "אתה {agent_name}, סוכן של {company_name}..."',
            'הגדר משתנים דינמיים: customer_name, driver_name, vehicle_plate, service_type',
            'הגדר First Message: "שלום {customer_name}, מדבר {agent_name} מ-{company_name}..."',
            'בחר את הכלים שהסוכן יכול להשתמש בהם (קביעת פגישה, העברה לאדם)',
            'שמור והפעל בדיקה דרך כפתור "התקשר עכשיו"',
          ],
        },
        {
          icon: <Settings className="h-5 w-5 text-muted-foreground" />,
          title: 'הגדרת תפקיד הסוכן (System Prompt)',
          link: '/voice',
          content: [
            'הגדר זהות ברורה: שם, תפקיד, חברה',
            'תן הוראות כיוון: "תמיד דבר עברית", "תהיה מנומס וקצר"',
            'הגדר מטרה ספציפית לכל שיחה: לתאם / לאשר / לעדכן',
            'תן רשימת אופציות (לדוגמה: סוגי טיפולים 10K/20K/30K/40K/60K)',
            'הגדר תנאי סיום: "סיים שיחה לאחר שקיבלת אישור" / "העבר לאדם אם הלקוח מסרב"',
            'הוסף הוראות על איך לטפל בהתנגדויות ובחזרות',
          ],
        },
        {
          icon: <PhoneCall className="h-5 w-5 text-success" />,
          title: 'ביצוע שיחה יוצאת',
          link: '/voice',
          content: [
            'אופציה 1: מכרטיס לקוח/נהג – לחץ על אייקון הטלפון ובחר תסריט',
            'אופציה 2: מ"סוכן קולי" → "התקשר עכשיו" – הזן מספר ובחר תסריט',
            'המערכת תשלח את כל המשתנים הדינמיים אוטומטית לסוכן',
            'תוכל להאזין לשיחה בזמן אמת דרך LiveCallWidget',
            'בסיום, השיחה תופיע ב"שיחות אחרונות" עם תמליל מלא',
          ],
        },
        {
          icon: <History className="h-5 w-5 text-info" />,
          title: 'מעקב ויומן שיחות',
          link: '/voice',
          content: [
            'לשונית "שיחות אחרונות" – כל השיחות עם סטטוס, משך, תוצאה',
            'לחץ על שיחה לצפייה בתמליל מלא והקלטה',
            'סנן לפי תסריט, לקוח, תאריך וסטטוס (בוצעה/נכשלה/ללא מענה)',
            'תוצאות אפשריות: הוסכם, נדחה, חזרה, הועבר לאדם',
          ],
        },
        {
          icon: <ListChecks className="h-5 w-5 text-warning" />,
          title: '⚠️ צ\'קליסט לפני התחלת עבודה',
          link: '/voice',
          content: [
            '☑ בדוק שהסוכן ב-ElevenLabs פעיל ומחובר למספר Twilio',
            '☑ בצע שיחת בדיקה לעצמך לוודא איכות שמע ושפה',
            '☑ ודא שכל המשתנים הדינמיים בתסריט תואמים לשמות בקוד',
            '☑ הגדר הודעה ראשונה (First Message) ברורה ומזהה',
            '☑ הפעל SMS Pumping Protection ב-Twilio למניעת הונאות',
            '☑ ודא יתרת קרדיט ב-Twilio וב-ElevenLabs',
            '☑ הגדר Webhook לתיעוד שיחות אם נדרש',
            '☑ בדוק הרשאות RLS על call_logs',
          ],
        },
      ],
    },
  ];
}

function getPrivateCustomerHelp(): HelpCategory[] {
  return [
    {
      label: 'שירותים',
      sections: [
        {
          icon: <Car className="h-5 w-5 text-primary" />,
          title: 'הרכב שלי',
          link: '/dashboard',
          content: [
            'פרטי הרכב מופיעים בדשבורד הראשי',
            'אם לא מופיע רכב, פנה למנהל לשיוך הרכב',
            'ניתן לצפות בקריאת מד-אוץ ומצב הרכב',
            'צפה בפרטי ביטוח וטסט',
          ],
        },
        {
          icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
          title: 'דיווח תקלה / תאונה',
          link: '/faults',
          content: [
            'לחץ על "דיווח תקלה / תאונה" בדשבורד',
            'מלא את הפרטים וצרף תמונות',
            'הדיווח יישלח אוטומטית למנהל',
            'עקוב אחרי עדכוני סטטוס',
          ],
        },
        {
          icon: <Wrench className="h-5 w-5 text-info" />,
          title: 'הזמנת טיפול',
          link: '/service-orders',
          content: [
            'לחץ "הזמנת טיפול" בדשבורד',
            'בחר סוג שירות: טיפול שוטף, חידוש ביטוח, שינוע לטסט ועוד',
            'ניתן לבקש השוואת מחירים לביטוח',
            'עקוב אחרי סטטוס הטיפול בפעילות אחרונה',
          ],
        },
        {
          icon: <CheckSquare className="h-5 w-5 text-success" />,
          title: 'בדיקת רכב תלת/חצי שנתית',
          link: '/private-vehicle-inspection',
          content: [
            'בצע בדיקה תקופתית לרכב שלך',
            'עבור על סעיפי הבדיקה וסמן תקין/לא תקין',
            'ליקויים שנמצאו ידווחו אוטומטית למנהל',
          ],
        },
      ],
    },
    {
      label: 'חירום ומידע',
      sections: [
        {
          icon: <Phone className="h-5 w-5 text-destructive" />,
          title: 'מצב חירום',
          link: '/emergency',
          content: [
            'משטרה: 100',
            'מד"א: 101',
            'כיבוי אש: 102',
            'פנה למנהל דרך כפתור חירום בדשבורד',
          ],
        },
        {
          icon: <FileText className="h-5 w-5 text-muted-foreground" />,
          title: 'היסטוריה ומסמכים',
          link: '/history',
          content: [
            'צפה בהיסטוריית טיפולים ואירועים',
            'העלה חשבוניות דלק והוצאות',
            'צפה במבצעים והטבות ייחודיות',
          ],
        },
      ],
    },
  ];
}

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const key = `help_seen_${user?.id || 'guest'}`;
    if (!localStorage.getItem(key)) {
      setShowPulse(true);
    }
  }, [user?.id]);

  const handleOpen = () => {
    setOpen(true);
    if (showPulse) {
      setShowPulse(false);
      const key = `help_seen_${user?.id || 'guest'}`;
      localStorage.setItem(key, 'true');
    }
  };

  const handleNavigate = (link: string) => {
    setOpen(false);
    navigate(link);
  };

  const role = user?.role || 'driver';

  let categories: HelpCategory[];
  let roleLabel: string;

  switch (role) {
    case 'super_admin':
      categories = getSuperAdminHelp();
      roleLabel = 'מנהל על';
      break;
    case 'fleet_manager':
      categories = getFleetManagerHelp();
      roleLabel = 'מנהל צי';
      break;
    case 'private_customer':
      categories = getPrivateCustomerHelp();
      roleLabel = 'לקוח פרטי';
      break;
    default:
      categories = getDriverHelp();
      roleLabel = 'נהג';
  }

  return (
    <>
      {!dismissed && (
        <div className="fixed bottom-28 right-4 md:bottom-6 md:right-6 z-50">
          <button
            onClick={handleOpen}
            className={`relative h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/20 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${showPulse ? 'animate-[help-bounce_1.5s_ease-in-out_infinite]' : ''}`}
            aria-label="עזרה"
          >
            <HelpCircle className="h-5 w-5" />
            {showPulse && (
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="absolute -top-2 -right-2 bg-muted border-2 border-background text-muted-foreground shadow-md flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
            style={{ width: '24px', height: '24px', minWidth: '24px', minHeight: '24px', borderRadius: '50%' }}
            aria-label="הסתר עזרה"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-2xl h-[90vh] max-h-[90vh] p-0 overflow-visible [&>button:last-child]:hidden flex flex-col">
          {/* Close X circle */}
          <button
            onClick={() => setOpen(false)}
            className="absolute -top-3 -right-3 z-10 h-9 w-9 rounded-full bg-destructive text-destructive-foreground shadow-lg border-2 border-background flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
          <DialogHeader className="p-6 pb-2 bg-primary text-primary-foreground rounded-t-lg shrink-0">
            <DialogTitle className="text-xl text-primary-foreground">מרכז עזרה</DialogTitle>
            <DialogDescription className="text-primary-foreground/80">
              הדרכה עבור: <span className="font-bold text-primary-foreground">{roleLabel}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden rounded-b-lg min-h-0">
            <Tabs defaultValue="ai" className="h-full flex flex-col" dir="rtl">
              <TabsList className="grid grid-cols-2 mx-4 mt-3 shrink-0">
                <TabsTrigger value="ai" className="gap-1.5">
                  <Bot className="w-4 h-4" />
                  עוזר AI
                </TabsTrigger>
                <TabsTrigger value="guide" className="gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  מדריך
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="flex-1 overflow-hidden mt-2 px-2">
                <AIChatAssistant />
              </TabsContent>

              <TabsContent value="guide" className="flex-1 overflow-hidden mt-2">
                <ScrollArea className="h-full p-4" dir="rtl">
                  <div className="space-y-6">
                    {categories.map((category, catIdx) => (
                      <div key={catIdx}>
                        <h3 className="text-sm font-black text-primary mb-2 px-1">{category.label}</h3>
                        <Accordion type="multiple" className="space-y-2">
                          {category.sections.map((section, idx) => (
                            <AccordionItem key={idx} value={`cat-${catIdx}-section-${idx}`} className="border rounded-xl px-4 bg-card">
                              <AccordionTrigger className="hover:no-underline gap-3">
                                <div className="flex items-center gap-3">
                                  {section.icon}
                                  <span className="font-semibold text-sm">{section.title}</span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <ul className="space-y-2 pr-8">
                                  {section.content.map((item, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                                {section.link && (
                                  <button
                                    onClick={() => handleNavigate(section.link!)}
                                    className="mt-3 mr-8 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    עבור לדף
                                  </button>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
