import { Link } from 'react-router-dom';
import logo from '@/assets/white-logo.png';
import screenshotDashboard from '@/assets/screenshot-dashboard.jpg';
import screenshotFaults from '@/assets/screenshot-faults.jpg';
import screenshotVehicles from '@/assets/screenshot-vehicles.jpg';
import {
  Car, Users, Wrench, FileText, BarChart3, Shield,
  TruckIcon, MessageCircle, ChevronLeft, AlertTriangle,
  ClipboardList, Route, Phone, CreditCard, Settings,
  CheckCircle2, ArrowLeft
} from 'lucide-react';

const problems = [
  { icon: Car, title: 'מידע מפוזר בכל מקום', desc: 'טבלאות אקסל, הודעות ווטסאפ ומיילים — בלי מקום אחד שמרכז הכל.' },
  { icon: Wrench, title: 'תקלות נשכחות', desc: 'אין מעקב מסודר — תקלות נופלות בין הכיסאות ולא מטופלות בזמן.' },
  { icon: FileText, title: 'מסמכים הולכים לאיבוד', desc: 'ביטוחים, רישיונות ואישורים לא מרוכזים — קשה למצוא כשצריך.' },
  { icon: TruckIcon, title: 'ספקים ושינועים בלי שליטה', desc: 'הפניות לספקים ושינועים נעשים ידנית — בלי מעקב ובלי תיעוד.' },
  { icon: Shield, title: 'אין הפרדה בין חברות', desc: 'כשמנהלים כמה חברות, קשה להפריד מידע — כל אחד רואה מה שלא שלו.' },
  { icon: BarChart3, title: 'דוחות לוקחים שעות', desc: 'במקום לקבל תמונת מצב בלחיצה, מבזבזים זמן על הכנת דוחות ידנית.' },
];

const steps = [
  { num: '1', title: 'פתיחת חשבון', desc: 'נפתח למנהל הצי חשבון במערכת עם הגדרות חברה.' },
  { num: '2', title: 'הוספת רכבים ונהגים', desc: 'מכניסים את כל הרכבים, הנהגים והלקוחות למערכת.' },
  { num: '3', title: 'ניהול תפעול שוטף', desc: 'מעקב רכב, מסלולים, שירותים ותחזוקה, שינועים — הכל במקום אחד.' },
  { num: '4', title: 'דוחות ובקרה מלאה', desc: 'מקבלים תמונת מצב בזמן אמת עם דוחות ובקרה.' },
];

const features = [
  { icon: Users, title: 'ניהול לקוחות', desc: 'כרטיס לקוח, הסכמים, מסמכים והיסטוריה' },
  { icon: Car, title: 'ניהול צי רכב', desc: 'רכבים, ביטוחים, טסטים, קילומטראז\' ושיוך נהגים' },
  { icon: Wrench, title: 'תקלות ותחזוקה', desc: 'פתיחת תקלה, מעקב סטטוס, צ\'אט והפניות לספקים' },
  { icon: Route, title: 'מסלולים ונסיעות', desc: 'תכנון מסלולים, שיוך נהגים ורכבים, מעקב ביצוע' },
  { icon: ClipboardList, title: 'שירותים ותחזוקה', desc: 'הזמנת טיפולים, אישורים ומעקב טיפול' },
  { icon: TruckIcon, title: 'שינועים', desc: 'ניהול שינועים עם אישורים ומעקב' },
  { icon: AlertTriangle, title: 'תאונות', desc: 'תיעוד תאונות, ביטוח ומעקב טיפול' },
  { icon: FileText, title: 'מסמכים', desc: 'העלאה, קטלוג ושיוך מסמכים לרכבים ונהגים' },
  { icon: BarChart3, title: 'דוחות', desc: 'דוחות כספיים, רכבים, נהגים ותפעול' },
  { icon: MessageCircle, title: 'צ\'אט פנימי', desc: 'תקשורת בזמן אמת בין משתמשי המערכת' },
  { icon: Phone, title: 'WhatsApp', desc: 'כפתור פנייה ישירה ללקוח דרך WhatsApp' },
  { icon: CreditCard, title: 'מנויים וחיוב', desc: 'ניהול חבילות, תשלומים ומעקב חיוב' },
  { icon: Settings, title: 'הגדרות והרשאות', desc: 'ניהול משתמשים, הרשאות, התראות ואישורים' },
  { icon: Shield, title: 'הפרדת חברות', desc: 'כל חברה רואה רק את המידע שלה — בידוד מלא' },
];

const screenshots = [
  { title: 'דשבורד ראשי', img: screenshotDashboard },
  { title: 'ניהול תקלות', img: screenshotFaults },
  { title: 'ניהול רכבים', img: screenshotVehicles },
];

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl" style={{ fontFamily: "'Heebo', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary/95 backdrop-blur-sm border-b border-primary-foreground/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="דליה" className="h-10" />
            <span className="text-primary-foreground font-bold text-lg hidden sm:inline">פתרונות תפעול ותחזוקה לרכב</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-primary-foreground/80 text-sm">
            <a href="#problems" className="hover:text-primary-foreground transition-colors">הבעיות</a>
            <a href="#flow" className="hover:text-primary-foreground transition-colors">איך זה עובד</a>
            <a href="#features" className="hover:text-primary-foreground transition-colors">תכונות</a>
            <a href="#screenshots" className="hover:text-primary-foreground transition-colors">צילומי מסך</a>
          </nav>
          <Link
            to="/login"
            className="bg-primary-foreground text-primary font-bold px-5 py-2 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            כניסה למערכת
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-20 sm:py-28 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
            פתרונות תפעול
            <br />
            ותחזוקה לרכב
          </h1>
          <p className="text-lg sm:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-10 leading-relaxed">
            מערכת ניהול צי רכב מקצועית שמרכזת את כל התפעול במקום אחד:
            רכבים, נהגים, מעקב רכב, מסלולים, ספקים, דוחות ועוד.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-primary-foreground text-primary font-bold text-lg px-8 py-4 rounded-2xl shadow-lg hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ArrowLeft className="w-5 h-5" />
            התחל עכשיו
          </Link>
        </div>
      </section>

      {/* Problems */}
      <section id="problems" className="py-16 sm:py-20 px-4 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">בעיות שאנחנו פותרים</h2>
          <p className="text-muted-foreground text-center mb-12 text-lg">כל הכאבים של מנהלי ציי רכב — במקום אחד</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {problems.map((p, i) => (
              <div
                key={i}
                className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <p.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Flow */}
      <section id="flow" className="py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">איך זה עובד?</h2>
          <p className="text-muted-foreground text-center mb-12 text-lg">4 שלבים פשוטים להתחלה</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground text-2xl font-extrabold flex items-center justify-center mx-auto mb-4 shadow-lg">
                  {s.num}
                </div>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-20 px-4 bg-primary text-primary-foreground">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">תכונות המערכת</h2>
          <p className="text-primary-foreground/70 text-center mb-12 text-lg">כל מה שצריך לניהול צי רכב מקצועי</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <div
                key={i}
                className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-5 border border-primary-foreground/10 hover:bg-primary-foreground/15 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <f.icon className="w-5 h-5 text-primary-foreground/80 shrink-0" />
                  <h3 className="font-bold">{f.title}</h3>
                </div>
                <p className="text-primary-foreground/60 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section id="screenshots" className="py-16 sm:py-20 px-4 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">מבט מבפנים</h2>
          <p className="text-muted-foreground text-center mb-12 text-lg">צילומי מסך מתוך המערכת</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {screenshots.map((s, i) => (
              <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-sm border border-border hover:shadow-md transition-shadow">
                <img src={s.img} alt={s.title} className="w-full aspect-video object-cover" loading="lazy" />
                <div className="p-4 text-center">
                  <h3 className="font-bold">{s.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">מוכנים להתחיל?</h2>
          <p className="text-muted-foreground text-lg mb-8">הצטרפו למנהלי ציי הרכב שכבר עובדים עם דליה</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold text-lg px-8 py-4 rounded-2xl shadow-lg hover:opacity-90 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            כניסה למערכת
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary py-6 px-4 text-center border-t border-primary-foreground/10">
        <p className="text-primary-foreground/60 text-sm">
          נבנה ע״י{' '}
          <a href="https://mao.co.il" target="_blank" rel="noopener noreferrer" className="text-primary-foreground/80 hover:text-primary-foreground underline">
            MAO.CO.IL
          </a>
          {' '}| מערכת ניהול{' '}
          <a href="https://tweak-soft.com" target="_blank" rel="noopener noreferrer" className="text-primary-foreground/80 hover:text-primary-foreground underline">
            tweak-soft.com
          </a>
          {' '}— מערכות ארגוניות לעסקים
        </p>
      </footer>
    </div>
  );
}
