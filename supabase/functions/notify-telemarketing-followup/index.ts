/**
 * Narrow notify function for telemarketing follow-ups.
 * Reuses existing Gupshup + Resend secrets. Does not widen send-whatsapp-message.
 * Failure never deletes saved call / follow-up rows.
 */
import { edgeCorsHeaders, jsonResponse, requireAuth } from '../_shared/edgeAuth.ts';

const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';
const DEFAULT_SOURCE = '972546500305';
const DEFAULT_APP_NAME = 'DaliaVehicle';
const DEFAULT_FROM = 'דליה מערכות <onboarding@resend.dev>';

function normalizeWhatsAppDestination(raw: string): string {
  let digits = raw.replace(/[\s\-()+]/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  else if (!digits.startsWith('972') && digits.length >= 9 && digits.length <= 10) {
    digits = `972${digits}`;
  }
  return digits.replace(/\D/g, '');
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatTimeLabel(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatDurationLabel(seconds: number | null): string {
  if (seconds == null) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildMessage(call: Record<string, unknown>): string {
  return [
    'טלמיטינג — נדרש המשך טיפול',
    '',
    `חברה: ${call.company_name || ''}`,
    call.contact_name ? `איש קשר: ${call.contact_name}` : null,
    `טלפון: ${call.phone || ''}`,
    call.vehicle_count != null ? `מספר רכבים: ${call.vehicle_count}` : null,
    `עובד/ת: ${call.employee_name || ''}`,
    '',
    `שעת התחלה: ${formatTimeLabel(String(call.started_at || ''))}`,
    `שעת סיום: ${formatTimeLabel(call.ended_at ? String(call.ended_at) : null)}`,
    `משך: ${formatDurationLabel(typeof call.duration_seconds === 'number' ? call.duration_seconds : null)}`,
    '',
    `תוצאה: ${call.result || ''}`,
    `דירוג: ${call.lead_rating || ''}`,
    '',
    'סיכום:',
    String(call.summary || ''),
    '',
    'נדרש לבצע:',
    String(call.next_action || ''),
    '',
    'מועד המשך:',
    call.follow_up_time ? `${call.follow_up_date} ${call.follow_up_time}` : String(call.follow_up_date || ''),
    '',
    `דחיפות: ${call.follow_up_urgency || 'רגיל'}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

async function sendWhatsApp(destination: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('GUPSHUP_API_KEY');
  if (!apiKey) return { ok: false, error: 'GUPSHUP_API_KEY missing' };
  const source = Deno.env.get('GUPSHUP_SOURCE') ?? DEFAULT_SOURCE;
  const appName = Deno.env.get('GUPSHUP_APP_NAME') ?? DEFAULT_APP_NAME;
  const formBody = new URLSearchParams({
    channel: 'whatsapp',
    source,
    destination,
    'src.name': appName,
    message: JSON.stringify({ type: 'text', text }),
  });
  const res = await fetch(GUPSHUP_SEND_URL, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });
  const raw = await res.text();
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, error: raw.slice(0, 300) || `Gupshup HTTP ${res.status}` };
  }
  return { ok: true };
}

async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' };
  const from = Deno.env.get('RESEND_FROM') || DEFAULT_FROM;
  const html = `<pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</pre>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (body as { message?: string }).message || `Resend HTTP ${res.status}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: edgeCorsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = await requireAuth(req, { roles: ['telemarketing_agent', 'super_admin'] });
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const callId = String(body.callId || body.call_id || '').trim();
    if (!callId) return jsonResponse({ error: 'callId required' }, 400);

    const { ctx } = auth;
    const { data: call, error: callErr } = await ctx.supabaseAdmin
      .from('telemarketing_calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle();

    if (callErr || !call) return jsonResponse({ error: 'call not found' }, 404);

    if (ctx.role === 'telemarketing_agent' && call.employee_id !== ctx.user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    if (!call.needs_follow_up || call.status !== 'completed') {
      return jsonResponse({ ok: true, skipped: true, reason: 'no_follow_up' });
    }

    const { data: settingsRows } = await ctx.supabaseAdmin.from('telemarketing_settings').select('key, value');
    const settings: Record<string, string> = {};
    for (const row of settingsRows || []) settings[row.key] = row.value;

    const waEnabled = settings.whatsapp_enabled !== 'false';
    const emailEnabled = settings.email_enabled !== 'false';
    const waNumber = settings.manager_whatsapp_number || '';
    const managerEmail = (settings.manager_notification_email || '').trim();
    const retry = body.retry === true;
    const message = buildMessage(call);
    const result = {
      whatsapp: 'skipped' as string,
      email: 'skipped' as string,
      whatsappError: null as string | null,
      emailError: null as string | null,
    };

    if (waEnabled && waNumber && (retry || call.whatsapp_status !== 'sent')) {
      const wa = await sendWhatsApp(normalizeWhatsAppDestination(waNumber), message);
      result.whatsapp = wa.ok ? 'sent' : 'failed';
      result.whatsappError = wa.error || null;
      await ctx.supabaseAdmin
        .from('telemarketing_calls')
        .update({ whatsapp_status: wa.ok ? 'sent' : 'failed' })
        .eq('id', callId);
    }

    if (emailEnabled && looksLikeEmail(managerEmail) && (retry || call.email_status !== 'sent')) {
      const em = await sendEmail(
        managerEmail,
        `טלמיטינג — נדרש המשך טיפול: ${call.company_name || ''}`,
        message,
      );
      result.email = em.ok ? 'sent' : 'failed';
      result.emailError = em.error || null;
      await ctx.supabaseAdmin
        .from('telemarketing_calls')
        .update({ email_status: em.ok ? 'sent' : 'failed' })
        .eq('id', callId);
    } else if (emailEnabled && !looksLikeEmail(managerEmail)) {
      result.email = 'skipped';
      result.emailError = 'manager_notification_email not configured';
    }

    return jsonResponse({ ok: true, callId, ...result });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      500,
    );
  }
});
