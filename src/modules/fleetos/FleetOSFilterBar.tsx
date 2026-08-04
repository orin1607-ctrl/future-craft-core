import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetOSVehicleRow } from './fleetosData';
import { STATUS_LABEL } from './fleetosFilters';

export interface FleetOSFilters {
  company: string;
  plate: string;
  internal: string;
  department: string;
  driver: string;
  make: string;
  model: string;
  status: string;
}

export const EMPTY_FLEETOS_FILTERS: FleetOSFilters = {
  company: '',
  plate: '',
  internal: '',
  department: '',
  driver: '',
  make: '',
  model: '',
  status: '',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] font-semibold text-muted-foreground block mb-1 truncate">{label}</label>
      {children}
    </div>
  );
}

export default function FleetOSFilterBar({
  filters,
  onChange,
  onSearch,
  onClear,
  vehicles,
  companyOptions,
  filteredCount,
  totalCount,
  isDirty,
}: {
  filters: FleetOSFilters;
  onChange: (patch: Partial<FleetOSFilters>) => void;
  onSearch: () => void;
  onClear: () => void;
  vehicles: FleetOSVehicleRow[];
  companyOptions?: string[];
  filteredCount: number;
  totalCount: number;
  isDirty?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const companies = companyOptions?.length
    ? companyOptions
    : [...new Set(vehicles.map((v) => v.company_name).filter(Boolean) as string[])].sort();

  const makes = [...new Set(vehicles.map((v) => v.make).filter(Boolean) as string[])].sort();
  const models = [...new Set(vehicles.map((v) => v.model).filter(Boolean) as string[])].sort();
  const departments = [...new Set(vehicles.map((v) => v.department).filter(Boolean) as string[])].sort();
  const statusOptions = [
    ...new Set([
      ...Object.values(STATUS_LABEL),
      ...vehicles.map((v) => v.status_text || '').filter(Boolean),
    ]),
  ].sort();

  const hasActive = Object.values(filters).some(Boolean);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div className="card-elevated p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">סינון צי</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            מציג {filteredCount} מתוך {totalCount} רכבים
            {isDirty ? ' · יש שינויים שלא חולצו' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button type="button" size="sm" className="h-9 gap-1.5 px-3" onClick={onSearch}>
            <Search size={15} />
            חפש
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-3"
            onClick={onClear}
            disabled={!hasActive && !isDirty}
          >
            <X size={15} />
            נקה סינון
          </Button>
        </div>
      </div>

      {/* Primary filters — always visible (mobile + desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-2 sm:mb-3">
        <Field label="מספר רישוי">
          <input
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.plate}
            onChange={(e) => onChange({ plate: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="12-345-67"
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
        </Field>
        <Field label="מספר פנימי">
          <input
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.internal}
            onChange={(e) => onChange({ internal: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="D-101"
          />
        </Field>
        <Field label="מחלקה">
          <select
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.department}
            onChange={(e) => onChange({ department: e.target.value })}
          >
            <option value="">הכול</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="נהג">
          <input
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.driver}
            onChange={(e) => onChange({ driver: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="שם נהג"
          />
        </Field>
        <Field label="חברה">
          <select
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.company}
            onChange={(e) => onChange({ company: e.target.value })}
          >
            <option value="">הכול</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="sm:hidden w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-lg border border-border bg-muted/30 text-sm font-bold text-foreground mb-2 min-h-[44px]"
      >
        <span>סינון נוסף (יצרן, דגם, סטטוס)</span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3',
          !expanded && 'hidden sm:grid',
        )}
      >
        <Field label="יצרן">
          <select
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.make}
            onChange={(e) => onChange({ make: e.target.value })}
          >
            <option value="">הכול</option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="דגם">
          <select
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.model}
            onChange={(e) => onChange({ model: e.target.value })}
          >
            <option value="">הכול</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="סטטוס">
          <select
            className="filter-input text-sm w-full min-h-[44px]"
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="">הכול</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
