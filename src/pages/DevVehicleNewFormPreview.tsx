import { Link } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';

/** תצוגת טופס הוספת רכב (משרד רישוי) — ללא שמירה */
export default function DevVehicleNewFormPreview() {
  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto animate-fade-in" dir="rtl">
      <div className="bg-primary text-primary-foreground rounded-xl p-3 mb-4 text-center text-sm font-bold">
        תצוגה — טופס הוספת רכב חדש (ללא שמירה ל-DB)
      </div>
      <button type="button" className="flex items-center gap-2 text-primary font-medium mb-4">
        <ArrowRight size={20} /> חזרה
      </button>
      <h1 className="text-2xl font-bold mb-2">הוספת רכב חדש</h1>
      <div className="card-elevated p-4 mb-6 border-primary/30 bg-primary/5">
        <p className="text-sm font-bold text-primary">אחרי שמירה → כרטיס VehicleHub</p>
        <p className="text-sm text-muted-foreground mt-1">
          <Link to="/dev/vehicle-card" className="underline">ראה כרטיס דמו</Link>
        </p>
      </div>

      <div className="space-y-5 card-elevated p-4">
        <div>
          <label className="block text-lg font-medium mb-2">מספר רכב (רישוי) *</label>
          <div className="flex gap-2">
            <input
              readOnly
              value="12-345-67"
              className="flex-1 p-4 text-lg rounded-xl border-2 border-input bg-background"
              dir="ltr"
            />
            <Button type="button" className="h-auto px-4 whitespace-nowrap">
              <Search className="h-5 w-5 ml-1" />
              משרד הרישוי / התחבורה
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">כפתור שליפה — אותה פונקציה `fetchVehicleFromGov`</p>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">מספר פנימי</label>
          <input readOnly value="VH-099" className="w-full p-4 rounded-xl border-2 border-input" dir="ltr" />
        </div>
        <p className="text-sm text-center text-muted-foreground pt-4">
          רכב לדוגמה: <VehiclePlateLine plate="12-345-67" internal="VH-099" className="font-bold" />
        </p>
        <Link
          to="/dev/vehicle-form-live/full"
          className="mt-6 block w-full py-4 rounded-xl bg-primary text-primary-foreground text-center font-bold text-lg"
        >
          המשך → טופס מלא (סעיפים 1–5)
        </Link>
        <p className="text-xs text-center text-muted-foreground mt-2">
          כמו אחרי &quot;מלא פרטים בטופס&quot; / שליפת רישוי
        </p>
      </div>
    </div>
  );
}
