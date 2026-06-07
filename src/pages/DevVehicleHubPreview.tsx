import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import VehicleHub from '@/components/vehicles/VehicleHub';
import {
  PREVIEW_VEHICLE,
  PREVIEW_DRIVERS,
  PREVIEW_DRILL_DOWN,
  PREVIEW_INSURER,
  PREVIEW_OPEN_ISSUES,
} from '@/dev/vehicleHubPreviewMock';

/**
 * תצוגת פיתוח — כרטיס רכב מלא ללא התחברות וללא שמירה ל-DB.
 * פתיחה: /dev/vehicle-card
 */
export default function DevVehicleHubPreview() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 text-center shadow-md">
        <p className="font-bold text-sm">תצוגת פיתוח — כרטיס רכב (Future Craft)</p>
        <p className="text-xs opacity-90 mt-1">
          לא שומר ל-Supabase · דשבורד לחיץ ·{' '}
          <Link to="/dev/vehicle-flows" className="underline font-semibold">
            מדריך זרימות
          </Link>
          {' · '}
          <Link to="/vehicle-hub-full-preview.html" className="underline font-semibold" target="_blank">
            HTML
          </Link>
          {' · '}
          <Link to="/vehicles" className="underline font-semibold">
            רכבים (התחברות)
          </Link>
        </p>
      </div>
      <div className="max-w-3xl mx-auto px-3 py-4 pb-24">
        <VehicleHub
          previewMode
          vehicle={PREVIEW_VEHICLE}
          drivers={PREVIEW_DRIVERS}
          isManager
          onBack={() => toast.info('תצוגת פיתוח — אין רשימת רכבים')}
          onEdit={() => toast.info('תצוגת פיתוח — עריכה דרך /vehicles לאחר התחברות')}
          onDelete={() => toast.error('תצוגת פיתוח — מחיקה מבוטלת')}
          onRefresh={() => {}}
          getDriverName={() => 'אבי כהן'}
          previewHubExtras={{
            semiInspection: '2024-10-15',
            triInspection: null,
            latestInsurer: PREVIEW_INSURER,
            openIssuesCount: PREVIEW_OPEN_ISSUES,
            drillDown: PREVIEW_DRILL_DOWN,
          }}
        />
      </div>
    </div>
  );
}
