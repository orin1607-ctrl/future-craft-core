import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildNotificationLogUrl } from '@/lib/notificationLogNav';
import { resolveLogViewMode } from '@/lib/notificationLogMock';
import { fetchActiveCustomAlertCount } from '@/lib/notificationLogService';
import { useAuth } from '@/contexts/AuthContext';

type Props = {
  vehicleId?: string;
  vehiclePlate?: string;
  driverId?: string;
  driverName?: string;
  className?: string;
};

export default function NotificationsAndSendsButton({
  vehicleId,
  vehiclePlate,
  driverId,
  driverName,
  className = '',
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    void fetchActiveCustomAlertCount({
      companyName: user?.role === 'super_admin' ? null : user?.company_name,
      vehicleId,
      vehiclePlate,
      driverId,
    }).then(setCount);
  }, [user?.role, user?.company_name, vehicleId, vehiclePlate, driverId]);

  const href = buildNotificationLogUrl({
    vehicleId,
    vehiclePlate,
    driverId,
    driverName,
    tab: 'active',
  });

  return (
    <Button
      type="button"
      variant="outline"
      className={`w-full h-11 gap-2 text-sm font-medium border-border/80 hover:bg-muted/50 ${className}`}
      onClick={() => navigate(href)}
    >
      <ClipboardList size={16} className="shrink-0 text-primary" />
      <span>התראות ושליחות</span>
      <span className="mr-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
        <Bell size={12} className="text-amber-600" />
        {count} התראות
      </span>
    </Button>
  );
}
