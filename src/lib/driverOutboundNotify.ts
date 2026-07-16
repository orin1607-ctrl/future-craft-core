/**
 * Outbound path for driver document-request notifications.
 * Real Gupshup send is OFF unless VITE_ALLOW_REAL_WHATSAPP=true
 * (or legacy VITE_ALLOW_REAL_WHATSAPP_STAGING=true) — default: in-app + wa.me fallback.
 */
import { supabase } from '@/integrations/supabase/client';

export type OutboundChannelResult = {
  channel: 'in_app' | 'whatsapp_api' | 'whatsapp_wa_me' | 'email_mailto' | 'copy_link';
  ok: boolean;
  detail?: string;
  skipped?: boolean;
};

function allowRealWhatsApp(): boolean {
  return (
    String(import.meta.env.VITE_ALLOW_REAL_WHATSAPP || '') === 'true' ||
    String(import.meta.env.VITE_ALLOW_REAL_WHATSAPP_STAGING || '') === 'true'
  );
}

function normalizePhoneForWaMe(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  else if (!digits.startsWith('972') && digits.length >= 9) digits = `972${digits}`;
  return digits;
}

async function findDriverUserId(driverId: string): Promise<string | null> {
  const { data: driver } = await supabase
    .from('drivers')
    .select('email, full_name')
    .eq('id', driverId)
    .maybeSingle();
  if (!driver?.email) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', driver.email)
    .maybeSingle();
  return profile?.id || null;
}

/** In-app notification to the driver (if they have a user account). */
export async function notifyDriverInApp(params: {
  driverEntityId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<OutboundChannelResult> {
  const userId = await findDriverUserId(params.driverEntityId);
  if (!userId) {
    return { channel: 'in_app', ok: true, skipped: true, detail: 'no_driver_user_account' };
  }
  const { error } = await supabase.from('driver_notifications').insert({
    user_id: userId,
    title: params.title,
    message: params.body,
    type: 'info',
    link: params.link || null,
    is_read: false,
  });
  if (error) {
    return { channel: 'in_app', ok: false, detail: error.message };
  }
  return { channel: 'in_app', ok: true };
}

/** Build wa.me URL (manual fallback — does not call Gupshup). */
export function buildWaMeUrl(phone: string, message: string): string {
  const dest = normalizePhoneForWaMe(phone);
  return `https://wa.me/${dest}?text=${encodeURIComponent(message)}`;
}

/**
 * Attempt Gupshup send only when explicitly enabled.
 * Otherwise returns skipped + wa_me suggestion.
 */
export async function sendDriverWhatsAppOrFallback(params: {
  phone: string;
  message: string;
  preferApi?: boolean;
}): Promise<{ results: OutboundChannelResult[]; waMeUrl: string | null }> {
  const waMeUrl = params.phone ? buildWaMeUrl(params.phone, params.message) : null;
  const results: OutboundChannelResult[] = [];

  if (!params.phone) {
    results.push({ channel: 'whatsapp_wa_me', ok: false, detail: 'missing_phone' });
    return { results, waMeUrl: null };
  }

  if (params.preferApi && allowRealWhatsApp()) {
    const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
      body: {
        action: 'send',
        destination: params.phone,
        message: params.message,
      },
    });
    if (!error && data?.success) {
      results.push({
        channel: 'whatsapp_api',
        ok: true,
        detail: data.message_id || 'sent',
      });
      return { results, waMeUrl };
    }
    results.push({
      channel: 'whatsapp_api',
      ok: false,
      detail: (data as { error?: string })?.error || error?.message || 'api_failed',
    });
  } else {
    results.push({
      channel: 'whatsapp_api',
      ok: true,
      skipped: true,
      detail: allowRealWhatsApp()
        ? 'api_not_requested'
        : 'REAL_WHATSAPP_DISABLED — default wa.me / copy-link (set VITE_ALLOW_REAL_WHATSAPP=true only with explicit approval)',
    });
  }

  results.push({
    channel: 'whatsapp_wa_me',
    ok: true,
    detail: 'fallback_ready',
  });
  return { results, waMeUrl };
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Orchestrate post-create notify for a document request. */
export async function notifyAfterDocumentRequestCreated(params: {
  driverEntityId: string;
  recipientPhone?: string;
  recipientEmail?: string;
  messagePreview: string;
  uploadUrl: string;
  documentLabel: string;
  openWaMe?: boolean;
  tryRealWhatsApp?: boolean;
}): Promise<{ results: OutboundChannelResult[]; waMeUrl: string | null; mailtoUrl: string | null }> {
  const inApp = await notifyDriverInApp({
    driverEntityId: params.driverEntityId,
    title: `בקשת מסמך: ${params.documentLabel}`,
    body: `נא להעלות את המסמך דרך הקישור המאובטח.`,
    link: params.uploadUrl,
  });

  const { results: waResults, waMeUrl } = await sendDriverWhatsAppOrFallback({
    phone: params.recipientPhone || '',
    message: params.messagePreview,
    preferApi: Boolean(params.tryRealWhatsApp),
  });

  if (params.openWaMe && waMeUrl) {
    window.open(waMeUrl, '_blank', 'noopener,noreferrer');
  }

  const mailtoUrl =
    params.recipientEmail
      ? buildMailtoUrl(
          params.recipientEmail,
          `בקשת מסמך: ${params.documentLabel}`,
          params.messagePreview,
        )
      : null;

  return {
    results: [inApp, ...waResults, { channel: 'copy_link', ok: true, detail: params.uploadUrl }],
    waMeUrl,
    mailtoUrl,
  };
}

export { allowRealWhatsApp };
