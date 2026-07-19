/**
 * Incident notify — Email + WhatsApp + in-app after fault/accident create.
 * - Honors company_settings.incident_notify_* (NOT emergency whatsapp_enabled)
 * - Recipient modes: fleet_managers | dalia | both
 * - Logs to incident_notification_deliveries with anti-duplicate
 * - Notify failures never throw to client as hard failure (returns partial results)
 */
import { assertCompanyAccess, edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;
const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';
const DEFAULT_SOURCE = '972546500305';
const DEFAULT_APP_NAME = 'DaliaVehicle';
const DEFAULT_DALIA = {
  email: 'orin1607@gmail.com',
  whatsappPhone: '0534338601',
  whatsappE164: '972534338601',
};

type RecipientMode = 'fleet_managers' | 'dalia' | 'both';
type IncidentKind = 'fault' | 'accident';

type DeliveryInsert = {
  company_name: string;
  incident_kind: IncidentKind;
  incident_id: string;
  event_number: string;
  channel: 'email' | 'whatsapp' | 'in_app';
  recipient: string;
  status: 'sent' | 'delivered' | 'failed' | 'skipped';
  provider_message_id?: string | null;
  error_message?: string | null;
  payload_excerpt?: string | null;
  sent_at?: string | null;
};

function normalizeWhatsAppDestination(raw: string): string {
  let digits = String(raw || '').replace(/[\s\-()+]/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  else if (!digits.startsWith('972') && digits.length >= 9 && digits.length <= 10) {
    digits = `972${digits}`;
  }
  return digits.replace(/\D/g, '');
}

function israelWhen(iso?: string | null): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso || Date.now()));
  } catch {
    return iso || new Date().toISOString();
  }
}

function faultTypeDisplay(faultType?: string | null, other?: string | null): string {
  if (!faultType) return '—';
  if (faultType === 'אחר' && other?.trim()) return `אחר: ${other.trim()}`;
  return faultType;
}

function buildMessageText(kind: IncidentKind, record: Record<string, unknown>, link: string): string {
  const status = String(record.status || (kind === 'fault' ? 'opened' : 'open') || 'חדש');
  const plate = String(record.vehicle_plate || '—');
  const internal = record.vehicle_internal_number
    ? String(record.vehicle_internal_number)
    : '';
  const plateLine = internal ? `${plate} (פנימי: ${internal})` : plate;
  const lines = [
    kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש',
    `מספר אירוע: ${record.event_number || '—'}`,
    `חברה: ${record.company_name || '—'}`,
    `נהג: ${record.driver_name || '—'}`,
    `טלפון נהג: ${record.reporter_phone || '—'}`,
    `מספר רישוי: ${plate}`,
    ...(internal ? [`מספר פנימי: ${internal}`] : []),
    `סוג אירוע: ${kind === 'fault' ? 'תקלה' : 'תאונה'}`,
    ...(kind === 'fault'
      ? [`סוג תקלה: ${faultTypeDisplay(record.fault_type as string, record.fault_type_other as string)}`]
      : []),
    `תאריך ושעה: ${israelWhen((record.created_at || record.date) as string)}`,
    `תיאור: ${String(record.description || '—').slice(0, 200)}`,
    `סטטוס ראשוני: ${status}`,
    'נציג דליה יחזור לנהג בהקדם.',
    'קישור לצפייה באירוע:',
    link || plateLine,
  ];
  return lines.join('\n');
}

function buildEmailSubject(kind: IncidentKind, record: Record<string, unknown>): string {
  const label = kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש';
  return `${label} | ${record.company_name || '—'} | ${record.vehicle_plate || '—'} | ${record.event_number || '—'}`;
}

function buildEmailHtml(kind: IncidentKind, record: Record<string, unknown>, link: string): string {
  const text = buildMessageText(kind, record, link).replace(/\n/g, '<br/>');
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;padding:24px">
    <h2 style="margin-top:0">${kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש'}</h2>
    <div style="line-height:1.6;font-size:15px;color:#222">${text}</div>
    <p style="margin-top:20px"><a href="${link}">פתיחת האירוע במערכת</a></p>
    <p style="color:#999;font-size:12px">הודעה אוטומטית ממערכת דליה</p>
  </div>`;
}

async function claimDelivery(
  // deno-lint-ignore no-explicit-any
  admin: any,
  row: DeliveryInsert,
): Promise<'claimed' | 'duplicate' | 'error'> {
  const { error } = await admin.from('incident_notification_deliveries').insert({
    ...row,
    status: 'pending',
    sent_at: null,
  });
  if (!error) return 'claimed';
  if (String(error.message || '').includes('duplicate') || error.code === '23505') {
    return 'duplicate';
  }
  // Table may not exist yet — still allow send, log later as best-effort
  console.error('claimDelivery', error);
  return 'error';
}

async function finalizeDelivery(
  // deno-lint-ignore no-explicit-any
  admin: any,
  key: { incident_kind: IncidentKind; incident_id: string; channel: string; recipient: string },
  patch: Partial<DeliveryInsert>,
) {
  const { error } = await admin
    .from('incident_notification_deliveries')
    .update({
      status: patch.status,
      provider_message_id: patch.provider_message_id ?? null,
      error_message: patch.error_message ?? null,
      payload_excerpt: patch.payload_excerpt ?? null,
      sent_at: patch.sent_at ?? new Date().toISOString(),
    })
    .eq('incident_kind', key.incident_kind)
    .eq('incident_id', key.incident_id)
    .eq('channel', key.channel)
    .eq('recipient', key.recipient);
  if (error) console.error('finalizeDelivery', error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req, { roles: ['super_admin', 'fleet_manager', 'driver'] });
    if ('error' in auth) return auth.error;
    const { ctx } = auth;
    const supabaseAdmin = ctx.supabaseAdmin;

    const body = await req.json();
    const record = (body.record || {}) as Record<string, unknown>;
    const eventType = (body.type || 'accident') as IncidentKind;
    const kind: IncidentKind = eventType === 'fault' ? 'fault' : 'accident';
    const channels = body.channels || {};
    const dryRun = body.dry_run === true;
    const dalia = { ...DEFAULT_DALIA, ...(body.dalia || {}) };

    if (!record?.company_name) {
      return new Response(JSON.stringify({ error: 'Missing record data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const denied = assertCompanyAccess(ctx, String(record.company_name));
    if (denied) return denied;

    const incidentId = String(record.id || '');
    if (!incidentId) {
      return new Response(JSON.stringify({ error: 'Missing incident id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load company settings — incident toggles independent of emergency whatsapp_enabled
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select(
        'incident_notify_in_app, incident_notify_email, incident_notify_whatsapp, incident_email_recipients, incident_whatsapp_recipients',
      )
      .eq('company_name', record.company_name)
      .maybeSingle();

    const wantInApp = channels.in_app ?? settings?.incident_notify_in_app ?? true;
    const wantEmail = channels.email ?? settings?.incident_notify_email ?? true;
    // Decoupled from emergency whatsapp_enabled — paid add-on is incident_notify_whatsapp only
    const wantWhatsApp = channels.whatsapp ?? settings?.incident_notify_whatsapp ?? false;
    const emailMode = (channels.emailRecipients ||
      settings?.incident_email_recipients ||
      'fleet_managers') as RecipientMode;
    const waMode = (channels.whatsappRecipients ||
      settings?.incident_whatsapp_recipients ||
      'dalia') as RecipientMode;

    const link = String(record.link || body.link || '');
    const messageText = buildMessageText(kind, record, link);
    const emailSubject = buildEmailSubject(kind, record);
    const emailHtml = buildEmailHtml(kind, record, link);
    const eventNumber = String(record.event_number || '');

    const results: Record<string, unknown>[] = [];

    // Resolve fleet managers (email + phone)
    const { data: managerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'fleet_manager');
    const managerIds = (managerRoles || []).map((m: { user_id: string }) => m.user_id);
    let managerProfiles: { id: string; full_name: string | null; company_name: string | null; phone: string | null }[] = [];
    if (managerIds.length) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, company_name, phone')
        .in('id', managerIds)
        .eq('company_name', record.company_name);
      managerProfiles = data || [];
    }
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const usersById = new Map((authUsers?.users || []).map((u) => [u.id, u]));

    const emailTargets: { email: string; label: string }[] = [];
    const waTargets: { phone: string; label: string }[] = [];

    const includeManagersEmail = emailMode === 'fleet_managers' || emailMode === 'both';
    const includeDaliaEmail = emailMode === 'dalia' || emailMode === 'both';
    const includeManagersWa = waMode === 'fleet_managers' || waMode === 'both';
    const includeDaliaWa = waMode === 'dalia' || waMode === 'both';

    if (wantEmail && includeManagersEmail) {
      for (const p of managerProfiles) {
        const u = usersById.get(p.id);
        if (u?.email) emailTargets.push({ email: u.email, label: p.full_name || u.email });
      }
    }
    if (wantEmail && includeDaliaEmail) {
      emailTargets.push({ email: dalia.email, label: 'דליה' });
    }
    // Dedupe emails
    const seenEmail = new Set<string>();
    const uniqueEmails = emailTargets.filter((t) => {
      const k = t.email.toLowerCase();
      if (seenEmail.has(k)) return false;
      seenEmail.add(k);
      return true;
    });

    if (wantWhatsApp && includeManagersWa) {
      for (const p of managerProfiles) {
        if (p.phone) waTargets.push({ phone: p.phone, label: p.full_name || p.phone });
      }
    }
    if (wantWhatsApp && includeDaliaWa) {
      waTargets.push({ phone: dalia.whatsappPhone || dalia.whatsappE164, label: 'דליה' });
    }
    const seenWa = new Set<string>();
    const uniqueWa = waTargets.filter((t) => {
      const k = normalizeWhatsAppDestination(t.phone);
      if (!k || k.length < 10 || seenWa.has(k)) return false;
      seenWa.add(k);
      return true;
    });

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          would_email: uniqueEmails.map((e) => e.email),
          would_whatsapp: uniqueWa.map((w) => normalizeWhatsAppDestination(w.phone)),
          wantInApp,
          messageText,
          emailSubject,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // In-app notifications to fleet managers
    if (wantInApp) {
      for (const p of managerProfiles) {
        const recipient = p.id;
        const claim = await claimDelivery(supabaseAdmin, {
          company_name: String(record.company_name),
          incident_kind: kind,
          incident_id: incidentId,
          event_number: eventNumber,
          channel: 'in_app',
          recipient,
          status: 'pending',
        });
        if (claim === 'duplicate') {
          results.push({ channel: 'in_app', recipient, status: 'skipped', reason: 'duplicate' });
          continue;
        }
        const { error } = await supabaseAdmin.from('driver_notifications').insert({
          user_id: p.id,
          type: kind === 'fault' ? 'fault' : 'accident',
          title: kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש',
          message: `${eventNumber} · ${record.vehicle_plate || ''} · ${record.driver_name || ''}`.trim(),
          link: link || (kind === 'fault' ? `/faults?id=${incidentId}` : `/accidents?id=${incidentId}`),
        });
        if (error) {
          await finalizeDelivery(
            supabaseAdmin,
            { incident_kind: kind, incident_id: incidentId, channel: 'in_app', recipient },
            { status: 'failed', error_message: error.message },
          );
          results.push({ channel: 'in_app', recipient, status: 'failed', error: error.message });
        } else {
          await finalizeDelivery(
            supabaseAdmin,
            { incident_kind: kind, incident_id: incidentId, channel: 'in_app', recipient },
            { status: 'sent', payload_excerpt: eventNumber },
          );
          results.push({ channel: 'in_app', recipient, status: 'sent' });
        }
      }
    }

    // Email via Resend
    if (wantEmail && uniqueEmails.length) {
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      const from = Deno.env.get('RESEND_FROM') || 'דליה מערכות <onboarding@resend.dev>';
      if (!RESEND_API_KEY) {
        results.push({ channel: 'email', status: 'failed', error: 'RESEND_API_KEY not configured' });
      } else {
        for (const t of uniqueEmails) {
          const claim = await claimDelivery(supabaseAdmin, {
            company_name: String(record.company_name),
            incident_kind: kind,
            incident_id: incidentId,
            event_number: eventNumber,
            channel: 'email',
            recipient: t.email,
            status: 'pending',
          });
          if (claim === 'duplicate') {
            results.push({ channel: 'email', recipient: t.email, status: 'skipped', reason: 'duplicate' });
            continue;
          }
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from,
                to: [t.email],
                subject: emailSubject,
                html: emailHtml,
                text: messageText,
              }),
            });
            const raw = await res.text();
            let parsed: Record<string, unknown> = {};
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              parsed = { raw };
            }
            if (!res.ok) {
              await finalizeDelivery(
                supabaseAdmin,
                { incident_kind: kind, incident_id: incidentId, channel: 'email', recipient: t.email },
                { status: 'failed', error_message: String(parsed.message || raw).slice(0, 500) },
              );
              results.push({
                channel: 'email',
                recipient: t.email,
                status: 'failed',
                error: parsed.message || raw.slice(0, 200),
              });
            } else {
              const mid = (parsed.id as string) || null;
              await finalizeDelivery(
                supabaseAdmin,
                { incident_kind: kind, incident_id: incidentId, channel: 'email', recipient: t.email },
                {
                  status: 'sent',
                  provider_message_id: mid,
                  payload_excerpt: emailSubject.slice(0, 200),
                },
              );
              results.push({
                channel: 'email',
                recipient: t.email,
                status: 'sent',
                message_id: mid,
              });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'email error';
            await finalizeDelivery(
              supabaseAdmin,
              { incident_kind: kind, incident_id: incidentId, channel: 'email', recipient: t.email },
              { status: 'failed', error_message: msg },
            );
            results.push({ channel: 'email', recipient: t.email, status: 'failed', error: msg });
          }
        }
      }
    }

    // WhatsApp via Gupshup (incident toggle only)
    if (wantWhatsApp && uniqueWa.length) {
      const apiKey = Deno.env.get('GUPSHUP_API_KEY');
      const source = Deno.env.get('GUPSHUP_SOURCE') ?? DEFAULT_SOURCE;
      const appName = Deno.env.get('GUPSHUP_APP_NAME') ?? DEFAULT_APP_NAME;
      if (!apiKey) {
        results.push({ channel: 'whatsapp', status: 'failed', error: 'GUPSHUP_API_KEY not configured' });
      } else {
        for (const t of uniqueWa) {
          const dest = normalizeWhatsAppDestination(t.phone);
          const claim = await claimDelivery(supabaseAdmin, {
            company_name: String(record.company_name),
            incident_kind: kind,
            incident_id: incidentId,
            event_number: eventNumber,
            channel: 'whatsapp',
            recipient: dest,
            status: 'pending',
          });
          if (claim === 'duplicate') {
            results.push({ channel: 'whatsapp', recipient: dest, status: 'skipped', reason: 'duplicate' });
            continue;
          }
          try {
            const formBody = new URLSearchParams({
              channel: 'whatsapp',
              source,
              destination: dest,
              'src.name': appName,
              message: JSON.stringify({ type: 'text', text: messageText }),
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
            let parsed: Record<string, unknown> = {};
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              parsed = { raw };
            }
            if (res.status < 200 || res.status >= 300) {
              await finalizeDelivery(
                supabaseAdmin,
                { incident_kind: kind, incident_id: incidentId, channel: 'whatsapp', recipient: dest },
                {
                  status: 'failed',
                  error_message: String(parsed.message || parsed.error || raw).slice(0, 500),
                },
              );
              results.push({
                channel: 'whatsapp',
                recipient: dest,
                status: 'failed',
                error: parsed.message || raw.slice(0, 200),
              });
            } else {
              const mid =
                (parsed.messageId as string) ||
                (parsed.message_id as string) ||
                (typeof parsed.id === 'string' ? parsed.id : null);
              await finalizeDelivery(
                supabaseAdmin,
                { incident_kind: kind, incident_id: incidentId, channel: 'whatsapp', recipient: dest },
                {
                  status: 'sent',
                  provider_message_id: mid,
                  payload_excerpt: messageText.slice(0, 200),
                },
              );
              results.push({
                channel: 'whatsapp',
                recipient: dest,
                status: 'sent',
                message_id: mid,
              });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'whatsapp error';
            await finalizeDelivery(
              supabaseAdmin,
              { incident_kind: kind, incident_id: incidentId, channel: 'whatsapp', recipient: dest },
              { status: 'failed', error_message: msg },
            );
            results.push({ channel: 'whatsapp', recipient: dest, status: 'failed', error: msg });
          }
        }
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        skipped,
        results,
        channels: { in_app: wantInApp, email: wantEmail, whatsapp: wantWhatsApp },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Incident notify error:', error);
    // Soft failure — client must not roll back saved incident
    return new Response(
      JSON.stringify({
        success: false,
        soft: true,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
