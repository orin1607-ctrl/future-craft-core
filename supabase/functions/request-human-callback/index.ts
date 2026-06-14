import { edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { allowInternal: true });
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const body = await req.json();
    const { customer_name, customer_phone, company_name, reason } = body;

    const supabase = ctx.supabaseAdmin;

    // Notify all fleet managers of the company about the callback request
    const { data: managers } = await supabase
      .from('user_roles')
      .select('user_id, profiles!inner(company_name)')
      .eq('role', 'fleet_manager')
      .eq('profiles.company_name', company_name);

    if (managers && managers.length > 0) {
      await supabase.from('driver_notifications').insert(
        managers.map((m: any) => ({
          user_id: m.user_id,
          type: 'callback_request',
          title: '📞 בקשת חזרה מלקוח',
          message: `${customer_name} (${customer_phone}) ביקש שמתאם אנושי יחזור אליו - ${reason || 'תיאום איסוף רכב'}`,
          link: '/customers',
        }))
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'בקשה נרשמה ומתאם יחזור אליך בהקדם' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
