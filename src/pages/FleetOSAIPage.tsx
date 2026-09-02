import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import FleetStatusModule from '@/modules/fleetos/FleetStatusModule';
import FuelChargingModule from '@/modules/fleetos/FuelChargingModule';
import { openVehicleHubFromFleetOS } from '@/modules/fleetos/openVehicleHubFromFleetOS';
import { canAccessFleetOS, mapAppRoleToFleetOS } from '@/modules/fleetos/fleetosRoleMap';
import { useFleetOSPrefs } from '@/modules/fleetos/useFleetOSPrefs';
import type { FleetOSNavModule } from '@/modules/fleetos/FleetOSBottomNav';
import {
  loadFleetOSAlertCatalog,
  loadFleetOSTracking,
  type FleetOSAlertRow,
  type FleetOSVehicleRow,
} from '@/modules/fleetos/fleetosData';
import { filterBusinessLocationNoComm, telematicsNoCommAlerts } from '@/modules/fleetos/starlink/adapter';
import { gpsTablesReady, persistAssignDevice, persistUnassignDevice } from '@/modules/fleetos/starlink/persist';
import { loadUnknownGpsRaw } from '@/modules/fleetos/starlink/loadOverlay';
import type { FleetOSKpiSnapshot } from '@/modules/fleetos/fleetosTypes';
import { readVehicleContext } from '@/lib/entityNavContext';

const EMPTY_KPIS: FleetOSKpiSnapshot = {
  vehicles_active: 0,
  vehicles_idling: 0,
  vehicles_in_garage: 0,
  total: 0,
};

function parseTab(raw: string | null): FleetOSNavModule {
  if (raw === 'fuel' || raw === 'alerts' || raw === 'ai' || raw === 'status') return raw;
  return 'status';
}

export default function FleetOSAIPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompany, companyOptions } = useCompanyScope();
  const { prefs } = useFleetOSPrefs(user?.id);

  const activeTab = parseTab(searchParams.get('tab'));
  const vehicleContext = useMemo(() => readVehicleContext(searchParams), [searchParams]);
  const [statusSelectedId, setStatusSelectedId] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';
  const companyFilter = isSuperAdmin ? selectedCompany : user?.company_name || null;

  const [vehicles, setVehicles] = useState<FleetOSVehicleRow[]>([]);
  const [alerts, setAlerts] = useState<FleetOSAlertRow[]>([]);
  const [kpis, setKpis] = useState<FleetOSKpiSnapshot>(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);
  const [gpsPersistReady, setGpsPersistReady] = useState(false);
  const [unknownDevices, setUnknownDevices] = useState<
    Array<{ id: string; at: string; raw: string; unitHint: string | null }>
  >([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setGpsPersistReady(await gpsTablesReady());
      const { vehicles: v, kpis: k, trackingRows } = await loadFleetOSTracking(companyFilter);
      const catalog = await loadFleetOSAlertCatalog(trackingRows, companyFilter);
      const withTelematics = filterBusinessLocationNoComm(
        [...catalog, ...telematicsNoCommAlerts(v)],
        v,
      );
      setVehicles(v);
      setKpis(k);
      setAlerts(withTelematics);
      setUnknownDevices(await loadUnknownGpsRaw(8));
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const vid = searchParams.get('vehicleId');
    if (vid && !vehicleContext.fromHub) {
      setStatusSelectedId(vid);
    }
  }, [searchParams, vehicleContext.fromHub]);

  const syncFleetVehicleToUrl = useCallback(
    (vehicleId: string, plate: string, tab: FleetOSNavModule = activeTab) => {
      const next = new URLSearchParams(searchParams);
      next.set('vehicleId', vehicleId);
      next.set('plate', plate);
      next.delete('context');
      next.delete('company');
      next.delete('internal');
      next.delete('driver');
      if (tab === 'fuel') {
        next.set('tab', 'fuel');
      } else if (tab === 'status') {
        next.delete('tab');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, activeTab],
  );

  const onModuleChange = useCallback(
    (module: FleetOSNavModule) => {
      if (module === 'alerts' || module === 'ai') {
        toast.info('המודול בבנייה');
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (module === 'status') {
        next.delete('tab');
      } else {
        next.set('tab', module);
      }
      if (module === 'fuel' && !vehicleContext.fromHub) {
        const selected = vehicles.find((v) => v.id === statusSelectedId);
        if (selected) {
          next.set('vehicleId', selected.id);
          next.set('plate', selected.plate);
          next.delete('context');
          next.delete('company');
          next.delete('internal');
          next.delete('driver');
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, statusSelectedId, vehicles, vehicleContext.fromHub],
  );

  const onFuelVehicleSelect = useCallback(
    (vehicleId: string, plate: string) => {
      setStatusSelectedId(vehicleId);
      syncFleetVehicleToUrl(vehicleId, plate, 'fuel');
    },
    [syncFleetVehicleToUrl],
  );

  const onStatusVehicleSelect = useCallback(
    (vehicleId: string | null) => {
      setStatusSelectedId(vehicleId);
      if (!vehicleId || vehicleContext.fromHub) return;
      const v = vehicles.find((x) => x.id === vehicleId);
      if (v) syncFleetVehicleToUrl(v.id, v.plate, activeTab === 'fuel' ? 'fuel' : 'status');
    },
    [vehicles, syncFleetVehicleToUrl, vehicleContext.fromHub, activeTab],
  );

  if (!canAccessFleetOS(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const companyNames = companyOptions.map((c) => c.name);
  const userRole = mapAppRoleToFleetOS(user?.role);

  if (activeTab === 'fuel') {
    return (
      <FuelChargingModule
        userRole={userRole}
        companyFilter={companyFilter}
        companyOptions={companyNames}
        navigate={navigate}
        onModuleChange={onModuleChange}
        vehicleContext={vehicleContext}
        onVehicleSelect={vehicleContext.fromHub ? undefined : onFuelVehicleSelect}
      />
    );
  }

  return (
    <FleetStatusModule
      userRole={userRole}
      prefs={prefs}
      vehicles={vehicles}
      alerts={alerts}
      kpis={kpis}
      loading={loading}
      onRefresh={refresh}
      onOpenVehicleHub={(vehicle) => openVehicleHubFromFleetOS(vehicle, navigate, companyFilter)}
      companyOptions={companyNames}
      onModuleChange={onModuleChange}
      selectedVehicleId={statusSelectedId}
      onSelectedVehicleIdChange={onStatusVehicleSelect}
      gpsPersistReady={gpsPersistReady}
      unknownDevices={unknownDevices}
      onAssignGpsDevice={async (vehicle, unitId, imei) => {
        const companyName = vehicle.company_name || user?.company_name || '';
        if (!companyName) {
          toast.error('אין חברה לרכב');
          return;
        }
        const result = vehicle.telematics?.unitId || vehicle.telematics?.imei
          ? await persistAssignDevice({
              vehicleId: vehicle.id,
              companyName,
              unitId,
              imei: imei || null,
              replace: true,
            })
          : await persistAssignDevice({
              vehicleId: vehicle.id,
              companyName,
              unitId,
              imei: imei || null,
            });
        if (!result.ok) {
          toast.error(`שיוך נכשל: ${result.reason}`);
          return;
        }
        toast.success('המכשיר שויך לרכב');
        await refresh();
      }}
      onUnassignGpsDevice={async (vehicle) => {
        const result = await persistUnassignDevice(vehicle.id);
        if (!result.ok) {
          toast.error(`ניתוק נכשל: ${result.reason}`);
          return;
        }
        toast.success('המכשיר נותק');
        await refresh();
      }}
    />
  );
}
