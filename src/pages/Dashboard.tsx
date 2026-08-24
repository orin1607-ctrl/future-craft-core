import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DriverDashboard from '@/components/DriverDashboard';
import PrivateCustomerDashboard from '@/components/PrivateCustomerDashboard';
import HomeDashboard from '@/components/home/HomeDashboard';
import { useDriverUrlContext } from '@/lib/entityNavContext';
import { useHiddenButtonsState } from '@/hooks/useHiddenButtons';
import { isDriverHubDashboardHidden } from '@/lib/hiddenButtons';

/** דשבורד ראשי — כרטיסי עולמות + התראות (+ מרכז ניהול ל-super_admin) */
export default function Dashboard() {
  const { user } = useAuth();
  const { driverId, driverName, locked: driverLocked } = useDriverUrlContext();
  const { hiddenButtons, ready } = useHiddenButtonsState();
  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';
  const hideDriverDashForFm =
    user?.role === 'fleet_manager' && ready && isDriverHubDashboardHidden(hiddenButtons);

  if (!user) return null;

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

  return <HomeDashboard />;
}
