import type { ReactNode } from 'react';
import { MapPin, Gauge, User, Hash, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetOSVehicleRow } from './fleetosData';
import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';

const STATUS_DOT: Record<FleetOSVehicleRow['status'], string> = {
  driving: 'bg-success',
  stopped: 'bg-muted-foreground',
  fault: 'bg-destructive',
  offline: 'bg-warning',
};

export default function FleetOSSelectedVehicleCard({
  vehicle,
  onOpenHub,
  hubOpening = false,
}: {
  vehicle: FleetOSVehicleRow | null;
  onOpenHub: () => void;
  hubOpening?: boolean;
}) {
  if (!vehicle) {
    return (
      <div className="card-elevated p-5 text-center">
        <p className="text-sm text-muted-foreground">בחר רכב מהמפה או מהרשימה לצפייה בפרטים</p>
      </div>
    );
  }

  const statusText = vehicle.status_text || vehicle.status;

  return (
    <div className="card-elevated overflow-hidden">
      <div className="bg-primary/5 border-b border-border px-4 py-3 flex flex-wrap items-center gap-3">
        <span className={cn('w-3 h-3 rounded-full shrink-0', STATUS_DOT[vehicle.status])} />
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xl font-black text-primary" dir="ltr">{vehicle.plate}</p>
          {vehicle.internal_number && (
            <p className="text-xs mt-0.5">
              פנימי: <InternalNumber value={vehicle.internal_number} className="text-xs" />
            </p>
          )}
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-foreground">
          {statusText}
        </span>
      </div>

      <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <Info icon={User} label="נהג" value={vehicle.driver_name || 'ללא נהג'} />
        <Info icon={Activity} label="סטטוס" value={statusText} />
        <Info
          icon={Gauge}
          label='ק"מ'
          value={vehicle.odometer != null ? vehicle.odometer.toLocaleString('he-IL') : '—'}
        />
        <Info icon={MapPin} label="מיקום אחרון" value={vehicle.location || '—'} className="col-span-2 sm:col-span-1" />
        {vehicle.internal_number && (
          <Info icon={Hash} label="מספר פנימי" value={<InternalNumber value={vehicle.internal_number} className="text-sm" />} />
        )}
        {(vehicle.make || vehicle.model) && (
          <Info icon={Activity} label="רכב" value={`${vehicle.make || ''} ${vehicle.model || ''}`.trim()} />
        )}
      </div>

      <div className="px-4 pb-4">
        <Button
          type="button"
          className="w-full min-h-[48px] text-sm sm:text-base"
          data-vehicle-id={vehicle.id}
          data-vehicle-plate={vehicle.plate}
          onClick={onOpenHub}
          disabled={hubOpening}
        >
          {hubOpening ? 'פותח כרטיס…' : 'פתח כרטיס רכב מלא'}
        </Button>
      </div>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof User;
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl bg-muted/40 p-3 text-right', className)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-muted-foreground shrink-0" />
        <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm font-bold text-foreground truncate break-words">{value}</p>
    </div>
  );
}
