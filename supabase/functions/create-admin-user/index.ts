import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate caller using getClaims (more resilient than getUser)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = claimsData.claims.sub;

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .single();

    const callerRole = roleRow?.role;
    const isSuperAdmin = callerRole === 'super_admin';
    const isFleetManager = callerRole === 'fleet_manager';

    // Only super_admin and fleet_manager can access this function
    if (!isSuperAdmin && !isFleetManager) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, full_name, role, company_name, phone, action, user_id, is_active, user_number } = await req.json();

    // Actions that require super_admin only
    const superAdminOnlyActions = ['update-password', 'reset-password-by-id', 'update-role', 'update-profile', 'toggle-active', 'list-users'];
    if (action && superAdminOnlyActions.includes(action) && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden - super_admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // List all users with their emails
    if (action === 'list-users') {
      const { data: authUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const emailMap: Record<string, string> = {};
      for (const u of authUsers.users) {
        emailMap[u.id] = u.email || '';
      }
      return new Response(JSON.stringify({ success: true, emails: emailMap }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update-password') {
      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email and password are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const targetUser = users.users.find((user) => user.email === email);
      if (!targetUser) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, { password });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reset password by user ID
    if (action === 'reset-password-by-id') {
      if (!user_id || !password) {
        return new Response(JSON.stringify({ error: 'user_id and password are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update user role
    if (action === 'update-role') {
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: 'user_id and role are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id);
      const { error } = await supabaseAdmin.from('user_roles').insert({ user_id, role });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update user profile fields
    if (action === 'update-profile') {
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updates: Record<string, unknown> = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (phone !== undefined) updates.phone = phone;
      if (company_name !== undefined) updates.company_name = company_name;
      if (typeof is_active === 'boolean') updates.is_active = is_active;
      if (user_number !== undefined) updates.user_number = user_number;

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: 'No fields to update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If role is provided, update it too
      if (role) {
        await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id);
        await supabaseAdmin.from('user_roles').insert({ user_id, role });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Toggle user active status
    if (action === 'toggle-active') {
      if (!user_id || typeof is_active !== 'boolean') {
        return new Response(JSON.stringify({ error: 'user_id and is_active are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin.from('profiles').update({ is_active }).eq('id', user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === CREATE USER ===
    if (!email || !password || !full_name || (role !== 'private_customer' && !company_name) || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fleet managers can only create users for their own company, and users are always inactive
    let effectiveCompany = company_name;
    let effectiveIsActive = typeof is_active === 'boolean' ? is_active : true;

    if (isFleetManager) {
      // Force inactive - only super_admin can activate
      effectiveIsActive = false;

      // Fleet manager can only create for their own company
      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('company_name')
        .eq('id', callerId)
        .single();
      
      if (callerProfile?.company_name) {
        effectiveCompany = callerProfile.company_name;
      }
    }

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role, company_name: effectiveCompany },
    });

    if (createError) {
      const msg = createError.message || '';
      const isDuplicate = /already been registered|already exists|duplicate/i.test(msg);
      return new Response(
        JSON.stringify({
          error: isDuplicate ? 'כתובת אימייל זו כבר רשומה במערכת' : msg,
          code: isDuplicate ? 'email_exists' : undefined,
        }),
        {
          status: isDuplicate ? 409 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await supabaseAdmin.from('user_roles').delete().eq('user_id', userData.user.id);
    await supabaseAdmin.from('user_roles').insert({ user_id: userData.user.id, role });

    await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userData.user.id,
          full_name,
          company_name: effectiveCompany,
          phone: phone || '',
          is_active: effectiveIsActive,
          user_number: user_number || null,
        },
        { onConflict: 'id' }
      );

    // Auto-create driver record when role is driver
    if (role === 'driver') {
      await supabaseAdmin.from('drivers').upsert(
        {
          id: userData.user.id,
          full_name,
          phone: phone || '',
          email,
          company_name: effectiveCompany,
          status: 'active',
          created_by: userData.user.id,
        },
        { onConflict: 'id' }
      );
    }

    // If created by fleet_manager, notify all super_admins
    if (isFleetManager) {
      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, company_name')
        .eq('id', callerId)
        .single();

      const { data: superAdmins } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'super_admin');

      if (superAdmins && superAdmins.length > 0) {
        const roleLabels: Record<string, string> = {
          driver: 'נהג',
          fleet_manager: 'מנהל צי',
          super_admin: 'מנהל על',
        };

        const notifications = superAdmins.map((sa) => ({
          user_id: sa.user_id,
          type: 'new_user_request',
          title: '📋 בקשה לפתיחת משתמש חדש',
          message: `מבקש: ${callerProfile?.full_name || 'לא ידוע'} | חברה: ${effectiveCompany} | סוג: ${roleLabels[role] || role} | שם: ${full_name} | ${new Date().toLocaleString('he-IL')}`,
          link: '/user-management',
        }));

        await supabaseAdmin.from('driver_notifications').insert(notifications);
      }
    }

    return new Response(JSON.stringify({ success: true, user_id: userData.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
