import { Link } from 'react-router-dom';
import { AlertTriangle, Car } from 'lucide-react';
import { PREVIEW_VEHICLE } from '@/dev/vehicleHubPreviewMock';
import { buildAccidentDetailUrl, buildAllAccidentsUrl, buildVehicleContextUrl } from '@/lib/entityNavContext';
import { accidentBelongsToVehicle } from '@/lib/accidentListFilter';

const MOCK_ACCIDENTS = [
  {
    id: 'acc-77-a',
    vehicle_plate: PREVIEW_VEHICLE.license_plate,
    description: 'פגיעה בפגוש קדמי',
    status: 'open',
  },
  {
    id: 'acc-other',
    vehicle_plate: '99-999-99',
    description: 'תאונה של רכב אחר',
    status: 'open',
  },
];

/** תצוגת UI — ניווט תאונות קיים (ללא DB / ללא עמוד מקביל) */
export default function DevAccidentsNavPreview() {
  const plate = PREVIEW_VEHICLE.license_plate;
  const vehicleId = PREVIEW_VEHICLE.id;
  const scoped = MOCK_ACCIDENTS.filter((a) => accidentBelongsToVehicle(a, plate));
  const reportUrl = buildAccidentDetailUrl(scoped[0].id, { plate, vehicleId });
  const listUrl = buildVehicleContextUrl('/accidents', { plate, vehicleId });

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-sky-600 text-white text-center text-xs font-bold py-2 px-3 rounded-lg mb-4">
        תצוגת פיתוח — ניווט תאונות · לא שומר ל-DB ·{' '}
        <Link to="/dev/vehicle-card" className="underline">
          כרטיס רכב
        </Link>
      </div>
      <h1 className="page-header flex items-center gap-3">
        <AlertTriangle size={28} /> תאונות הרכב
      </h1>
      <p className="text-sm text-muted-foreground mb-3">
        מוצגות תאונות הרכב הזה בלבד. מספר פנימי:{' '}
        <span className="font-bold text-destructive">{PREVIEW_VEHICLE.internal_number}</span>
        {' · '}מחלקה: {PREVIEW_VEHICLE.department}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          to={listUrl}
          className="px-4 py-2 rounded-xl border border-primary/30 text-primary text-sm font-bold min-h-[44px] inline-flex items-center"
        >
          תאונות (כרטיס רכב)
        </Link>
        <Link
          to={buildAllAccidentsUrl()}
          className="px-4 py-2 rounded-xl border border-primary/30 text-primary text-sm font-bold min-h-[44px] inline-flex items-center"
        >
          כל התאונות
        </Link>
      </div>
      <div className="space-y-3">
        {scoped.map((a) => (
          <Link key={a.id} to={reportUrl} className="card-elevated block p-4 hover:border-primary/40">
            <p className="text-lg font-bold flex items-center gap-2">
              <Car size={16} /> {a.vehicle_plate}
            </p>
            <p className="text-sm text-muted-foreground">{a.description}</p>
            <p className="text-xs text-primary mt-2 font-semibold">פתח דוח תאונה ←</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
