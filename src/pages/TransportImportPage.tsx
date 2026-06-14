import { Link } from 'react-router-dom';
import { Bus, Upload } from 'lucide-react';

/** Placeholder — dry-run import wizard comes in a later phase. */
export default function TransportImportPage() {
  return (
    <div className="animate-fade-in space-y-6 pb-8 max-w-xl mx-auto">
      <div>
        <Link to="/transport" className="text-primary text-sm font-medium">
          ← חזרה למרכז הסעות
        </Link>
      </div>

      <header className="text-center space-y-2">
        <Upload size={48} className="mx-auto text-primary opacity-80" />
        <h1 className="page-header">יבוא נתונים — Dry Run</h1>
        <p className="text-muted-foreground text-sm">אשף יבוא נתונים (ללא כתיבה ל-DB) — שלב עתידי, באישור.</p>
      </header>

      <div className="card-elevated space-y-3 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Bus size={18} className="text-primary" />
          Staging בלבד
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>לא מבוצע import אמיתי</li>
          <li>לא נמחקים נתונים קיימים</li>
          <li>לא נוצרות כפילויות רכבים / נהגים / לקוחות</li>
        </ul>
      </div>
    </div>
  );
}
