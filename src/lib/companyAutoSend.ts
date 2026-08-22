import { supabase } from '@/integrations/supabase/client';

export const COMPANY_AUTO_SEND_KEY_PREFIX = 'company_auto_send:';

export type CompanyAutoSend = {
  emailAutomatic: boolean;
  whatsappAutomatic: boolean;
};

export const DEFAULT_COMPANY_AUTO_SEND: CompanyAutoSend = {
  emailAutomatic: true,
  whatsappAutomatic: true,
};

export function companyAutoSendConfigKey(companyName: string): string {
  return `${COMPANY_AUTO_SEND_KEY_PREFIX}${companyName}`;
}

export function normalizeCompanyAutoSend(raw: unknown): CompanyAutoSend {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COMPANY_AUTO_SEND };
  const row = raw as Record<string, unknown>;
  return {
    emailAutomatic: row.emailAutomatic !== false,
    whatsappAutomatic: row.whatsappAutomatic !== false,
  };
}

/** Master automatic-send gates. In-app alerts are never gated here. */
export function applyAutomaticSendGates(
  channels: { email: boolean; whatsapp: boolean; inApp: boolean },
  auto: CompanyAutoSend,
): { email: boolean; whatsapp: boolean; inApp: boolean } {
  return {
    email: channels.email && auto.emailAutomatic,
    whatsapp: channels.whatsapp && auto.whatsappAutomatic,
    inApp: channels.inApp,
  };
}

export async function fetchCompanyAutoSend(companyName: string): Promise<CompanyAutoSend> {
  if (!companyName) return { ...DEFAULT_COMPANY_AUTO_SEND };
  const { data, error } = await supabase
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', companyAutoSendConfigKey(companyName))
    .maybeSingle();
  if (error) {
    console.warn('[companyAutoSend] fetch failed', error.message);
    return { ...DEFAULT_COMPANY_AUTO_SEND };
  }
  return normalizeCompanyAutoSend((data as { config_value?: unknown } | null)?.config_value);
}

export async function saveCompanyAutoSend(
  companyName: string,
  value: CompanyAutoSend,
  userId?: string | null,
): Promise<void> {
  const payload = {
    config_key: companyAutoSendConfigKey(companyName),
    config_value: {
      emailAutomatic: Boolean(value.emailAutomatic),
      whatsappAutomatic: Boolean(value.whatsappAutomatic),
    },
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
  const { error } = await supabase.from('dalia_form_config').upsert(payload, { onConflict: 'config_key' });
  if (error) throw new Error(error.message || 'שגיאה בשמירת שליחה אוטומטית');
}
