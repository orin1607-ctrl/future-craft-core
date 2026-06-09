import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM_ADDRESS = 'דליה מערכות <onboarding@resend.dev>';
const EMAIL_SUBJECT = 'קוד גישה — דליה';

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim().toUpperCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseResendErrorBody(text: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string | { message?: string } };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
    if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
      return parsed.error.message;
    }
  } catch {
    // plain text
  }
  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: authError?.message || 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = callerUser.id;
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .single();

    if (roleRow?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden - super_admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { user_id, code, mode = 'manual', email, send_email } = await req.json();

    if (!user_id || !code || typeof code !== 'string' || code.length < 4) {
      return new Response(JSON.stringify({ error: 'user_id and code (min 4 chars) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const codeHash = await hashCode(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const nextRotation = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    await supabaseAdmin
      .from('user_access_codes')
      .update({ is_active: false })
      .eq('user_id', user_id)
      .eq('is_active', true);

    const { error: insertErr } = await supabaseAdmin.from('user_access_codes').insert({
      user_id,
      code_hash: codeHash,
      mode: mode === 'auto' ? 'auto' : 'manual',
      expires_at: expiresAt.toISOString(),
      next_rotation_at: nextRotation.toISOString(),
      is_active: true,
      created_by: callerId,
      sent_to_email_at: null,
    });

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message, code_saved: false }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailRequested = !!(send_email && email);
    let emailSent = false;
    let resendStatus: number | null = null;
    let resendError: string | null = null;

    if (emailRequested) {
      if (!RESEND_API_KEY) {
        resendError = 'RESEND_API_KEY is not configured in Supabase Secrets';
      } else {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', user_id)
          .single();

        const html = `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h1 style="color: #1a3a5c; font-size: 22px;">קוד גישה — דליה</h1>
          <p>שלום ${profile?.full_name || ''},</p>
          <p>קוד הגישה שלך למערכת דליה:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 16px; background: #f0f4f8; border-radius: 12px;">${code}</p>
          <p style="color: #666; font-size: 14px;">שמור על הקוד בסוד. ניתן לשנות אותו לאחר כניסה למערכת.</p>
        </div>`;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [email],
            subject: EMAIL_SUBJECT,
            html,
          }),
        });

        resendStatus = res.status;
        if (res.status === 200) {
          const resBody = await res.json().catch(() => ({})) as { id?: string };
          if (resBody.id) {
            emailSent = true;
            await supabaseAdmin
              .from('user_access_codes')
              .update({ sent_to_email_at: new Date().toISOString() })
              .eq('user_id', user_id)
              .eq('code_hash', codeHash);
          } else {
            resendError = 'Resend returned 200 but no email id — delivery not confirmed';
          }
        } else {
          const errText = await res.text();
          resendError = parseResendErrorBody(errText);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      code_saved: true,
      email_requested: emailRequested,
      email_sent: emailSent,
      resend_status: resendStatus,
      resend_error: resendError,
      from: FROM_ADDRESS,
      subject: EMAIL_SUBJECT,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
