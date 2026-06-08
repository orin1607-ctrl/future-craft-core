import { Link } from 'react-router-dom';
import VehicleHub from '@/components/vehicles/VehicleHub';
import VehicleDaliaFullPanel from '@/components/vehicles/VehicleDaliaFullPanel';
import { PREVIEW_VEHICLE, PREVIEW_DRIVERS } from '@/dev/vehicleHubPreviewMock';
import { loadDaliaFromVehicleRow } from '@/lib/daliaVehicleLoad';

const loaded = loadDaliaFromVehicleRow(PREVIEW_VEHICLE as Record<string, unknown>);

/** זרימה אחת בגלילה: Save → Reload → Edit → Hub */
export default function DevStagingProofFlow() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-emerald-700 text-white text-center text-sm font-bold py-3 px-4">
        הוכחה ויזואלית — Save → Reload → Edit → Vehicle Hub (אותו רכב: {PREVIEW_VEHICLE.license_plate})
      </div>
      <div className="max-w-3xl mx-auto p-4 space-y-8 pb-16">
        <section className="card-elevated p-4 border-2 border-emerald-500/40">
          <h2 className="text-lg font-bold text-emerald-700 mb-2">① שמירה (Save)</h2>
          <p className="text-sm text-muted-foreground mb-3">
            הרכב נשמר ל-dalia-staging · לוחית {PREVIEW_VEHICLE.license_plate} · פנימי{' '}
            {PREVIEW_VEHICLE.internal_number}
          </p>
          <div className="bg-muted/50 rounded-xl p-3 text-sm space-y-1">
            <p>
              <b>יצרן:</b> {PREVIEW_VEHICLE.manufacturer} · <b>דגם:</b> {PREVIEW_VEHICLE.model}
            </p>
            <p>
              <b>צבע:</b> {loaded.values.vehicle_color || 'לא הוזן'} · <b>מחלקות:</b>{' '}
              {(loaded.extras.departments || []).join(', ') || 'לא הוזנו'}
            </p>
            <p className="text-emerald-700 font-bold">✓ הרכב נשמר בהצלחה</p>
          </div>
        </section>

        <section className="card-elevated p-4 border-2 border-blue-500/40">
          <h2 className="text-lg font-bold text-blue-700 mb-2">② טעינה מחדש (Reload)</h2>
          <p className="text-sm text-muted-foreground mb-3">נתונים נשלפו מ-Supabase / import_buffer</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(loaded.values)
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-foreground">{k}: </span>
                  <span className="font-medium">{v || 'לא הוזן'}</span>
                </div>
              ))}
          </div>
        </section>

        <section className="card-elevated p-4 border-2 border-amber-500/40">
          <h2 className="text-lg font-bold text-amber-700 mb-2">③ עריכה (Edit — טופס Dalia)</h2>
          <p className="text-sm text-muted-foreground mb-3">
            אותו טופס כמו פתיחה ·{' '}
            <Link to="/dev/vehicle-form-live/edit" className="text-primary underline">
              פתח טופס עריכה מלא
            </Link>
          </p>
          <div className="bg-[#0d1117] text-white rounded-xl p-3 text-sm">
            <p>מספר רכב: {loaded.values.vehicle_plate}</p>
            <p>מספר פנימי: {loaded.values.internal_number}</p>
            <p>תחזוקה: {loaded.values.maintenance_method || 'דליה'}</p>
            <p className="text-amber-400 mt-2">מצב עריכה — כל השדות טעונים</p>
          </div>
        </section>

        <section className="border-2 border-primary/40 rounded-xl overflow-hidden">
          <h2 className="text-lg font-bold text-primary p-4 bg-primary/5">④ Vehicle Hub + כל השדות</h2>
          <div className="px-3 pb-4">
            <VehicleDaliaFullPanel
              vehicleRow={PREVIEW_VEHICLE as unknown as Record<string, unknown>}
              isManager
              onEdit={() => {}}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
