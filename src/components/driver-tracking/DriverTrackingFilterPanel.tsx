import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DRIVER_ALERT_KIND_LABELS,
  type DriverAlertKind,
  type DriverTrackingFilters,
  type DriverTrackingRow,
} from '@/lib/driverTrackingData';
import { cn } from '@/lib/utils';

export default function DriverTrackingFilterPanel({
  open,
  onToggle,
  filters,
  onChange,
  onApply,
  onClear,
  drivers,
}: {
  open: boolean;
  onToggle: () => void;
  filters: DriverTrackingFilters;
  onChange: (patch: Partial<DriverTrackingFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  drivers: DriverTrackingRow[];
}) {
  const departments = [...new Set(drivers.map((d) => d.departmentRaw).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
  const statuses = [...new Set(drivers.map((d) => d.statusText).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

  return (
    <div className="mb-4">
      <Button type="button" variant={open ? 'default' : 'outline'} className="gap-2" onClick={onToggle}>
        <Filter size={16} />
        סינון מתקדם
      </Button>
      {open && (
        <div className="card-elevated mt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="חיפוש נהג, מספר עובד או רכב">
              <input
                className="filter-input"
                value={filters.search}
                onChange={(e) => onChange({ search: e.target.value })}
                placeholder="שם, מספר עובד או רכב"
              />
            </Field>
            <Field label="מחלקה">
              <select className="filter-input" value={filters.department} onChange={(e) => onChange({ department: e.target.value })}>
                <option value="">כל המחלקות</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="סטטוס">
              <select className="filter-input" value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
                <option value="">הכול</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="סוג התראה">
              <select
                className="filter-input"
                value={filters.alertKind}
                onChange={(e) => onChange({ alertKind: e.target.value as DriverAlertKind | '' })}
              >
                <option value="">הכול</option>
                {(Object.keys(DRIVER_ALERT_KIND_LABELS) as DriverAlertKind[]).map((k) => (
                  <option key={k} value={k}>{DRIVER_ALERT_KIND_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="מועד טיפול מ־">
              <input type="date" className="filter-input" value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} />
            </Field>
            <Field label="מועד טיפול עד">
              <input type="date" className="filter-input" value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['overdue', 'התראות באיחור'],
                ['approaching', 'התראות שמתקרבות'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted cursor-pointer border border-transparent hover:border-primary/30',
                  filters[key] && 'border-primary bg-primary/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={filters[key]}
                  onChange={(e) => onChange({ [key]: e.target.checked })}
                  className="accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={onApply}>החל סינון</Button>
            <Button type="button" variant="outline" onClick={onClear}>נקה הכול</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}
