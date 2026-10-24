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
import { DaliaLaunchButton } from '@/features/claims/DaliaLaunchButton';
import { createGarageVoiceActions } from '@/modules/garage-management/garageVoiceActions';
import { garageShopScopeOf } from '@/modules/garage-management/garageTenant';

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

      <div className="dashboard-ai-fab-container">
        <DaliaLaunchButton
          testId="dashboard-ai-launch-btn"
          onClick={() => setAiOpen(true)}
          title="דליה AI · עוזר אישי לדשבורד ולמוסך"
          subtitle={user.garageOps ? 'עוזרת קולית למוסך' : 'עוזרת אישית'}
          aboveBottomNav
        />
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
            garageVoiceActions={user.garageOps
              ? createGarageVoiceActions({ id: user.id, full_name: user.full_name, role: user.role, company_name: user.company_name }, garageShopScopeOf(user))
              : null}
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
