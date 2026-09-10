import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import {
  EXPIRY_KIND_LABELS,
  filterPendingExpiryItems,
  formatExpiryHe,
  loadPendingExpiryItems,
  matchesExpiryKindQuery,
  type ExpiryFilterScope,
  type PendingExpiryItem,
} from '@/lib/expiryOfficerApproval';

const FILTERS: { id: ExpiryFilterScope; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'vehicles', label: 'רכבים' },
  { id: 'drivers', label: 'נהגים' },
  { id: 'test', label: EXPIRY_KIND_LABELS.test },
  { id: 'insurance', label: EXPIRY_KIND_LABELS.insurance },
  { id: 'comprehensive_insurance', label: EXPIRY_KIND_LABELS.comprehensive_insurance },
  { id: 'third_party_insurance', label: EXPIRY_KIND_LABELS.third_party_insurance },
  { id: 'license', label: EXPIRY_KIND_LABELS.license },
  { id: 'exam', label: EXPIRY_KIND_LABELS.exam },
];

export default function ExpiryApprovals() {
  const companyFilter = useCompanyFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = matchesExpiryKindQuery(searchParams.get('kind'));
  const [items, setItems] = useState<PendingExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPendingExpiryItems(companyFilter)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyFilter]);

  const visible = useMemo(() => filterPendingExpiryItems(items, filter), [items, filter]);

  const setFilter = (next: ExpiryFilterScope) => {
    const q = new URLSearchParams(searchParams);
    if (next === 'all') q.delete('kind');
    else q.set('kind', next);
    setSearchParams(q, { replace: true });
  };

  return (
    <div className="animate-fade-in space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowRight size={20} />
        </Link>
        <h1 className="page-header flex items-center gap-2 !mb-0">
          <ClipboardCheck size={24} />
          ממתינים לאישור קצין רכב
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {loading ? 'טוען…' : `${visible.length} מתוך ${items.length} פגי תוקף`}
      </p>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border min-h-[36px] ${
              filter === f.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-background text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {!loading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground card-elevated p-4">אין ממתינים לאישור בסינון זה.</p>
        )}
        {visible.map((item) => (
          <Link
            key={item.id}
            to={item.href}
            className="card-elevated block p-3 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">
                  {item.displayName}
                  <span className="text-muted-foreground font-medium"> · {item.kindLabel}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  פג {formatExpiryHe(item.oldDate)} · ממתין לאישור
                </p>
              </div>
              <span className="text-[10px] font-bold text-destructive shrink-0">ממתין</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
