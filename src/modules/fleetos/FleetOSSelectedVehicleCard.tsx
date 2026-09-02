import type { ReactNode } from 'react';
import {
  MapPin, Gauge, User, Hash, Activity, Radio, Zap, Compass, Fuel, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetOSVehicleRow } from './fleetosData';
import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';
import {
  commStatusLabel,
  flagLabel,
  formatLastSeen,
  formatNa,
  gpsFreshnessLabel,
  headingLabel,
  motionLabel,
  NA,
  originLabel,
} from './telematicsDisplay';

const STATUS_DOT: Record<FleetOSVehicleRow['status'], string> = {
  driving: 'bg-success',
  stopped: 'bg-muted-foreground',
  fault: 'bg-destructive',
  offline: 'bg-warning',
};

const COMM_PILL: Record<string, string> = {
  online: 'bg-success/15 text-success border-success/30',
  stale: 'bg-warning/15 text-warning border-warning/30',
  offline: 'bg-muted text-muted-foreground border-border',
  no_data: 'bg-muted text-muted-foreground border-border',
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

  const t = vehicle.telematics;
  const statusText = vehicle.status_text || vehicle.status;
  const locText = t?.lat != null && t?.lng != null
    ? `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`
    : NA;
  const lastEvent = t?.events?.[0];

  return (
    <div className="card-elevated overflow-hidden" data-telematics-card="1">
      <div className="bg-primary/5 border-b border-border px-4 py-3 flex flex-wrap items-center gap-2">
        <span className={cn('w-3 h-3 rounded-full shrink-0', STATUS_DOT[vehicle.status])} />
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xl font-black text-primary" dir="ltr">{vehicle.plate}</p>
          {vehicle.internal_number && (
            <p className="text-xs mt-0.5">
              פנימי: <InternalNumber value={vehicle.internal_number} className="text-xs" />
            </p>
          )}
        </div>
        {t ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill className={t.dataOrigin === 'qa' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-foreground border-border'}>
              {originLabel(t)}
            </Pill>
            <Pill className={COMM_PILL[t.commStatus]}>
              {commStatusLabel(t.commStatus)}
            </Pill>
            <Pill className={t.freshness === 'live' ? 'bg-success/15 text-success border-success/30' : 'bg-muted text-muted-foreground border-border'}>
              {gpsFreshnessLabel(t)}
            </Pill>
          </div>
        ) : (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-foreground">
            {statusText}
          </span>
        )}
      </div>

      <Section title="מצב עכשיו">
        <Info icon={Radio} label="Last Seen" value={formatLastSeen(t?.lastSeen)} />
        <Info icon={MapPin} label="מיקום" value={locText} className="col-span-2 sm:col-span-1" />
        <Info icon={Gauge} label="מהירות" value={t?.speedKmh != null ? `${t.speedKmh} קמ״ש` : NA} />
        <Info icon={Compass} label="Heading" value={headingLabel(t?.heading)} />
        <Info icon={Zap} label="הצתה" value={flagLabel(t?.ignition, 'דולקת', 'כבויה')} />
        <Info icon={Activity} label="מנוע" value={flagLabel(t?.engine, 'פועל', 'כבוי')} />
        <Info icon={Activity} label="תנועה" value={t ? motionLabel(t) : NA} />
      </Section>

      <Section title="קילומטראז׳">
        <Info
          icon={Gauge}
          label='ODO טלמטיקה'
          value={t?.odometer != null ? t.odometer.toLocaleString('he-IL') : NA}
        />
        <Info icon={Hash} label="מקור ODO" value={t?.odometerSourceTag || NA} />
        <Info icon={Hash} label="GPS / CAN" value={t?.odometerGpsVsCan || NA} className="col-span-2 sm:col-span-1" />
        <Info
          icon={Gauge}
          label='ק״מ עסקי (לא נדרס)'
          value={vehicle.odometer != null ? vehicle.odometer.toLocaleString('he-IL') : '—'}
        />
      </Section>

      <Section title="חשמל ומנוע">
        <Info icon={Zap} label="מתח רכב" value={t?.vehicleVoltage != null ? `${t.vehicleVoltage} V` : NA} />
        <Info icon={Zap} label="סוללת גיבוי" value={t?.backupVoltage != null ? `${t.backupVoltage} V` : NA} />
        <Info icon={Activity} label="RPM" value={formatNa(t?.rpm)} />
        <Info icon={Clock} label="שעות מנוע" value={formatNa(t?.engineHours)} />
        <Info icon={Fuel} label="דלק" value={t?.fuel != null ? `${t.fuel}` : NA} />
        <Info icon={User} label="Driver ID" value={t?.driverId || NA} />
      </Section>

      <Section title="איכות GPS">
        <Info icon={Activity} label="GPS Fix" value={t?.gpsFix || NA} />
        <Info icon={Activity} label="לוויינים" value={formatNa(t?.satellites)} />
        <Info icon={Activity} label="HDOP" value={formatNa(t?.hdop)} />
        <Info icon={MapPin} label="גובה" value={t?.altitude != null ? `${t.altitude} מ׳` : NA} />
      </Section>

      {t && (Object.keys(t.canMapped).length > 0 || Object.keys(t.canRaw).length > 0) && (
        <Section title="CAN">
          <Info
            icon={Hash}
            label={Object.keys(t.canMapped).length ? 'ערכים ממופים' : 'ערכים גולמיים'}
            className="col-span-2 sm:col-span-3"
            value={
              Object.keys(t.canMapped).length
                ? Object.entries(t.canMapped).map(([k, m]) => `${m.label}: ${m.value}`).join(' · ')
                : Object.entries(t.canRaw).map(([k, val]) => `${k}=${val}`).join(' · ')
            }
          />
        </Section>
      )}

      <Section title="אירועים אחרונים">
        <Info
          icon={Clock}
          label="זמן אירוע אחרון"
          value={lastEvent ? formatLastSeen(lastEvent.at) : NA}
        />
        <Info
          icon={Activity}
          label="אירועים"
          className="col-span-2"
          value={
            t?.events?.length
              ? t.events.map((e) => `${e.labelHe}${e.at ? ` (${formatLastSeen(e.at)})` : ''}`).join(' · ')
              : NA
          }
        />
      </Section>

      <div className="p-3 sm:p-4 pt-0 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <Info icon={User} label="נהג עסקי" value={vehicle.driver_name || 'ללא נהג'} />
        {(vehicle.make || vehicle.model) && (
          <Info icon={Activity} label="רכב" value={`${vehicle.make || ''} ${vehicle.model || ''}`.trim()} />
        )}
        {vehicle.internal_number && (
          <Info icon={Hash} label="מספר פנימי" value={<InternalNumber value={vehicle.internal_number} className="text-sm" />} />
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 sm:px-4 pt-3">
      <p className="text-[11px] font-black text-muted-foreground mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">{children}</div>
    </div>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full border', className)}>
      {children}
    </span>
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
  const missing = value === NA;
  return (
    <div className={cn('rounded-xl bg-muted/40 p-3 text-right', className)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-muted-foreground shrink-0" />
        <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      </div>
      <p className={cn('text-sm font-bold truncate break-words', missing ? 'text-muted-foreground font-semibold' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}
