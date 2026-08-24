import { useMemo, useState } from 'react';
import type { FollowUpWorkItem } from '@/features/telemarketing/types';
import { LeadTimeline } from '@/features/telemarketing/components/FollowUp/LeadTimeline';

const BUCKET_LABEL: Record<FollowUpWorkItem['bucket'], string> = {
  late: 'באיחור',
  today: 'לחזור היום',
  future: 'בהמשך',
  done: 'הושלמו',
};

const BUCKET_TONE: Record<FollowUpWorkItem['bucket'], string> = {
  late: 'border-destructive bg-destructive/10 text-destructive',
  today: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
  future: 'border-border bg-card',
  done: 'border-border bg-muted/40 text-muted-foreground',
};

export interface FollowUpFiltersState {
  search: string;
  fromDate: string;
  toDate: string;
  employee: string;
  bucket: '' | FollowUpWorkItem['bucket'];
  urgency: string;
  result: string;
}

const EMPTY_FILTERS: FollowUpFiltersState = {
  search: '',
  fromDate: '',
  toDate: '',
  employee: '',
  bucket: '',
  urgency: '',
  result: '',
};

function applyFilters(items: FollowUpWorkItem[], filters: FollowUpFiltersState, hideEmployee: boolean): FollowUpWorkItem[] {
  const q = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const hay = `${item.companyName} ${item.contactName ?? ''} ${item.phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.fromDate && item.dueDate < filters.fromDate) return false;
    if (filters.toDate && item.dueDate > filters.toDate) return false;
    if (!hideEmployee && filters.employee && item.employeeName !== filters.employee) return false;
    if (filters.bucket && item.bucket !== filters.bucket) return false;
    if (filters.urgency && item.urgency !== filters.urgency) return false;
    if (filters.result && item.lastResult !== filters.result) return false;
    return true;
  });
}

export function FollowUpBoard({
  items,
  hideEmployeeFilter,
  onStartReturn,
  allowStartReturn,
}: {
  items: FollowUpWorkItem[];
  hideEmployeeFilter?: boolean;
  onStartReturn?: (item: FollowUpWorkItem) => void;
  allowStartReturn?: boolean;
}) {
  const [filters, setFilters] = useState<FollowUpFiltersState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<FollowUpWorkItem | null>(null);
  const employees = useMemo(
    () => Array.from(new Set(items.map((i) => i.employeeName).filter(Boolean))),
    [items],
  );
  const results = useMemo(
    () => Array.from(new Set(items.map((i) => i.lastResult).filter(Boolean))) as string[],
    [items],
  );
  const filtered = applyFilters(items, filters, !!hideEmployeeFilter);
  const grouped = {
    late: filtered.filter((i) => i.bucket === 'late'),
    today: filtered.filter((i) => i.bucket === 'today'),
    future: filtered.filter((i) => i.bucket === 'future'),
    done: filtered.filter((i) => i.bucket === 'done'),
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-3">
        <input
          placeholder="חיפוש: חברה / איש קשר / טלפון"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm md:col-span-3"
        />
        <label className="text-xs font-semibold text-muted-foreground">
          מתאריך
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
            className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          עד תאריך
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
            className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
        </label>
        {!hideEmployeeFilter && (
          <select
            value={filters.employee}
            onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
            className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm"
          >
            <option value="">כל הנציגים</option>
            {employees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          value={filters.bucket}
          onChange={(e) => setFilters((f) => ({ ...f, bucket: e.target.value as FollowUpFiltersState['bucket'] }))}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="late">באיחור</option>
          <option value="today">להיום</option>
          <option value="future">עתידי</option>
          <option value="done">הושלם</option>
        </select>
        <select
          value={filters.urgency}
          onChange={(e) => setFilters((f) => ({ ...f, urgency: e.target.value }))}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="">כל הדחיפויות</option>
          <option value="רגיל">רגיל</option>
          <option value="חשוב">חשוב</option>
          <option value="דחוף">דחוף</option>
        </select>
        <select
          value={filters.result}
          onChange={(e) => setFilters((f) => ({ ...f, result: e.target.value }))}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="">כל תוצאות השיחה</option>
          {results.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {(['late', 'today', 'future', 'done'] as const).map((bucket) => (
        <section key={bucket}>
          <h4 className={`mb-2 text-base font-black ${bucket === 'late' ? 'text-destructive' : ''}`}>
            {BUCKET_LABEL[bucket]} ({grouped[bucket].length})
          </h4>
          {grouped[bucket].length === 0 && (
            <p className="mb-4 text-sm text-muted-foreground">אין רשומות</p>
          )}
          <div className="space-y-2">
            {grouped[bucket].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={`w-full rounded-xl border p-3 text-right ${BUCKET_TONE[item.bucket]} ${
                  item.urgency === 'דחוף' ? 'ring-2 ring-destructive' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{item.companyName || 'ללא שם'}</span>
                  <span className="text-xs font-semibold">
                    {BUCKET_LABEL[item.bucket]} · {item.dueDate}
                    {item.dueTime ? ` ${item.dueTime}` : ''} · {item.urgency}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  {item.contactName ? `${item.contactName} · ` : ''}
                  {item.phone || 'אין טלפון'}
                  {!hideEmployeeFilter ? ` · ${item.employeeName}` : ''}
                </p>
                <p className="mt-1 text-sm font-semibold">{item.actionNeeded || 'ללא פעולה מוגדרת'}</p>
                {item.lastSummary && <p className="mt-1 line-clamp-2 text-xs opacity-80">{item.lastSummary}</p>}
                {item.lastResult && <p className="mt-1 text-xs">תוצאה אחרונה: {item.lastResult}</p>}
              </button>
            ))}
          </div>
        </section>
      ))}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setSelected(null)} className="float-left text-2xl text-muted-foreground">
              ×
            </button>
            <h3 className="mb-3 text-lg font-black">{selected.companyName}</h3>
            <LeadTimeline
              followUp={selected}
              showStartButton={allowStartReturn}
              onStartReturn={(item) => {
                setSelected(null);
                onStartReturn?.(item);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function dueCount(items: FollowUpWorkItem[]): number {
  return items.filter((i) => i.bucket === 'late' || i.bucket === 'today').length;
}
