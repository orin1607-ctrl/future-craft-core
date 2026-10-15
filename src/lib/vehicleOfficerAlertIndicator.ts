import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { fetchCompanySettings } from '@/lib/companySettings';
import {
  buildOfficerAlertLights,
  officerAlertWindowDays,
  type OfficerAlertRow,
  type OfficerAlertVehicle,
  type VehicleOfficerAlertLight,
} from '@/lib/vehicleOfficerAlertLight';

/**
 * Loads open officer alert indicators mapped by vehicle ID.
 * Scoped to company, read-only.
 * Includes custom_alerts (officer) and vehicle next_inspection_date (tri-annual).
 * Respects company-specific alert_days_before setting (default 30).
 */
export async function loadVehicleOfficerAlertsMap(
  vehicles: OfficerAlertVehicle[],
  companyFilter: string | null,
): Promise<Map<string, VehicleOfficerAlertLight>> {
  if (!vehicles || vehicles.length === 0) return new Map();

  try {
    const companyNames = [...new Set(vehicles.map((v) => v.company_name).filter(Boolean))] as string[];
    const officerWindowDays = new Map<string, number>();

    await Promise.all(
      companyNames.map(async (name) => {
        const settings = await fetchCompanySettings(name);
        officerWindowDays.set(name, officerAlertWindowDays(settings?.alert_days_before));
      }),
    );

    const { data: alerts } = await applyCompanyScope(
      supabase
        .from('custom_alerts')
        .select('id, alert_type, company_name, description, alert_date, is_active')
        .eq('alert_type', 'officer')
        .eq('is_active', true),
      companyFilter,
    );

    return buildOfficerAlertLights(
      (alerts || []) as OfficerAlertRow[],
      vehicles,
      (company) => officerWindowDays.get(company) ?? officerAlertWindowDays(null),
    );
  } catch (err) {
    console.error('Failed to load vehicle officer alerts map:', err);
    return new Map();
  }
}
