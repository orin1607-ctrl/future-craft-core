import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ALERT_OPTIONS, type AlertTypeKey } from './fleetosTypes';
import type { FleetOSAlertRow } from './fleetosData';

export default function FleetOSPinnedAlerts({
  alertTypes,
  allAlerts,
  selectedPlate,
}: {
  alertTypes: [AlertTypeKey, AlertTypeKey, AlertTypeKey];
  allAlerts: FleetOSAlertRow[];
  selectedPlate?: string;
}) {
  const pinned = alertTypes.map((type) => allAlerts.find((a) => a.type === type) ?? null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          התראות נבחרות
          {selectedPlate && (
            <span className="normal-case text-primary mr-1">· {selectedPlate}</span>
          )}
        </p>
        <Link to="/settings#fleetos-alerts" className="text-xs font-bold text-primary hover:underline">
          שנה בהגדרות
        </Link>
      </div>
      <div className="space-y-2">
        {pinned.map((alert, i) => {
          const slotLabel = ALERT_OPTIONS.find((o) => o.key === alertTypes[i])?.label;
          if (!alert) {
            return (
              <div
                key={i}
                className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
              >
                {slotLabel} — אין התראות פעילות
              </div>
            );
          }
          return (
            <div
              key={alert.id}
              className={cn(
                'card-elevated flex items-center gap-3 p-3 border-r-4',
                alert.severity === 'critical' && 'border-r-destructive',
                alert.severity === 'warning' && 'border-r-warning',
                alert.severity === 'info' && 'border-r-primary',
              )}
            >
              <div className="flex-1 min-w-0 text-right">
                <p className="text-sm font-bold text-foreground leading-snug">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {alert.vehicle_plate} · {alert.created_at}
                </p>
              </div>
              <Link
                to="/alerts"
                className="shrink-0 text-xs font-bold text-primary border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted"
              >
                טפל
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
