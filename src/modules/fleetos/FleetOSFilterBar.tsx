import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FleetOSVehicleRow } from './fleetosData';

export interface FleetOSFilters {
  company: string;
  plate: string;
  internal: string;
  driver: string;
  make: string;
  model: string;
  status: string;
}

export const EMPTY_FLEETOS_FILTERS: FleetOSFilters = {
  company: '',
  plate: '',
  internal: '',
  driver: '',
  make: '',
  model: '',
  status: '',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function FleetOSFilterBar({
  filters,
  onChange,
  onClear,
  vehicles,
  companyOptions,
}: {
  filters: FleetOSFilters;
  onChange: (patch: Partial<FleetOSFilters>) => void;
  onClear: () => void;
  vehicles: FleetOSVehicleRow[];
  companyOptions?: string[];
}) {
  const companies = companyOptions?.length
    ? companyOptions
    : [...new Set(vehicles.map((v) => v.company_name).filter(Boolean) as string[])].sort();

  const makes = [...new Set(vehicles.map((v) => v.make).filter(Boolean) as string[])].sort();
  const models = [...new Set(vehicles.map((v) => v.model).filter(Boolean) as string[])].sort();
  const statuses = [...new Set(vehicles.map((v) => v.status_text || '').filter(Boolean))].sort();

  const hasActive = Object.values(filters).some(Boolean);

  return (
    <div className="card-elevated p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-foreground">סינון צי</p>
        {hasActive && (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onClear}>
            <X size={14} />
            נקה
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
        <Field label="חברה">
          <select
            className="filter-input text-sm"
            value={filters.company}
            onChange={(e) => onChange({ company: e.target.value })}
          >
            <option value="">הכול</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="מספר רכב">
          <input
            className="filter-input text-sm"
            value={filters.plate}
            onChange={(e) => onChange({ plate: e.target.value })}
            placeholder="12-345-67"
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
        </Field>
        <Field label="מספר פנימי">
          <input
            className="filter-input text-sm"
            value={filters.internal}
            onChange={(e) => onChange({ internal: e.target.value })}
            placeholder="D-101"
          />
        </Field>
        <Field label="נהג">
          <input
            className="filter-input text-sm"
            value={filters.driver}
            onChange={(e) => onChange({ driver: e.target.value })}
            placeholder="שם נהג"
          />
        </Field>
        <Field label="יצרן">
          <select
            className="filter-input text-sm"
            value={filters.make}
            onChange={(e) => onChange({ make: e.target.value })}
          >
            <option value="">הכול</option>
            {makes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="דגם">
          <select
            className="filter-input text-sm"
            value={filters.model}
            onChange={(e) => onChange({ model: e.target.value })}
          >
            <option value="">הכול</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="סטטוס">
          <select
            className="filter-input text-sm"
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="">הכול</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
