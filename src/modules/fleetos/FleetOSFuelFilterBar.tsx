import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EMPTY_FUEL_FILTERS, type FleetOSFuelFilters } from './fleetosFuelTypes';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] font-semibold text-muted-foreground block mb-1 truncate">{label}</label>
      {children}
    </div>
  );
}

export default function FleetOSFuelFilterBar({
  filters,
  onChange,
  onSearch,
  onClear,
  companies,
  isDirty,
  lockedPlate,
}: {
  filters: FleetOSFuelFilters;
  onChange: (patch: Partial<FleetOSFuelFilters>) => void;
  onSearch: () => void;
  onClear: () => void;
  companies: string[];
  isDirty?: boolean;
  lockedPlate?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  const inputCls = 'filter-input text-sm w-full min-h-[44px]';

  return (
    <div className="card-elevated p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">סינון דלק וטעינה</p>
          {lockedPlate && (
            <p className="text-xs text-primary font-semibold mt-0.5">מסונן לרכב: {lockedPlate}</p>
          )}
          {isDirty && <p className="text-xs text-muted-foreground mt-0.5">יש שינויים שלא חולצו</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button type="button" size="sm" className="h-9 gap-1.5 px-3" onClick={onSearch}>
            <Search size={15} />
            חפש
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 px-3" onClick={onClear}>
            <X size={15} />
            נקה סינון
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-2">
        <Field label="מספר רישוי">
          <input
            className={inputCls}
            value={filters.plate}
            onChange={(e) => onChange({ plate: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="12-345-67"
            disabled={!!lockedPlate}
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
        </Field>
        <Field label="מספר פנימי">
          <input className={inputCls} value={filters.internal} onChange={(e) => onChange({ internal: e.target.value })} onKeyDown={handleKeyDown} placeholder="D-101" />
        </Field>
        <Field label="נהג">
          <input className={inputCls} value={filters.driver} onChange={(e) => onChange({ driver: e.target.value })} onKeyDown={handleKeyDown} placeholder="שם נהג" />
        </Field>
        <Field label="חברה">
          <select className={inputCls} value={filters.company} onChange={(e) => onChange({ company: e.target.value })}>
            <option value="">הכול</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-lg border border-border bg-muted/30 text-sm font-bold min-h-[44px] sm:hidden mb-2"
      >
        <span>סינון מתקדם</span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      <div className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3', !expanded && 'hidden sm:grid')}>
        <Field label="לקוח">
          <select className={inputCls} value={filters.customer} onChange={(e) => onChange({ customer: e.target.value })}>
            <option value="">הכול</option>
            {companies.map((c) => (
              <option key={`cust-${c}`} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="סוג אנרגיה">
          <select className={inputCls} value={filters.energy_type} onChange={(e) => onChange({ energy_type: e.target.value as FleetOSFuelFilters['energy_type'] })}>
            <option value="all">הכול</option>
            <option value="fuel">דלק</option>
            <option value="electric">חשמל</option>
            <option value="hybrid">היברידי</option>
          </select>
        </Field>
        <Field label="תחנה / עמדה">
          <input className={inputCls} value={filters.station} onChange={(e) => onChange({ station: e.target.value })} onKeyDown={handleKeyDown} placeholder="שם תחנה" />
        </Field>
        <Field label="מיקום / אזור">
          <input className={inputCls} value={filters.location} onChange={(e) => onChange({ location: e.target.value })} onKeyDown={handleKeyDown} placeholder="אזור" />
        </Field>
        <Field label="תאריך מ-">
          <input type="date" className={inputCls} value={filters.date_from} onChange={(e) => onChange({ date_from: e.target.value })} />
        </Field>
        <Field label="תאריך עד">
          <input type="date" className={inputCls} value={filters.date_to} onChange={(e) => onChange({ date_to: e.target.value })} />
        </Field>
        <Field label="חודש">
          <input type="number" min={1} max={12} className={inputCls} value={filters.month} onChange={(e) => onChange({ month: e.target.value })} placeholder="1-12" />
        </Field>
        <Field label="שנה">
          <input type="number" className={inputCls} value={filters.year} onChange={(e) => onChange({ year: e.target.value })} placeholder="2026" />
        </Field>
        <Field label="שעה מ-">
          <input type="time" className={inputCls} value={filters.time_from} onChange={(e) => onChange({ time_from: e.target.value })} />
        </Field>
        <Field label="שעה עד">
          <input type="time" className={inputCls} value={filters.time_to} onChange={(e) => onChange({ time_to: e.target.value })} />
        </Field>
        <Field label="סטטוס">
          <select className={inputCls} value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
            <option value="">הכול</option>
            <option value="ok">תקין</option>
            <option value="anomaly">חריגה</option>
            <option value="no_invoice">חסרה קבלה</option>
            <option value="open">חריגה פתוחה</option>
            <option value="handled">טופל</option>
          </select>
        </Field>
      </div>
    </div>
  );
}
