export type CompanyAutoSend = {
  emailAutomatic: boolean;
  whatsappAutomatic: boolean;
};

export const COMPANY_AUTO_SEND_KEY_PREFIX = 'company_auto_send:';
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

export async function loadCompanyAutoSend(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  companyName: string,
): Promise<CompanyAutoSend> {
  if (!companyName) return { ...DEFAULT_COMPANY_AUTO_SEND };
  const { data, error } = await supabaseAdmin
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', companyAutoSendConfigKey(companyName))
    .maybeSingle();
  if (error) return { ...DEFAULT_COMPANY_AUTO_SEND };
  return normalizeCompanyAutoSend(data?.config_value);
}
