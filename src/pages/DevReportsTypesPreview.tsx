import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

const REPORT_TYPES = [
  { value: 'ops_tests', label: 'טסטים' },
  { value: 'ops_treatments', label: 'טיפולים' },
  { value: 'ops_accidents', label: 'תאונות' },
  { value: 'ops_officer_inspections', label: 'ביקורות קצין רכב' },
  { value: 'ops_insurance', label: 'ביטוחים לחידוש' },
  { value: 'vehicles', label: 'סיכום רכבים' },
  { value: 'drivers', label: 'סיכום נהגים' },
  { value: 'expenses', label: 'הוצאות לפי תקופה' },
  { value: 'profit_loss', label: 'רווח והפסד' },
  { value: 'service_orders', label: 'הזמנות' },
  { value: 'vendors', label: 'סיכום לפי ספקים' },
];

/** תצוגת UI — כפתורי סוגי דוח אחרי הסרת הכפילויות (ללא DB) */
export default function DevReportsTypesPreview() {
  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-sky-600 text-white text-center text-xs font-bold py-2 px-3 rounded-lg mb-4">
        תצוגת פיתוח — סוגי דוח להצגה · לא טוען נתונים
      </div>
      <h1 className="page-header flex items-center gap-3">
        <BarChart3 size={28} /> דוחות
      </h1>
      <label className="block text-sm font-medium mb-2">סוגי דוח להצגה</label>
      <div className="flex flex-wrap gap-2">
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.value}
            type="button"
            className="px-3 py-2 rounded-xl text-sm font-bold border bg-primary/10 border-primary text-primary"
          >
            {rt.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        טיפולים מפורט ותאונות מפורטות הוסרו. הסיכומים פתוחות / דחופות / עלות משוערת נשארו בתוך טיפולים ותאונות.
      </p>
      <Link to="/dev/vehicle-card" className="text-primary text-sm font-medium mt-6 inline-block min-h-[44px]">
        חזרה לכרטיס רכב
      </Link>
    </div>
  );
}
