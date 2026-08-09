import { Car, ChevronDown, Fuel, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetOSVehicleRow } from './fleetosData';
import { InternalNumber, VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';

export type FuelVehicleDisplay = {
  id: string;
  plate: string;
  internal_number?: string;
  company_name?: string;
  driver_name?: string;
};

export default function FleetOSFuelVehicleBar({
  vehicle,
  locked,
  fromHub,
  vehicles,
  onSelectVehicle,
  onOpenHub,
}: {
  vehicle: FuelVehicleDisplay | null;
  locked?: boolean;
  fromHub?: boolean;
  vehicles: FleetOSVehicleRow[];
  onSelectVehicle: (id: string) => void;
  onOpenHub?: () => void;
}) {
  if (!vehicle) {
    return (
      <div className="card-elevated p-4 border-2 border-dashed border-primary/30">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Car size={20} className="text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">בחר רכב לעבודה</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              יש לבחור רכב לפני הצגת נתוני דלק וטעינה. ניתן לבחור כאן או במסך מצב צי.
            </p>
          </div>
        </div>
        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">רכב פעיל</label>
        <div className="relative">
          <select
            className="filter-input text-sm w-full min-h-[48px] pl-10 appearance-none"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onSelectVehicle(e.target.value);
            }}
          >
            <option value="" disabled>
              בחר מספר רישוי…
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
                {v.internal_number ? ` · ${v.internal_number}` : ''}
                {v.driver_name ? ` · ${v.driver_name}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('card-elevated p-4', locked && 'ring-2 ring-primary/20')}>
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          {locked ? <Lock size={18} className="text-primary" /> : <Fuel size={20} className="text-primary" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-muted-foreground mb-1">
            {fromHub ? 'רכב מכרטיס הרכב' : 'רכב פעיל'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-black text-primary" dir="ltr">
              <VehiclePlateLine plate={vehicle.plate} internal={vehicle.internal_number} className="text-xl" />
            </p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            {vehicle.company_name && <span>חברה: <strong className="text-foreground">{vehicle.company_name}</strong></span>}
            <span>נהג: <strong className="text-foreground">{vehicle.driver_name || 'ללא נהג'}</strong></span>
          </div>
        </div>
        {!locked && vehicles.length > 1 && (
          <div className="w-full sm:w-auto sm:min-w-[200px]">
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">החלף רכב</label>
            <select
              className="filter-input text-sm w-full min-h-[44px]"
              value={vehicle.id}
              onChange={(e) => onSelectVehicle(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}{v.internal_number ? ` · ${v.internal_number}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {onOpenHub && (
        <Button type="button" className="w-full min-h-[48px]" onClick={onOpenHub}>
          פתח כרטיס רכב מלא
        </Button>
      )}
    </div>
  );
}
