import { Link } from 'react-router-dom';
import { VehicleForm } from '@/pages/Vehicles';
import { PREVIEW_VEHICLE } from '@/dev/vehicleHubPreviewMock';

const MOCK_USER = {
  id: 'dev-preview-user',
  full_name: 'מנהל דמו',
  company_name: 'חברת דמו',
  role: 'fleet_manager',
};

/** אותו VehicleForm כמו /vehicles אחרי login — ללא שמירה ל-DB אם אין session */
export default function DevVehicleFormLive({
  initialStep = 'intro',
  mockGov = false,
  openAllSections = false,
  editPreview = false,
}: {
  initialStep?: 'intro' | 'full';
  mockGov?: boolean;
  openAllSections?: boolean;
  editPreview?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-amber-500/90 text-amber-950 text-center text-xs font-bold py-2 px-3">
        תצוגת פיתוח — אותו טופס כמו במערכת אמיתית (VehicleForm) ·{' '}
        <Link to="/dev/vehicle-card" className="underline">
          כרטיס רכב
        </Link>
        {editPreview && (
          <>
            {' · '}
            <span className="font-extrabold">מצב עריכה (נתונים טעונים)</span>
          </>
        )}
      </div>
      <div className="p-4 max-w-lg mx-auto">
        <VehicleForm
          vehicle={editPreview ? (PREVIEW_VEHICLE as never) : null}
          drivers={[]}
          user={MOCK_USER}
          previewMode={!editPreview}
          onBack={() => window.history.back()}
          onDone={() => {}}
          previewInitialStep={initialStep}
          previewMockGov={mockGov}
          previewOpenAllSections={openAllSections}
        />
      </div>
    </div>
  );
}
