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

  const isSuperAdmin = user?.role === 'super_admin';
  const companyFilter = isSuperAdmin ? selectedCompany : user?.company_name || null;

  const [vehicles, setVehicles] = useState<FleetOSVehicleRow[]>([]);
  const [alerts, setAlerts] = useState<FleetOSAlertRow[]>([]);
  const [kpis, setKpis] = useState<FleetOSKpiSnapshot>(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { vehicles: v, kpis: k, trackingRows } = await loadFleetOSTracking(companyFilter);
      const catalog = await loadFleetOSAlertCatalog(trackingRows, companyFilter);
      setVehicles(v);
      setKpis(k);
      setAlerts(catalog);
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
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
    />
  );
}
