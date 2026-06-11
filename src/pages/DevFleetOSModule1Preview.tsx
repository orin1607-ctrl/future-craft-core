import { useNavigate } from 'react-router-dom';
import FleetStatusModule from '@/modules/fleetos/FleetStatusModule';
import {
  PREVIEW_FLEETOS_ALERTS,
  PREVIEW_FLEETOS_KPIS,
  PREVIEW_FLEETOS_PREFS,
  PREVIEW_FLEETOS_VEHICLES,
} from '@/dev/fleetOSPreviewMock';

/**
 * תצוגת פיתוח — FleetOS AI מודול 1 (מצב צי) ללא התחברות.
 * פתיחה: /dev/fleetos-module1
 */
export default function DevFleetOSModule1Preview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="hidden md:block fixed inset-y-0 right-0 w-72 bg-[hsl(218,58%,15%)] z-10" aria-hidden />
      <main className="md:mr-72 p-4 md:p-6 max-w-7xl mx-auto pb-24 relative z-20">
        <FleetStatusModule
          userRole="fleet_admin"
          prefs={PREVIEW_FLEETOS_PREFS}
          vehicles={PREVIEW_FLEETOS_VEHICLES}
          alerts={PREVIEW_FLEETOS_ALERTS}
          kpis={PREVIEW_FLEETOS_KPIS}
          onRefresh={() => {}}
          onOpenVehicleHub={(vehicle) => {
            const params = new URLSearchParams({ vehicleId: vehicle.id });
            navigate(`/dev/vehicle-card?${params.toString()}`);
          }}
        />
      </main>
    </div>
  );
}
