import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ChevronDown, ChevronUp, ChevronLeft,
  RefreshCcw, Radar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import FleetOSKpiBar from './FleetOSKpiBar';
import FleetOSPinnedAlerts from './FleetOSPinnedAlerts';
import FleetOSMapSection from './FleetOSMapSection';
import FleetOSFilterBar, { EMPTY_FLEETOS_FILTERS, type FleetOSFilters } from './FleetOSFilterBar';
import FleetOSSelectedVehicleCard from './FleetOSSelectedVehicleCard';
import FleetOSBottomNav, { type FleetOSNavModule } from './FleetOSBottomNav';
import {
  applyFleetOSFilters,
  computeFleetOSKpisFromRows,
  filterFleetOSAlerts,
  hasActiveFleetOSFilters,
  STATUS_LABEL,
} from './fleetosFilters';
import {
  DEFAULT_PREFS,
  getVisibilityForRole,
  type DaliaRole,
  type FleetOSDashboardPrefs,
  type FleetOSKpiSnapshot,
} from './fleetosTypes';
import type { FleetOSAlertRow, FleetOSVehicleRow } from './fleetosData';

const STATUS_DOT: Record<FleetOSVehicleRow['status'], string> = {
  driving: 'bg-success',
  stopped: 'bg-muted-foreground',
  fault: 'bg-destructive',
  offline: 'bg-warning',
};

export interface FleetStatusModuleProps {
  userRole: DaliaRole;
  prefs?: FleetOSDashboardPrefs;
  vehicles: FleetOSVehicleRow[];
  alerts: FleetOSAlertRow[];
  kpis: FleetOSKpiSnapshot;
  loading?: boolean;
  onRefresh?: () => void;
  onOpenVehicleHub: (vehicle: FleetOSVehicleRow) => void | Promise<void>;
  companyOptions?: string[];
  onModuleChange?: (module: FleetOSNavModule) => void;
}

export default function FleetStatusModule({
  userRole,
  prefs = DEFAULT_PREFS,
  vehicles,
  alerts,
  kpis,
  loading,
  onRefresh,
  onOpenVehicleHub,
  companyOptions,
  onModuleChange,
}: FleetStatusModuleProps) {
  const visibility = getVisibilityForRole(userRole);
  const [draftFilters, setDraftFilters] = useState<FleetOSFilters>(EMPTY_FLEETOS_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FleetOSFilters>(EMPTY_FLEETOS_FILTERS);
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<FleetOSVehicleRow | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [hubOpening, setHubOpening] = useState(false);
  const selectedRef = useRef<FleetOSVehicleRow | null>(null);
  selectedRef.current = selected;

  const isDirty = useMemo(
    () => JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters),
    [draftFilters, appliedFilters],
  );

  const filtered = useMemo(
    () => applyFleetOSFilters(vehicles, appliedFilters),
    [vehicles, appliedFilters],
  );

  const filteredKpis = useMemo(() => {
    if (!hasActiveFleetOSFilters(appliedFilters)) return kpis;
    return computeFleetOSKpisFromRows(filtered);
  }, [appliedFilters, filtered, kpis]);

  const filteredAlerts = useMemo(
    () => filterFleetOSAlerts(alerts, filtered, selected, vehicles.length),
    [alerts, filtered, selected, vehicles.length],
  );

  const pickVehicle = useCallback((v: FleetOSVehicleRow) => {
    setSelected(v);
  }, []);

  const applySearch = useCallback(() => {
    setAppliedFilters({ ...draftFilters });
  }, [draftFilters]);

  const clearFilters = useCallback(() => {
    setDraftFilters(EMPTY_FLEETOS_FILTERS);
    setAppliedFilters(EMPTY_FLEETOS_FILTERS);
  }, []);

  useEffect(() => {
    setSelected((prev) => {
      if (filtered.length === 0) return null;
      if (prev && filtered.some((v) => v.id === prev.id)) return prev;
      return filtered[0];
    });
  }, [filtered]);

  const handleOpenSelectedHub = useCallback(() => {
    const row = selectedRef.current;
    if (!row?.id || hubOpening) return;
    setHubOpening(true);
    void Promise.resolve(onOpenVehicleHub(row)).finally(() => setHubOpening(false));
  }, [onOpenVehicleHub, hubOpening]);

  const handleRefresh = () => {
    setSpinning(true);
    onRefresh?.();
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <div className="animate-fade-in w-full max-w-none pb-36 md:pb-24">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="page-header flex flex-wrap items-center gap-2 sm:gap-3 mb-1 text-xl sm:text-2xl md:text-3xl">
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Radar size={22} className="text-primary sm:hidden" />
              <Radar size={24} className="text-primary hidden sm:block" />
            </span>
            <span className="min-w-0">מיקום צי חכם</span>
            <span className="text-sm sm:text-base font-bold text-muted-foreground w-full sm:w-auto sm:inline">
              · FleetOS AI
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground pr-0 md:pr-14 leading-relaxed">
            מצב צי — נתונים חיים ממערכת דליה (רכבים, תקלות, הזמנות שירות)
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none min-h-[44px]"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCcw size={14} className={cn(spinning && 'animate-spin')} />
            רענון
          </Button>
          <Link
            to="/dashboard"
            className="flex-1 sm:flex-none text-sm border border-border rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-1 min-h-[44px]"
          >
            <ArrowRight size={14} />
            דשבורד
          </Link>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-5">
        <FleetOSFilterBar
          filters={draftFilters}
          onChange={(patch) => setDraftFilters((p) => ({ ...p, ...patch }))}
          onSearch={applySearch}
          onClear={clearFilters}
          vehicles={vehicles}
          companyOptions={companyOptions}
          filteredCount={filtered.length}
          totalCount={vehicles.length}
          isDirty={isDirty}
        />

        <FleetOSKpiBar
          kpis={filteredKpis}
          loading={loading}
          filtered={hasActiveFleetOSFilters(appliedFilters)}
        />

        {visibility.canSeeAlerts && (
          <FleetOSPinnedAlerts
            alertTypes={prefs.alerts}
            allAlerts={filteredAlerts}
            selectedPlate={selected?.plate}
          />
        )}

        <FleetOSMapSection
          vehicles={filtered}
          totalCount={vehicles.length}
          selectedId={selected?.id}
          onSelect={pickVehicle}
        />

        <FleetOSSelectedVehicleCard
          vehicle={selected}
          onOpenHub={handleOpenSelectedHub}
          hubOpening={hubOpening}
        />

        <div className="card-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setListOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-muted/30 transition-colors min-h-[52px]"
          >
            <span className="text-sm font-bold text-foreground truncate">
              {listOpen ? 'הסתר רשימת רכבים' : 'הצג רשימת רכבים'}
              <span className="text-muted-foreground font-normal mr-2">({filtered.length})</span>
            </span>
            {listOpen ? (
              <ChevronUp size={18} className="text-primary shrink-0" />
            ) : (
              <ChevronDown size={18} className="text-primary shrink-0" />
            )}
          </button>

          {listOpen && (
            <div className="border-t border-border px-2 pb-2 max-h-[min(420px,50vh)] overflow-y-auto">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">טוען רכבים…</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">אין רכבים להצגה — נסה לשנות סינון</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => pickVehicle(v)}
                        className={cn(
                          'w-full flex items-center gap-3 py-3 text-right hover:bg-muted/40 rounded-lg px-2 transition-colors min-h-[56px]',
                          selected?.id === v.id && 'bg-primary/5 ring-1 ring-primary/20',
                        )}
                      >
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_DOT[v.status])} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold text-primary text-sm" dir="ltr">
                              {v.plate}
                            </span>
                            {v.internal_number && (
                              <span className="text-xs text-muted-foreground truncate">{v.internal_number}</span>
                            )}
                            <span className="text-xs text-muted-foreground mr-auto shrink-0">
                              {STATUS_LABEL[v.status]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {v.driver_name || 'ללא נהג'}
                            {v.make && ` · ${v.make} ${v.model || ''}`}
                            {(v.fault_count ?? 0) > 0 && (
                              <span className="text-destructive font-bold"> · תקלה פעילה</span>
                            )}
                          </p>
                        </div>
                        <ChevronLeft size={16} className="text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <FleetOSBottomNav active="status" onModuleChange={onModuleChange} />
    </div>
  );
}
