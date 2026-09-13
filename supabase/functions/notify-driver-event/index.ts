import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PRODUCTION_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'];

function isStagingWhatsAppAllowed(supabaseUrl: string | undefined): boolean {
  const url = supabaseUrl || '';
  if (PRODUCTION_REFS.some((ref) => url.includes(ref))) return false;
  return url.includes(STAGING_REF);
}

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
  const base: ActionSetting = {
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
  if (actionKey === 'fault') {
    return { ...base, in_app_enabled: true, in_app_to_fleet_managers: true };
  }
  if (actionKey === 'fault_urgent' || actionKey === 'accident' || actionKey === 'service_order') {
    return {
      ...base,
      in_app_enabled: true,
      in_app_to_fleet_managers: true,
      email_enabled: true,
      email_to_fleet_managers: true,
    };
  }
  if (actionKey === 'emergency' || actionKey === 'expenses') {
    return { ...base, in_app_enabled: true, in_app_to_fleet_managers: true };
  }
  return base;
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

    if (setting.email_enabled) {
      if (setting.email_to_fleet_managers) {
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
                        from: 'דליה מערכות <onboarding@resend.dev>',
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

    if (uniqueWhatsapp.length > 0) {
      if (!isStagingWhatsAppAllowed(supabaseUrl)) {
        whatsappSkipped = 'not_staging';
        console.log('WhatsApp skipped — not staging project');
      } else {
        const apiKey = Deno.env.get('GUPSHUP_API_KEY');
        const source = Deno.env.get('GUPSHUP_SOURCE_NUMBER') || '972546500305';
        const srcName = Deno.env.get('GUPSHUP_APP_NAME') || 'DaliaVehicle';
        if (!apiKey) {
          whatsappSkipped = 'missing_gupshup_key';
          console.error('GUPSHUP_API_KEY is not configured on staging — skipping WhatsApp');
        } else {
          const text = `${title}\n${message}`;
          const waResults = await Promise.allSettled(
            uniqueWhatsapp.map(async (destination) => {
              const params = new URLSearchParams();
              params.set('channel', 'whatsapp');
              params.set('source', source);
              params.set('destination', destination);
              params.set('src.name', srcName);
              params.set('message', JSON.stringify({ type: 'text', text }));
              const res = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
                method: 'POST',
                headers: {
                  apikey: apiKey,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
              });
              if (!res.ok) {
                console.error(`WhatsApp failed for ${destination}: ${res.status} ${await res.text()}`);
                throw new Error('whatsapp failed');
              }
              return true;
            }),
          );
          whatsappSent = waResults.filter((r) => r.status === 'fulfilled').length;
        }
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
