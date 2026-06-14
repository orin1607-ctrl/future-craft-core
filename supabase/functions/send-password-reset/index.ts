import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCompanyAccess, edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req, { roles: ['super_admin', 'fleet_manager'] });
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const { email, redirect_url } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = ctx.supabaseAdmin;

    if (ctx.role === 'fleet_manager') {
      const { data: targetUsers } = await supabaseAdmin.auth.admin.listUsers();
      const target = targetUsers?.users?.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (target) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('company_name')
          .eq('id', target.id)
          .maybeSingle();
        const denied = assertCompanyAccess(ctx, profile?.company_name);
        if (denied) return denied;
      }
    }

    // Generate a password reset link using admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: redirect_url || 'https://dalia-car.online/reset-password',
      },
    });

    // Replace any lovable.app or preview URLs in the action_link with the production domain
    let resetLink = linkData?.properties?.action_link;
    if (resetLink) {
      resetLink = resetLink.replace(/https?:\/\/[^\/]*lovable\.app/g, 'https://dalia-car.online');
      resetLink = resetLink.replace(/https?:\/\/[^\/]*\.lovableproject\.com/g, 'https://dalia-car.online');
    }

    if (linkError) {
      console.error('Generate link error:', linkError);
      // Don't reveal if user exists or not
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!resetLink) {
      console.error('No action_link returned');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send email via Resend
    const emailHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px;">
        <h1 style="color: #1a1a2e; font-size: 24px; margin-bottom: 16px;">🔑 איפוס סיסמה - דליה</h1>
        <p style="color: #333; font-size: 16px;">שלום,</p>
        <p style="color: #333; font-size: 16px;">קיבלנו בקשה לאיפוס הסיסמה שלך במערכת דליה.</p>
        <p style="color: #333; font-size: 16px;">לחץ על הכפתור למטה כדי להגדיר סיסמה חדשה:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}" 
             style="background-color: #1a1a2e; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-size: 18px; font-weight: bold; display: inline-block;">
            איפוס סיסמה
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">אם לא ביקשת לאפס את הסיסמה, ניתן להתעלם מהודעה זו.</p>
        <p style="color: #666; font-size: 14px;">הקישור תקף לשעה אחת בלבד.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">הודעה זו נשלחה אוטומטית ממערכת דליה לניהול ציי רכב.</p>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'דליה מערכות <onboarding@resend.dev>',
        to: [email],
        subject: '🔑 איפוס סיסמה - דליה',
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Failed to send reset email: ${res.status} ${errBody}`);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
