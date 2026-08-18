import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, jsonResponse, edgeCorsHeaders } from '../_shared/edgeAuth.ts';

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
) {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === needle);
    if (hit) return hit;
    if (!data.users.length || data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: edgeCorsHeaders });
  }

  try {
    const auth = await requireAuth(req, { roles: ['fleet_manager', 'super_admin'] });
    if ('error' in auth) return auth.error;
    const { ctx } = auth;
    const supabaseAdmin = ctx.supabaseAdmin;

    const { email, new_password } = await req.json();

    if (!email || !new_password) {
      return jsonResponse({ error: 'Email and new_password are required' }, 400);
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
    }

    const targetUser = await findAuthUserByEmail(supabaseAdmin, String(email));
    if (!targetUser) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUser.id)
      .maybeSingle();

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('company_name')
      .eq('id', targetUser.id)
      .maybeSingle();

    if (ctx.role === 'fleet_manager') {
      if (targetRole?.role === 'super_admin') {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      if (!ctx.companyName || !targetProfile?.company_name || ctx.companyName !== targetProfile.company_name) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      { password: new_password },
    );

    if (updateError) {
      console.error('Update password error:', updateError);
      return jsonResponse({ error: 'Failed to update password' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      500,
    );
  }
});
