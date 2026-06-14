import { supabase } from '@/integrations/supabase/client';
import { fetchCompanySettings, type CompanySettingsRow } from '@/lib/companySettings';
import type { DaliaDoc } from '@/components/vehicles/vehicleNewDalia/VehicleNewFormDalia';

function hasInsuranceDoc(allValues: Record<string, string>, docs: DaliaDoc[]): boolean {
  const links = [
    allValues.mandatory_insurance_doc_link,
    allValues.comprehensive_insurance_doc_link,
    allValues.third_party_insurance_doc_link,
    allValues.license_link,
  ].filter((v) => v && v.trim() !== '');

  if (links.length > 0) return true;

  return docs.some(
    (d) =>
      d.link?.trim() ||
      d.file?.trim() ||
      /ביטוח|insurance/i.test(d.category) ||
      /ביטוח|insurance|פוליס/i.test(d.name),
  );
}

export async function validateVehicleAgainstCompanyPolicy(params: {
  allValues: Record<string, string>;
  docs: DaliaDoc[];
  companyName: string;
  userRole?: string;
  vehicleId?: string | null;
  assignedDriverId?: string | null;
  isNewVehicle: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (params.userRole === 'super_admin') return { ok: true };

  const settings = await fetchCompanySettings(params.companyName);
  if (!settings) return { ok: true };

  const driverAssigned =
    Boolean(params.assignedDriverId) || Boolean(params.allValues.assigned_driver?.trim());

  if (settings.require_driver_assignment && !driverAssigned) {
    return { ok: false, message: 'לפי הגדרות החברה — חובה להצמיד נהג לרכב לפני שמירה' };
  }

  if (!settings.require_driver_assignment && !driverAssigned && settings.max_vehicles_without_assignment > 0) {
    let query = supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_name', params.companyName)
      .is('assigned_driver_id', null);

    if (params.vehicleId) {
      query = query.neq('id', params.vehicleId);
    }

    const { count } = await query;
    const unassigned = count ?? 0;
    if (unassigned >= settings.max_vehicles_without_assignment) {
      return {
        ok: false,
        message: `חריגה ממכסת רכבים ללא נהג (${settings.max_vehicles_without_assignment}) — הצמד נהג או עדכן הגדרות`,
      };
    }
  }

  if (settings.require_insurance_docs && !hasInsuranceDoc(params.allValues, params.docs)) {
    return {
      ok: false,
      message: 'לפי הגדרות החברה — חובה לצרף מסמך ביטוח (קישור או העלאה) לפני שמירה',
    };
  }

  if (settings.require_no_claims) {
    const declared =
      params.allValues.has_no_claims === 'true' || params.allValues.has_no_claims === 'on';
    if (!declared) {
      return {
        ok: false,
        message: 'לפי הגדרות החברה — יש לאשר הדר תביעות (ללא תביעות) לפני שמירה',
      };
    }
  }

  return { ok: true };
}

export function resolveVehicleApprovalStatus(
  settings: CompanySettingsRow | null,
  isNewVehicle: boolean,
  userRole?: string,
): string {
  if (!isNewVehicle) return 'approved';
  if (userRole === 'super_admin') return 'approved';
  if (settings?.vehicle_approval_required) return 'pending_approval';
  return 'approved';
}
