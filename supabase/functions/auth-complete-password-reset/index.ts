import {
  createAdminClient,
  getClientIp,
  getUserAgent,
  hashValue,
  jsonResponse,
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
    const { reset_token, new_password, confirm_password } = await req.json();

    if (!reset_token || !new_password || !confirm_password) {
      return jsonResponse({ success: false, error: 'All fields required' }, 400, corsHeaders);
    }

    if (new_password.length < 6) {
      return jsonResponse({ success: false, error: 'סיסמה חייבת להכיל לפחות 6 תווים' }, 400, corsHeaders);
    }

    if (new_password !== confirm_password) {
      return jsonResponse({ success: false, error: 'הסיסמאות אינן תואמות' }, 400, corsHeaders);
    }

    const tokenHash = await hashValue(reset_token);
    const now = new Date();

    const { data: row } = await admin
      .from('auth_password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('consumed_at', null)
      .maybeSingle();

    if (!row || new Date(row.expires_at) < now) {
      return jsonResponse({ success: false, error: 'קישור/קוד לא תקין או שפג תוקפו' }, 400, corsHeaders);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(row.user_id, {
      password: new_password,
    });

    if (updateErr) {
      return jsonResponse({ success: false, error: updateErr.message }, 500, corsHeaders);
    }

    await admin.from('auth_password_reset_tokens').update({
      consumed_at: now.toISOString(),
    }).eq('id', row.id);

    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    await writeAudit(admin, 'password_reset_completed', {
      success: true,
      userId: row.user_id,
      email: row.email,
      ip,
      userAgent,
    });

    return jsonResponse({ success: true, message: 'הסיסמה עודכנה בהצלחה' }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
    }, 500, corsHeaders);
  }
});
