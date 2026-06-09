import {
  clearLoginFailures,
  createAdminClient,
  createAnonClient,
  generateToken,
  getClientIp,
  getUserAgent,
  hashValue,
  jsonResponse,
  normalizeEmail,
  RESET_TOKEN_EXPIRY_MINUTES,
  verifyOtpCode,
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
    const { email, code, purpose, challenge_id, password } = await req.json();

    if (!email || !code || !purpose) {
      return jsonResponse({ success: false, error: 'email, code, and purpose required' }, 400, corsHeaders);
    }

    const normalized = normalizeEmail(email);
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    const result = await verifyOtpCode(admin, {
      email: normalized,
      code,
      purpose,
      req,
      challengeId: challenge_id,
    });

    if (!result.ok) {
      return jsonResponse({ success: false, error: result.error, locked: result.locked }, 400, corsHeaders);
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
        return jsonResponse({ success: false, error: 'התחברות לא תקינה. נסה שוב.' }, 400, corsHeaders);
      }

      if (new Date(challenge.expires_at) < new Date()) {
        return jsonResponse({ success: false, error: 'פג תוקף ההתחברות. התחבר מחדש.' }, 400, corsHeaders);
      }

      await admin.from('auth_login_challenges').update({
        consumed_at: new Date().toISOString(),
      }).eq('id', challenge_id);

      if (!password) {
        return jsonResponse({ success: false, error: 'password required to complete login' }, 400, corsHeaders);
      }

      const anon = createAnonClient();
      const { data: sessionData, error: sessionErr } = await anon.auth.signInWithPassword({
        email: normalized,
        password,
      });

      if (sessionErr || !sessionData.session) {
        return jsonResponse({ success: false, error: 'Failed to create session' }, 500, corsHeaders);
      }

      await clearLoginFailures(admin, normalized);
      await writeAudit(admin, 'login_success', {
        success: true,
        userId: challenge.user_id,
        email: normalized,
        ip,
        userAgent,
        details: { two_factor: true },
      });

      return jsonResponse({
        success: true,
        session: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_at: sessionData.session.expires_at,
          expires_in: sessionData.session.expires_in,
          token_type: sessionData.session.token_type,
          user: sessionData.session.user,
        },
      }, 200, corsHeaders);
    }

    if (purpose === 'password_reset') {
      const userId = result.userId;
      if (!userId) {
        return jsonResponse({ success: false, error: 'User not found' }, 404, corsHeaders);
      }

      const now = new Date();
      await admin
        .from('auth_password_reset_tokens')
        .update({ consumed_at: now.toISOString() })
        .eq('email', normalized)
        .is('consumed_at', null);

      const resetToken = generateToken();
      const tokenHash = await hashValue(resetToken);
      const expiresAt = new Date(now.getTime() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

      await admin.from('auth_password_reset_tokens').insert({
        user_id: userId,
        email: normalized,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      return jsonResponse({
        success: true,
        reset_token: resetToken,
        expires_at: expiresAt,
      }, 200, corsHeaders);
    }

    return jsonResponse({ success: false, error: 'Invalid purpose' }, 400, corsHeaders);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
    }, 500, corsHeaders);
  }
});
