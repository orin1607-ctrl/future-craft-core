import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { fetchCompanySettings } from '@/lib/companySettings';
import {
  buildOfficerAlertLights,
  officerAlertWindowDays,
  type OfficerAlertRow,
  type OfficerAlertVehicle,
  type OfficerInspectionRow,
  type VehicleOfficerAlertLight,
} from '@/lib/vehicleOfficerAlertLight';

const INSPECTION_CHUNK = 150;

/** Saved inspections per vehicle, newest first (same order the vehicle card reads). */
async function loadInspectionsByVehicle(vehicleIds: string[]): Promise<Map<string, OfficerInspectionRow[]>> {
  const byVehicle = new Map<string, OfficerInspectionRow[]>();
  for (let i = 0; i < vehicleIds.length; i += INSPECTION_CHUNK) {
    const chunk = vehicleIds.slice(i, i + INSPECTION_CHUNK);
    const { data } = await supabase
      .from('vehicle_inspections')
      .select('id, vehicle_id, inspection_type, inspection_date, next_due_date, created_at')
      .in('vehicle_id', chunk)
      .order('inspection_date', { ascending: false })
      .order('created_at', { ascending: false, nullsFirst: false });
    for (const row of (data || []) as OfficerInspectionRow[]) {
      if (!row.vehicle_id) continue;
      const list = byVehicle.get(row.vehicle_id) || [];
      list.push(row);
      byVehicle.set(row.vehicle_id, list);
    }
  }
  return byVehicle;
}

/**
 * Loads the officer light per vehicle id. Read-only and company-scoped.
 * Callers pass active-fleet vehicles only (archived vehicles get no light).
 * Window: company_settings.alert_days_before, default 30.
 */
export async function loadVehicleOfficerAlertsMap(
  vehicles: OfficerAlertVehicle[],
  companyFilter: string | null,
  windowDaysByCompany?: Map<string, number>,
): Promise<Map<string, VehicleOfficerAlertLight>> {
  if (!vehicles || vehicles.length === 0) return new Map();

  try {
    const officerWindowDays = windowDaysByCompany ?? new Map<string, number>();
    if (!windowDaysByCompany) {
      const companyNames = [...new Set(vehicles.map((v) => v.company_name).filter(Boolean))] as string[];
      await Promise.all(
        companyNames.map(async (name) => {
          const settings = await fetchCompanySettings(name);
          officerWindowDays.set(name, officerAlertWindowDays(settings?.alert_days_before));
        }),
      );
    }

    const [alertsRes, inspectionsByVehicle] = await Promise.all([
      applyCompanyScope(
        supabase
          .from('custom_alerts')
          .select('id, alert_type, company_name, title, description, alert_date, is_active')
          .eq('alert_type', 'officer')
          .eq('is_active', true),
        companyFilter,
      ),
      loadInspectionsByVehicle(vehicles.map((v) => v.id)),
    ]);

    return buildOfficerAlertLights(
      (alertsRes.data || []) as OfficerAlertRow[],
      vehicles,
      (company) => officerWindowDays.get(company) ?? officerAlertWindowDays(null),
      undefined,
      inspectionsByVehicle,
    );
  } catch (err) {
    console.error('Failed to load vehicle officer alerts map:', err);
    return new Map();
  }
}
