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
import FleetOSBottomNav from './FleetOSBottomNav';
import {
  DEFAULT_PREFS,
  getVisibilityForRole,
  type DaliaRole,
  type FleetOSDashboardPrefs,
  type FleetOSKpiSnapshot,
} from './fleetosTypes';
import type { FleetOSAlertRow, FleetOSVehicleRow } from './fleetosData';

const STATUS_LABEL: Record<FleetOSVehicleRow['status'], string> = {
  driving: 'בנסיעה',
  stopped: 'עצור',
  fault: 'תקלה',
  offline: 'לא מחובר',
};

const STATUS_DOT: Record<FleetOSVehicleRow['status'], string> = {
  driving: 'bg-success',
  stopped: 'bg-muted-foreground',
  fault: 'bg-destructive',
  offline: 'bg-warning',
};

function applyFilters(vehicles: FleetOSVehicleRow[], f: FleetOSFilters): FleetOSVehicleRow[] {
  return vehicles.filter((v) => {
    if (f.company && v.company_name !== f.company) return false;
    if (f.plate && !v.plate.includes(f.plate.trim())) return false;
    if (f.internal && !(v.internal_number || '').includes(f.internal.trim())) return false;
    if (f.driver && !(v.driver_name || '').includes(f.driver.trim())) return false;
    if (f.make && v.make !== f.make) return false;
    if (f.model && v.model !== f.model) return false;
    if (f.status && v.status_text !== f.status) return false;
    return true;
  });
}

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
}: FleetStatusModuleProps) {
  const visibility = getVisibilityForRole(userRole);
  const [filters, setFilters] = useState<FleetOSFilters>(EMPTY_FLEETOS_FILTERS);
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<FleetOSVehicleRow | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [hubOpening, setHubOpening] = useState(false);
  const selectedRef = useRef<FleetOSVehicleRow | null>(null);
  selectedRef.current = selected;

  const filtered = useMemo(() => applyFilters(vehicles, filters), [vehicles, filters]);

  const pickVehicle = useCallback((v: FleetOSVehicleRow) => {
    setSelected(v);
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
    try {
      void onOpenVehicleHub(row);
    } finally {
      setHubOpening(false);
    }
  }, [onOpenVehicleHub, hubOpening]);

  const handleRefresh = () => {
    setSpinning(true);
    onRefresh?.();
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <div className="animate-fade-in w-full max-w-none pb-36 md:pb-24">
      {/* כותרת */}
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="page-header flex items-center gap-3 mb-1 text-2xl md:text-3xl">
            <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Radar size={24} className="text-primary" />
            </span>
            מיקום צי חכם
            <span className="text-base font-bold text-muted-foreground hidden sm:inline">· FleetOS AI</span>
          </h1>
          <p className="text-sm text-muted-foreground pr-0 md:pr-14">
            מצב צי — נתונים חיים ממערכת דליה (רכבים, תקלות, הזמנות שירות)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCcw size={14} className={cn(spinning && 'animate-spin')} />
            רענון
          </Button>
          <Link
            to="/dashboard"
            className="text-sm border border-border rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted transition-colors inline-flex items-center gap-1"
          >
            <ArrowRight size={14} />
            דשבורד
          </Link>
        </div>
      </div>

      <div className="space-y-5">
        {/* סינון עליון */}
        <FleetOSFilterBar
          filters={filters}
          onChange={(patch) => setFilters((p) => ({ ...p, ...patch }))}
          onClear={() => setFilters(EMPTY_FLEETOS_FILTERS)}
          vehicles={vehicles}
          companyOptions={companyOptions}
        />

        {/* KPI */}
        <FleetOSKpiBar kpis={kpis} loading={loading} />

        {/* התראות נבחרות */}
        {visibility.canSeeAlerts && (
          <FleetOSPinnedAlerts alertTypes={prefs.alerts} allAlerts={alerts} />
        )}

        {/* מפה — כל הרכבים */}
        <FleetOSMapSection
          vehicles={vehicles}
          selectedId={selected?.id}
          onSelect={pickVehicle}
        />

        {/* רכב נבחר */}
        <FleetOSSelectedVehicleCard
          vehicle={selected}
          onOpenHub={handleOpenSelectedHub}
          hubOpening={hubOpening}
        />

        {/* רשימת רכבים מתקפלת */}
        <div className="card-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setListOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-bold text-foreground">
              {listOpen ? 'הסתר רשימת רכבים' : 'הצג רשימת רכבים'}
              <span className="text-muted-foreground font-normal mr-2">({filtered.length})</span>
            </span>
            {listOpen ? <ChevronUp size={18} className="text-primary shrink-0" /> : <ChevronDown size={18} className="text-primary shrink-0" />}
          </button>

          {listOpen && (
            <div className="border-t border-border px-2 pb-2">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">טוען רכבים…</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">אין רכבים להצגה</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => pickVehicle(v)}
                        className={cn(
                          'w-full flex items-center gap-3 py-3 text-right hover:bg-muted/40 rounded-lg px-2 transition-colors',
                          selected?.id === v.id && 'bg-primary/5',
                        )}
                      >
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_DOT[v.status])} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-primary" dir="ltr">{v.plate}</span>
                            {v.internal_number && (
                              <span className="text-xs text-muted-foreground">{v.internal_number}</span>
                            )}
                            <span className="text-xs text-muted-foreground mr-auto">{STATUS_LABEL[v.status]}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
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

      {/* 4 כפתורי ניווט ראשיים */}
      <FleetOSBottomNav active="status" />
    </div>
  );
}
