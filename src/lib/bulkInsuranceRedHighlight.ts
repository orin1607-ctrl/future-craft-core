import { supabase } from '@/integrations/supabase/client';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';

export type CompanyInsuranceRedStats = {
  total: number;
  redOn: number;
  redOff: number;
};

export async function loadCompanyInsuranceRedStats(companyName: string): Promise<CompanyInsuranceRedStats> {
  const base = applyExcludeArchivedVehicles(
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', companyName),
  );
  const [{ count: total }, { count: redOn }, { count: redOff }] = await Promise.all([
    base,
    applyExcludeArchivedVehicles(
      supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('company_name', companyName)
        .eq('insurance_alerts_red_enabled', true),
    ),
    applyExcludeArchivedVehicles(
      supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('company_name', companyName)
        .eq('insurance_alerts_red_enabled', false),
    ),
  ]);
  return { total: total ?? 0, redOn: redOn ?? 0, redOff: redOff ?? 0 };
}

/** Bulk update red highlight for active-fleet vehicles of one company. Does not touch insurance_alerts_enabled. */
export async function bulkSetCompanyInsuranceRedHighlight(
  companyName: string,
  enabled: boolean,
): Promise<{ updated: number; error: string | null }> {
  const { data, error } = await applyExcludeArchivedVehicles(
    supabase
      .from('vehicles')
      .update({ insurance_alerts_red_enabled: enabled })
      .eq('company_name', companyName),
  ).select('id');
  if (error) return { updated: 0, error: error.message };
  return { updated: data?.length ?? 0, error: null };
}
