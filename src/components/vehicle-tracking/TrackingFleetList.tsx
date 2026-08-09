import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { TrackingVehicleRow } from '@/lib/vehicleTrackingData';
import { TRACKING_ALERT_KIND_LABELS } from '@/lib/vehicleTrackingAlerts';
import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';

function AlertChips({
  items,
  insuranceRed,
}: {
  items: TrackingVehicleRow['alert_items'];
  insuranceRed: boolean;
}) {
  if (items.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1 justify-end max-w-[220px]" onClick={(e) => e.stopPropagation()}>
      {items.map((a) => {
        const isInsurance = a.kind === 'insurance';
        const chipCls = isInsurance && insuranceRed
          ? 'status-badge bg-destructive/10 text-destructive border border-destructive/30 text-[10px] hover:bg-destructive/15'
          : 'status-badge status-pending text-[10px] hover:bg-primary/15';
        return (
        <Link
          key={`${a.kind}-${a.entityId || a.tier || ''}-${a.label}`}
          to={a.hubLink}
          className={chipCls}
          title={a.detail}
        >
          {a.label}
        </Link>
        );
      })}
    </div>
  );
}

function Flag({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex w-6 h-6 items-center justify-center rounded-md bg-destructive/10 text-destructive text-xs font-bold">!</span>
  ) : (
    <span className="text-muted-foreground text-xs">—</span>
  );
}

function StatusBadge({ text, status }: { text: string; status: string }) {
  const cls =
    status === 'active'
      ? 'status-active'
      : status === 'in_service'
        ? 'status-pending'
        : status === 'out_of_service'
          ? 'status-inactive'
          : 'bg-muted text-muted-foreground';
  return <span className={`status-badge ${cls}`}>{text}</span>;
}

export default function TrackingFleetList({
  rows,
  total,
  onOpen,
}: {
  rows: TrackingVehicleRow[];
  total: number;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="card-elevated text-center py-12 text-muted-foreground">
        לא נמצאו רכבים
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase">רשימת רכבים</p>
        <p className="text-sm text-muted-foreground">
          מוצגים <strong className="text-foreground">{rows.length}</strong> מתוך{' '}
          <strong className="text-foreground">{total}</strong>
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card-elevated overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs">
              <th className="py-3 px-3 text-right font-bold">מספר רכב</th>
              <th className="py-3 px-2 text-right">פנימי</th>
              <th className="py-3 px-2 text-right">חברה</th>
              <th className="py-3 px-2 text-right">יצרן / דגם</th>
              <th className="py-3 px-2 text-right">נהג</th>
              <th className="py-3 px-2 text-right">סטטוס</th>
              <th className="py-3 px-2 text-right">ליקוי</th>
              <th className="py-3 px-2 text-right">תקלה</th>
              <th className="py-3 px-2 text-right">התראות</th>
              <th className="py-3 px-2 text-right">מוסך</th>
              <th className="py-3 px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr
                key={v.id}
                className="border-t border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onOpen(v.id)}
              >
                <td className="py-3 px-3 font-bold">{v.license_plate}</td>
                <td className="py-3 px-2"><InternalNumber value={v.internal_number} className="text-xs" /></td>
                <td className="py-3 px-2">{v.company_name}</td>
                <td className="py-3 px-2">{v.manufacturer} {v.model}</td>
                <td className="py-3 px-2">{v.driver_name || '—'}</td>
                <td className="py-3 px-2"><StatusBadge text={v.status_text} status={v.status} /></td>
                <td className="py-3 px-2 text-center"><Flag on={v.has_open_defect} /></td>
                <td className="py-3 px-2 text-center"><Flag on={v.has_open_fault} /></td>
                <td className="py-3 px-2 text-center">
                  <AlertChips items={v.alert_items} insuranceRed={v.insurance_alerts_red_enabled} />
                </td>
                <td className="py-3 px-2 text-center">
                  {v.in_garage ? (
                    <span className="status-badge status-pending">{v.days_in_garage} ימים</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" onClick={() => onOpen(v.id)}>פתח מעקב</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onOpen(v.id)}
            className="w-full card-elevated text-right space-y-2 hover:border-primary/30 transition-colors"
          >
            <div className="flex justify-between items-start gap-2">
              <StatusBadge text={v.status_text} status={v.status} />
              <div>
                <p className="text-lg font-black">{v.license_plate}</p>
                <p className="text-xs text-muted-foreground">
                  <InternalNumber value={v.internal_number} className="text-xs" /> · {v.manufacturer} {v.model}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {v.company_name} · נהג: {v.driver_name || '—'}
            </p>
            <div className="flex flex-wrap gap-1 justify-end">
              {v.alert_items.length > 0 ? (
                <AlertChips items={v.alert_items} insuranceRed={v.insurance_alerts_red_enabled} />
              ) : (
                <span className="text-xs text-muted-foreground">אין התראות</span>
              )}
              {v.in_garage && <span className="status-badge status-pending">מוסך {v.days_in_garage}י</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
