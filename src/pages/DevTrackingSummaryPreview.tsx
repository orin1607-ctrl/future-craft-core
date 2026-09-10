import { Link } from 'react-router-dom';
import TrackingSummaryGrid from '@/components/vehicle-tracking/TrackingSummaryGrid';
import type { SummaryFilterKey } from '@/lib/vehicleTrackingData';

const ZERO_COUNTS = {
  total: 0,
  attention: 0,
  active: 0,
  service: 0,
  transport: 0,
  accident: 0,
  defect: 0,
  fault: 0,
  alert: 0,
  garage: 0,
  disabled: 0,
  nodriver: 0,
  testSoon: 0,
  insSoon: 0,
  km: 0,
} as Record<SummaryFilterKey, number>;

/** תצוגת UI — כותרות סיכום מעקב רכב (ללא DB / ללא שינוי ספירה) */
export default function DevTrackingSummaryPreview() {
  return (
    <div className="min-h-screen bg-background p-4 max-w-3xl mx-auto" dir="rtl">
      <div className="bg-sky-600 text-white text-center text-xs font-bold py-2 px-3 rounded-lg mb-4">
        תצוגת פיתוח — מעקב רכב · כותרות סיכום צי · לא טוען נתונים
      </div>
      <h1 className="page-header mb-4">מעקב רכב</h1>
      <TrackingSummaryGrid counts={ZERO_COUNTS} activeKey={null} onSelect={() => {}} />
      <Link to="/dev/vehicle-card" className="text-primary text-sm font-medium mt-6 inline-block min-h-[44px]">
        חזרה לכרטיס רכב
      </Link>
    </div>
  );
}
