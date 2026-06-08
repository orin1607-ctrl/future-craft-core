import { Car, Search, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PREVIEW_VEHICLE, PREVIEW_DRIVERS } from '@/dev/vehicleHubPreviewMock';
import { statusLabel } from '@/components/vehicles/vehicleHubUtils';

const MOCK_VEHICLES = [
  PREVIEW_VEHICLE,
  {
    ...PREVIEW_VEHICLE,
    id: 'preview-vehicle-2',
    license_plate: '98-765-43',
    internal_number: 'VH-017',
    manufacturer: 'מרצדס',
    model: 'ספרינטר',
    year: 2020,
    status: 'in_service',
    odometer: 142300,
    assigned_driver_id: null,
  },
  {
    ...PREVIEW_VEHICLE,
    id: 'preview-vehicle-3',
    license_plate: '11-222-33',
    internal_number: 'VH-088',
    manufacturer: 'קיה',
    model: 'פיקנטו',
    year: 2019,
    status: 'out_of_service',
    odometer: 198500,
    assigned_driver_id: 'preview-driver-1',
  },
];

function getDriverName(id: string | null) {
  if (!id) return 'לא משויך';
  return PREVIEW_DRIVERS.find((d) => d.id === id)?.full_name || 'לא ידוע';
}

/** תצוגת פיתוח — רשימת רכבים עם עברית תקינה, ללא DB */
export default function DevVehiclesListPreview() {
  return (
    <div className="min-h-screen bg-background animate-fade-in" dir="rtl">
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2 text-center text-xs">
        תצוגת פיתוח — רשימת רכבים ·{' '}
        <Link to="/dev/vehicle-card" className="underline font-semibold">
          כרטיס רכב
        </Link>
      </div>
      <div className="max-w-3xl mx-auto px-3 py-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h1 className="page-header !mb-0 flex items-center gap-3">
            <Car size={28} /> ניהול רכבים
          </h1>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px]"
          >
            <Download size={18} /> ייצוא
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <input
            readOnly
            placeholder="חיפוש לפי מספר רכב, מספר פנימי, יצרן או דגם..."
            className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background"
          />
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {[
            { key: 'all', label: 'הכל', count: 3 },
            { key: 'active', label: 'פעיל', count: 1 },
            { key: 'in_service', label: 'בטיפול', count: 1 },
            { key: 'out_of_service', label: 'לא פעיל', count: 1 },
            { key: 'archived', label: 'ארכיון', count: 0 },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                f.key === 'all' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {MOCK_VEHICLES.map((v) => {
            const sl = statusLabel(v.status);
            return (
              <div key={v.id} className="card-elevated w-full">
                <div className="flex items-center gap-4">
                  <Link to="/dev/vehicle-card" className="flex items-center gap-4 flex-1 text-right min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Car size={28} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-bold truncate">
                        {v.manufacturer} {v.model}
                      </p>
                      <p className="text-muted-foreground text-lg truncate">
                        {v.license_plate}
                        {v.internal_number ? ` | ${v.internal_number}` : ''} • {v.year}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        נהג: {getDriverName(v.assigned_driver_id)}
                      </p>
                    </div>
                  </Link>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`status-badge ${sl.cls}`}>{sl.text}</span>
                    <span className="text-sm text-muted-foreground">
                      {(v.odometer || 0).toLocaleString()} ק&quot;מ
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
