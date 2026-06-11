import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import FleetStatusModule from '@/modules/fleetos/FleetStatusModule';
import { openVehicleHubFromFleetOS } from '@/modules/fleetos/openVehicleHubFromFleetOS';
import { canAccessFleetOS, mapAppRoleToFleetOS } from '@/modules/fleetos/fleetosRoleMap';
import { useFleetOSPrefs } from '@/modules/fleetos/useFleetOSPrefs';
import {
  loadFleetOSAlertCatalog,
  loadFleetOSTracking,
  type FleetOSAlertRow,
  type FleetOSVehicleRow,
} from '@/modules/fleetos/fleetosData';
import type { FleetOSKpiSnapshot } from '@/modules/fleetos/fleetosTypes';

const EMPTY_KPIS: FleetOSKpiSnapshot = {
  vehicles_active: 0,
  vehicles_idling: 0,
  vehicles_in_garage: 0,
  total: 0,
};

export default function FleetOSAIPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedCompany, companyOptions } = useCompanyScope();
  const { prefs } = useFleetOSPrefs(user?.id);

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

  if (!canAccessFleetOS(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <FleetStatusModule
      userRole={mapAppRoleToFleetOS(user?.role)}
      prefs={prefs}
      vehicles={vehicles}
      alerts={alerts}
      kpis={kpis}
      loading={loading}
      onRefresh={refresh}
      onOpenVehicleHub={(vehicle) => openVehicleHubFromFleetOS(vehicle, navigate, companyFilter)}
      companyOptions={companyOptions.map((c) => c.name)}
    />
  );
}
