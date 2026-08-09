import { useMemo } from 'react';
import FleetOSFuelAdvancedFilters from './FleetOSFuelAdvancedFilters';
import type { FleetOSFuelFilters } from './fleetosFuelTypes';
import type { FuelVehicleDisplay } from './FleetOSFuelVehicleBar';
import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';

export default function FleetOSFuelSheetFilters({
  vehicle,
  draftFilters,
  appliedFilters,
  onChange,
  onSearch,
  onClear,
  companies,
}: {
  vehicle: FuelVehicleDisplay;
  draftFilters: FleetOSFuelFilters;
  appliedFilters: FleetOSFuelFilters;
  onChange: (patch: Partial<FleetOSFuelFilters>) => void;
  onSearch: () => void;
  onClear: () => void;
  companies: string[];
}) {
  const isDirty = useMemo(
    () => JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters),
    [draftFilters, appliedFilters],
  );

  return (
    <div className="space-y-3 mb-4">
      <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-right text-xs">
        <span className="text-muted-foreground">רכב: </span>
        <strong className="text-primary" dir="ltr">{vehicle.plate}</strong>
        {vehicle.internal_number && (
          <>
            {' · '}
            <InternalNumber value={vehicle.internal_number} className="inline text-xs" />
          </>
        )}
        <span className="text-muted-foreground"> · {vehicle.driver_name || 'ללא נהג'}</span>
      </div>
      <FleetOSFuelAdvancedFilters
        filters={draftFilters}
        onChange={onChange}
        onSearch={onSearch}
        onClear={onClear}
        companies={companies}
        isDirty={isDirty}
      />
    </div>
  );
}
