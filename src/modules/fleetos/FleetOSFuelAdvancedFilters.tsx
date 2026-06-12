import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetOSFuelFilters } from './fleetosFuelTypes';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] font-semibold text-muted-foreground block mb-1 truncate">{label}</label>
      {children}
    </div>
  );
}

export default function FleetOSFuelAdvancedFilters({
  filters,
  onChange,
  onSearch,
  onClear,
  companies,
  isDirty,
}: {
  filters: FleetOSFuelFilters;
  onChange: (patch: Partial<FleetOSFuelFilters>) => void;
  onSearch: () => void;
  onClear: () => void;
  companies: string[];
  isDirty?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const inputCls = 'filter-input text-sm w-full min-h-[44px]';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          className="flex items-center gap-2 text-sm font-bold text-foreground min-h-[44px]"
        >
          סינון מתקדם
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button type="button" size="sm" className="h-9 gap-1.5 px-3" onClick={onSearch}>
            <Search size={15} />
            חפש
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 px-3" onClick={onClear}>
            <X size={15} />
            נקה
          </Button>
        </div>
      </div>
      {isDirty && <p className="text-xs text-muted-foreground">יש שינויים שלא חולצו</p>}

      <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3', !expanded && 'hidden')}>
        <Field label="לקוח">
          <select className={inputCls} value={filters.customer} onChange={(e) => onChange({ customer: e.target.value })}>
            <option value="">הכול</option>
            {companies.map((c) => (
              <option key={`cust-${c}`} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="סוג אנרגיה">
          <select
            className={inputCls}
            value={filters.energy_type}
            onChange={(e) => onChange({ energy_type: e.target.value as FleetOSFuelFilters['energy_type'] })}
          >
            <option value="all">הכול</option>
            <option value="fuel">דלק</option>
            <option value="electric">חשמל</option>
            <option value="hybrid">היברידי</option>
          </select>
        </Field>
        <Field label="תחנה / עמדה">
          <input
            className={inputCls}
            value={filters.station}
            onChange={(e) => onChange({ station: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="שם תחנה"
          />
        </Field>
        <Field label="מיקום / אזור">
          <input
            className={inputCls}
            value={filters.location}
            onChange={(e) => onChange({ location: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="אזור"
          />
        </Field>
        <Field label="תאריך מ-">
          <input type="date" className={inputCls} value={filters.date_from} onChange={(e) => onChange({ date_from: e.target.value })} />
        </Field>
        <Field label="תאריך עד">
          <input type="date" className={inputCls} value={filters.date_to} onChange={(e) => onChange({ date_to: e.target.value })} />
        </Field>
        <Field label="חודש">
          <input
            type="number"
            min={1}
            max={12}
            className={inputCls}
            value={filters.month}
            onChange={(e) => onChange({ month: e.target.value })}
            placeholder="1-12"
          />
        </Field>
        <Field label="שנה">
          <input
            type="number"
            className={inputCls}
            value={filters.year}
            onChange={(e) => onChange({ year: e.target.value })}
            placeholder="2026"
          />
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
