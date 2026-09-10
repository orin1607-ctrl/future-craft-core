import { Radio } from 'lucide-react';
import type { DaliaRole } from './fleetosTypes';
import { canManageGpsDevices } from './starlink/types';
import { formatLastSeen } from './telematicsDisplay';

export default function FleetOSUnknownDevicesPanel({
  userRole,
  rows,
}: {
  userRole: DaliaRole;
  rows: Array<{ id: string; at: string; raw: string; unitHint: string | null }>;
}) {
  if (!canManageGpsDevices(userRole) || rows.length === 0) return null;

  return (
    <div className="card-elevated p-4 text-right" data-unknown-devices="1">
      <div className="flex items-center gap-2 mb-2">
        <Radio size={14} className="text-warning shrink-0" />
        <p className="text-sm font-bold text-foreground">מכשיר לא מוכר</p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">Unknown Device</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        הודעה הגיעה ל-Listener בלי שיוך Unit ID. אין ACK. לא נכתב ל-gps_live.
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
            <p className="font-bold" dir="ltr">{row.unitHint || '—'}</p>
            <p className="text-muted-foreground">{formatLastSeen(row.at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
