import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

export type GupshupConnectionStatus = {
  success: boolean;
  configured?: boolean;
  gupshup_verified?: boolean;
  provider?: string;
  app_name?: string;
  source?: string;
  endpoint?: string;
  secret_name?: string;
  message?: string;
  gupshup_status?: number;
  gupshup_endpoint?: string;
  gupshup_response?: Record<string, unknown>;
  error?: string;
};

export type SendWhatsAppResult = {
  success: boolean;
  message?: string;
  destination?: string;
  text?: string;
  error?: string;
};

async function invokeWhatsAppFunction<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('send-whatsapp-message', { body });
  const parsed = (data && typeof data === 'object' ? data : {}) as T;

  if (parsed.success === true || parsed.configured === true || parsed.error) {
    return parsed;
  }

  if (error) {
    const msg = await getEdgeFunctionErrorMessage(error, parsed as { error?: string });
    if (error && typeof error === 'object' && 'context' in error) {
      try {
        const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
        if (ctx?.json) {
          const errBody = (await ctx.json()) as T;
          if (errBody && typeof errBody === 'object') return errBody;
        }
      } catch {
        // ignore
      }
    }
    return { ...parsed, success: false, error: msg } as T;
  }

  return (data ?? { success: false, error: 'שגיאה לא ידועה' }) as T;
}

export async function checkGupshupConnection(): Promise<GupshupConnectionStatus> {
  return invokeWhatsAppFunction<GupshupConnectionStatus>({ action: 'status' });
}

export async function sendWhatsAppTestMessage(
  destination: string,
  message?: string,
): Promise<SendWhatsAppResult> {
  return invokeWhatsAppFunction<SendWhatsAppResult>({
    action: 'send_test',
    destination,
    message,
  });
}
