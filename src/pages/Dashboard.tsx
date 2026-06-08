import { useAuth } from '@/contexts/AuthContext';
import DriverDashboard from '@/components/DriverDashboard';
import PrivateCustomerDashboard from '@/components/PrivateCustomerDashboard';
import HomeDashboard from '@/components/home/HomeDashboard';
import { useDriverUrlContext } from '@/lib/entityNavContext';

/** דשבורד ראשי — כרטיסי עולמות + התראות (+ מרכז ניהול ל-super_admin) */
export default function Dashboard() {
  const { user } = useAuth();
  const { driverId, driverName, locked: driverLocked } = useDriverUrlContext();
  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  if (!user) return null;

  if (driverLocked && driverId && isManager) {
    return <DriverDashboard scopedDriverId={driverId} scopedDriverName={driverName} managerView />;
  }

  if (user.role === 'driver') {
    return <DriverDashboard />;
  }

  if (user.role === 'private_customer') {
    return <PrivateCustomerDashboard />;
  }

  return <HomeDashboard />;
}
