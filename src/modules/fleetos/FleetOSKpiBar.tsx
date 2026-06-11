import { cn } from '@/lib/utils';
import type { FleetOSKpiSnapshot } from './fleetosTypes';
import { FIXED_KPI_LABELS, type FixedKpiKey } from './fleetosTypes';

const KPI_KEYS: FixedKpiKey[] = ['vehicles_active', 'vehicles_idling', 'vehicles_in_garage'];

const KPI_SUB: Record<FixedKpiKey, string> = {
  vehicles_active: 'סטטוס פעיל בדליה',
  vehicles_idling: 'פעילים בשטח (לא במוסך)',
  vehicles_in_garage: 'מבוסס service_orders + סטטוס',
};

export default function FleetOSKpiBar({
  kpis,
  loading,
}: {
  kpis: FleetOSKpiSnapshot;
  loading?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {KPI_KEYS.map((key) => (
        <div key={key} className="card-elevated p-4 text-right">
          <p className="text-xs font-bold text-muted-foreground mb-1">{FIXED_KPI_LABELS[key]}</p>
          <p
            className={cn(
              'text-3xl font-black leading-none',
              key === 'vehicles_in_garage' && kpis[key] > 0 ? 'text-warning' : 'text-primary',
            )}
          >
            {loading ? '…' : kpis[key]}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            {loading ? 'טוען…' : `מתוך ${kpis.total} · ${KPI_SUB[key]}`}
          </p>
        </div>
      ))}
    </div>
  );
}
