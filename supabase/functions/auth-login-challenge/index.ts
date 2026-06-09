import {
  CHALLENGE_EXPIRY_MINUTES,
  clearLoginFailures,
  createAdminClient,
  createAndSendOtp,
  createAnonClient,
  getClientIp,
  getUserAgent,
  findUserIdByEmail,
  isAccountLocked,
  jsonResponse,
  normalizeEmail,
  recordLoginFailure,
  writeAudit,
} from '../_shared/authOtp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = createAdminClient();
    const { email, password } = await req.json();

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'email and password required' }, 400, corsHeaders);
    }

    const normalized = normalizeEmail(email);
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    const LOCKOUT_MSG =
      'החשבון ננעל זמנית ל־15 דקות בגלל מספר ניסיונות התחברות כושלים. נסה שוב מאוחר יותר או פנה למנהל מערכת.';

    const lock = await isAccountLocked(admin, normalized);
    if (lock.locked) {
      return jsonResponse({
        success: false,
        error: LOCKOUT_MSG,
        locked_until: lock.lockedUntil,
      }, 429, corsHeaders);
    }

    const anon = createAnonClient();
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (signInError || !signInData.session || !signInData.user) {
      const userId = await findUserIdByEmail(admin, normalized);
      const fail = await recordLoginFailure(admin, normalized, req, userId);
      if (fail.locked) {
        return jsonResponse({
          success: false,
          error: LOCKOUT_MSG,
          locked_until: fail.lockedUntil,
        }, 429, corsHeaders);
      }
      return jsonResponse({ success: false, error: 'שם משתמש או סיסמה שגויים' }, 401, corsHeaders);
    }

    const userId = signInData.user.id;

    const { data: profile } = await admin
      .from('profiles')
      .select('is_active, two_factor_approved, full_name')
      .eq('id', userId)
      .single();

    if (!profile?.is_active) {
      await anon.auth.signOut();
      await writeAudit(admin, 'login_failed', {
        success: false,
        userId,
        email: normalized,
        ip,
        userAgent,
        details: { reason: 'inactive_account' },
      });
      return jsonResponse({
        success: false,
        error: 'החשבון שלך ממתין לאישור מנהל. פנה למנהל המערכת.',
      }, 403, corsHeaders);
    }

    await clearLoginFailures(admin, normalized);

    if (!profile.two_factor_approved) {
      await writeAudit(admin, 'login_success', {
        success: true,
        userId,
        email: normalized,
        ip,
        userAgent,
        details: { two_factor: false },
      });

      return jsonResponse({
        success: true,
        requires_otp: false,
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_at: signInData.session.expires_at,
          expires_in: signInData.session.expires_in,
          token_type: signInData.session.token_type,
          user: signInData.session.user,
        },
      }, 200, corsHeaders);
    }

    await anon.auth.signOut();

    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const { data: challenge, error: chErr } = await admin
      .from('auth_login_challenges')
      .insert({
        user_id: userId,
        email: normalized,
        expires_at: expiresAt,
        created_ip: ip,
      })
      .select('id')
      .single();

    if (chErr || !challenge) {
      return jsonResponse({ success: false, error: 'Failed to create login challenge' }, 500, corsHeaders);
    }

    const sendResult = await createAndSendOtp(admin, {
      email: normalized,
      purpose: 'login_2fa',
      userId,
      req,
      challengeId: challenge.id,
    });

    if (!sendResult.sent) {
      return jsonResponse({
        success: true,
        requires_otp: true,
        challenge_id: challenge.id,
        email: normalized,
        otp_sent: false,
        resend_error: sendResult.resendError,
        message: 'נדרש אימות OTP. אם לא הגיע קוד — לחץ שלח שוב.',
      }, 200, corsHeaders);
    }

    return jsonResponse({
      success: true,
      requires_otp: true,
      challenge_id: challenge.id,
      email: normalized,
      otp_sent: true,
      message: 'נשלח קוד אימות לאימייל',
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
    }, 500, corsHeaders);
  }
});
