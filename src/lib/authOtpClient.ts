import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

/** Shown when auth_account_lockouts blocks login (429). */
export const ACCOUNT_LOCKOUT_MESSAGE =
  'החשבון ננעל זמנית ל־15 דקות בגלל מספר ניסיונות התחברות כושלים. נסה שוב מאוחר יותר או פנה למנהל מערכת.';

async function parseInvokeErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;
  const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
  if (!ctx?.json) return null;
  try {
    const body = await ctx.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function invokeAuthEdgeFunction<T extends Record<string, unknown>>(
  name: string,
  body: unknown,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  const parsed = (data && typeof data === 'object' ? data : {}) as T;

  if (parsed.success === true) {
    return parsed;
  }

  const lockedUntil = parsed.locked_until as string | undefined;
  const parsedError = parsed.error as string | undefined;

  if (lockedUntil || parsedError?.includes('נעול')) {
    return { ...parsed, success: false, error: ACCOUNT_LOCKOUT_MESSAGE, locked_until: lockedUntil } as T;
  }

  if (error) {
    const errBody = await parseInvokeErrorBody(error);
    if (errBody) {
      const bodyLocked = errBody.locked_until as string | undefined;
      const bodyError = errBody.error as string | undefined;
      if (bodyLocked || bodyError?.includes('נעול')) {
        return {
          ...parsed,
          ...errBody,
          success: false,
          error: ACCOUNT_LOCKOUT_MESSAGE,
        } as T;
      }
      if (bodyError) {
        return { ...parsed, ...errBody, success: false, error: bodyError } as T;
      }
    }
    if (parsedError) {
      return { ...parsed, success: false, error: parsedError } as T;
    }
    const msg = await getEdgeFunctionErrorMessage(error, parsed as { error?: string });
    return { ...parsed, success: false, error: msg } as T;
  }

  if (parsedError) {
    return { ...parsed, success: false, error: parsedError } as T;
  }

  return parsed;
}

export interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
}

export interface LoginChallengeResult {
  success: boolean;
  requires_otp?: boolean;
  challenge_id?: string;
  email?: string;
  session?: AuthSessionPayload;
  error?: string;
  locked_until?: string;
  message?: string;
}

export async function invokeAuthLoginChallenge(email: string, password: string): Promise<LoginChallengeResult> {
  return invokeAuthEdgeFunction<LoginChallengeResult>('auth-login-challenge', { email, password });
}

export async function invokeAuthSendOtp(body: {
  email: string;
  purpose: 'login_2fa' | 'password_reset';
  challenge_id?: string;
}) {
  const { data, error } = await supabase.functions.invoke('auth-send-otp', { body });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; message?: string; cooldown_seconds?: number; error?: string };
}

export async function invokeAuthVerifyOtp(body: {
  email: string;
  code: string;
  purpose: 'login_2fa' | 'password_reset';
  challenge_id?: string;
  password?: string;
}) {
  const { data, error } = await supabase.functions.invoke('auth-verify-otp', { body });
  if (error) return { success: false, error: error.message };
  return data as {
    success: boolean;
    session?: AuthSessionPayload;
    reset_token?: string;
    error?: string;
    locked?: boolean;
  };
}

export async function invokeAuthCompletePasswordReset(body: {
  reset_token: string;
  new_password: string;
  confirm_password: string;
}) {
  return invokeAuthEdgeFunction<{ success: boolean; error?: string; message?: string }>(
    'auth-complete-password-reset',
    body,
  );
}

export async function applyAuthSession(session: AuthSessionPayload) {
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return { error: error?.message ?? null };
}

export async function setTwoFactorApproved(userId: string, approved: boolean) {
  const { data, error } = await supabase.functions.invoke('create-admin-user', {
    body: { action: 'set-two-factor-approved', user_id: userId, two_factor_approved: approved },
  });
  if (error) return { success: false, error: error.message };
  if (data?.error) return { success: false, error: data.error };
  return { success: true };
}
