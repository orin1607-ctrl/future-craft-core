import { useAuth } from '@/contexts/AuthContext';
import DriverDashboard from '@/components/DriverDashboard';
import PrivateCustomerDashboard from '@/components/PrivateCustomerDashboard';
import HomeDashboard from '@/components/home/HomeDashboard';

/** דשבורד ראשי — 6 כרטיסי עולמות (רכבים, נהגים, מעקב, מנהלי צי, דוחות, מנהל על) */
export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === 'driver') {
    return <DriverDashboard />;
  }

  if (user.role === 'private_customer') {
    return <PrivateCustomerDashboard />;
  }

  return <HomeDashboard />;
}
