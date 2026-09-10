import { Link } from 'react-router-dom';
import { AlertTriangle, Car } from 'lucide-react';
import { PREVIEW_DRILL_DOWN, PREVIEW_VEHICLE } from '@/dev/vehicleHubPreviewMock';
import { openDefectLabel } from '@/lib/openVehicleDefects';

/** תצוגת UI — ניהול ליקויים scoped מכרטיס רכב (ללא DB) */
export default function DevVehicleTasksPreview() {
  const defects = PREVIEW_DRILL_DOWN.openIssues.filter((i) => i.kind === 'defect');
  const plate = PREVIEW_VEHICLE.license_plate;

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-sky-600 text-white text-center text-xs font-bold py-2 px-3 rounded-lg mb-4">
        תצוגת פיתוח — ניהול ליקויים · לא שומר ל-DB ·{' '}
        <Link to="/dev/vehicle-card" className="underline">
          כרטיס רכב
        </Link>
      </div>
      <h1 className="page-header flex items-center gap-3">
        <AlertTriangle size={28} /> ניהול ליקויים
      </h1>
      <p className="text-muted-foreground mb-3">ליקויים שנמצאו בביקורות רכב — מעקב וטיפול</p>
      <p className="text-sm text-muted-foreground mb-4">
        מוצגים ליקויי הרכב הזה בלבד — תיאור, תאריך פתיחה וסטטוס. {openDefectLabel(defects.length)}.
      </p>
      <div className="space-y-3">
        {defects.map((d) => (
          <div key={d.id} className="card-elevated p-4">
            <p className="text-lg font-bold">{d.title}</p>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
              <Car size={14} />
              <span className="font-medium">רכב {plate}</span>
              <span>•</span>
              <span>{d.date}</span>
              <span>•</span>
              <span>{d.status}</span>
            </div>
            {d.description ? (
              <p className="text-sm text-muted-foreground mt-1.5 bg-muted/50 p-2 rounded-lg">{d.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
