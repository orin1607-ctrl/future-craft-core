// Daily check for driving exam expiry - sends in-app notifications to drivers
// Runs via cron (pg_cron) and notifies drivers whose exam expired or expires within 14 days
import { edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { roles: ['super_admin'], allowInternal: true });
    if ('error' in auth) return auth.error;

    const supabase = auth.ctx.supabaseAdmin;

    const today = new Date();
    const in14Days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Find drivers whose exam_expiry has passed OR is within 14 days
    const { data: drivers, error } = await supabase
      .from('drivers')
      .select('id, full_name, exam_expiry, last_exam_date')
      .not('exam_expiry', 'is', null);

    if (error) throw error;

    let notified = 0;
    for (const d of drivers || []) {
      if (!d.exam_expiry) continue;
      const expiry = new Date(d.exam_expiry);
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

      if (daysLeft > 14) continue;

      // Avoid spamming: skip if a similar notif was sent in last 7 days
      const { data: recent } = await supabase
        .from('driver_notifications')
        .select('id')
        .eq('user_id', d.id)
        .eq('type', 'exam_expiry')
        .gte('created_at', new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
      if (recent && recent.length > 0) continue;

      const title = daysLeft < 0 ? '⚠️ תוקף מבחן הנהיגה פג' : `⏰ תוקף מבחן בעוד ${daysLeft} ימים`;
      const message = daysLeft < 0
        ? `תוקף מבחן הכשירות שלך פג בתאריך ${expiry.toLocaleDateString('he-IL')}. יש לבצע מבחן חדש בהקדם.`
        : `תוקף מבחן הכשירות שלך יפוג בתאריך ${expiry.toLocaleDateString('he-IL')}. מומלץ לבצע מבחן חדש.`;

      await supabase.from('driver_notifications').insert({
        user_id: d.id,
        type: 'exam_expiry',
        title,
        message,
        link: '/dashboard',
      });
      notified++;
    }

    return new Response(
      JSON.stringify({ ok: true, checked: drivers?.length || 0, notified }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
