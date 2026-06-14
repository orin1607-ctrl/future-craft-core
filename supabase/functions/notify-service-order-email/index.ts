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

    const supabaseAdmin = ctx.supabaseAdmin;

    const { record, type } = await req.json();
    // type: 'new_order' | 'urgent_order'

    if (!record || !record.company_name) {
      return new Response(JSON.stringify({ error: 'Missing record data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const denied = assertCompanyAccess(ctx, record.company_name);
    if (denied) return denied;

    // Find fleet managers in the same company
    const { data: managers } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'fleet_manager');

    if (!managers || managers.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const managerIds = managers.map(m => m.user_id);

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, company_name')
      .in('id', managerIds)
      .eq('company_name', record.company_name);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const profileIds = new Set(profiles.map(p => p.id));
    const targetUsers = users.filter(u => profileIds.has(u.id) && u.email);

    const urgencyLabels: Record<string, string> = {
      critical: 'מיידי 🔴',
      urgent: 'דחוף 🟠',
      normal: 'רגיל',
      low: 'נמוך',
    };

    const categoryLabels: Record<string, string> = {
      test: 'טסט',
      regular_service: 'טיפול שוטף',
      accident_repair: 'תיקון תאונה',
      tire: 'צמיגים',
      electric: 'חשמל',
      body: 'פחחות/צבע',
      other: 'אחר',
    };

    const isUrgent = type === 'urgent_order' || record.urgency === 'critical' || record.urgency === 'urgent';

    const buildEmailHtml = (managerName: string) => {
      const urgencyText = urgencyLabels[record.urgency] || record.urgency || 'רגיל';
      const categoryText = categoryLabels[record.service_category] || record.service_category || '—';
      const headerColor = isUrgent ? '#dc2626' : '#2563eb';
      const headerIcon = isUrgent ? '🚨' : '🔧';
      const headerTitle = isUrgent ? 'הזמנת שירות דחופה' : 'הזמנת שירות חדשה';

      return `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px;">
          <h1 style="color: ${headerColor}; font-size: 24px; margin-bottom: 16px;">${headerIcon} ${headerTitle}</h1>
          <p style="color: #333; font-size: 16px;">שלום ${managerName},</p>
          <p style="color: #333; font-size: 16px;">התקבלה הזמנת שירות ${isUrgent ? 'דחופה ' : ''}חדשה במערכת דליה:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">מס׳ הפניה</td>
              <td style="padding: 10px;">${record.reference_number || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">חברה</td>
              <td style="padding: 10px;">${record.company_name || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">רכב</td>
              <td style="padding: 10px;">${record.vehicle_plate || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">נהג</td>
              <td style="padding: 10px;">${record.driver_name || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">קטגוריה</td>
              <td style="padding: 10px;">${categoryText}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">דחיפות</td>
              <td style="padding: 10px; ${isUrgent ? 'color: #dc2626; font-weight: bold;' : ''}">${urgencyText}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">תיאור</td>
              <td style="padding: 10px;">${record.description || '—'}</td>
            </tr>
            ${record.towing_requested ? `<tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #666;">שינוע</td>
              <td style="padding: 10px; color: #ea580c; font-weight: bold;">נדרש שינוע 🚛</td>
            </tr>` : ''}
          </table>
          <p style="color: #666; font-size: 14px;">היכנס למערכת לפרטים נוספים וטיפול.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">הודעה זו נשלחה אוטומטית ממערכת דליה לניהול ציי רכב.</p>
        </div>`;
    };

    const subject = isUrgent
      ? `🚨 הזמנת שירות דחופה - רכב ${record.vehicle_plate || ''}`
      : `🔧 הזמנת שירות חדשה - רכב ${record.vehicle_plate || ''}`;

    const emailPromises = targetUsers.map(async (manager) => {
      const profile = profiles.find(p => p.id === manager.id);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'דליה מערכות <onboarding@resend.dev>',
          to: [manager.email],
          subject,
          html: buildEmailHtml(profile?.full_name || 'מנהל'),
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`Failed to send email to ${manager.email}: ${res.status} ${errBody}`);
      }
      return res;
    });

    await Promise.allSettled(emailPromises);

    return new Response(JSON.stringify({ sent: targetUsers.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Service order email notification error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
