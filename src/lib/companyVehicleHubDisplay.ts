import { supabase } from '@/integrations/supabase/client';

export const COMPANY_VEHICLE_HUB_DISPLAY_KEY_PREFIX = 'company_vehicle_hub_display:';

export type CompanyVehicleHubDisplay = {
  showRecentActionsOnHub: boolean;
};

export const DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY: CompanyVehicleHubDisplay = {
  showRecentActionsOnHub: true,
};

export function companyVehicleHubDisplayConfigKey(companyName: string): string {
  return `${COMPANY_VEHICLE_HUB_DISPLAY_KEY_PREFIX}${companyName}`;
}

export function normalizeCompanyVehicleHubDisplay(raw: unknown): CompanyVehicleHubDisplay {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY };
  const row = raw as Record<string, unknown>;
  return {
    showRecentActionsOnHub: row.showRecentActionsOnHub !== false,
  };
}

export async function fetchCompanyVehicleHubDisplay(
  companyName: string,
): Promise<CompanyVehicleHubDisplay> {
  if (!companyName) return { ...DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY };
  const { data, error } = await supabase
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', companyVehicleHubDisplayConfigKey(companyName))
    .maybeSingle();
  if (error) {
    console.warn('[companyVehicleHubDisplay] fetch failed', error.message);
    return { ...DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY };
  }
  return normalizeCompanyVehicleHubDisplay((data as { config_value?: unknown } | null)?.config_value);
}

export async function saveCompanyVehicleHubDisplay(
  companyName: string,
  value: CompanyVehicleHubDisplay,
  userId?: string | null,
): Promise<void> {
  const payload = {
    config_key: companyVehicleHubDisplayConfigKey(companyName),
    config_value: {
      showRecentActionsOnHub: Boolean(value.showRecentActionsOnHub),
    },
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
  const { error } = await supabase.from('dalia_form_config').upsert(payload, { onConflict: 'config_key' });
  if (error) throw new Error(error.message || 'שגיאה בשמירת תצוגת כרטיס הרכב');
}
