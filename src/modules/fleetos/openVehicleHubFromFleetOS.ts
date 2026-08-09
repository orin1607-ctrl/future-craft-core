import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import {
  buildVehicleHubUrl,
  markFleetOSHubNavigation,
  stashFleetOSHubVehicle,
} from '@/lib/entityNavContext';
import type { FleetOSVehicleRow } from './fleetosData';

const HUB_TRACE = '[FleetOS→Hub]';

/** Minimal vehicles row — enough to open Vehicle Hub immediately. */
export function fleetOSRowToHubVehicle(row: FleetOSVehicleRow): Record<string, unknown> {
  return {
    id: row.id,
    license_plate: row.plate,
    internal_number: row.internal_number || '',
    manufacturer: row.make || '',
    model: row.model || '',
    year: 0,
    vehicle_type: '',
    status: 'active',
    odometer: row.odometer ?? 0,
    assigned_driver_id: null,
    company_name: row.company_name || '',
    test_expiry: null,
    insurance_expiry: null,
    insurance_start: null,
    comprehensive_insurance_expiry: null,
    comprehensive_insurance_start: null,
    next_service_date: null,
    last_service_date: null,
    needs_transport: false,
    approval_status: '',
    license_doc_url: '',
    insurance_doc_url: '',
    comprehensive_insurance_doc_url: '',
    notes: '',
    management_type: '',
    monthly_leasing_cost: null,
    leasing_end_date: null,
    vehicle_return_date: null,
    monthly_loan_payment: null,
    loan_end_date: null,
    planned_replacement_date: null,
    has_loan: false,
    is_leasing: false,
    insurance_alerts_enabled: true,
    insurance_alerts_red_enabled: true,
  };
}

/**
 * FleetOS AI → Vehicle Hub (מסלול אמיתי בלבד).
 * ניווט מיידי עם שורת רכב — בלי המתנה ל-DB ובלי toast שגיאה.
 */
export function openVehicleHubFromFleetOS(
  selected: FleetOSVehicleRow,
  navigate: NavigateFunction,
  companyFilter: string | null,
): void {
  const vehicleId = selected.id?.trim();
  if (!vehicleId) {
    console.warn(HUB_TRACE, 'missing vehicleId on selected row', selected);
    return;
  }

  console.info(HUB_TRACE, 'click', {
    vehicleId,
    plate: selected.plate,
    internal: selected.internal_number,
    company: selected.company_name,
    companyFilter,
  });

  const hubRow = fleetOSRowToHubVehicle(selected);
  const returnPath =
    typeof window !== 'undefined' && window.location.pathname.includes('fleetos-ai')
      ? `${window.location.pathname}${window.location.search || ''}`
      : '/fleetos-ai';
  markFleetOSHubNavigation(vehicleId, returnPath);
  stashFleetOSHubVehicle(vehicleId, hubRow);
  toast.dismiss();

  const url = buildVehicleHubUrl(vehicleId);
  console.info(HUB_TRACE, 'navigate', { vehicleId, plate: selected.plate, url });

  navigate(url, {
    state: { fleetOSHubVehicle: hubRow, fleetOSFrom: true },
  });

  void (async () => {
    const { data, error } = await applyCompanyScope(
      supabase.from('vehicles').select('*').eq('id', vehicleId),
      companyFilter,
    ).maybeSingle();

    console.info(HUB_TRACE, 'background-fetch', {
      vehicleId,
      dbOk: !!data,
      dbError: error?.message ?? null,
    });

    if (data) {
      stashFleetOSHubVehicle(vehicleId, data as Record<string, unknown>);
    }
  })();
}

