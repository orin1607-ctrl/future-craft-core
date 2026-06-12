import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Fuel, MoreHorizontal, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import FleetOSBottomNav, { type FleetOSNavModule } from './FleetOSBottomNav';
import FleetOSFuelVehicleBar, { type FuelVehicleDisplay } from './FleetOSFuelVehicleBar';
import FleetOSFuelSheetFilters from './FleetOSFuelSheetFilters';
import FleetOSFuelKpiBar from './FleetOSFuelKpiBar';
import FleetOSSheetPanel from './FleetOSSheetPanel';
import {
  ActionsContent,
  AddChargeContent,
  AddFuelContent,
  AnomaliesContent,
  ChargeLogContent,
  ChargeLogDetail,
  FuelLogContent,
  FuelLogDetail,
  ReportsContent,
  SavingsContent,
  type FuelSheetId,
} from './fleetosFuelSheets';
import {
  applyAnomalyFilters,
  applyChargeFilters,
  applyFuelFilters,
  filtersFromVehicleContext,
  mergeVehicleScopeWithAdvanced,
  vehicleScopeFromRow,
} from './fleetosFuelFilters';
import { buildAnomaliesFromFuel, computeFuelKpis, loadFleetOSFuelData } from './fleetosFuelData';
import { EMPTY_FUEL_FILTERS, type FleetOSFuelFilters } from './fleetosFuelTypes';
import type { FleetOSChargeRow, FleetOSFuelRow } from './fleetosFuelTypes';
import type { FleetOSVehicleRow } from './fleetosData';
import { getVisibilityForRole, type DaliaRole } from './fleetosTypes';
import { openVehicleHubFromFleetOS } from './openVehicleHubFromFleetOS';
import type { NavigateFunction } from 'react-router-dom';
import { markFleetOSHubNavigation } from '@/lib/entityNavContext';

export interface FuelVehicleContext {
  plate?: string;
  vehicleId?: string;
  company?: string;
  internal?: string;
  driver?: string;
  locked?: boolean;
  fromHub?: boolean;
}

export interface FuelChargingModuleProps {
  userRole: DaliaRole;
  companyFilter: string | null;
  companyOptions: string[];
  navigate: NavigateFunction;
  onModuleChange: (module: FleetOSNavModule) => void;
  vehicleContext?: FuelVehicleContext;
  onVehicleSelect?: (vehicleId: string, plate: string) => void;
}

const SHEETS_WITH_ADVANCED: FuelSheetId[] = ['fuel-log', 'charge-log', 'anomalies', 'reports'];

function rowToDisplay(v: FleetOSVehicleRow): FuelVehicleDisplay {
  return {
    id: v.id,
    plate: v.plate,
    internal_number: v.internal_number,
    company_name: v.company_name,
    driver_name: v.driver_name,
  };
}

function contextToDisplay(ctx: FuelVehicleContext): FuelVehicleDisplay | null {
  if (!ctx.plate && !ctx.vehicleId) return null;
  return {
    id: ctx.vehicleId || '',
    plate: ctx.plate || '',
    internal_number: ctx.internal,
    company_name: ctx.company,
    driver_name: ctx.driver,
  };
}

export default function FuelChargingModule({
  userRole,
  companyFilter,
  companyOptions,
  navigate,
  onModuleChange,
  vehicleContext,
  onVehicleSelect,
}: FuelChargingModuleProps) {
  const visibility = getVisibilityForRole(userRole);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [fuelAll, setFuelAll] = useState<FleetOSFuelRow[]>([]);
  const [chargeAll, setChargeAll] = useState<FleetOSChargeRow[]>([]);
  const [vehicles, setVehicles] = useState<FleetOSVehicleRow[]>([]);
  const [sheet, setSheet] = useState<FuelSheetId>(null);
  const [fuelDetail, setFuelDetail] = useState<FleetOSFuelRow | null>(null);
  const [chargeDetail, setChargeDetail] = useState<FleetOSChargeRow | null>(null);
  const [sheetDraftFilters, setSheetDraftFilters] = useState<FleetOSFuelFilters>(EMPTY_FUEL_FILTERS);
  const [sheetAppliedFilters, setSheetAppliedFilters] = useState<FleetOSFuelFilters>(EMPTY_FUEL_FILTERS);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadFleetOSFuelData(companyFilter);
      setFuelAll(data.fuel);
      setChargeAll(data.charges);
      setVehicles(data.vehicles);
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeVehicle = useMemo((): FuelVehicleDisplay | null => {
    if (vehicleContext?.vehicleId) {
      const found = vehicles.find((v) => v.id === vehicleContext.vehicleId);
      if (found) return rowToDisplay(found);
    }
    if (vehicleContext?.plate) {
      const found = vehicles.find((v) => v.plate === vehicleContext.plate || v.plate.includes(vehicleContext.plate!));
      if (found) return rowToDisplay(found);
    }
    if (vehicleContext?.vehicleId || vehicleContext?.plate) {
      return contextToDisplay(vehicleContext);
    }
    return null;
  }, [vehicleContext, vehicles]);

  const vehicleScope = useMemo((): Partial<FleetOSFuelFilters> | null => {
    if (!activeVehicle?.plate) return null;
    const row = vehicles.find((v) => v.id === activeVehicle.id);
    if (row) return vehicleScopeFromRow(row);
    return filtersFromVehicleContext({
      plate: activeVehicle.plate,
      vehicleId: activeVehicle.id,
      company: activeVehicle.company_name,
      internal: activeVehicle.internal_number,
      driver: activeVehicle.driver_name,
    });
  }, [activeVehicle, vehicles]);

  const hasVehicle = Boolean(activeVehicle?.plate);

  const filteredFuel = useMemo(() => {
    if (!vehicleScope) return [];
    return applyFuelFilters(fuelAll, mergeVehicleScopeWithAdvanced(vehicleScope, EMPTY_FUEL_FILTERS));
  }, [fuelAll, vehicleScope]);

  const filteredCharge = useMemo(() => {
    if (!vehicleScope) return [];
    return applyChargeFilters(chargeAll, mergeVehicleScopeWithAdvanced(vehicleScope, EMPTY_FUEL_FILTERS));
  }, [chargeAll, vehicleScope]);

  const sheetMergedFilters = useMemo(() => {
    if (!vehicleScope) return EMPTY_FUEL_FILTERS;
    return mergeVehicleScopeWithAdvanced(vehicleScope, sheetAppliedFilters);
  }, [vehicleScope, sheetAppliedFilters]);

  const sheetFilteredFuel = useMemo(() => applyFuelFilters(fuelAll, sheetMergedFilters), [fuelAll, sheetMergedFilters]);
  const sheetFilteredCharge = useMemo(() => {
    let rows = applyChargeFilters(chargeAll, sheetMergedFilters);
    if (sheetMergedFilters.energy_type === 'fuel') rows = [];
    return rows;
  }, [chargeAll, sheetMergedFilters]);

  const anomaliesAll = useMemo(() => buildAnomaliesFromFuel(fuelAll), [fuelAll]);
  const filteredAnomalies = useMemo(() => {
    if (!vehicleScope) return [];
    return applyAnomalyFilters(anomaliesAll, mergeVehicleScopeWithAdvanced(vehicleScope, EMPTY_FUEL_FILTERS));
  }, [anomaliesAll, vehicleScope]);

  const sheetFilteredAnomalies = useMemo(
    () => applyAnomalyFilters(anomaliesAll, sheetMergedFilters),
    [anomaliesAll, sheetMergedFilters],
  );

  const kpis = useMemo(
    () => computeFuelKpis(filteredFuel, filteredCharge, filteredAnomalies),
    [filteredFuel, filteredCharge, filteredAnomalies],
  );

  const selectedVehicleRow = useMemo(
    () => (activeVehicle?.id ? vehicles.find((v) => v.id === activeVehicle.id) || null : null),
    [activeVehicle, vehicles],
  );

  const openHub = useCallback(() => {
    if (!selectedVehicleRow) {
      toast.error('בחר רכב לפני פתיחת כרטיס');
      return;
    }
    const returnPath =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search || ''}`
        : '/fleetos-ai?tab=fuel';
    markFleetOSHubNavigation(selectedVehicleRow.id, returnPath);
    openVehicleHubFromFleetOS(selectedVehicleRow, navigate, companyFilter);
  }, [selectedVehicleRow, navigate, companyFilter, vehicleContext?.fromHub, activeVehicle]);

  const handleSelectVehicle = useCallback(
    (vehicleId: string) => {
      const v = vehicles.find((x) => x.id === vehicleId);
      if (!v) return;
      onVehicleSelect?.(v.id, v.plate);
    },
    [vehicles, onVehicleSelect],
  );

  const openSheet = useCallback((id: FuelSheetId) => {
    if (!hasVehicle) {
      toast.info('בחר רכב לפני פתיחת הפעולה');
      return;
    }
    setSheetDraftFilters(EMPTY_FUEL_FILTERS);
    setSheetAppliedFilters(EMPTY_FUEL_FILTERS);
    setSheet(id);
  }, [hasVehicle]);

  const closeSheet = () => {
    setSheet(null);
    setFuelDetail(null);
    setChargeDetail(null);
    setSheetDraftFilters(EMPTY_FUEL_FILTERS);
    setSheetAppliedFilters(EMPTY_FUEL_FILTERS);
  };

  const openAnomalyCount = filteredAnomalies.filter((a) => !a.handled).length;
  const sheetAnomalyCount = sheetFilteredAnomalies.filter((a) => !a.handled).length;

  const actionButtons: { id: FuelSheetId; label: string; badge?: string; urgent?: boolean; full?: boolean }[] = [
    { id: 'add-fuel', label: 'הוסף תדלוק' },
    { id: 'add-charge', label: 'הוסף טעינה' },
    { id: 'fuel-log', label: 'יומן תדלוקים', badge: hasVehicle ? String(filteredFuel.length) : undefined },
    { id: 'charge-log', label: 'יומן טעינות', badge: hasVehicle ? String(filteredCharge.length) : undefined },
    { id: 'anomalies', label: 'חריגות', badge: openAnomalyCount > 0 ? String(openAnomalyCount) : undefined, urgent: openAnomalyCount > 0 },
    { id: 'savings', label: 'חיסכון ותחנות' },
    { id: 'reports', label: 'דוחות', full: true },
  ];

  if (!visibility.canSeeFuel) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        אין הרשאה לצפייה במודול דלק וטעינה
      </div>
    );
  }

  const sheetTitle = (): string => {
    if (sheet === 'fuel-log' && fuelDetail) return `תדלוק — ${fuelDetail.plate}`;
    if (sheet === 'charge-log' && chargeDetail) return `טעינה — ${chargeDetail.plate}`;
    const titles: Record<string, string> = {
      actions: 'פעולות',
      'add-fuel': 'הוסף תדלוק',
      'add-charge': 'הוסף טעינה',
      'fuel-log': `יומן תדלוקים (${sheetFilteredFuel.length})`,
      'charge-log': `יומן טעינות (${sheetFilteredCharge.length})`,
      anomalies: `חריגות (${sheetAnomalyCount} פתוחות)`,
      savings: 'חיסכון ותחנות',
      reports: 'דוחות',
    };
    return sheet ? titles[sheet] || '' : '';
  };

  const sheetFilterPanel = activeVehicle && sheet && SHEETS_WITH_ADVANCED.includes(sheet) ? (
    <FleetOSFuelSheetFilters
      vehicle={activeVehicle}
      draftFilters={sheetDraftFilters}
      appliedFilters={sheetAppliedFilters}
      onChange={(patch) => setSheetDraftFilters((p) => ({ ...p, ...patch }))}
      onSearch={() => setSheetAppliedFilters({ ...sheetDraftFilters })}
      onClear={() => {
        setSheetDraftFilters(EMPTY_FUEL_FILTERS);
        setSheetAppliedFilters(EMPTY_FUEL_FILTERS);
      }}
      companies={companyOptions.length ? companyOptions : []}
    />
  ) : null;

  return (
    <div className="animate-fade-in w-full max-w-none pb-36 md:pb-24">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="page-header flex flex-wrap items-center gap-2 sm:gap-3 mb-1 text-xl sm:text-2xl md:text-3xl">
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Fuel size={22} className="text-primary" />
            </span>
            <span className="min-w-0">דלק וטעינה</span>
            <span className="text-sm sm:text-base font-bold text-muted-foreground w-full sm:w-auto sm:inline">
              · FleetOS AI
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground pr-0 md:pr-14 leading-relaxed">
            תדלוקים, טעינות, חריגות ודוחות — נתונים ממערכת דליה
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none min-h-[44px]"
            onClick={() => { setSpinning(true); refresh().finally(() => setTimeout(() => setSpinning(false), 600)); }}
            disabled={loading}
          >
            <RefreshCcw size={14} className={cn(spinning && 'animate-spin')} />
            רענון
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1 sm:flex-none min-h-[44px] gap-1" onClick={() => openSheet('actions')}>
            <MoreHorizontal size={14} />
            פעולות
          </Button>
          <Link to="/dashboard" className="flex-1 sm:flex-none text-sm border border-border rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-1 min-h-[44px]">
            <ArrowRight size={14} />
            דשבורד
          </Link>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-5">
        <FleetOSFuelVehicleBar
          vehicle={activeVehicle}
          locked={vehicleContext?.locked}
          fromHub={vehicleContext?.fromHub}
          vehicles={vehicles}
          onSelectVehicle={handleSelectVehicle}
          onOpenHub={selectedVehicleRow ? openHub : undefined}
        />

        {hasVehicle ? (
          <>
            <FleetOSFuelKpiBar kpis={kpis} loading={loading} />

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {actionButtons.map((btn) => (
                <Button
                  key={btn.id}
                  type="button"
                  variant="outline"
                  className={cn(
                    'h-auto min-h-[52px] py-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-xs sm:text-sm font-bold relative',
                    btn.full && 'col-span-2',
                    btn.urgent && 'border-destructive/40',
                  )}
                  onClick={() => openSheet(btn.id)}
                >
                  {btn.label}
                  {btn.badge && (
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full text-primary-foreground', btn.urgent ? 'bg-destructive' : 'bg-primary')}>
                      {btn.badge}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
            בחר רכב למעלה כדי לראות נתוני דלק, טעינה וחריגות
          </div>
        )}
      </div>

      <FleetOSBottomNav active="fuel" onModuleChange={onModuleChange} />

      <FleetOSSheetPanel
        open={sheet !== null}
        title={sheetTitle()}
        onClose={closeSheet}
        onBack={
          (sheet === 'fuel-log' && fuelDetail) || (sheet === 'charge-log' && chargeDetail)
            ? () => { setFuelDetail(null); setChargeDetail(null); }
            : undefined
        }
      >
        {sheetFilterPanel}
        {sheet === 'actions' && <ActionsContent />}
        {sheet === 'add-fuel' && <AddFuelContent selectedVehicle={selectedVehicleRow} onClose={closeSheet} />}
        {sheet === 'add-charge' && <AddChargeContent selectedVehicle={selectedVehicleRow} onClose={closeSheet} />}
        {sheet === 'fuel-log' && !fuelDetail && (
          <FuelLogContent rows={sheetFilteredFuel} onSelect={(r) => setFuelDetail(r)} />
        )}
        {sheet === 'fuel-log' && fuelDetail && <FuelLogDetail row={fuelDetail} />}
        {sheet === 'charge-log' && !chargeDetail && (
          <ChargeLogContent rows={sheetFilteredCharge} onSelect={(r) => setChargeDetail(r)} />
        )}
        {sheet === 'charge-log' && chargeDetail && <ChargeLogDetail row={chargeDetail} />}
        {sheet === 'anomalies' && <AnomaliesContent rows={sheetFilteredAnomalies} />}
        {sheet === 'savings' && <SavingsContent />}
        {sheet === 'reports' && <ReportsContent />}
      </FleetOSSheetPanel>
    </div>
  );
}
