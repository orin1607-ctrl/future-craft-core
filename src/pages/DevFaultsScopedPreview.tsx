import { Link } from 'react-router-dom';
import { Wrench, Search, Filter } from 'lucide-react';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import { PREVIEW_VEHICLE } from '@/dev/vehicleHubPreviewMock';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';
/** תצוגת UI — תקלות scoped מכרטיס רכב (ללא DB) */
export default function DevFaultsScopedPreview() {
  const plate = PREVIEW_VEHICLE.license_plate;

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-sky-600 text-white text-center text-xs font-bold py-2 px-3 rounded-lg mb-4">
        תצוגת פיתוח — תקלות scoped · dalia-staging UI ·{' '}
        <Link to="/dev/vehicle-card" className="underline">
          כרטיס רכב
        </Link>
      </div>
      <Link
        to="/dev/vehicle-card"
        className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4 min-h-[44px]"
      >
        ← חזרה לכרטיס הרכב
      </Link>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-4">
        <Wrench size={24} /> תקלות
      </h1>
      <EntityContextBanner label={`רכב ${plate}`} strict />
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          disabled
          placeholder="חיפוש לפי נהג, רכב, סוג, תיאור..."
          className="w-full pr-12 pl-12 p-4 text-lg rounded-2xl border-2 border-input bg-muted/30"
        />
        <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-muted-foreground">
          <Filter size={18} />
        </button>
      </div>
      <div className="card-elevated p-8 text-center text-muted-foreground">{VEHICLE_EMPTY_LIST_MSG}</div>
    </div>
  );
}
