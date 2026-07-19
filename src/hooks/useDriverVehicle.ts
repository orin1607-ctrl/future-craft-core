import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { listDriverVehicles, type ResolvedVehicle } from '@/lib/incidentResolve';

/**
 * For drivers: returns vehicles assigned to them (assigned_driver_id = user.id).
 * Supports one or many vehicles. Managers: empty list.
 */
export function useDriverVehicle() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<ResolvedVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.role !== 'driver' && user.role !== 'private_customer') {
      setLoading(false);
      return;
    }

    listDriverVehicles(user.id, user.company_name).then((rows) => {
      setVehicles(rows);
      setLoading(false);
    });
  }, [user?.id, user?.role, user?.company_name]);

  const vehicle = vehicles.length === 1 ? vehicles[0] : vehicles[0] || null;

  return {
    vehicle,
    vehicles,
    loading,
    isDriver: user?.role === 'driver',
    hasNoVehicle: !loading && (user?.role === 'driver' || user?.role === 'private_customer') && vehicles.length === 0,
    phone: (user as { phone?: string } | null)?.phone || '',
  };
}
