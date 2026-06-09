import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;
export const MAX_LOGIN_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
export const RESEND_COOLDOWN_SECONDS = 60;
export const CHALLENGE_EXPIRY_MINUTES = 10;
export const RESET_TOKEN_EXPIRY_MINUTES = 10;

export const FROM_ADDRESS = 'דליה מערכות <onboarding@resend.dev>';

export type OtpPurpose = 'login_2fa' | 'password_reset';

export type AuditEvent =
  | 'login_success'
  | 'login_failed'
  | 'otp_sent'
  | 'otp_verified'
  | 'otp_failed'
  | 'password_reset_completed'
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'account_locked'
  | 'account_unlocked';

export function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashValue(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateOtpCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(OTP_LENGTH, '0');
}

export function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export function getClientIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? null;
}

export function getUserAgent(req: Request): string | null {
  return req.headers.get('user-agent');
}

export async function writeAudit(
  admin: SupabaseClient,
  event: AuditEvent,
  opts: {
    success?: boolean;
    userId?: string | null;
    email?: string | null;
    actorUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await admin.from('auth_audit_log').insert({
    event_type: event,
    success: opts.success ?? true,
    user_id: opts.userId ?? null,
    email: opts.email ?? null,
    actor_user_id: opts.actorUserId ?? null,
    ip_address: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
    details: opts.details ?? {},
  });
}

export async function isAccountLocked(
  admin: SupabaseClient,
  email: string,
): Promise<{ locked: boolean; lockedUntil?: string }> {
  const normalized = normalizeEmail(email);
  const { data } = await admin
    .from('auth_account_lockouts')
    .select('locked_until, failed_attempts')
    .eq('email', normalized)
    .maybeSingle();

  if (!data?.locked_until) return { locked: false };

  const lockedUntil = new Date(data.locked_until);
  if (lockedUntil > new Date()) {
    return { locked: true, lockedUntil: data.locked_until };
  }

  await admin.from('auth_account_lockouts').upsert({
    email: normalized,
    locked_until: null,
    failed_attempts: 0,
    updated_at: new Date().toISOString(),
  });

  await writeAudit(admin, 'account_unlocked', {
    success: true,
    email: normalized,
    details: { reason: 'lock_expired' },
  });

  return { locked: false };
}

export async function recordLoginFailure(
  admin: SupabaseClient,
  email: string,
  req: Request,
  userId?: string | null,
): Promise<{ locked: boolean; lockedUntil?: string }> {
  const normalized = normalizeEmail(email);
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  const { data: existing } = await admin
    .from('auth_account_lockouts')
    .select('*')
    .eq('email', normalized)
    .maybeSingle();

  const failedAttempts = (existing?.failed_attempts ?? 0) + 1;
  let lockedUntil: string | null = null;

  if (failedAttempts >= MAX_LOGIN_FAILURES) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    await writeAudit(admin, 'account_locked', {
      success: true,
      userId,
      email: normalized,
      ip,
      userAgent,
      details: { failed_attempts: failedAttempts, locked_until: lockedUntil },
    });
  }

  await admin.from('auth_account_lockouts').upsert({
    email: normalized,
    failed_attempts: lockedUntil ? 0 : failedAttempts,
    locked_until: lockedUntil,
    last_failed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await writeAudit(admin, 'login_failed', {
    success: false,
    userId,
    email: normalized,
    ip,
    userAgent,
    details: { failed_attempts: failedAttempts, locked: !!lockedUntil },
  });

  return { locked: !!lockedUntil, lockedUntil: lockedUntil ?? undefined };
}

export async function clearLoginFailures(admin: SupabaseClient, email: string) {
  const normalized = normalizeEmail(email);
  const { data: existing } = await admin
    .from('auth_account_lockouts')
    .select('locked_until, failed_attempts')
    .eq('email', normalized)
    .maybeSingle();

  if (!existing) return;

  if (existing.locked_until || existing.failed_attempts > 0) {
    await admin.from('auth_account_lockouts').upsert({
      email: normalized,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    });

    if (existing.locked_until) {
      await writeAudit(admin, 'account_unlocked', {
        success: true,
        email: normalized,
        details: { reason: 'successful_login' },
      });
    }
  }
}

/** Invalidate all unconsumed OTP codes for email+purpose before issuing a new one. */
export async function invalidateOldOtpCodes(
  admin: SupabaseClient,
  email: string,
  purpose: OtpPurpose,
) {
  const now = new Date().toISOString();
  await admin
    .from('auth_verification_codes')
    .update({ consumed_at: now })
    .eq('email', normalizeEmail(email))
    .eq('purpose', purpose)
    .is('consumed_at', null);
}

export async function createAndSendOtp(
  admin: SupabaseClient,
  opts: {
    email: string;
    purpose: OtpPurpose;
    userId?: string | null;
    req: Request;
    challengeId?: string;
  },
): Promise<{ sent: boolean; resendError?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const normalized = normalizeEmail(opts.email);

  await invalidateOldOtpCodes(admin, normalized, opts.purpose);

  const code = generateOtpCode();
  const codeHash = await hashValue(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error: insertErr } = await admin.from('auth_verification_codes').insert({
    user_id: opts.userId ?? null,
    email: normalized,
    purpose: opts.purpose,
    code_hash: codeHash,
    expires_at: expiresAt,
    max_attempts: MAX_OTP_ATTEMPTS,
    created_ip: getClientIp(opts.req),
    metadata: opts.challengeId ? { challenge_id: opts.challengeId } : {},
  });

  if (insertErr) {
    return { sent: false, resendError: insertErr.message };
  }

  if (!RESEND_API_KEY) {
    return { sent: false, resendError: 'RESEND_API_KEY not configured' };
  }

  const subject =
    opts.purpose === 'login_2fa'
      ? 'קוד אימות כניסה — דליה'
      : 'קוד איפוס סיסמה — דליה';

  const intro =
    opts.purpose === 'login_2fa'
      ? 'קוד האימות הדו-שלבי שלך:'
      : 'קוד לאיפוס הסיסמה שלך:';

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
      <h1 style="color: #1a3a5c; font-size: 22px;">${subject}</h1>
      <p>${intro}</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; background: #f0f4f8; border-radius: 12px;">${code}</p>
      <p style="color: #666; font-size: 14px;">הקוד תקף ל-${OTP_EXPIRY_MINUTES} דקות בלבד. אל תשתף אותו עם אף אחד.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [normalized],
      subject,
      html,
    }),
  });

  const ip = getClientIp(opts.req);
  const userAgent = getUserAgent(opts.req);

  if (!res.ok) {
    const errText = await res.text();
    await writeAudit(admin, 'otp_sent', {
      success: false,
      userId: opts.userId ?? null,
      email: normalized,
      ip,
      userAgent,
      details: { purpose: opts.purpose, error: errText.slice(0, 500) },
    });
    return { sent: false, resendError: errText };
  }

  await writeAudit(admin, 'otp_sent', {
    success: true,
    userId: opts.userId ?? null,
    email: normalized,
    ip,
    userAgent,
    details: { purpose: opts.purpose },
  });

  return { sent: true };
}

export async function verifyOtpCode(
  admin: SupabaseClient,
  opts: {
    email: string;
    code: string;
    purpose: OtpPurpose;
    req: Request;
    challengeId?: string;
  },
): Promise<{ ok: true; rowId: string; userId: string | null } | { ok: false; error: string; locked?: boolean }> {
  const normalized = normalizeEmail(opts.email);
  const ip = getClientIp(opts.req);
  const userAgent = getUserAgent(opts.req);
  const now = new Date();

  const { data: row } = await admin
    .from('auth_verification_codes')
    .select('*')
    .eq('email', normalized)
    .eq('purpose', opts.purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    await writeAudit(admin, 'otp_failed', {
      success: false,
      email: normalized,
      ip,
      userAgent,
      details: { purpose: opts.purpose, reason: 'no_active_code' },
    });
    return { ok: false, error: 'קוד לא תקין או שפג תוקפו' };
  }

  if (opts.challengeId && row.metadata?.challenge_id && row.metadata.challenge_id !== opts.challengeId) {
    await writeAudit(admin, 'otp_failed', {
      success: false,
      userId: row.user_id,
      email: normalized,
      ip,
      userAgent,
      details: { purpose: opts.purpose, reason: 'challenge_mismatch' },
    });
    return { ok: false, error: 'קוד לא תקין' };
  }

  if (new Date(row.expires_at) < now) {
    await admin.from('auth_verification_codes').update({ consumed_at: now.toISOString() }).eq('id', row.id);
    await writeAudit(admin, 'otp_failed', {
      success: false,
      userId: row.user_id,
      email: normalized,
      ip,
      userAgent,
      details: { purpose: opts.purpose, reason: 'expired' },
    });
    return { ok: false, error: 'קוד פג תוקף. בקש קוד חדש.' };
  }

  if (row.attempts_count >= row.max_attempts) {
    await admin.from('auth_verification_codes').update({ consumed_at: now.toISOString() }).eq('id', row.id);
    await writeAudit(admin, 'otp_failed', {
      success: false,
      userId: row.user_id,
      email: normalized,
      ip,
      userAgent,
      details: { purpose: opts.purpose, reason: 'max_attempts' },
    });
    return { ok: false, error: 'חרגת ממספר הניסיונות. בקש קוד חדש.', locked: true };
  }

  const codeHash = await hashValue(opts.code.replace(/\D/g, ''));
  if (codeHash !== row.code_hash) {
    const attempts = row.attempts_count + 1;
    const updates: Record<string, unknown> = { attempts_count: attempts };
    if (attempts >= row.max_attempts) {
      updates.consumed_at = now.toISOString();
    }
    await admin.from('auth_verification_codes').update(updates).eq('id', row.id);

    await writeAudit(admin, 'otp_failed', {
      success: false,
      userId: row.user_id,
      email: normalized,
      ip,
      userAgent,
      details: { purpose: opts.purpose, attempt: attempts, max: row.max_attempts },
    });

    if (attempts >= row.max_attempts) {
      return { ok: false, error: 'חרגת ממספר הניסיונות. בקש קוד חדש.', locked: true };
    }
    return { ok: false, error: `קוד שגוי. נותרו ${row.max_attempts - attempts} ניסיונות.` };
  }

  const verifiedAt = now.toISOString();
  await admin.from('auth_verification_codes').update({
    verified_at: verifiedAt,
    consumed_at: verifiedAt,
    attempts_count: row.attempts_count + 1,
  }).eq('id', row.id);

  await writeAudit(admin, 'otp_verified', {
    success: true,
    userId: row.user_id,
    email: normalized,
    ip,
    userAgent,
    details: { purpose: opts.purpose },
  });

  return { ok: true, rowId: row.id, userId: row.user_id };
}

export function createAnonClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
  return match?.id ?? null;
}
