import { Link } from 'react-router-dom';
import VehicleNewFormDalia from '@/components/vehicles/vehicleNewDalia/VehicleNewFormDalia';

/** תצוגת UI — טופס Claude מלא · ללא DB */
export default function DevVehicleNewFormDalia() {
  return (
    <div className="min-h-screen bg-[#0d1117] p-4" dir="rtl">
      <div className="max-w-[760px] mx-auto mb-4 text-center">
        <p className="text-[#e3b341] text-sm font-bold">תצוגת פיתוח — פתיחת רכב חדש (קוד Claude)</p>
        <p className="text-[#8b949e] text-xs mt-1">
          <Link to="/vehicles" className="underline text-[#58a6ff]">
            חזרה לרכבים (התחברות)
          </Link>
          {' · '}
          <Link to="/dev/vehicle-card" className="underline text-[#58a6ff]">
            כרטיס רכב (לא השתנה)
          </Link>
        </p>
      </div>
      <VehicleNewFormDalia
        initialPlate="12-345-67"
        initialInternal="VH-099"
        onBackToStep1={() => window.history.back()}
        onCancel={() => window.history.back()}
        showPreviewBanner
        previewMode
      />
    </div>
  );
}
