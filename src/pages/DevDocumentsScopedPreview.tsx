import { Link } from 'react-router-dom';
import { FileText, Car } from 'lucide-react';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import { PREVIEW_VEHICLE } from '@/dev/vehicleHubPreviewMock';
/** תצוגת UI — מסמכים scoped מכרטיס רכב (ללא DB) */
export default function DevDocumentsScopedPreview() {
  const plate = PREVIEW_VEHICLE.license_plate;
  const categories = [
    { icon: '🚗', label: 'רישיונות רכב', count: 0 },
    { icon: '🛡️', label: 'ביטוח חובה', count: 1 },
    { icon: '📋', label: 'ביטוח מקיף', count: 0 },
    { icon: '✅', label: 'טסט', count: 0 },
  ];

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto" dir="rtl">
      <div className="bg-sky-600 text-white text-center text-xs font-bold py-2 px-3 rounded-lg mb-4">
        תצוגת פיתוח — מסמכים scoped · dalia-staging UI ·{' '}
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
      <h1 className="page-header flex items-center gap-3">
        <FileText size={28} /> מסמכים
      </h1>
      <EntityContextBanner label={`רכב ${plate}`} strict />
      <div className="card-elevated p-4 mb-4">
        <p className="font-bold flex items-center gap-2">
          <Car size={18} /> מסמכי רכב — {plate}
        </p>
        <p className="text-sm text-muted-foreground mt-1">מסונן לרכב זה בלבד</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((c) => (
          <div key={c.label} className="card-elevated p-4 flex flex-col gap-2">
            <span className="text-2xl">{c.icon}</span>
            <span className="font-bold">{c.label}</span>
            <span className="text-sm text-muted-foreground">{c.count} מסמכים</span>
          </div>
        ))}
      </div>
    </div>
  );
}
