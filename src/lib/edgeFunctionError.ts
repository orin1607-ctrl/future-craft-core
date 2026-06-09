/** Parse Resend API error body (JSON or plain text). */
export function parseResendError(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'שגיאה לא ידועה מ-Resend';
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string | { message?: string } };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
    if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
      return parsed.error.message;
    }
  } catch {
    // plain text response
  }
  return raw.trim().slice(0, 400);
}

export type AccessCodeSendResult = {
  email_sent?: boolean;
  email_requested?: boolean;
  resend_status?: number | null;
  resend_error?: string | null;
  code_saved?: boolean;
  from?: string | null;
  subject?: string | null;
};

const ONBOARDING_SENDER = 'onboarding@resend.dev';

/** Classify common Resend failures (unverified recipient, sandbox sender). */
export function diagnoseResendFailure(
  resendError: string | null | undefined,
  fromAddress?: string | null,
): string | null {
  const msg = parseResendError(resendError).toLowerCase();
  const usesOnboarding = fromAddress?.includes(ONBOARDING_SENDER) ?? false;

  if (
    msg.includes('testing emails') ||
    msg.includes('own email') ||
    msg.includes('not verified') ||
    msg.includes('verify') ||
    msg.includes('only send')
  ) {
    return usesOnboarding
      ? 'נמען לא מאומת — עם onboarding@resend.dev אפשר לשלוח רק לכתובות מאומתות בחשבון Resend'
      : 'נמען לא מאומת ב-Resend';
  }

  if (usesOnboarding && !msg) {
    return 'שולח מ-onboarding@resend.dev (דומיין בדיקה) — מגביל שליחה לנמענים מאומתים בלבד';
  }

  if (usesOnboarding && msg) {
    return `שולח מ-onboarding@resend.dev — ${parseResendError(resendError)}`;
  }

  return null;
}

/** True only when Resend returned HTTP 200 and the function confirmed send. */
export function isEmailActuallySent(res: AccessCodeSendResult | null | undefined): boolean {
  return res?.email_sent === true && res?.resend_status === 200;
}

/** Extract the real error message from a Supabase Edge Function invoke failure. */
export async function getEdgeFunctionErrorMessage(
  error: unknown,
  data?: { error?: string } | null,
): Promise<string> {
  if (data?.error) return String(data.error);

  if (error && typeof error === 'object') {
    const e = error as { message?: string; context?: { json?: () => Promise<unknown> } };
    if (e.context?.json) {
      try {
        const body = (await e.context.json()) as { error?: string };
        if (body?.error) return String(body.error);
      } catch {
        // ignore parse errors
      }
    }
    if (e.message && !e.message.includes('non-2xx')) {
      return e.message;
    }
  }

  return 'שגיאה בקריאה לשרת';
}
