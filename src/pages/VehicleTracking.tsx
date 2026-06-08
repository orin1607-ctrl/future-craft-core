import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Car, ArrowRight } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import TrackingSummaryGrid from '@/components/vehicle-tracking/TrackingSummaryGrid';
import TrackingFilterPanel from '@/components/vehicle-tracking/TrackingFilterPanel';
import TrackingFleetList from '@/components/vehicle-tracking/TrackingFleetList';
import TrackingVehicleDetail from '@/components/vehicle-tracking/TrackingVehicleDetail';
import {
  applySummaryFilter,
  applyTrackingFilters,
  buildSummaryCounts,
  EMPTY_TRACKING_FILTERS,
  loadFleetTrackingRows,
  loadVehicleTrackingDetail,
  type SummaryFilterKey,
  type TrackingFilters,
  type TrackingVehicleRow,
} from '@/lib/vehicleTrackingData';

export default function VehicleTracking() {
  const companyFilter = useCompanyFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const vehicleId = searchParams.get('vehicleId') || '';

  const [allRows, setAllRows] = useState<TrackingVehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryKey, setSummaryKey] = useState<SummaryFilterKey | null>(null);
  const [filters, setFilters] = useState<TrackingFilters>(EMPTY_TRACKING_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<TrackingFilters>(EMPTY_TRACKING_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadVehicleTrackingDetail>>>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refreshFleet = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadFleetTrackingRows(companyFilter);
      setAllRows(rows);
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    refreshFleet();
  }, [refreshFleet]);

  useEffect(() => {
    if (!vehicleId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    loadVehicleTrackingDetail(vehicleId, companyFilter)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  }, [vehicleId, companyFilter]);

  const displayedRows = useMemo(() => {
    let rows = applySummaryFilter(allRows, summaryKey);
    rows = applyTrackingFilters(rows, appliedFilters);
    return rows;
  }, [allRows, summaryKey, appliedFilters]);

  const counts = useMemo(() => buildSummaryCounts(allRows), [allRows]);

  const openVehicle = (id: string) => {
    setSearchParams({ vehicleId: id });
  };

  const backToList = () => {
    setSearchParams({});
  };

  const onSummarySelect = (key: SummaryFilterKey) => {
    setSummaryKey((prev) => (prev === key ? null : key));
    setAppliedFilters(EMPTY_TRACKING_FILTERS);
  };

  if (vehicleId) {
    if (detailLoading) {
      return <p className="text-center py-12 text-muted-foreground">טוען מעקב רכב...</p>;
    }
    if (!detail) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">לא נמצא רכב</p>
          <button type="button" onClick={backToList} className="text-primary font-medium">
            חזרה לרשימה
          </button>
        </div>
      );
    }
    return (
      <TrackingVehicleDetail vehicle={detail.vehicle} history={detail.history} onBack={backToList} />
    );
  }

  return (
    <div className="animate-fade-in pb-8">
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="page-header flex items-center gap-3 mb-1 text-2xl md:text-3xl">
            <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Car size={24} className="text-primary" />
            </span>
            מעקב רכב
            <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" title="חי" />
          </h1>
          <p className="text-sm text-muted-foreground pr-14">
            מרכז שליטה — צפייה ובקרה בלבד. פעולות מתבצעות מכרטיס הרכב.
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
        <p className="text-center py-12 text-muted-foreground">טוען נתוני צי...</p>
      ) : (
        <>
          <TrackingSummaryGrid counts={counts} activeKey={summaryKey} onSelect={onSummarySelect} />
          <div className="mt-6">
            <TrackingFilterPanel
              open={filterOpen}
              onToggle={() => setFilterOpen((o) => !o)}
              filters={filters}
              onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
              onApply={() => {
                setAppliedFilters(filters);
                setSummaryKey(null);
              }}
              onClear={() => {
                setFilters(EMPTY_TRACKING_FILTERS);
                setAppliedFilters(EMPTY_TRACKING_FILTERS);
                setSummaryKey(null);
              }}
              vehicles={allRows}
            />
          </div>
          <TrackingFleetList rows={displayedRows} total={allRows.length} onOpen={openVehicle} />
        </>
      )}
    </div>
  );
}
