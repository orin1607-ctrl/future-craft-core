import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import VehicleHub from '@/components/vehicles/VehicleHub';
import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';
import {
  PREVIEW_VEHICLE,
  PREVIEW_DRIVERS,
  PREVIEW_DRILL_DOWN,
  PREVIEW_INSURER,
  PREVIEW_OPEN_ISSUES,
} from '@/dev/vehicleHubPreviewMock';
import { PREVIEW_FLEETOS_VEHICLES } from '@/dev/fleetOSPreviewMock';

function fleetosRowToHubVehicle(row: (typeof PREVIEW_FLEETOS_VEHICLES)[number]): VehicleHubVehicle {
  return {
    ...PREVIEW_VEHICLE,
    id: row.id,
    license_plate: row.plate,
    internal_number: row.internal_number || PREVIEW_VEHICLE.internal_number,
    manufacturer: row.make || PREVIEW_VEHICLE.manufacturer,
    model: row.model || PREVIEW_VEHICLE.model,
    odometer: row.odometer ?? PREVIEW_VEHICLE.odometer,
    status: row.in_garage ? 'in_service' : row.status === 'offline' ? 'out_of_service' : 'active',
    notes: `תצוגת פיתוח FleetOS · vehicle.id=${row.id}`,
  };
}

/**
 * תצוגת פיתוח — כרטיס רכב מלא ללא התחברות וללא שמירה ל-DB.
 * פתיחה: /dev/vehicle-card?vehicleId=...
 */
export default function DevVehicleHubPreview() {
  const [searchParams] = useSearchParams();
  const vehicleId = searchParams.get('vehicleId') || '';
  const fleetosRow = vehicleId ? PREVIEW_FLEETOS_VEHICLES.find((v) => v.id === vehicleId) : null;
  const vehicle = fleetosRow ? fleetosRowToHubVehicle(fleetosRow) : PREVIEW_VEHICLE;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 text-center shadow-md">
        <p className="font-bold text-sm">תצוגת פיתוח — כרטיס רכב (Future Craft)</p>
        {vehicleId && (
          <p className="text-xs opacity-90 mt-1" dir="ltr">
            vehicleId: {vehicleId} · plate: {vehicle.license_plate}
          </p>
        )}
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
          vehicle={vehicle}
          drivers={PREVIEW_DRIVERS}
          isManager
          onBack={() => toast.info('תצוגת פיתוח — אין רשימת רכבים')}
          onEdit={() => toast.info('תצוגת פיתוח — עריכה דרך /vehicles לאחר התחברות')}
          onDelete={() => toast.error('תצוגת פיתוח — מחיקה מבוטלת')}
          onRefresh={() => {}}
          getDriverName={() => fleetosRow?.driver_name || 'אבי כהן'}
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
