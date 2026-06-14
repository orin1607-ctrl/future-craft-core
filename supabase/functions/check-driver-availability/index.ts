import { edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, {
      roles: ['super_admin', 'fleet_manager'],
      allowInternal: true,
    });
    if ('error' in auth) return auth.error;

    const url = new URL(req.url);
    const driverName = url.searchParams.get('driver_name') || '';
    const companyName = url.searchParams.get('company_name') || '';
    const daysAhead = parseInt(url.searchParams.get('days_ahead') || '7');

    const supabase = auth.ctx.supabaseAdmin;

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + daysAhead);

    const { data: assignments } = await supabase
      .from('work_orders')
      .select('scheduled_date, scheduled_time, end_time, status')
      .eq('driver_name', driverName)
      .eq('company_name', companyName)
      .gte('scheduled_date', today.toISOString().split('T')[0])
      .lte('scheduled_date', endDate.toISOString().split('T')[0])
      .neq('status', 'rejected');

    // Build available slots map (default working hours 08:00-18:00)
    const slots: Array<{ date: string; day_label: string; available_slots: string[] }> = [];
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    for (let i = 1; i <= daysAhead; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      if (d.getDay() === 6) continue; // skip Saturday

      const busy = (assignments || []).filter(a => a.scheduled_date === dateStr);
      const allSlots = ['09:00', '11:00', '13:00', '15:00', '17:00'];
      const free = allSlots.filter(slot => !busy.some(b => b.scheduled_time === slot));

      if (free.length > 0) {
        slots.push({
          date: dateStr,
          day_label: `יום ${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
          available_slots: free,
        });
      }
    }

    return new Response(
      JSON.stringify({ driver_name: driverName, available_days: slots.slice(0, 5) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
