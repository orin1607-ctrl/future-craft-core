import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_VEHICLE_TYPES,
  fetchVehicleTypes,
  type VehicleTypeOption,
} from '@/lib/vehicleTypesConfig';

export function useVehicleTypes() {
  const [types, setTypes] = useState<VehicleTypeOption[]>(DEFAULT_VEHICLE_TYPES);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTypes(await fetchVehicleTypes());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { types, loading, reload };
}
