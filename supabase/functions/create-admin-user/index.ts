import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getClientIp, getUserAgent, writeAudit } from '../_shared/authOtp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Staging QA only — may reuse existing auth user instead of failing on duplicate email. */
const STAGING_TEST_LOGIN_EMAIL = 'yoni19111977@gmail.com';

function isStagingTestLoginEmail(email: string): boolean {
  return email.trim().toLowerCase() === STAGING_TEST_LOGIN_EMAIL;
}

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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: authError?.message || 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = callerUser.id;

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

    const body = await req.json();
    const {
      email, password, full_name, role, company_name, phone, action, user_id, is_active, user_number,
      nickname, address, contact_email, job_title, notes, permissions,
      contact_role, activity_field, business_id,
      license_number, assigned_vehicle_id,
      approval_status,
      two_factor_approved,
    } = body;

    // Actions that require super_admin only
    const superAdminOnlyActions = ['update-password', 'reset-password-by-id', 'update-role', 'update-profile', 'toggle-active', 'list-users', 'set-two-factor-approved'];
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
      if (nickname !== undefined) updates.nickname = nickname;
      if (address !== undefined) updates.address = address;
      if (contact_email !== undefined) updates.contact_email = contact_email;
      if (job_title !== undefined) updates.job_title = job_title;
      if (notes !== undefined) updates.notes = notes;
      if (approval_status !== undefined) updates.approval_status = approval_status;

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

      const profileUpdate: Record<string, unknown> = {
        is_active,
        approval_updated_at: new Date().toISOString(),
      };
      if (is_active) {
        profileUpdate.approval_status = 'approved';
        profileUpdate.approved_by = callerId;
      }

      const { error } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', user_id);
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

    if (action === 'set-two-factor-approved') {
      if (!user_id || typeof two_factor_approved !== 'boolean') {
        return new Response(JSON.stringify({ error: 'user_id and two_factor_approved are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, two_factor_approved')
        .eq('id', user_id)
        .single();

      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', callerId)
        .single();

      const updates: Record<string, unknown> = {
        two_factor_approved,
        two_factor_approved_at: two_factor_approved ? new Date().toISOString() : null,
        two_factor_approved_by: two_factor_approved ? callerId : null,
      };

      const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(user_id);
      const targetEmail = targetAuth.user?.email ?? null;

      await writeAudit(supabaseAdmin, two_factor_approved ? 'two_factor_enabled' : 'two_factor_disabled', {
        success: true,
        userId: user_id,
        email: targetEmail,
        actorUserId: callerId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          target_name: targetProfile?.full_name ?? '',
          actor_name: callerProfile?.full_name ?? '',
          previous_value: targetProfile?.two_factor_approved ?? false,
          new_value: two_factor_approved,
        },
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === CREATE USER ===
    const needsCompany = role !== 'private_customer';
    if (!email || !password || !full_name || !role || (needsCompany && !company_name)) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let effectiveCompany = company_name || '';
    let effectiveIsActive = typeof is_active === 'boolean' ? is_active : false;
    const effectiveApproval = approval_status || 'pending';

    if (isFleetManager) {
      effectiveIsActive = false;
      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('company_name')
        .eq('id', callerId)
        .single();
      if (callerProfile?.company_name) {
        effectiveCompany = callerProfile.company_name;
      }
    }

    const profileNotes = [notes, permissions ? `הרשאות: ${permissions}` : ''].filter(Boolean).join('\n') || null;

    let newUserId: string;
    let reusedTestUser = false;

    if (isStagingTestLoginEmail(email)) {
      const { data: authUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const existing = authUsers.users.find(
        (u) => (u.email || '').trim().toLowerCase() === email.trim().toLowerCase(),
      );
      if (existing) {
        newUserId = existing.id;
        reusedTestUser = true;
        const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(newUserId, {
          password,
          email_confirm: true,
          user_metadata: { full_name, role, company_name: effectiveCompany },
        });
        if (updateAuthErr) {
          return new Response(JSON.stringify({ error: updateAuthErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (!reusedTestUser) {
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role, company_name: effectiveCompany },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      newUserId = userData.user.id;
    }

    const cleanupAuthUser = async () => {
      if (!reusedTestUser) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      }
    };

    await supabaseAdmin.from('user_roles').delete().eq('user_id', newUserId);
    const { error: roleInsertErr } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newUserId, role });

    if (roleInsertErr) {
      await cleanupAuthUser();
      return new Response(JSON.stringify({ error: roleInsertErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(
      {
        id: newUserId,
        full_name,
        company_name: effectiveCompany,
        phone: phone || '',
        is_active: effectiveIsActive,
        user_number: user_number || null,
        nickname: nickname || null,
        address: address || null,
        contact_email: contact_email || null,
        job_title: job_title || null,
        notes: profileNotes,
        approval_status: effectiveApproval,
        approval_updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (profileErr) {
      await cleanupAuthUser();
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'driver') {
      const driverEmail = contact_email || email;
      const { error: driverErr } = await supabaseAdmin.from('drivers').upsert(
        {
          id: newUserId,
          full_name,
          phone: phone || '',
          email: driverEmail,
          company_name: effectiveCompany,
          license_number: license_number || '',
          notes: notes || '',
          status: 'active',
          created_by: callerId,
        },
        { onConflict: 'id' },
      );
      if (driverErr) {
        await cleanupAuthUser();
        return new Response(JSON.stringify({ error: driverErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (assigned_vehicle_id) {
        await supabaseAdmin
          .from('vehicles')
          .update({ assigned_driver_id: newUserId })
          .eq('id', assigned_vehicle_id);
      }
    }

    if (role === 'business_customer') {
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('user_id', newUserId)
        .maybeSingle();

      if (existingCustomer?.id) {
        const { error: custUpdateErr } = await supabaseAdmin
          .from('customers')
          .update({
            name: company_name || full_name,
            company_name: company_name || full_name,
            contact_person: full_name,
            contact_role: contact_role || '',
            business_id: business_id || null,
            address: address || '',
            phone: phone || '',
            email: contact_email || email,
            notes: profileNotes,
            activity_field: activity_field || '',
            status: 'pending',
          })
          .eq('id', existingCustomer.id);

        if (custUpdateErr) {
          await cleanupAuthUser();
          return new Response(JSON.stringify({ error: custUpdateErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabaseAdmin
          .from('profiles')
          .update({ customer_id: existingCustomer.id })
          .eq('id', newUserId);
      } else {
        const { data: customerRow, error: custErr } = await supabaseAdmin
          .from('customers')
          .insert({
            name: company_name || full_name,
            company_name: company_name || full_name,
            contact_person: full_name,
            contact_role: contact_role || '',
            business_id: business_id || null,
            address: address || '',
            phone: phone || '',
            email: contact_email || email,
            notes: profileNotes,
            activity_field: activity_field || '',
            customer_type: 'company',
            status: 'pending',
            user_id: newUserId,
            created_by: callerId,
          })
          .select('id')
          .single();

        if (custErr) {
          await cleanupAuthUser();
          return new Response(JSON.stringify({ error: custErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (customerRow?.id) {
          const { error: linkErr } = await supabaseAdmin
            .from('profiles')
            .update({ customer_id: customerRow.id })
            .eq('id', newUserId);
          if (linkErr) {
            await cleanupAuthUser();
            return new Response(JSON.stringify({ error: linkErr.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
    }

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
          private_customer: 'לקוח פרטי',
          business_customer: 'לקוח עסקי',
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

    return new Response(JSON.stringify({
      success: true,
      user_id: newUserId,
      reused_test_user: reusedTestUser,
    }), {
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
