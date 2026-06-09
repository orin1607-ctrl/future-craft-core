import {
  createAdminClient,
  createAndSendOtp,
  findUserIdByEmail,
  getClientIp,
  isAccountLocked,
  jsonResponse,
  normalizeEmail,
  RESEND_COOLDOWN_SECONDS,
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
    const { email, purpose, challenge_id } = await req.json();

    if (!email || !purpose) {
      return jsonResponse({ success: false, error: 'email and purpose required' }, 400, corsHeaders);
    }

    if (purpose !== 'login_2fa' && purpose !== 'password_reset') {
      return jsonResponse({ success: false, error: 'Invalid purpose' }, 400, corsHeaders);
    }

    const normalized = normalizeEmail(email);
    const genericOk = {
      success: true,
      message: 'אם האימייל קיים במערכת, נשלח קוד אימות.',
    };

    const lock = await isAccountLocked(admin, normalized);
    if (lock.locked) {
      return jsonResponse({
        success: false,
        error: 'החשבון נעול זמנית. נסה שוב מאוחר יותר.',
        locked_until: lock.lockedUntil,
      }, 429, corsHeaders);
    }

    if (purpose === 'login_2fa') {
      if (!challenge_id) {
        return jsonResponse({ success: false, error: 'challenge_id required' }, 400, corsHeaders);
      }

      const { data: challenge } = await admin
        .from('auth_login_challenges')
        .select('*')
        .eq('id', challenge_id)
        .is('consumed_at', null)
        .maybeSingle();

      if (!challenge || challenge.email !== normalized) {
        return jsonResponse(genericOk, 200, corsHeaders);
      }

      if (new Date(challenge.expires_at) < new Date()) {
        return jsonResponse({ success: false, error: 'פג תוקף ההתחברות. התחבר מחדש.' }, 400, corsHeaders);
      }

      const { data: recent } = await admin
        .from('auth_verification_codes')
        .select('created_at')
        .eq('email', normalized)
        .eq('purpose', 'login_2fa')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recent?.created_at) {
        const elapsed = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
        if (elapsed < RESEND_COOLDOWN_SECONDS) {
          return jsonResponse({
            success: true,
            message: genericOk.message,
            cooldown_seconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
          }, 200, corsHeaders);
        }
      }

      await createAndSendOtp(admin, {
        email: normalized,
        purpose: 'login_2fa',
        userId: challenge.user_id,
        req,
        challengeId: challenge_id,
      });

      return jsonResponse(genericOk, 200, corsHeaders);
    }

    const userId = await findUserIdByEmail(admin, normalized);
    if (!userId) {
      await writeAudit(admin, 'otp_sent', {
        success: true,
        email: normalized,
        ip: getClientIp(req),
        details: { purpose: 'password_reset', note: 'email_not_found' },
      });
      return jsonResponse(genericOk, 200, corsHeaders);
    }

    const { data: recent } = await admin
      .from('auth_verification_codes')
      .select('created_at')
      .eq('email', normalized)
      .eq('purpose', 'password_reset')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.created_at) {
      const elapsed = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return jsonResponse({
          success: true,
          message: genericOk.message,
          cooldown_seconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        }, 200, corsHeaders);
      }
    }

    await createAndSendOtp(admin, {
      email: normalized,
      purpose: 'password_reset',
      userId,
      req,
    });

    return jsonResponse(genericOk, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
    }, 500, corsHeaders);
  }
});
