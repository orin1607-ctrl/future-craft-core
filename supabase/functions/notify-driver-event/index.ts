import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCTION_REF = 'qasomfndnjuixgjmjwcm';
/** Owner-approved Production business WhatsApp (0546500305). Driver-event only — does not change the global Edge secret. */
const APPROVED_GUPSHUP_SOURCE = '972546500305';
const APPROVED_GUPSHUP_APP = 'DaliaVehicle';

function normalizeGupshupSource(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits === '0546500305' || digits === '546500305') return APPROVED_GUPSHUP_SOURCE;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

function resolveDriverEventSource(): { source: string; env_source: string; pinned: boolean } {
  const envSource = normalizeGupshupSource(
    Deno.env.get('GUPSHUP_SOURCE') || Deno.env.get('GUPSHUP_SOURCE_NUMBER') || '',
  );
  if (!envSource || envSource === APPROVED_GUPSHUP_SOURCE) {
    return { source: APPROVED_GUPSHUP_SOURCE, env_source: envSource, pinned: !envSource };
  }
  // Point-safe: this function always sends from the approved business number.
  // Global GUPSHUP_SOURCE secret is left unchanged for other Edge functions.
  return { source: APPROVED_GUPSHUP_SOURCE, env_source: envSource, pinned: true };
}

/** Live Production Gupshup only — same project as send-whatsapp-message. */
function isDriverEventWhatsAppAllowed(supabaseUrl: string | undefined): boolean {
  return (supabaseUrl || '').includes(PRODUCTION_REF);
}

const LEGACY_EMAIL_ACTIONS = new Set(['fault', 'fault_urgent', 'accident', 'service_order']);
/** These events already send WhatsApp via notify-accident-email when company_settings.incident_notify_whatsapp is on. */
const LEGACY_WHATSAPP_ACTIONS = new Set(['fault', 'fault_urgent', 'accident']);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeWhatsAppDigits(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/** Proven Production path (22.7 / 6.9): send-whatsapp-message → session POST /wa/api/v1/msg. */
async function sendViaSendWhatsAppMessage(opts: {
  supabaseUrl: string;
  destination: string;
  text: string;
}): Promise<{
  destination: string;
  http: number;
  success: boolean;
  message_id: string | null;
  gupshup_status: string | number | null;
  gupshup_response: Record<string, unknown> | null;
  error: string | null;
}> {
  const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const res = await fetch(`${opts.supabaseUrl}/functions/v1/send-whatsapp-message`, {
    method: 'POST',
    headers: {
      apikey: srk,
      Authorization: `Bearer ${srk}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'send',
      destination: opts.destination,
      message: opts.text,
    }),
  });
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    parsed = { raw: raw.slice(0, 400) };
  }
  const nested = (parsed.gupshup_response && typeof parsed.gupshup_response === 'object')
    ? parsed.gupshup_response as Record<string, unknown>
    : parsed;
  const messageId = String(
    parsed.message_id || parsed.messageId || nested.messageId || nested.message_id || parsed.id || '',
  );
  const success = res.ok && parsed.success !== false;
  return {
    destination: opts.destination,
    http: res.status,
    success,
    message_id: messageId || null,
    gupshup_status: (parsed.gupshup_status as string | number | null) ?? (nested.status as string | null) ?? null,
    gupshup_response: nested,
    error: success ? null : String(parsed.error || parsed.message || raw).slice(0, 300),
  };
}

type ActionSetting = {
  action_key: string;
  in_app_enabled: boolean;
  in_app_to_fleet_managers: boolean;
  in_app_to_company_contact: boolean;
  in_app_to_dalia: boolean;
  email_enabled: boolean;
  email_to_fleet_managers: boolean;
  email_to_company_contact: boolean;
  email_to_dalia: boolean;
  email_extra: string;
  whatsapp_enabled: boolean;
  whatsapp_to_fleet_managers: boolean;
  whatsapp_to_company_contact: boolean;
  whatsapp_to_dalia: boolean;
  whatsapp_extra: string;
  condition_mode: string;
  condition_values: string[];
};

function defaultSetting(actionKey: string): ActionSetting {
  // Unconfigured company: do not add Email/WhatsApp on top of existing Production
  // notify-accident-email / notify-service-order-email / incidentNotify.
  return {
    action_key: actionKey,
    in_app_enabled: false,
    in_app_to_fleet_managers: false,
    in_app_to_company_contact: false,
    in_app_to_dalia: false,
    email_enabled: false,
    email_to_fleet_managers: false,
    email_to_company_contact: false,
    email_to_dalia: false,
    email_extra: '',
    whatsapp_enabled: false,
    whatsapp_to_fleet_managers: false,
    whatsapp_to_company_contact: false,
    whatsapp_to_dalia: false,
    whatsapp_extra: '',
    condition_mode: 'all',
    condition_values: [],
  };
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function mergeSetting(actionKey: string, row: Record<string, unknown> | null): ActionSetting {
  const defaults = defaultSetting(actionKey);
  if (!row) return defaults;
  const conditionValues = row.condition_values;
  return {
    ...defaults,
    in_app_enabled: boolOr(row.in_app_enabled, defaults.in_app_enabled),
    in_app_to_fleet_managers: boolOr(row.in_app_to_fleet_managers, defaults.in_app_to_fleet_managers),
    in_app_to_company_contact: boolOr(row.in_app_to_company_contact, defaults.in_app_to_company_contact),
    in_app_to_dalia: boolOr(row.in_app_to_dalia, defaults.in_app_to_dalia),
    email_enabled: boolOr(row.email_enabled, defaults.email_enabled),
    email_to_fleet_managers: boolOr(row.email_to_fleet_managers, defaults.email_to_fleet_managers),
    email_to_company_contact: boolOr(row.email_to_company_contact, defaults.email_to_company_contact),
    email_to_dalia: boolOr(row.email_to_dalia, defaults.email_to_dalia),
    email_extra: typeof row.email_extra === 'string' ? row.email_extra : '',
    whatsapp_enabled: boolOr(row.whatsapp_enabled, defaults.whatsapp_enabled),
    whatsapp_to_fleet_managers: boolOr(row.whatsapp_to_fleet_managers, defaults.whatsapp_to_fleet_managers),
    whatsapp_to_company_contact: boolOr(row.whatsapp_to_company_contact, defaults.whatsapp_to_company_contact),
    whatsapp_to_dalia: boolOr(row.whatsapp_to_dalia, defaults.whatsapp_to_dalia),
    whatsapp_extra: typeof row.whatsapp_extra === 'string' ? row.whatsapp_extra : '',
    condition_mode: row.condition_mode === 'by_value' ? 'by_value' : 'all',
    condition_values: Array.isArray(conditionValues)
      ? conditionValues.filter((v): v is string => typeof v === 'string')
      : [],
  };
}

function conditionMatches(setting: ActionSetting, fieldValue?: string | null): boolean {
  if (setting.condition_mode === 'all') return true;
  if (!fieldValue) return false;
  return setting.condition_values.includes(fieldValue);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const checkSla = !!body.check_sla;

    if (checkSla) {
      const { data, error } = await supabaseAdmin.rpc('process_driver_emergency_jobs');
      if (error) console.error('process_driver_emergency_jobs', error);
      if (!body.action_key) {
        return new Response(JSON.stringify({ ok: true, sla_processed: data ?? 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const actionKey = String(body.action_key || '');
    const record = (body.record || {}) as Record<string, unknown>;
    const companyName = String(record.company_name || '');
    if (!actionKey || !companyName) {
      return new Response(JSON.stringify({ error: 'Missing action_key or company_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [settingRes, configRes, daliaRes] = await Promise.all([
      supabaseAdmin
        .from('driver_app_action_settings')
        .select('*')
        .eq('company_name', companyName)
        .eq('action_key', actionKey)
        .maybeSingle(),
      supabaseAdmin
        .from('driver_app_company_config')
        .select('*')
        .eq('company_name', companyName)
        .maybeSingle(),
      supabaseAdmin
        .from('dalia_contact_settings')
        .select('*')
        .eq('id', 'global')
        .maybeSingle(),
    ]);

    const setting = mergeSetting(actionKey, settingRes.data as Record<string, unknown> | null);
    const conditionValue = body.condition_value != null ? String(body.condition_value) : null;
    if (!conditionMatches(setting, conditionValue)) {
      return new Response(JSON.stringify({ ok: true, skipped: 'condition' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const daliaEnabled = !!configRes.data?.dalia_service_enabled;
    const contactEmail = String(configRes.data?.contact_email || '').trim();
    const contactWhatsapp = String(configRes.data?.contact_whatsapp || '').trim();
    const daliaEmail = String(daliaRes.data?.email || '').trim();
    const daliaWhatsapp = String(daliaRes.data?.whatsapp || '').trim();

    const { data: managers } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'fleet_manager');
    const managerIds = (managers || []).map((m) => m.user_id);
    const { data: managerProfiles } = managerIds.length
      ? await supabaseAdmin
          .from('profiles')
          .select('id, full_name, company_name, phone')
          .in('id', managerIds)
          .eq('company_name', companyName)
      : { data: [] as Array<{ id: string; full_name: string; company_name: string; phone: string | null }> };

    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const managerProfileIds = new Set((managerProfiles || []).map((p) => p.id));
    const managerUsers = (users || []).filter((u) => managerProfileIds.has(u.id));

    const title = String(body.title || defaultTitle(actionKey, record));
    const message = String(body.message || defaultMessage(actionKey, record));
    const link = String(body.link || defaultLink(actionKey));
    const subject = title;

    const emailDestinations: Array<{ email: string; name: string }> = [];
    const whatsappDestinations: string[] = [];
    let inAppCompanyContact = 0;
    let emailsSent = 0;
    let whatsappSent = 0;
    let whatsappSkipped = '';
    const whatsappResults: Array<Record<string, unknown>> = [];
    let sourceUsed = '';
    let sourceEnv = '';
    let sourcePinned = false;

    if (setting.email_enabled) {
      // Legacy Production already emails fleet managers for fault/accident/service_order.
      const skipLegacyFleetEmail = LEGACY_EMAIL_ACTIONS.has(actionKey);
      if (setting.email_to_fleet_managers && !skipLegacyFleetEmail) {
        for (const u of managerUsers) {
          if (u.email) {
            const profile = (managerProfiles || []).find((p) => p.id === u.id);
            emailDestinations.push({ email: u.email, name: profile?.full_name || 'מנהל' });
          }
        }
      }
      if (setting.email_to_company_contact && contactEmail) {
        emailDestinations.push({
          email: contactEmail,
          name: String(configRes.data?.contact_name || 'איש קשר'),
        });
      }
      if (setting.email_to_dalia && daliaEnabled && daliaEmail) {
        emailDestinations.push({
          email: daliaEmail,
          name: String(daliaRes.data?.contact_name || 'דליה'),
        });
      }
      if (setting.email_extra.trim()) {
        for (const extra of setting.email_extra.split(/[,;\s]+/).filter(Boolean)) {
          emailDestinations.push({ email: extra, name: 'נמען נוסף' });
        }
      }
    }

    if (setting.whatsapp_enabled) {
      if (setting.whatsapp_to_fleet_managers) {
        for (const p of managerProfiles || []) {
          const digits = normalizeWhatsAppDigits(p.phone || '');
          if (digits) whatsappDestinations.push(digits);
        }
      }
      if (setting.whatsapp_to_company_contact && contactWhatsapp) {
        const digits = normalizeWhatsAppDigits(contactWhatsapp);
        if (digits) whatsappDestinations.push(digits);
      }
      if (setting.whatsapp_to_dalia && daliaEnabled && daliaWhatsapp) {
        const digits = normalizeWhatsAppDigits(daliaWhatsapp);
        if (digits) whatsappDestinations.push(digits);
      }
      if (setting.whatsapp_extra.trim()) {
        for (const extra of setting.whatsapp_extra.split(/[,;\s]+/).filter(Boolean)) {
          const digits = normalizeWhatsAppDigits(extra);
          if (digits) whatsappDestinations.push(digits);
        }
      }
    }

    // In-app for company_contact only — fleet/dalia are written by DB triggers.
    if (setting.in_app_enabled && setting.in_app_to_company_contact && contactEmail) {
      const contactUser = (users || []).find(
        (u) => (u.email || '').toLowerCase() === contactEmail.toLowerCase(),
      );
      if (contactUser) {
        const { error } = await supabaseAdmin.from('driver_notifications').insert({
          user_id: contactUser.id,
          type: actionKey,
          title,
          message,
          link,
        });
        if (!error) inAppCompanyContact = 1;
      }
    }

    const uniqueEmails = [...new Map(emailDestinations.map((d) => [d.email.toLowerCase(), d])).values()];
    const uniqueWhatsapp = [...new Set(whatsappDestinations)];

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'דליה מערכות <onboarding@resend.dev>';
    if (uniqueEmails.length > 0) {
      if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY is not configured — skipping email');
      } else {
                const html = buildEmailHtml(title, message, record, actionKey);
                const emailResults = await Promise.allSettled(
                  uniqueEmails.map(async (dest) => {
                    const res = await fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${RESEND_API_KEY}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        from: RESEND_FROM,
                        to: [dest.email],
                        subject,
                        html,
                      }),
                    });
                    if (!res.ok) {
                      console.error(`Failed to send email to ${dest.email}: ${res.status} ${await res.text()}`);
                      throw new Error('email failed');
                    }
                    return true;
                  }),
                );
                emailsSent = emailResults.filter((r) => r.status === 'fulfilled').length;
      }
    }

    if (uniqueWhatsapp.length > 0 && LEGACY_WHATSAPP_ACTIONS.has(actionKey)) {
      const { data: incidentSettings } = await supabaseAdmin
        .from('company_settings')
        .select('incident_notify_whatsapp')
        .eq('company_name', companyName)
        .maybeSingle();
      if (incidentSettings?.incident_notify_whatsapp === true) {
        whatsappSkipped = 'legacy_notify_accident_email';
        uniqueWhatsapp.length = 0;
        console.log('WhatsApp skipped — notify-accident-email already owns this event');
      }
    }

    if (uniqueWhatsapp.length > 0) {
      if (!isDriverEventWhatsAppAllowed(supabaseUrl)) {
        whatsappSkipped = 'not_production_gupshup';
        console.log('WhatsApp skipped — not live Production Gupshup project');
      } else {
        const resolved = resolveDriverEventSource();
        sourceUsed = resolved.source;
        sourceEnv = resolved.env_source;
        sourcePinned = resolved.pinned;
        const text = `${title}\n${message}`;
        const waResults = await Promise.allSettled(
          uniqueWhatsapp.map(async (destination) => {
            if (destination === sourceUsed || destination === APPROVED_GUPSHUP_SOURCE) {
              const result = {
                destination,
                source: sourceUsed,
                via: 'send-whatsapp-message',
                http: 0,
                gupshup_status: null as string | number | null,
                message_id: null as string | null,
                error: 'refused SOURCE==DESTINATION',
              };
              whatsappResults.push(result);
              throw new Error('whatsapp refused source==destination');
            }
            const sent = await sendViaSendWhatsAppMessage({
              supabaseUrl,
              destination,
              text,
            });
            const ok = sent.success && !!sent.message_id;
            const result = {
              destination,
              source: sourceUsed,
              via: 'send-whatsapp-message',
              http: sent.http,
              gupshup_status: sent.gupshup_status,
              message_id: sent.message_id,
              error: ok ? null : sent.error,
            };
            whatsappResults.push(result);
            if (sent.message_id) {
              const { error: insErr } = await supabaseAdmin.from('incident_notification_deliveries').insert({
                company_name: companyName || 'notify-driver-event',
                incident_kind: 'fault',
                incident_id: crypto.randomUUID(),
                event_number: String(record.event_number || 'DRV-WA'),
                channel: 'whatsapp',
                recipient: destination,
                status: ok ? 'sent' : 'failed',
                provider_message_id: sent.message_id,
                payload_excerpt: text.slice(0, 400),
                error_message: result.error,
                sent_at: new Date().toISOString(),
              });
              if (insErr) console.error('notify-driver-event delivery insert', insErr);
            }
            if (!ok) {
              console.error(`WhatsApp failed for ${destination}: ${sent.http} ${sent.error}`);
              throw new Error('whatsapp failed');
            }
            return result;
          }),
        );
        whatsappSent = waResults.filter((r) => r.status === 'fulfilled').length;
      }
    }

    if (actionKey === 'emergency' && typeof record.id === 'string') {
      await supabaseAdmin
        .from('emergency_logs')
        .update({ notify_dispatched_at: new Date().toISOString() })
        .eq('id', record.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        action_key: actionKey,
        emails_sent: emailsSent,
        whatsapp_sent: whatsappSent,
        whatsapp_skipped: whatsappSkipped || null,
        in_app_company_contact: inAppCompanyContact,
        source_used: sourceUsed || null,
        source_env: sourceEnv || null,
        source_pinned: sourcePinned,
        whatsapp_via: whatsappSent > 0 || whatsappResults.length > 0 ? 'send-whatsapp-message' : null,
        whatsapp_results: whatsappResults,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('notify-driver-event error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function defaultLink(actionKey: string): string {
  if (actionKey === 'fault' || actionKey === 'fault_urgent') return '/faults';
  if (actionKey === 'accident') return '/accidents';
  if (actionKey === 'service_order') return '/service-orders';
  if (actionKey === 'emergency') return '/emergency-settings';
  if (actionKey === 'expenses') return '/expenses';
  return '/dashboard';
}

function defaultTitle(actionKey: string, record: Record<string, unknown>): string {
  if (actionKey === 'fault_urgent') return 'תקלה דחופה דווחה';
  if (actionKey === 'fault') return 'תקלה חדשה דווחה';
  if (actionKey === 'accident') return 'דיווח תאונה חדש';
  if (actionKey === 'service_order') return 'הזמנת שירות חדשה';
  if (actionKey === 'emergency') return 'בקשת חירום';
  if (actionKey === 'expenses') return 'חשבונית / הוצאה חדשה';
  return String(record.title || 'התראת נהג');
}

function defaultMessage(actionKey: string, record: Record<string, unknown>): string {
  const driver = String(record.driver_name || record.user_name || '');
  const plate = String(record.vehicle_plate || '');
  const desc = String(record.description || record.notes || record.category || '');
  if (actionKey === 'emergency') {
    return `${driver} פתח בקשת חירום${plate ? ` • רכב ${plate}` : ''}${desc ? `: ${desc}` : ''}`;
  }
  return `נהג ${driver} • רכב ${plate}${desc ? `: ${desc}` : ''}`;
}

function buildEmailHtml(
  title: string,
  message: string,
  record: Record<string, unknown>,
  actionKey: string,
): string {
  const rows: Array<[string, string]> = [
    ['נהג', String(record.driver_name || record.user_name || '—')],
    ['רכב', String(record.vehicle_plate || '—')],
    ['חברה', String(record.company_name || '—')],
  ];
  if (record.location) rows.push(['מיקום', String(record.location)]);
  if (record.urgency) rows.push(['דחיפות', String(record.urgency)]);
  if (record.fault_type) rows.push(['סוג תקלה', String(record.fault_type)]);
  if (record.category || record.service_category) {
    rows.push(['קטגוריה', String(record.category || record.service_category)]);
  }
  if (record.description) rows.push(['תיאור', String(record.description)]);
  if (record.amount != null) rows.push(['סכום', String(record.amount)]);
  const color = actionKey === 'emergency' || actionKey === 'accident' || actionKey === 'fault_urgent'
    ? '#dc2626'
    : '#2563eb';
  const table = rows
    .map(
      ([k, v]) =>
        `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px; font-weight: bold; color: #666;">${escapeHtml(k)}</td><td style="padding: 10px;">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px;">
      <h1 style="color: ${color}; font-size: 24px; margin-bottom: 16px;">${escapeHtml(title)}</h1>
      <p style="color: #333; font-size: 16px;">${escapeHtml(message)}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">${table}</table>
      <p style="color: #666; font-size: 14px;">היכנס למערכת לפרטים נוספים וטיפול.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">הודעה זו נשלחה אוטומטית ממערכת דליה לניהול ציי רכב.</p>
    </div>`;
}
