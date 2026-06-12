import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Fuel, MoreHorizontal, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import FleetOSBottomNav, { type FleetOSNavModule } from './FleetOSBottomNav';
import FleetOSFuelFilterBar from './FleetOSFuelFilterBar';
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
} from './fleetosFuelFilters';
import { buildAnomaliesFromFuel, computeFuelKpis, loadFleetOSFuelData } from './fleetosFuelData';
import { EMPTY_FUEL_FILTERS, type FleetOSFuelFilters } from './fleetosFuelTypes';
import type { FleetOSChargeRow, FleetOSFuelRow } from './fleetosFuelTypes';
import type { FleetOSVehicleRow } from './fleetosData';
import { getVisibilityForRole, type DaliaRole } from './fleetosTypes';
import { openVehicleHubFromFleetOS } from './openVehicleHubFromFleetOS';
import type { NavigateFunction } from 'react-router-dom';
import { markFleetOSHubNavigation } from '@/lib/entityNavContext';

export interface FuelChargingModuleProps {
  userRole: DaliaRole;
  companyFilter: string | null;
  companyOptions: string[];
  navigate: NavigateFunction;
  onModuleChange: (module: FleetOSNavModule) => void;
  vehicleContext?: {
    plate?: string;
    vehicleId?: string;
    locked?: boolean;
  };
}

export default function FuelChargingModule({
  userRole,
  companyFilter,
  companyOptions,
  navigate,
  onModuleChange,
  vehicleContext,
}: FuelChargingModuleProps) {
  const visibility = getVisibilityForRole(userRole);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [fuelAll, setFuelAll] = useState<FleetOSFuelRow[]>([]);
  const [chargeAll, setChargeAll] = useState<FleetOSChargeRow[]>([]);
  const [vehicles, setVehicles] = useState<FleetOSVehicleRow[]>([]);
  const [draftFilters, setDraftFilters] = useState<FleetOSFuelFilters>(EMPTY_FUEL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FleetOSFuelFilters>(EMPTY_FUEL_FILTERS);
  const [sheet, setSheet] = useState<FuelSheetId>(null);
  const [fuelDetail, setFuelDetail] = useState<FleetOSFuelRow | null>(null);
  const [chargeDetail, setChargeDetail] = useState<FleetOSChargeRow | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters),
    [draftFilters, appliedFilters],
  );

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

  useEffect(() => {
    if (!vehicleContext?.plate && !vehicleContext?.vehicleId) return;
    const v = vehicles.find((x) => x.id === vehicleContext.vehicleId) ||
      vehicles.find((x) => x.plate === vehicleContext.plate);
    const patch = filtersFromVehicleContext({
      plate: vehicleContext.plate || v?.plate,
      vehicleId: vehicleContext.vehicleId,
      company: v?.company_name,
      internal: v?.internal_number,
      driver: v?.driver_name,
    });
    setDraftFilters((p) => ({ ...p, ...patch }));
    setAppliedFilters((p) => ({ ...p, ...patch }));
  }, [vehicleContext, vehicles]);

  const filteredFuel = useMemo(() => applyFuelFilters(fuelAll, appliedFilters), [fuelAll, appliedFilters]);
  const filteredCharge = useMemo(() => {
    let rows = applyChargeFilters(chargeAll, appliedFilters);
    if (appliedFilters.energy_type === 'fuel') rows = [];
    if (appliedFilters.energy_type === 'electric' || appliedFilters.energy_type === 'hybrid') {
      /* keep charge rows */
    }
    return rows;
  }, [chargeAll, appliedFilters]);

  const anomaliesAll = useMemo(() => buildAnomaliesFromFuel(fuelAll), [fuelAll]);
  const filteredAnomalies = useMemo(
    () => applyAnomalyFilters(anomaliesAll, appliedFilters),
    [anomaliesAll, appliedFilters],
  );
  const kpis = useMemo(
    () => computeFuelKpis(filteredFuel, filteredCharge, filteredAnomalies),
    [filteredFuel, filteredCharge, filteredAnomalies],
  );

  const selectedVehicle = useMemo(() => {
    if (vehicleContext?.vehicleId) {
      return vehicles.find((v) => v.id === vehicleContext.vehicleId) || null;
    }
    if (appliedFilters.plate) {
      return vehicles.find((v) => v.plate.includes(appliedFilters.plate) || appliedFilters.plate.includes(v.plate)) || null;
    }
    return vehicles[0] || null;
  }, [vehicles, vehicleContext, appliedFilters.plate]);

  const openHub = useCallback(() => {
    if (!selectedVehicle) {
      toast.error('בחר רכב לפני פתיחת כרטיס');
      return;
    }
    markFleetOSHubNavigation(selectedVehicle.id, '/fleetos-ai?tab=fuel');
    openVehicleHubFromFleetOS(selectedVehicle, navigate, companyFilter);
  }, [selectedVehicle, navigate, companyFilter]);

  const closeSheet = () => {
    setSheet(null);
    setFuelDetail(null);
    setChargeDetail(null);
  };

  const openAnomalyCount = filteredAnomalies.filter((a) => !a.handled).length;

  const actionButtons: { id: FuelSheetId; label: string; badge?: string; urgent?: boolean; full?: boolean }[] = [
    { id: 'add-fuel', label: 'הוסף תדלוק' },
    { id: 'add-charge', label: 'הוסף טעינה' },
    { id: 'fuel-log', label: 'יומן תדלוקים', badge: String(filteredFuel.length) },
    { id: 'charge-log', label: 'יומן טעינות', badge: String(filteredCharge.length) },
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
      'fuel-log': `יומן תדלוקים (${filteredFuel.length})`,
      'charge-log': `יומן טעינות (${filteredCharge.length})`,
      anomalies: `חריגות (${openAnomalyCount} פתוחות)`,
      savings: 'חיסכון ותחנות',
      reports: 'דוחות',
    };
    return sheet ? titles[sheet] || '' : '';
  };

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
          <Button type="button" variant="outline" size="sm" className="flex-1 sm:flex-none min-h-[44px]" onClick={() => { setSpinning(true); refresh().finally(() => setTimeout(() => setSpinning(false), 600)); }} disabled={loading}>
            <RefreshCcw size={14} className={cn(spinning && 'animate-spin')} />
            רענון
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1 sm:flex-none min-h-[44px] gap-1" onClick={() => setSheet('actions')}>
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
        <FleetOSFuelFilterBar
          filters={draftFilters}
          onChange={(patch) => setDraftFilters((p) => ({ ...p, ...patch }))}
          onSearch={() => setAppliedFilters({ ...draftFilters })}
          onClear={() => {
            const base = { ...EMPTY_FUEL_FILTERS };
            if (vehicleContext?.locked && vehicleContext.plate) {
              base.plate = vehicleContext.plate;
            }
            setDraftFilters(base);
            setAppliedFilters(base);
          }}
          companies={companyOptions.length ? companyOptions : []}
          isDirty={isDirty}
          lockedPlate={vehicleContext?.locked ? vehicleContext.plate : undefined}
        />

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
              onClick={() => setSheet(btn.id)}
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

        {selectedVehicle && (
          <div className="card-elevated p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <p className="text-lg font-black text-primary" dir="ltr">{selectedVehicle.plate}</p>
              {selectedVehicle.internal_number && (
                <span className="text-xs text-muted-foreground">{selectedVehicle.internal_number}</span>
              )}
              <span className="text-xs text-muted-foreground mr-auto">{selectedVehicle.driver_name || 'ללא נהג'}</span>
            </div>
            <Button type="button" className="w-full min-h-[48px]" onClick={openHub}>
              פתח כרטיס רכב מלא
            </Button>
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
        {sheet === 'actions' && <ActionsContent />}
        {sheet === 'add-fuel' && <AddFuelContent selectedVehicle={selectedVehicle} onClose={closeSheet} />}
        {sheet === 'add-charge' && <AddChargeContent selectedVehicle={selectedVehicle} onClose={closeSheet} />}
        {sheet === 'fuel-log' && !fuelDetail && (
          <FuelLogContent rows={filteredFuel} onSelect={(r) => setFuelDetail(r)} />
        )}
        {sheet === 'fuel-log' && fuelDetail && <FuelLogDetail row={fuelDetail} />}
        {sheet === 'charge-log' && !chargeDetail && (
          <ChargeLogContent rows={filteredCharge} onSelect={(r) => setChargeDetail(r)} />
        )}
        {sheet === 'charge-log' && chargeDetail && <ChargeLogDetail row={chargeDetail} />}
        {sheet === 'anomalies' && <AnomaliesContent rows={filteredAnomalies} />}
        {sheet === 'savings' && <SavingsContent />}
        {sheet === 'reports' && <ReportsContent />}
      </FleetOSSheetPanel>
    </div>
  );
}
