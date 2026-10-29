import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import {
  archivedPlateKey,
  buildArchivedVehicleRefs,
  EMPTY_ARCHIVED_VEHICLE_REFS,
  isVehicleArchived,
  type ArchivedVehicleRefs,
} from '@/lib/vehicleArchive';

/** Reads vehicle id / plate / status in scope (read-only) to know which alerts belong to archived vehicles. */
export async function loadArchivedVehicleRefs(companyFilter: string | null): Promise<ArchivedVehicleRefs> {
  try {
    const { data, error } = await applyCompanyScope(
      supabase.from('vehicles').select('id, license_plate, status'),
      companyFilter,
    );
    if (error || !data) return EMPTY_ARCHIVED_VEHICLE_REFS;
    return buildArchivedVehicleRefs(data);
  } catch {
    return EMPTY_ARCHIVED_VEHICLE_REFS;
  }
}

/** Checked right before an alert is written for a vehicle. */
export async function isVehicleArchivedNow(params: {
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  companyName?: string | null;
}): Promise<boolean> {
  try {
    if (params.vehicleId) {
      const { data } = await supabase.from('vehicles').select('status').eq('id', params.vehicleId).maybeSingle();
      return isVehicleArchived(data?.status);
    }
    if (!params.vehiclePlate) return false;
    const refs = await loadArchivedVehicleRefs(params.companyName || null);
    return refs.plates.has(archivedPlateKey(params.vehiclePlate));
  } catch {
    return false;
  }
}
