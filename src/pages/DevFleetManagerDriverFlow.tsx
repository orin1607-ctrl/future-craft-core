import { Link } from 'react-router-dom';
import { Building2, LayoutDashboard, Users, ArrowRight, Car, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntityContextBanner } from '@/components/EntityContextBanner';

const MOCK_FM = { name: 'יוסי כהן', company: 'דליה לוגיסטיקה' };
const MOCK_DRIVER = { name: 'דוד לוי', phone: '050-1234567', id: 'preview-driver-1' };

/** תצוגת פיתוח — זרימה מנהל צי → נהג → דשבורד נהג (ללא login) */
export default function DevFleetManagerDriverFlow() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2 text-center text-xs">
        תצוגת פיתוח — זרימת מנהל צי → דשבורד נהג ·{' '}
        <Link to="/dashboard" className="underline font-semibold">
          דשבורד
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-3 py-6 space-y-10 pb-24">
        {/* שלב 1 */}
        <section>
          <p className="text-xs font-bold text-primary mb-2">שלב 1 — כרטיס מנהל צי</p>
          <div className="card-elevated">
            <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Building2 size={24} className="text-primary" />
              {MOCK_FM.name}
            </h1>
            <p className="text-muted-foreground text-sm mb-4">חברה: {MOCK_FM.company}</p>
            <h2 className="font-bold mb-3">פעולות מנהל צי</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="card-elevated py-3 px-4 text-sm font-bold text-center border-2 border-primary bg-primary/5">
                נהגים באחריותו
              </div>
              <div className="card-elevated py-3 px-4 text-sm font-bold text-center text-muted-foreground">לקוחות</div>
            </div>
          </div>
        </section>

        {/* שלב 2 */}
        <section>
          <p className="text-xs font-bold text-primary mb-2">שלב 2 — בחירת נהג + כפתור ישיר</p>
          <EntityContextBanner label={`נהגים באחריות מנהל צי · ${MOCK_FM.company}`} strict />
          <div className="card-elevated mt-3">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 rounded-2xl bg-info/10 flex items-center justify-center">
                <Users size={28} className="text-info" />
              </div>
              <div className="flex-1">
                <p className="text-xl font-bold">{MOCK_DRIVER.name}</p>
                <p className="text-muted-foreground">{MOCK_DRIVER.phone}</p>
              </div>
              <span className="status-badge status-active">פעיל</span>
            </div>
            <Button type="button" className="w-full h-12 font-bold gap-2">
              <LayoutDashboard size={18} />
              פתח דשבורד נהג
            </Button>
          </div>
          <div className="card-elevated mt-4">
            <h1 className="text-2xl font-bold mb-4">{MOCK_DRIVER.name}</h1>
            <Button type="button" className="w-full h-14 text-lg font-bold gap-2 mb-4 shadow-md">
              <LayoutDashboard size={22} />
              פתח דשבורד נהג
            </Button>
            <p className="text-sm text-muted-foreground">כרטיס נהג — כפתור ראשי בולט למעלה</p>
          </div>
        </section>

        {/* שלב 3 */}
        <section>
          <p className="text-xs font-bold text-primary mb-2">שלב 3 — דשבורד נהג (נתונים של נהג זה בלבד)</p>
          <EntityContextBanner label={`נהג: ${MOCK_DRIVER.name}`} strict />
          <div className="animate-fade-in space-y-4 mt-3">
            <header>
              <h1 className="text-2xl font-black">דשבורד נהג (צפייה מנהל)</h1>
              <p className="text-muted-foreground">{MOCK_DRIVER.name}</p>
              <p className="text-muted-foreground text-sm">{MOCK_FM.company}</p>
            </header>
            <section className="card-elevated p-4">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Car size={18} className="text-primary" />
                הרכב המשויך
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">מספר רכב</p>
                  <p className="font-bold">123-45-678</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">דגם</p>
                  <p className="font-bold">טויוטה קורולה</p>
                </div>
              </div>
            </section>
            <section className="card-elevated p-4">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Bell size={18} className="text-primary" />
                התראות נהג
              </h2>
              <p className="text-sm text-muted-foreground">רק התראות של {MOCK_DRIVER.name} והרכב המשויך</p>
            </section>
            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
              <ArrowRight size={14} className="rotate-180" />
              חזרה לכרטיס נהג
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
