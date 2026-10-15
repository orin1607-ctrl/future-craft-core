import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, UserRound } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import DriverTrackingSummaryGrid from '@/components/driver-tracking/DriverTrackingSummaryGrid';
import DriverTrackingFilterPanel from '@/components/driver-tracking/DriverTrackingFilterPanel';
import DriverTrackingList from '@/components/driver-tracking/DriverTrackingList';
import DriverTrackingDetail from '@/components/driver-tracking/DriverTrackingDetail';
import { loadDriverTrackingRows } from '@/lib/driverTrackingLoad';
import {
  applyDriverFilters,
  applyDriverSummaryFilter,
  buildDriverSummaryCounts,
  EMPTY_DRIVER_FILTERS,
  sortDriverRows,
  type DriverSortKey,
  type DriverSummaryKey,
  type DriverTrackingFilters,
  type DriverTrackingRow,
} from '@/lib/driverTrackingData';

const SUMMARY_KEYS: DriverSummaryKey[] = ['total', 'open', 'overdue', 'in_progress', 'completed'];

export default function DriverTracking() {
  const companyFilter = useCompanyFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const driverId = searchParams.get('driverId') || '';

  const [allRows, setAllRows] = useState<DriverTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const summaryFromUrl = searchParams.get('summary') as DriverSummaryKey | null;
  const [summaryKey, setSummaryKey] = useState<DriverSummaryKey | null>(
    summaryFromUrl && SUMMARY_KEYS.includes(summaryFromUrl) ? summaryFromUrl : null,
  );
  const [filters, setFilters] = useState<DriverTrackingFilters>(EMPTY_DRIVER_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DriverTrackingFilters>(EMPTY_DRIVER_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<DriverSortKey>('urgency');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const rows = await loadDriverTrackingRows(companyFilter);
      setAllRows(rows);
      setError('');
    } catch (err) {
      console.error(err);
      if (!silent) {
        setAllRows([]);
        setError('לא ניתן לטעון את מעקב הנהגים');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [refresh]);

  const filtered = useMemo(
    () => applyDriverFilters(allRows, appliedFilters),
    [allRows, appliedFilters],
  );
  const displayedRows = useMemo(
    () => sortDriverRows(applyDriverSummaryFilter(filtered, summaryKey), sort),
    [filtered, summaryKey, sort],
  );
  const counts = useMemo(() => buildDriverSummaryCounts(filtered), [filtered]);
  const selected = driverId ? allRows.find((row) => row.id === driverId) || null : null;

  const openDriver = (id: string) => {
    const q = new URLSearchParams(searchParams);
    q.set('driverId', id);
    setSearchParams(q);
  };

  const backToList = () => {
    const q = new URLSearchParams(searchParams);
    q.delete('driverId');
    setSearchParams(q);
  };

  const onSummarySelect = (key: DriverSummaryKey) => {
    const next = summaryKey === key ? null : key;
    setSummaryKey(next);
    const q = new URLSearchParams(searchParams);
    if (next) q.set('summary', next);
    else q.delete('summary');
    q.delete('driverId');
    setSearchParams(q);
  };

  if (driverId) {
    if (loading) return <p className="text-center py-12 text-muted-foreground">טוען מעקב נהג...</p>;
    if (!selected) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">לא נמצא נהג</p>
          <button type="button" onClick={backToList} className="text-primary font-medium">חזרה לרשימה</button>
        </div>
      );
    }
    return <DriverTrackingDetail driver={selected} onBack={backToList} />;
  }

  return (
    <div className="animate-fade-in pb-8">
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="page-header flex items-center gap-3 mb-1 text-2xl md:text-3xl">
            <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <UserRound size={24} className="text-primary" />
            </span>
            מעקב נהגים
            <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" title="חי" />
          </h1>
          <p className="text-sm text-muted-foreground pr-14">
            מרכז שליטה — צפייה ובקרה בלבד. פעולות מתבצעות מכרטיס הנהג.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="text-sm border border-border rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted transition-colors shrink-0"
        >
          <ArrowRight size={14} className="inline ml-1" />
          דשבורד
        </Link>
      </div>

      {loading ? (
        <p className="text-center py-12 text-muted-foreground">טוען נתוני נהגים...</p>
      ) : error ? (
        <div className="card-elevated text-center py-12">
          <p className="text-destructive mb-3">{error}</p>
          <button type="button" onClick={refresh} className="text-primary font-medium">נסו שוב</button>
        </div>
      ) : (
        <>
          <DriverTrackingSummaryGrid counts={counts} activeKey={summaryKey} onSelect={onSummarySelect} />
          <div className="mt-6">
            <DriverTrackingFilterPanel
              open={filterOpen}
              onToggle={() => setFilterOpen((o) => !o)}
              filters={filters}
              onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
              onApply={() => setAppliedFilters(filters)}
              onClear={() => {
                setFilters(EMPTY_DRIVER_FILTERS);
                setAppliedFilters(EMPTY_DRIVER_FILTERS);
                setSummaryKey(null);
                const q = new URLSearchParams(searchParams);
                q.delete('summary');
                setSearchParams(q);
              }}
              drivers={allRows}
            />
          </div>
          <DriverTrackingList
            rows={displayedRows}
            total={allRows.length}
            sort={sort}
            onSort={setSort}
            onOpen={openDriver}
          />
        </>
      )}
    </div>
  );
}
