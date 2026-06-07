import { Link } from 'react-router-dom';
import { Car, Upload, Search, FileSpreadsheet, CheckCircle2 } from 'lucide-react';

/**
 * מדריך בדיקה — זרימות רכב (ללא שמירה ל-DB)
 * /dev/vehicle-flows
 */
export default function DevVehicleFlowsPreview() {
  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-primary text-primary-foreground rounded-xl p-4 mb-6 text-center">
        <h1 className="text-lg font-bold">מדריך בדיקה — זרימות רכב</h1>
        <p className="text-sm opacity-90 mt-1">ללא Commit · Merge · Push · Production</p>
      </div>

      <section className="card-elevated p-4 mb-4">
        <h2 className="font-bold flex items-center gap-2 mb-3">
          <Car size={20} className="text-primary" /> כרטיס רכב (מבנה חדש)
        </h2>
        <ul className="text-sm space-y-2 text-muted-foreground list-disc list-inside mb-3">
          <li>דשבורד מצומצם — 4 כרטיסים מרוכזים</li>
          <li>פרטי רכב · פעולות · היסטוריה · ניהול</li>
        </ul>
        <Link
          to="/dev/vehicle-card"
          className="inline-flex items-center gap-2 text-primary font-bold text-sm underline"
        >
          פתח תצוגת דמו → /dev/vehicle-card
        </Link>
      </section>

      <section className="card-elevated p-4 mb-4">
        <h2 className="font-bold flex items-center gap-2 mb-3">
          <CheckCircle2 size={20} className="text-primary" /> פתיחת רכב חדש
        </h2>
        <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
          <li>התחברות → <strong>רכבים</strong> → כפתור <strong>+</strong></li>
          <li>טופס <strong>הוספת רכב חדש</strong> (VehicleForm — ללא שינוי bindings)</li>
          <li>אחרי שמירה → נפתח אוטומטית <strong>כרטיס VehicleHub</strong> עם דשבורד חדש</li>
        </ol>
        <p className="text-xs text-primary mt-3 font-semibold">
          לא נשארים ברשימה בלבד — עוברים ישירות לכרטיס החדש
        </p>
      </section>

      <section className="card-elevated p-4 mb-4 border-primary/20">
        <h2 className="font-bold flex items-center gap-2 mb-3">
          <Search size={20} className="text-primary" /> משרד הרישוי
        </h2>
        <p className="text-sm text-muted-foreground mb-2">בטופס הוספת רכב — ללא שינוי:</p>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>הזנת מספר רכב</li>
          <li>כפתור <strong>שליפה</strong> → `fetchVehicleFromGov`</li>
          <li>דיאלוג פרטים → <strong>מלא פרטים בטופס</strong></li>
          <li>שמירה → כרטיס חדש + רישום בהיסטוריה</li>
        </ul>
      </section>

      <section className="card-elevated p-4 mb-4">
        <h2 className="font-bold flex items-center gap-2 mb-3">
          <Upload size={20} className="text-primary" /> יבוא רכבים
        </h2>
        <ul className="text-sm space-y-2 text-muted-foreground list-disc list-inside mb-3">
          <li>תפריט: <strong>יבוא רכבים</strong> → `/vehicle-import`</li>
          <li>או כפתור <strong>יבוא רכבים</strong> בעמוד רכבים</li>
          <li>מיפוי CSV — ללא שינוי</li>
          <li>אחרי יבוא → רכבים → בחר רכב → כרטיס חדש</li>
        </ul>
        <Link to="/vehicle-import" className="text-primary font-bold text-sm underline">
          פתח יבוא רכבים (נדרשת התחברות)
        </Link>
      </section>

      <section className="card-elevated p-4">
        <h2 className="font-bold flex items-center gap-2 mb-3">
          <FileSpreadsheet size={20} /> HTML סטטי
        </h2>
        <a
          href="/vehicle-hub-full-preview.html"
          target="_blank"
          rel="noreferrer"
          className="text-primary font-bold text-sm underline"
        >
          vehicle-hub-full-preview.html
        </a>
      </section>
    </div>
  );
}
