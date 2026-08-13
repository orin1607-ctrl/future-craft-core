import { supabase } from '@/integrations/supabase/client';

/** Per-company vehicle dashboard attention display (visibility + red). Data/gaps unchanged. */
export type CompanyAttentionDisplaySettings = {
  /** When false: client does not see "יש לטפל" on insurance/licenses tile. */
  showInsuranceAttention: boolean;
  /** When shown: whether "יש לטפל" uses red styling. */
  showInsuranceAttentionRed: boolean;
  /** When false: client does not see "דורש טיפול" on gaps/alerts tile. */
  showGapsAttention: boolean;
  /** When shown: whether "דורש טיפול" uses red styling. */
  showGapsAttentionRed: boolean;
};

/** @deprecated Use CompanyAttentionDisplaySettings */
export type CompanyAttentionRedSettings = CompanyAttentionDisplaySettings;

const DEFAULTS: CompanyAttentionDisplaySettings = {
  showInsuranceAttention: true,
  showInsuranceAttentionRed: true,
  showGapsAttention: true,
  showGapsAttentionRed: true,
};

const cache = new Map<string, { at: number; data: CompanyAttentionDisplaySettings }>();
const CACHE_MS = 60_000;

export async function loadCompanyAttentionRedSettings(
  companyName: string,
): Promise<CompanyAttentionDisplaySettings> {
  if (!companyName) return { ...DEFAULTS };
  const hit = cache.get(companyName);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const { data, error } = await supabase
    .from('company_settings')
    .select(
      'show_insurance_attention, show_gaps_attention, show_insurance_attention_red, show_gaps_attention_red',
    )
    .eq('company_name', companyName)
    .maybeSingle();

  if (error) {
    console.error('loadCompanyAttentionRedSettings', error);
    return { ...DEFAULTS };
  }

  const settings: CompanyAttentionDisplaySettings = {
    showInsuranceAttention: data?.show_insurance_attention !== false,
    showGapsAttention: data?.show_gaps_attention !== false,
    showInsuranceAttentionRed: data?.show_insurance_attention_red !== false,
    showGapsAttentionRed: data?.show_gaps_attention_red !== false,
  };
  cache.set(companyName, { at: Date.now(), data: settings });
  return settings;
}

export function clearCompanyAttentionRedCache(companyName?: string) {
  if (companyName) cache.delete(companyName);
  else cache.clear();
}

/** Pure helpers for tile labels (visual only). */
export function insuranceAttentionLabel(
  needsAttention: boolean,
  settings: Pick<CompanyAttentionDisplaySettings, 'showInsuranceAttention'>,
): string {
  if (!settings.showInsuranceAttention) return 'בסדר';
  return needsAttention ? 'יש לטפל' : 'בסדר';
}

export function gapsAttentionLabel(
  needsAttention: boolean,
  settings: Pick<CompanyAttentionDisplaySettings, 'showGapsAttention'>,
): string {
  if (!settings.showGapsAttention) return 'אין';
  return needsAttention ? 'דורש טיפול' : 'אין';
}

export function insuranceAttentionWarn(
  needsAttention: boolean,
  settings: Pick<
    CompanyAttentionDisplaySettings,
    'showInsuranceAttention' | 'showInsuranceAttentionRed'
  >,
): boolean {
  return (
    settings.showInsuranceAttention &&
    needsAttention &&
    settings.showInsuranceAttentionRed
  );
}

export function gapsAttentionWarn(
  needsAttention: boolean,
  settings: Pick<CompanyAttentionDisplaySettings, 'showGapsAttention' | 'showGapsAttentionRed'>,
): boolean {
  return settings.showGapsAttention && needsAttention && settings.showGapsAttentionRed;
}
