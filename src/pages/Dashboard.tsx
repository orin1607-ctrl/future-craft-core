import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DriverDashboard from '@/components/DriverDashboard';
import PrivateCustomerDashboard from '@/components/PrivateCustomerDashboard';
import HomeDashboard from '@/components/home/HomeDashboard';
import GarageOpsHomeDashboard from '@/components/home/GarageOpsHomeDashboard';
import { useDriverUrlContext } from '@/lib/entityNavContext';
import { useHiddenButtonsState } from '@/hooks/useHiddenButtons';
import { isDriverHubDashboardHidden } from '@/lib/hiddenButtons';
import { ClaimsAiWorkspace } from '@/features/claims/ClaimsAiWorkspace';

/** דשבורד ראשי — כרטיסי עולמות + התראות (+ מרכז ניהול ל-super_admin) */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);
  const { driverId, driverName, locked: driverLocked } = useDriverUrlContext();
  const { hiddenButtons, ready } = useHiddenButtonsState();
  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';
  const hideDriverDashForFm =
    user?.role === 'fleet_manager' && ready && isDriverHubDashboardHidden(hiddenButtons);

  if (!user) return null;

  if (user.garagePhotographer) {
    return <Navigate to="/garage" replace />;
  }

  if (user.claimsWorkerOnly) {
    return <Navigate to="/claims" replace />;
  }

  if (driverLocked && driverId && isManager) {
    if (hideDriverDashForFm) {
      return <Navigate to={`/drivers?driverId=${encodeURIComponent(driverId)}`} replace />;
    }
    return <DriverDashboard scopedDriverId={driverId} scopedDriverName={driverName} managerView />;
  }

  if (user.role === 'driver') {
    return <DriverDashboard />;
  }

  if (user.role === 'private_customer') {
    return <PrivateCustomerDashboard />;
  }

  if (user.role === 'telemarketing_agent') {
    return <Navigate to="/telemarketing" replace />;
  }

  return (
    <div className="relative">
      {user.garageOps ? <GarageOpsHomeDashboard /> : <HomeDashboard />}

      <div className="dashboard-ai-fab-container fixed bottom-6 left-6 z-40">
        <button
          type="button"
          className="dashboard-dalia-ai-btn flex items-center gap-2.5 px-5 py-3 rounded-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-bold shadow-xl hover:shadow-blue-500/50 hover:scale-105 active:scale-95 transition-all text-sm border border-white/20"
          data-testid="dashboard-ai-launch-btn"
          onClick={() => setAiOpen(true)}
          title="דליה AI · עוזר אישי לדשבורד ולמוסך"
        >
          <span className="text-lg">✨</span>
          <span>דליה AI</span>
        </button>
      </div>

      {aiOpen && (
        <div className="claims-root">
          <ClaimsAiWorkspace
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            claim={null}
            userId={user.id}
            companyName={user.company_name || null}
            module={user.garageOps ? 'garage' : 'dashboard'}
            onOpenGarageCase={(caseId) => {
              navigate(`/garage-management/${caseId}`);
            }}
            onOpenClaim={(claimId) => {
              navigate(`/claims/${claimId}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
