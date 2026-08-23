import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TrackingFilters, TrackingVehicleRow } from '@/lib/vehicleTrackingData';
import { TRACKING_ALERT_KIND_LABELS, type TrackingAlertKind } from '@/lib/vehicleTrackingAlerts';
import { cn } from '@/lib/utils';

export default function TrackingFilterPanel({
  open,
  onToggle,
  filters,
  onChange,
  onApply,
  onClear,
  vehicles,
}: {
  open: boolean;
  onToggle: () => void;
  filters: TrackingFilters;
  onChange: (patch: Partial<TrackingFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  vehicles: TrackingVehicleRow[];
}) {
  const companies = [...new Set(vehicles.map((v) => v.company_name).filter(Boolean))].sort();
  const departments = [...new Set(vehicles.map((v) => v.department).filter(Boolean) as string[])].sort();
  const manufacturers = [...new Set(vehicles.map((v) => v.manufacturer).filter(Boolean) as string[])].sort();
  const statuses = [...new Set(vehicles.map((v) => v.status_text))].sort();

  return (
    <div className="mb-4">
      <Button
        type="button"
        variant={open ? 'default' : 'outline'}
        className="gap-2"
        onClick={onToggle}
      >
        <Filter size={16} />
        סינון מתקדם
      </Button>
      {open && (
        <div className="card-elevated mt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="מספר רכב">
              <input
                className="filter-input"
                value={filters.plate}
                onChange={(e) => onChange({ plate: e.target.value })}
                placeholder="123-45-678"
              />
            </Field>
            <Field label="מספר פנימי">
              <input
                className="filter-input"
                value={filters.internal}
                onChange={(e) => onChange({ internal: e.target.value })}
              />
            </Field>
            <Field label="חברה">
              <select className="filter-input" value={filters.company} onChange={(e) => onChange({ company: e.target.value })}>
                <option value="">הכול</option>
                {companies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="מחלקה">
              <select className="filter-input" value={filters.department} onChange={(e) => onChange({ department: e.target.value })}>
                <option value="">כל המחלקות</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="יצרן">
              <select className="filter-input" value={filters.manufacturer} onChange={(e) => onChange({ manufacturer: e.target.value })}>
                <option value="">הכול</option>
                {manufacturers.map((m) => (
                  <option key={m} value={m}>{m}</option>
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
            <Field label='ק"מ מינימלי'>
              <input
                type="number"
                className="filter-input"
                value={filters.minKm || ''}
                onChange={(e) => onChange({ minKm: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="נהג">
              <input
                className="filter-input"
                value={filters.driver}
                onChange={(e) => onChange({ driver: e.target.value })}
              />
            </Field>
            <Field label="סוג התראה">
              <select
                className="filter-input"
                value={filters.alertKind}
                onChange={(e) => onChange({ alertKind: e.target.value as TrackingAlertKind | '' })}
              >
                <option value="">הכול</option>
                {(Object.keys(TRACKING_ALERT_KIND_LABELS) as TrackingAlertKind[]).map((k) => (
                  <option key={k} value={k}>{TRACKING_ALERT_KIND_LABELS[k]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['garage', 'רכב במוסך'],
                ['fault', 'תקלה פתוחה'],
                ['defect', 'ליקוי פתוח'],
                ['accident', 'תאונה פתוחה'],
                ['alert', 'התראה'],
                ['transport', 'בשינוע'],
                ['nodriver', 'ללא נהג'],
                ['testSoon', 'טסט קרוב'],
                ['insSoon', 'ביטוח קרוב'],
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
