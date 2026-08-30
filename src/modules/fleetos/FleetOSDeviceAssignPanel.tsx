import { useState } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FleetOSVehicleRow } from './fleetosData';
import { canManageGpsDevices } from './starlink/types';
import type { DaliaRole } from './fleetosTypes';

export default function FleetOSDeviceAssignPanel({
  vehicle,
  userRole,
  persistReady = false,
  onAssign,
  onUnassign,
}: {
  vehicle: FleetOSVehicleRow | null;
  userRole: DaliaRole;
  persistReady?: boolean;
  onAssign?: (unitId: string, imei: string) => void;
  onUnassign?: () => void;
}) {
  const [unitId, setUnitId] = useState('');
  const [imei, setImei] = useState('');
  if (!vehicle || !canManageGpsDevices(userRole)) return null;

  const linked = vehicle.telematics?.unitId || vehicle.telematics?.imei;

  return (
    <div className="card-elevated p-4 text-right">
      <div className="flex items-center gap-2 mb-2">
        <Radio size={14} className="text-primary shrink-0" />
        <p className="text-sm font-bold text-foreground">שיוך מכשיר ERM</p>
      </div>
      {linked ? (
        <p className="text-xs text-muted-foreground mb-3">
          משויך: {vehicle.telematics?.unitId || '—'}
          {vehicle.telematics?.imei ? ` · IMEI ${vehicle.telematics.imei}` : ''}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">אין מכשיר משויך לכרטיס זה</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <label className="text-right">
          <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Unit ID</span>
          <input
            dir="ltr"
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="0004D2 / IMEI"
          />
        </label>
        <label className="text-right">
          <span className="text-[11px] font-semibold text-muted-foreground block mb-1">IMEI</span>
          <input
            dir="ltr"
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            placeholder="15 ספרות (אופציונלי)"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-[44px]"
          disabled={!persistReady || (!unitId.trim() && !imei.trim())}
          onClick={() => onAssign?.(unitId.trim(), imei.trim())}
        >
          שיוך לרכב
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={!persistReady || !linked}
          onClick={() => onUnassign?.()}
        >
          ניתוק
        </Button>
      </div>
      {!persistReady && (
        <p className="text-[11px] text-muted-foreground mt-2">
          שמירת שיוך מחכה לאישור Migration של טבלאות GPS. הלוגיקה מוכנה ולא נכתבת ל-DB.
        </p>
      )}
    </div>
  );
}
