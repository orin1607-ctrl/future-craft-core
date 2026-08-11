import { supabase } from '@/integrations/supabase/client';

export type CompanyAttentionRedSettings = {
  /** "יש לטפל" tile red styling on vehicle dashboard insurance/licenses section. */
  showInsuranceAttentionRed: boolean;
  /** "דורש טיפול" tile red styling on vehicle dashboard gaps/alerts section. */
  showGapsAttentionRed: boolean;
};

const DEFAULTS: CompanyAttentionRedSettings = {
  showInsuranceAttentionRed: true,
  showGapsAttentionRed: true,
};

const cache = new Map<string, { at: number; data: CompanyAttentionRedSettings }>();
const CACHE_MS = 60_000;

export async function loadCompanyAttentionRedSettings(
  companyName: string,
): Promise<CompanyAttentionRedSettings> {
  if (!companyName) return { ...DEFAULTS };
  const hit = cache.get(companyName);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const { data, error } = await supabase
    .from('company_settings')
    .select('show_insurance_attention_red, show_gaps_attention_red')
    .eq('company_name', companyName)
    .maybeSingle();

  if (error) {
    console.error('loadCompanyAttentionRedSettings', error);
    return { ...DEFAULTS };
  }

  const settings: CompanyAttentionRedSettings = {
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
