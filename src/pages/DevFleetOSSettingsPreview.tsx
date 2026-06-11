import { Link } from 'react-router-dom';
import { Radar, User } from 'lucide-react';
import FleetOSDashboardPreferences from '@/modules/fleetos/FleetOSDashboardPreferences';
import { PREVIEW_FLEETOS_USER_ID } from '@/dev/fleetOSPreviewMock';

/**
 * תצוגת פיתוח — הגדרות FleetOS (התראות מותאמות) ללא התחברות.
 * פתיחה: /dev/fleetos-settings
 */
export default function DevFleetOSSettingsPreview() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="hidden md:block fixed inset-y-0 right-0 w-72 bg-[hsl(218,58%,15%)] z-10" aria-hidden />
      <main className="md:mr-72 p-4 md:p-6 max-w-3xl mx-auto pb-24 relative z-20">
        <h1 className="page-header text-2xl md:text-3xl mb-6">הגדרות</h1>

        <div className="card-elevated mb-4 p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <User size={24} className="text-primary" />
            </div>
            <div className="flex-1 text-right">
              <p className="text-lg font-bold">מנהל צי (תצוגת פיתוח)</p>
              <p className="text-muted-foreground">fleet.manager@preview.local</p>
            </div>
            <span className="status-badge status-active">מנהל צי</span>
          </div>
        </div>

        <div className="card-elevated mb-4 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Radar size={24} className="text-primary" />
            </div>
            <p className="text-lg font-bold">FleetOS AI</p>
          </div>
          <FleetOSDashboardPreferences userId={PREVIEW_FLEETOS_USER_ID} />
        </div>

        <p className="text-xs text-muted-foreground text-center">
          <Link to="/dev/fleetos-module1" className="text-primary underline">
            חזרה ל-FleetOS AI
          </Link>
        </p>
      </main>
    </div>
  );
}
