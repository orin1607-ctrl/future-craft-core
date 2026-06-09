import { describe, expect, it } from 'vitest';
import {
  diagnoseResendFailure,
  isEmailActuallySent,
  parseResendError,
} from './edgeFunctionError';

describe('parseResendError', () => {
  it('extracts message from Resend JSON', () => {
    const raw = JSON.stringify({
      message: 'You can only send testing emails to your own email address (you@company.com).',
    });
    expect(parseResendError(raw)).toContain('testing emails');
  });

  it('returns plain text when not JSON', () => {
    expect(parseResendError('RESEND_API_KEY is not configured')).toBe(
      'RESEND_API_KEY is not configured',
    );
  });
});

describe('diagnoseResendFailure', () => {
  it('flags unverified recipient with onboarding sender', () => {
    const err = JSON.stringify({ message: 'You can only send testing emails to your own email address.' });
    const d = diagnoseResendFailure(err, 'דליה <onboarding@resend.dev>');
    expect(d).toContain('נמען לא מאומת');
    expect(d).toContain('onboarding@resend.dev');
  });
});

describe('isEmailActuallySent', () => {
  it('requires email_sent true and resend_status 200', () => {
    expect(isEmailActuallySent({ email_sent: true, resend_status: 200 })).toBe(true);
    expect(isEmailActuallySent({ email_sent: true, resend_status: 403 })).toBe(false);
    expect(isEmailActuallySent({ email_sent: false, resend_status: 200 })).toBe(false);
    expect(isEmailActuallySent(null)).toBe(false);
  });
});

export function uiToastForSendResult(
  sendToEmail: boolean,
  sendResult: { email_sent?: boolean; resend_status?: number | null; resend_error?: string | null; code_saved?: boolean } | null,
): { title: string; variant?: 'destructive' } | null {
  if (!sendToEmail) {
    if (sendResult?.code_saved !== false) {
      return { title: 'קוד גישה נשמר' };
    }
    return null;
  }
  if (isEmailActuallySent(sendResult)) {
    return { title: '📧 אימייל נשלח בפועל' };
  }
  return {
    title: 'הקוד נשמר, אבל האימייל לא נשלח',
    variant: 'destructive',
  };
}

describe('ui toast messaging', () => {
  it('shows sent only on real Resend success', () => {
    expect(uiToastForSendResult(true, { email_sent: true, resend_status: 200 }).title).toBe(
      '📧 אימייל נשלח בפועל',
    );
  });

  it('shows failure when code saved but email not sent', () => {
    const toast = uiToastForSendResult(true, {
      email_sent: false,
      resend_status: 403,
      resend_error: JSON.stringify({ message: 'Recipient not verified' }),
      code_saved: true,
    });
    expect(toast?.title).toBe('הקוד נשמר, אבל האימייל לא נשלח');
    expect(toast?.variant).toBe('destructive');
  });

  it('shows code saved when email not requested', () => {
    expect(uiToastForSendResult(false, { code_saved: true })?.title).toBe('קוד גישה נשמר');
  });
});
