import { useState } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FleetOSVehicleRow } from './fleetosData';
import { canManageGpsDevices } from './starlink/types';
import type { DaliaRole } from './fleetosTypes';

function vehicleIdentity(v: FleetOSVehicleRow): string {
  return [v.make, v.model, v.year].filter(Boolean).join(' ').trim();
}

export default function FleetOSDeviceAssignPanel({
  vehicle,
  vehicles = [],
  userRole,
  persistReady = false,
  onAssign,
  onUnassign,
  onSelectVehicle,
}: {
  vehicle: FleetOSVehicleRow | null;
  vehicles?: FleetOSVehicleRow[];
  userRole: DaliaRole;
  persistReady?: boolean;
  onAssign?: (unitId: string, imei: string) => void;
  onUnassign?: () => void;
  onSelectVehicle?: (vehicle: FleetOSVehicleRow) => void;
}) {
  const [unitId, setUnitId] = useState('');
  const [imei, setImei] = useState('');
  if (!canManageGpsDevices(userRole)) return null;

  const linked = vehicle?.telematics?.unitId || vehicle?.telematics?.imei;
  const assigned = vehicles
    .filter((v) => v.telematics?.unitId || v.telematics?.imei)
    .slice()
    .sort((a, b) => {
      const aSel = vehicle && a.id === vehicle.id ? 0 : 1;
      const bSel = vehicle && b.id === vehicle.id ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      const aQa = /^QA/i.test(a.telematics?.unitId || '') ? 1 : 0;
      const bQa = /^QA/i.test(b.telematics?.unitId || '') ? 1 : 0;
      return aQa - bQa;
    });
  const selectedIdentity = vehicle ? vehicleIdentity(vehicle) : '';

  return (
    <div className="card-elevated p-4 text-right" data-erm-assign="1">
      <div className="flex items-center gap-2 mb-2">
        <Radio size={14} className="text-primary shrink-0" />
        <p className="text-sm font-bold text-foreground">שיוך מכשיר ERM</p>
      </div>

      {assigned.length > 0 && (
        <div className="mb-3" data-erm-assigned-list="1">
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">שיוך פעיל בצי</p>
          <ul className="space-y-1">
            {assigned.map((v) => {
              const identity = vehicleIdentity(v);
              const unit = v.telematics?.unitId || v.telematics?.imei || '—';
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onSelectVehicle?.(v)}
                    data-assigned-unit={v.telematics?.unitId || ''}
                    data-assigned-plate={v.plate}
                    className={`w-full text-right rounded-lg px-3 py-2 text-xs transition-colors min-h-[40px] ${
                      vehicle?.id === v.id
                        ? 'bg-primary/5 ring-1 ring-primary/20'
                        : 'bg-muted/40 hover:bg-muted/70'
                    }`}
                  >
                    <span className="font-bold" dir="ltr">{unit}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-bold" dir="ltr">{v.plate}</span>
                    {identity ? <span className="text-muted-foreground"> · {identity}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {vehicle ? (
        linked ? (
          <p className="text-xs text-muted-foreground mb-3" data-erm-selected-assigned="1">
            משויך: {vehicle.telematics?.unitId || '—'}
            {vehicle.telematics?.imei ? ` · IMEI ${vehicle.telematics.imei}` : ''}
            {' → '}
            <span dir="ltr">{vehicle.plate}</span>
            {selectedIdentity ? ` · ${selectedIdentity}` : ''}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">
            אין מכשיר משויך לכרטיס זה
            {assigned.length > 0 ? ' — יש שיוך פעיל לרכב אחר ברשימה למעלה' : ''}
          </p>
        )
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          {assigned.length > 0
            ? 'בחר רכב מהשיוך הפעיל או מהרשימה כדי לשייך או לנתק'
            : 'בחר רכב מהרשימה כדי לשייך מכשיר'}
        </p>
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
          disabled={!vehicle || !persistReady || (!unitId.trim() && !imei.trim())}
          onClick={() => onAssign?.(unitId.trim(), imei.trim())}
        >
          שיוך לרכב
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={!vehicle || !persistReady || !linked}
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
