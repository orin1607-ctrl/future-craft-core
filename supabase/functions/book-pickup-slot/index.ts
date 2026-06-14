import { assertCompanyAccess, edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, {
      roles: ['super_admin', 'fleet_manager'],
      allowInternal: true,
    });
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const body = await req.json();
    const {
      driver_name,
      driver_phone,
      driver_id,
      customer_name,
      customer_phone,
      customer_id,
      company_name,
      scheduled_date,
      scheduled_time,
      vehicle_plate,
      vehicle_id,
      location,
      notes,
      conversation_id,
      call_log_id,
      source,
    } = body;

    if (!ctx.isInternalCall) {
      const denied = assertCompanyAccess(ctx, company_name);
      if (denied) return denied;
    }

    const supabase = ctx.supabaseAdmin;

    // Try to auto-resolve driver from phone if not provided
    let resolvedDriverId = driver_id || null;
    let resolvedDriverName = driver_name || null;
    let resolvedDriverPhone = driver_phone || null;

    if (!resolvedDriverId && (driver_name || driver_phone)) {
      const { data: drv } = await supabase
        .from('drivers')
        .select('id, full_name, phone')
        .or(`full_name.eq.${driver_name || ''},phone.eq.${driver_phone || ''}`)
        .maybeSingle();
      if (drv) {
        resolvedDriverId = drv.id;
        resolvedDriverName = drv.full_name;
        resolvedDriverPhone = drv.phone;
      }
    }

    const { data, error } = await supabase
      .from('pickup_appointments')
      .insert({
        company_name: company_name || null,
        customer_id: customer_id || null,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        vehicle_id: vehicle_id || null,
        vehicle_plate: vehicle_plate || null,
        driver_id: resolvedDriverId,
        driver_name: resolvedDriverName,
        driver_phone: resolvedDriverPhone,
        scheduled_date: scheduled_date || null,
        scheduled_time: scheduled_time || null,
        location: location || null,
        notes: notes || 'תיאום איסוף רכב - נקבע אוטומטית בשיחה קולית',
        status: 'scheduled',
        source: source || 'voice_ai',
        conversation_id: conversation_id || null,
        call_log_id: call_log_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        appointment_id: data.id,
        message: scheduled_date
          ? `נקבע ל-${scheduled_date}${scheduled_time ? ' בשעה ' + scheduled_time : ''}`
          : 'התיאום נשמר',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('book-pickup-slot error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
