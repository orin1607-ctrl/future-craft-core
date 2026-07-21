import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';
const DEFAULT_SOURCE = '972546500305';
const DEFAULT_APP_NAME = 'DaliaVehicle';
const DEFAULT_TEST_MESSAGE = 'שלום, זו הודעת בדיקה ממערכת דליה';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Normalize phone to Gupshup destination format (digits only, no +). */
export function normalizeWhatsAppDestination(raw: string): string {
  let digits = raw.replace(/[\s\-()+]/g, '');
  if (digits.startsWith('0')) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.startsWith('972')) {
    // already international
  } else if (digits.length >= 9 && digits.length <= 10) {
    digits = `972${digits}`;
  }
  return digits.replace(/\D/g, '');
}

async function requireSuperAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: jsonResponse({ success: false, error: 'Unauthorized' }, 401) };
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return { error: jsonResponse({ success: false, error: authError?.message || 'Unauthorized' }, 401) };
  }

  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleRow?.role !== 'super_admin') {
    return { error: jsonResponse({ success: false, error: 'Forbidden — super_admin only' }, 403) };
  }

  return { supabaseAdmin, user };
}

async function recordWhatsAppSubmission(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  opts: {
    destination: string;
    messageId: string;
    textExcerpt?: string;
    gupshupStatus?: number | null;
  },
) {
  const incidentId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from('incident_notification_deliveries').insert({
    company_name: 'Dalia E2E',
    incident_kind: 'whatsapp_probe',
    incident_id: incidentId,
    event_number: `WA-PROBE-${Date.now()}`,
    channel: 'whatsapp',
    recipient: opts.destination,
    status: 'submitted',
    provider_message_id: opts.messageId,
    payload_excerpt: (opts.textExcerpt || '').slice(0, 400),
    dlr_event: 'submitted',
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('recordWhatsAppSubmission', error);
    return { ok: false as const, error: error.message, incident_id: incidentId };
  }
  return { ok: true as const, incident_id: incidentId };
}

async function callGupshupMsgEndpoint(formBody: URLSearchParams) {
  const apiKey = Deno.env.get('GUPSHUP_API_KEY');
  if (!apiKey) {
    return { ok: false, error: 'GUPSHUP_API_KEY is not configured in Supabase Secrets' };
  }

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

  const errMsg =
    (typeof parsed.message === 'string' && parsed.message) ||
    (typeof parsed.error === 'string' && parsed.error) ||
    raw.slice(0, 300) ||
    `Gupshup HTTP ${res.status}`;

  return { status: res.status, response: parsed, error: errMsg };
}

/**
 * Validate API key against the same send endpoint used for WhatsApp delivery.
 * Uses an invalid destination so no real message is delivered.
 */
async function verifyGupshupSendEndpoint(appName: string, source: string) {
  const apiKey = Deno.env.get('GUPSHUP_API_KEY');
  if (!apiKey) {
    return { ok: false, error: 'GUPSHUP_API_KEY is not configured in Supabase Secrets' };
  }

  const formBody = new URLSearchParams({
    channel: 'whatsapp',
    source,
    destination: '0',
    'src.name': appName,
    message: JSON.stringify({ type: 'text', text: 'connection-check-probe' }),
  });

  const result = await callGupshupMsgEndpoint(formBody);

  if (result.status === 401 || result.status === 403) {
    return {
      ok: false,
      error: result.error,
      status: result.status,
      response: result.response,
      endpoint: GUPSHUP_SEND_URL,
    };
  }

  // Non-401 on /wa/api/v1/msg means the apikey was accepted (validation/business errors are OK).
  return {
    ok: true,
    status: result.status,
    response: result.response,
    endpoint: GUPSHUP_SEND_URL,
    message: 'מפתח Gupshup תקין עבור endpoint השליחה',
  };
}

async function sendViaGupshup(destination: string, text: string) {
  const source = Deno.env.get('GUPSHUP_SOURCE') ?? DEFAULT_SOURCE;
  const appName = Deno.env.get('GUPSHUP_APP_NAME') ?? DEFAULT_APP_NAME;

  const messagePayload = JSON.stringify({ type: 'text', text });
  const formBody = new URLSearchParams({
    channel: 'whatsapp',
    source,
    destination,
    'src.name': appName,
    message: messagePayload,
  });

  const result = await callGupshupMsgEndpoint(formBody);
  if (result.status === 401 || result.status === 403) {
    return { ok: false, error: result.error, status: result.status, response: result.response };
  }
  if (result.status < 200 || result.status >= 300) {
    return { ok: false, error: result.error, status: result.status, response: result.response };
  }

  return { ok: true, status: result.status, response: result.response };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireSuperAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const action = body.action ?? 'send';

    const source = Deno.env.get('GUPSHUP_SOURCE') ?? DEFAULT_SOURCE;
    const appName = Deno.env.get('GUPSHUP_APP_NAME') ?? DEFAULT_APP_NAME;
    const apiKeyConfigured = Boolean(Deno.env.get('GUPSHUP_API_KEY'));

    const GUPSHUP_APP_ID = Deno.env.get('GUPSHUP_APP_ID') ?? '496709e8-b5fc-4de9-9c75-bc87455482dd';

    if (action === 'inspect_outbound_permissions') {
      const apiKey = Deno.env.get('GUPSHUP_API_KEY');
      const report: Record<string, unknown> = {
        note: 'Read-only inspection — no WhatsApp message sent, no webhooks changed',
        app: {
          name: appName,
          id: GUPSHUP_APP_ID,
          source_expected: DEFAULT_SOURCE,
          source_used: source,
          source_match: source === DEFAULT_SOURCE,
        },
        api_key: {
          configured: Boolean(apiKey),
          length: apiKey?.length ?? 0,
        },
        outbound_rules_from_gupshup_docs: {
          session_endpoint: GUPSHUP_SEND_URL,
          template_endpoint: 'https://api.gupshup.io/wa/api/v1/template/msg',
          session_messages: 'Free-form text only to users active in last 24h (after they messaged you)',
          template_messages: 'Required for business-initiated / outside 24h window; needs opt-in + approved template',
          inbound_bot: 'Receiving messages needs callback URL only; does not grant outbound API by itself',
        },
        probes: {} as Record<string, unknown>,
      };

      if (apiKey) {
        const templatesUrl = `https://api.gupshup.io/wa/app/${GUPSHUP_APP_ID}/template?pageNo=0&pageSize=20&templateStatus=APPROVED`;
        const templatesRes = await fetch(templatesUrl, {
          method: 'GET',
          headers: { apikey: apiKey },
        });
        const templatesRaw = await templatesRes.text();
        let templatesJson: unknown = null;
        try { templatesJson = templatesRaw ? JSON.parse(templatesRaw) : null; } catch { templatesJson = { raw: templatesRaw }; }

        const approved = Array.isArray((templatesJson as { templates?: unknown[] })?.templates)
          ? (templatesJson as { templates: { id: string; elementName: string; status: string; category: string }[] }).templates
          : [];

        const messagePayload = JSON.stringify({ type: 'text', text: 'connection-check-probe' });
        const formBody = new URLSearchParams({
          channel: 'whatsapp',
          source,
          destination: '0',
          'src.name': appName,
          message: messagePayload,
        });
        const msgRes = await fetch(GUPSHUP_SEND_URL, {
          method: 'POST',
          headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody.toString(),
        });
        const msgRaw = await msgRes.text();
        let msgJson: unknown = null;
        try { msgJson = msgRaw ? JSON.parse(msgRaw) : null; } catch { msgJson = { raw: msgRaw }; }

        (report.probes as Record<string, unknown>).list_approved_templates = {
          endpoint: templatesUrl,
          method: 'GET',
          http_status: templatesRes.status,
          api_key_accepted_for_app: templatesRes.status === 200,
          approved_template_count: approved.length,
          approved_templates_sample: approved.slice(0, 5).map((t) => ({
            id: t.id,
            elementName: t.elementName,
            status: t.status,
            category: t.category,
          })),
          response: templatesJson,
        };

        (report.probes as Record<string, unknown>).session_msg_auth_probe = {
          endpoint: GUPSHUP_SEND_URL,
          method: 'POST',
          purpose: 'Auth probe only — destination=0 invalid, no delivery',
          body_fields: Object.fromEntries(formBody.entries()),
          http_status: msgRes.status,
          outbound_session_api_authorized: msgRes.status !== 401 && msgRes.status !== 403,
          response: msgJson,
        };

        report.analysis = {
          api_key_belongs_to_dalia_vehicle_app: templatesRes.status === 200,
          outbound_session_api_blocked: msgRes.status === 401 || msgRes.status === 403,
          likely_first_message_needs_template: approved.length > 0,
          our_code_uses_session_endpoint_for_all_sends: true,
          note_403_vs_business_errors:
            'HTTP 403/401 = API key / app permission at gateway. Errors 1004-1007 = session/template business rules after auth.',
        };
      }

      return jsonResponse(report);
    }

    if (action === 'debug_connection') {
      const apiKey = Deno.env.get('GUPSHUP_API_KEY');
      const messagePayload = JSON.stringify({ type: 'text', text: 'connection-check-probe' });
      const formBody = new URLSearchParams({
        channel: 'whatsapp',
        source,
        destination: '0',
        'src.name': appName,
        message: messagePayload,
      });

      const requestHeaders = {
        apikey: apiKey ? `[REDACTED — ${apiKey.length} chars]` : '[NOT SET]',
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      let gupshupHttpStatus: number | null = null;
      let gupshupResponseHeaders: Record<string, string> = {};
      let gupshupBodyRaw = '';
      let gupshupBodyJson: Record<string, unknown> | null = null;

      if (apiKey) {
        const res = await fetch(GUPSHUP_SEND_URL, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody.toString(),
        });
        gupshupHttpStatus = res.status;
        gupshupResponseHeaders = Object.fromEntries(res.headers.entries());
        gupshupBodyRaw = await res.text();
        try {
          gupshupBodyJson = gupshupBodyRaw ? JSON.parse(gupshupBodyRaw) : {};
        } catch {
          gupshupBodyJson = { raw: gupshupBodyRaw };
        }
      }

      return jsonResponse({
        note: 'Same probe as check_connection — destination=0, no real WhatsApp delivery',
        request: {
          endpoint: GUPSHUP_SEND_URL,
          method: 'POST',
          headers: requestHeaders,
          body_urlencoded: formBody.toString(),
          body_fields: {
            channel: 'whatsapp',
            source,
            destination: '0',
            'src.name': appName,
            message: messagePayload,
          },
        },
        validation: {
          source_expected: DEFAULT_SOURCE,
          source_used: source,
          source_match: source === DEFAULT_SOURCE,
          app_name_expected: DEFAULT_APP_NAME,
          app_name_used: appName,
          app_name_match: appName === DEFAULT_APP_NAME,
        },
        secrets_env: {
          GUPSHUP_API_KEY_configured: Boolean(apiKey),
          GUPSHUP_API_KEY_length: apiKey?.length ?? 0,
          GUPSHUP_APP_NAME_secret: Deno.env.get('GUPSHUP_APP_NAME') ?? null,
          GUPSHUP_SOURCE_secret: Deno.env.get('GUPSHUP_SOURCE') ?? null,
        },
        gupshup_response: {
          http_status: gupshupHttpStatus,
          headers: gupshupResponseHeaders,
          body_raw: gupshupBodyRaw,
          body_json: gupshupBodyJson,
        },
        gupshup_verified: gupshupHttpStatus !== null && gupshupHttpStatus !== 401 && gupshupHttpStatus !== 403,
        gupshup_status: gupshupHttpStatus,
        app_name_used: appName,
      });
    }

    if (action === 'status' || action === 'check_connection') {
      if (!apiKeyConfigured) {
        return jsonResponse({
          success: false,
          configured: false,
          provider: 'Gupshup',
          app_name: appName,
          source,
          endpoint: GUPSHUP_SEND_URL,
          secret_name: 'GUPSHUP_API_KEY',
          message: 'מפתח GUPSHUP_API_KEY לא הוגדר — הוסף אותו ב-Supabase Dashboard → Edge Functions → Secrets',
        });
      }

      const gupshup = await verifyGupshupSendEndpoint(appName, source);
      const gupshupVerified = gupshup.ok;
      return jsonResponse({
        success: gupshupVerified,
        configured: true,
        gupshup_verified: gupshupVerified,
        provider: 'Gupshup',
        app_name: appName,
        source,
        endpoint: GUPSHUP_SEND_URL,
        secret_name: 'GUPSHUP_API_KEY',
        gupshup_status: gupshup.status,
        gupshup_endpoint: gupshup.endpoint,
        gupshup_response: gupshup.response,
        message: gupshupVerified
          ? (gupshup.message ?? 'מפתח Gupshup תקין — endpoint השליחה מגיב')
          : 'Gupshup דחה את המפתח ב-endpoint השליחה — עדכן GUPSHUP_API_KEY ב-Supabase Secrets',
        error: gupshupVerified ? undefined : gupshup.error,
      }, gupshupVerified ? 200 : 502);
    }

    if (action === 'send' || action === 'send_test') {
      if (!apiKeyConfigured) {
        return jsonResponse({
          success: false,
          error: 'GUPSHUP_API_KEY is not configured in Supabase Secrets',
        }, 503);
      }

      // Dry-run for templates / preview without delivery
      if (body.dry_run === true) {
        const destinationRaw = body.destination ?? body.to ?? '';
        const text =
          typeof body.message === 'string' && body.message.trim()
            ? body.message.trim()
            : DEFAULT_TEST_MESSAGE;
        return jsonResponse({
          success: true,
          dry_run: true,
          destination: typeof destinationRaw === 'string' ? normalizeWhatsAppDestination(destinationRaw) : '',
          text,
          message: 'dry_run — no WhatsApp delivery',
        });
      }

      // Optional Meta template send (business-initiated). Requires approved template name.
      if (body.use_template === true || body.template_name) {
        const destinationRaw = body.destination ?? body.to;
        if (!destinationRaw || typeof destinationRaw !== 'string') {
          return jsonResponse({ success: false, error: 'destination (phone number) is required' }, 400);
        }
        const destination = normalizeWhatsAppDestination(destinationRaw);
        const templateName = String(body.template_name || '');
        if (!templateName) {
          return jsonResponse({
            success: false,
            error: 'template_name required for business-initiated WhatsApp',
          }, 400);
        }
        const apiKey = Deno.env.get('GUPSHUP_API_KEY');
        const templateParams = Array.isArray(body.template_params)
          ? (body.template_params as string[])
          : typeof body.message === 'string'
            ? [body.message]
            : [];
        const formBody = new URLSearchParams({
          channel: 'whatsapp',
          source,
          destination,
          'src.name': appName,
          template: JSON.stringify({
            id: templateName,
            params: templateParams,
          }),
        });
        const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
          method: 'POST',
          headers: {
            apikey: apiKey!,
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
          return jsonResponse({
            success: false,
            error: (parsed.message as string) || raw.slice(0, 300) || `Gupshup HTTP ${res.status}`,
            gupshup_status: res.status,
            gupshup_response: parsed,
          }, 502);
        }
        const messageId =
          (parsed.messageId as string | undefined) ||
          (parsed.message_id as string | undefined);
        let deliveryLog: Record<string, unknown> | null = null;
        if (messageId) {
          deliveryLog = await recordWhatsAppSubmission(auth.supabaseAdmin, {
            destination,
            messageId,
            textExcerpt: `template:${templateName}`,
            gupshupStatus: res.status,
          });
        }
        return jsonResponse({
          success: true,
          message: 'הודעת WhatsApp (template) נשלחה',
          destination,
          template_name: templateName,
          gupshup_status: res.status,
          message_id: messageId,
          gupshup_response: parsed,
          delivery_log: deliveryLog,
        });
      }

      const probe = await verifyGupshupSendEndpoint(appName, source);
      if (!probe.ok) {
        return jsonResponse({
          success: false,
          error: probe.error ?? 'Gupshup authentication failed — update GUPSHUP_API_KEY in Supabase Secrets',
          gupshup_status: probe.status,
          gupshup_endpoint: GUPSHUP_SEND_URL,
        }, 502);
      }

      const destinationRaw = body.destination ?? body.to;
      if (!destinationRaw || typeof destinationRaw !== 'string') {
        return jsonResponse({ success: false, error: 'destination (phone number) is required' }, 400);
      }

      const destination = normalizeWhatsAppDestination(destinationRaw);
      if (destination.length < 10) {
        return jsonResponse({ success: false, error: 'מספר טלפון לא תקין' }, 400);
      }

      const text =
        typeof body.message === 'string' && body.message.trim()
          ? body.message.trim()
          : DEFAULT_TEST_MESSAGE;

      const result = await sendViaGupshup(destination, text);
      if (!result.ok) {
        return jsonResponse({
          success: false,
          error: result.error,
          destination,
          gupshup_status: result.status,
        }, 502);
      }

      const messageId =
        (result.response?.messageId as string | undefined) ||
        (result.response?.message_id as string | undefined) ||
        (typeof result.response?.id === 'string' ? result.response.id : undefined);

      let deliveryLog: Record<string, unknown> | null = null;
      if (messageId) {
        deliveryLog = await recordWhatsAppSubmission(auth.supabaseAdmin, {
          destination,
          messageId,
          textExcerpt: text,
          gupshupStatus: result.status ?? null,
        });
      }

      return jsonResponse({
        success: true,
        message: 'הודעת WhatsApp נשלחה',
        destination,
        text,
        gupshup_status: result.status,
        message_id: messageId,
        gupshup_response: result.response,
        delivery_log: deliveryLog,
      });
    }

    if (action === 'register_dlr_callback') {
      const apiKey = Deno.env.get('GUPSHUP_API_KEY');
      if (!apiKey) {
        return jsonResponse({ success: false, error: 'GUPSHUP_API_KEY missing' }, 503);
      }
      const GUPSHUP_APP_ID = Deno.env.get('GUPSHUP_APP_ID') ?? '496709e8-b5fc-4de9-9c75-bc87455482dd';
      const callbackUrl =
        typeof body.callback_url === 'string' && body.callback_url.trim()
          ? body.callback_url.trim()
          : `${Deno.env.get('SUPABASE_URL')}/functions/v1/gupshup-webhook`;

      const attempts: Record<string, unknown>[] = [];
      const endpoints = [
        {
          name: 'wa_app_callback_put_form',
          url: `https://api.gupshup.io/wa/app/${GUPSHUP_APP_ID}/callback`,
          method: 'PUT' as const,
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ callbackUrl }).toString(),
        },
        {
          name: 'wa_app_callback_put_json',
          url: `https://api.gupshup.io/wa/app/${GUPSHUP_APP_ID}/callback`,
          method: 'PUT' as const,
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ callbackUrl }),
        },
        {
          name: 'sm_app_name_callbackUrl',
          url: `https://api.gupshup.io/sm/api/v1/app/${encodeURIComponent(appName)}/callbackUrl`,
          method: 'PUT' as const,
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ callbackUrl }).toString(),
        },
        {
          name: 'sm_app_opt_callback',
          url: 'https://api.gupshup.io/sm/api/v1/app/opt/callback',
          method: 'PUT' as const,
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            callbackUrl,
            'src.name': appName,
          }).toString(),
        },
      ];

      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, {
            method: ep.method,
            headers: ep.headers,
            body: ep.body,
          });
          const raw = await res.text();
          attempts.push({
            name: ep.name,
            http: res.status,
            body: raw.slice(0, 300),
          });
          if (res.status >= 200 && res.status < 300) {
            return jsonResponse({
              success: true,
              callback_url: callbackUrl,
              registered_via: ep.name,
              attempts,
            });
          }
        } catch (e) {
          attempts.push({
            name: ep.name,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return jsonResponse({
        success: false,
        callback_url: callbackUrl,
        error: 'Could not register callback via API — set manually in Gupshup Console → App → Webhooks',
        owner_action_required: true,
        attempts,
      }, 502);
    }

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('send-whatsapp-message error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
    }, 500);
  }
});
