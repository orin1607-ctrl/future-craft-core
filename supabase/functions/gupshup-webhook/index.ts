/**
 * Gupshup WhatsApp delivery webhook (DLR) — Staging.
 * Public endpoint (verify_jwt=false). Acknowledges 2xx immediately after parse+upsert.
 *
 * Supported payloads:
 * - Gupshup v2 message-event { type, payload: { id, gsId, type, destination, payload } }
 * - Console delivery { eventType, externalId, destAddr, errorCode, cause }
 * - Meta/Gupshup v3 { entry[].changes[].value.statuses[] } with gs_id
 *
 * Updates public.incident_notification_deliveries by provider_message_id.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, user-agent',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

type MappedStatus =
  | 'submitted'
  | 'enqueued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'rejected'
  | 'pending';

interface DlrEvent {
  messageIds: string[];
  status: MappedStatus;
  dlrEvent: string;
  destination?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  rawExcerpt: string;
}

function mapEventType(raw: string): MappedStatus | null {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'submitted') return 'submitted';
  if (t === 'enqueued') return 'enqueued';
  if (t === 'sent') return 'sent';
  if (t === 'delivered') return 'delivered';
  if (t === 'read' || t === 'seen') return 'read';
  if (t === 'failed' || t === 'discarded') return 'failed';
  if (t === 'rejected' || t === 'deleted') return 'rejected';
  return null;
}

function excerpt(obj: unknown, max = 800): string {
  try {
    return JSON.stringify(obj).slice(0, max);
  } catch {
    return String(obj).slice(0, max);
  }
}

/** Make {{toJSON(1)}} / double-encoded JSON / nested wrappers → raw Gupshup/Meta payload */
function normalizeWebhookBody(input: unknown): unknown {
  let b: unknown = input;
  for (let i = 0; i < 4; i++) {
    if (typeof b === 'string') {
      const s = b.trim();
      if (!s) return {};
      try { b = JSON.parse(s); continue; } catch { return { raw: s.slice(0, 500) }; }
    }
    if (!b || typeof b !== 'object') return b;
    const o = b as Record<string, unknown>;
    if (Array.isArray(o.entry) || o.type === 'message-event' || typeof o.eventType === 'string') {
      return b;
    }
    for (const key of ['value', 'data', 'body', 'payload', 'request']) {
      const nested = o[key];
      if (typeof nested === 'string' || (nested && typeof nested === 'object')) {
        b = nested;
        break;
      }
    }
    // Deep-ish: first object that contains entry[]
    const stack: unknown[] = Object.values(o);
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      const no = n as Record<string, unknown>;
      if (Array.isArray(no.entry)) return n;
      stack.push(...Object.values(no).slice(0, 20));
    }
    break;
  }
  return b;
}

function metaErrorMessage(st: Record<string, unknown>): { code: string | null; message: string | null } {
  const errors = Array.isArray(st.errors) ? st.errors : [];
  const err = (errors[0] && typeof errors[0] === 'object')
    ? (errors[0] as Record<string, unknown>)
    : null;
  if (!err) return { code: null, message: null };
  const data = (err.error_data && typeof err.error_data === 'object')
    ? (err.error_data as Record<string, unknown>)
    : {};
  const message =
    (typeof data.details === 'string' && data.details) ||
    (typeof err.title === 'string' && err.title) ||
    (typeof err.message === 'string' && err.message) ||
    null;
  return {
    code: err.code != null ? String(err.code) : null,
    message,
  };
}

function parseEvents(body: unknown): DlrEvent[] {
  const events: DlrEvent[] = [];
  body = normalizeWebhookBody(body);
  if (!body || typeof body !== 'object') return events;
  const b = body as Record<string, unknown>;

  // Gupshup v2 message-event
  if (b.type === 'message-event' && b.payload && typeof b.payload === 'object') {
    const p = b.payload as Record<string, unknown>;
    const status = mapEventType(String(p.type || ''));
    if (status) {
      const ids = [p.gsId, p.id, p.messageId, p.message_id]
        .filter((x) => typeof x === 'string' && x.length > 0) as string[];
      const nested = (p.payload && typeof p.payload === 'object')
        ? (p.payload as Record<string, unknown>)
        : {};
      events.push({
        messageIds: [...new Set(ids)],
        status,
        dlrEvent: String(p.type),
        destination: typeof p.destination === 'string' ? p.destination : null,
        errorCode: nested.code != null ? String(nested.code) : (nested.errorCode != null ? String(nested.errorCode) : null),
        errorMessage:
          (typeof nested.reason === 'string' && nested.reason) ||
          (typeof nested.message === 'string' && nested.message) ||
          (typeof nested.whatsappMessage === 'string' && nested.whatsappMessage) ||
          null,
        rawExcerpt: excerpt(b),
      });
    }
  }

  // Console-style delivery event
  if (typeof b.eventType === 'string' || typeof b.externalId === 'string') {
    const status = mapEventType(String(b.eventType || b.cause || ''));
    if (status) {
      const ids = [b.externalId, b.gsId, b.messageId, b.id]
        .filter((x) => typeof x === 'string' && x.length > 0) as string[];
      events.push({
        messageIds: [...new Set(ids)],
        status,
        dlrEvent: String(b.eventType || b.cause || status),
        destination: typeof b.destAddr === 'string' ? b.destAddr : null,
        errorCode: b.errorCode != null ? String(b.errorCode) : null,
        errorMessage: typeof b.cause === 'string' ? b.cause : null,
        rawExcerpt: excerpt(b),
      });
    }
  }

  // Meta / Gupshup v3 (also what Make receives from Gupshup Delivery)
  if (Array.isArray(b.entry)) {
    for (const entry of b.entry as Record<string, unknown>[]) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const ch of changes as Record<string, unknown>[]) {
        const value = (ch.value && typeof ch.value === 'object')
          ? (ch.value as Record<string, unknown>)
          : {};
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const st of statuses as Record<string, unknown>[]) {
          const status = mapEventType(String(st.status || ''));
          if (!status) continue;
          const ids = [st.gs_id, st.gsId, st.id, st.meta_msg_id]
            .filter((x) => typeof x === 'string' && x.length > 0) as string[];
          const { code, message } = metaErrorMessage(st);
          events.push({
            messageIds: [...new Set(ids)],
            status,
            dlrEvent: String(st.status),
            destination: typeof st.recipient_id === 'string' ? st.recipient_id : null,
            errorCode: code,
            errorMessage: message,
            rawExcerpt: excerpt(st),
          });
        }
      }
    }
  }

  // Sandbox / misc: { payload: { type, gsId } } without outer type
  if (events.length === 0 && b.payload && typeof b.payload === 'object') {
    const p = b.payload as Record<string, unknown>;
    const status = mapEventType(String(p.type || p.status || ''));
    if (status) {
      const ids = [p.gsId, p.id, p.messageId]
        .filter((x) => typeof x === 'string' && x.length > 0) as string[];
      events.push({
        messageIds: [...new Set(ids)],
        status,
        dlrEvent: String(p.type || p.status),
        destination: typeof p.destination === 'string' ? p.destination : null,
        errorCode: null,
        errorMessage: null,
        rawExcerpt: excerpt(b),
      });
    }
  }

  return events;
}

function preferStatus(current: string | null | undefined, next: MappedStatus): boolean {
  const rank: Record<string, number> = {
    pending: 0,
    submitted: 1,
    enqueued: 2,
    sent: 3,
    delivered: 4,
    read: 5,
    failed: 6,
    rejected: 6,
    skipped: 0,
  };
  const cur = rank[String(current || 'pending')] ?? 0;
  const nxt = rank[next] ?? 0;
  // Always allow terminal failure to overwrite; allow forward progress; allow read after delivered
  if (next === 'failed' || next === 'rejected') return true;
  return nxt >= cur;
}

/** Walk inbound webhook JSON for WhatsApp Reply context Message IDs (gsId / id). */
function deepFindReplyContextIds(input: unknown, acc: string[] = [], depth = 0): string[] {
  if (input == null || depth > 12) return acc;
  if (typeof input === 'string') {
    const s = input.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return deepFindReplyContextIds(JSON.parse(s), acc, depth + 1);
      } catch {
        return acc;
      }
    }
    return acc;
  }
  if (Array.isArray(input)) {
    for (const x of input) deepFindReplyContextIds(x, acc, depth + 1);
    return acc;
  }
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const ctx = o.context;
    if (ctx && typeof ctx === 'object') {
      const c = ctx as Record<string, unknown>;
      for (const k of ['gsId', 'gs_id', 'id', 'message_id', 'messageId']) {
        const v = c[k];
        if (typeof v === 'string' && v.trim()) acc.push(v.trim());
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') deepFindReplyContextIds(v, acc, depth + 1);
      else if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
        deepFindReplyContextIds(v, acc, depth + 1);
      }
    }
  }
  return acc;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Gupshup may health-check with GET.
  // Also: Make Bot one-way filter — check if Reply context Message ID is a system alert.
  if (req.method === 'GET' || req.method === 'POST') {
    const url = new URL(req.url);
    const check =
      url.searchParams.get('check_system_alert') === '1' ||
      url.searchParams.get('check_system_alert') === 'true';

    // POST body may carry inbound webhook for deep context extraction
    let postBody: unknown = null;
    if (req.method === 'POST' && check) {
      try {
        const text = await req.text();
        postBody = text ? JSON.parse(text) : {};
      } catch {
        postBody = {};
      }
    }

    if (check) {
      const fromQuery = [
        url.searchParams.get('gsId'),
        url.searchParams.get('waId'),
        url.searchParams.get('id'),
        url.searchParams.get('alert_msg_id'),
      ];
      const fromBody =
        postBody && typeof postBody === 'object'
          ? [
              (postBody as Record<string, unknown>).gsId,
              (postBody as Record<string, unknown>).waId,
              (postBody as Record<string, unknown>).id,
              (postBody as Record<string, unknown>).alert_msg_id,
            ]
          : [];
      const deepIds = deepFindReplyContextIds(postBody);
      const candidates = [...fromQuery, ...fromBody, ...deepIds]
        .map((x) => String(x || '').trim())
        .filter((x) => x && x !== '__none__' && x !== 'undefined' && x !== 'null');

      if (!candidates.length) {
        return new Response(
          JSON.stringify({
            ok: true,
            service: 'gupshup-webhook',
            is_system_alert: false,
            is_system_alert_flag: 'no',
            reason: 'no_context_id',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: rows, error } = await supabaseAdmin
        .from('incident_notification_deliveries')
        .select('id, provider_message_id, incident_kind, event_number, channel')
        .in('provider_message_id', [...new Set(candidates)])
        .eq('channel', 'whatsapp')
        .limit(5);

      if (error) {
        console.error('gupshup-webhook check_system_alert', error);
        return new Response(
          JSON.stringify({
            ok: true,
            service: 'gupshup-webhook',
            is_system_alert: false,
            is_system_alert_flag: 'no',
            reason: 'lookup_error',
            error: error.message,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const match = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'gupshup-webhook',
          is_system_alert: Boolean(match),
          is_system_alert_flag: match ? 'yes' : 'no',
          matched_id: match?.provider_message_id || null,
          incident_kind: match?.incident_kind || null,
          event_number: match?.event_number || null,
          checked: [...new Set(candidates)],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (req.method === 'GET') {
      return new Response(JSON.stringify({ ok: true, service: 'gupshup-webhook' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: unknown = null;
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const obj: Record<string, string> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      // Some gateways wrap JSON in a "response" / "data" field
      if (obj.response) {
        try { body = JSON.parse(obj.response); } catch { body = obj; }
      } else if (obj.data) {
        try { body = JSON.parse(obj.data); } catch { body = obj; }
      } else {
        body = obj;
      }
    } else {
      const text = await req.text();
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 500) }; }
    }
  } catch (e) {
    console.error('gupshup-webhook parse error', e);
    // Still 200 so Gupshup does not hammer retries on malformed probes
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // sandbox-start etc.
  if (body && typeof body === 'object' && (body as Record<string, unknown>).type === 'sandbox-start') {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const events = parseEvents(body);
  const results: Record<string, unknown>[] = [];

  for (const ev of events) {
    if (!ev.messageIds.length) {
      results.push({ skipped: true, reason: 'no_message_id', dlr: ev.dlrEvent });
      continue;
    }

    for (const mid of ev.messageIds) {
      const { data: rows, error: selErr } = await supabaseAdmin
        .from('incident_notification_deliveries')
        .select('id, status, provider_message_id, status_history')
        .eq('provider_message_id', mid)
        .eq('channel', 'whatsapp')
        .limit(5);

      if (selErr) {
        console.error('gupshup-webhook select', selErr);
        results.push({ message_id: mid, error: selErr.message });
        continue;
      }

      const historyEntry = {
        at: new Date().toISOString(),
        status: ev.status,
        dlr_event: ev.dlrEvent,
        error_code: ev.errorCode ?? null,
        error_message: ev.errorMessage ?? null,
      };

      if (!rows || rows.length === 0) {
        // Insert orphan DLR so we still retain the event for investigation
        const { error: insErr } = await supabaseAdmin.from('incident_notification_deliveries').insert({
          company_name: 'Gupshup DLR',
          incident_kind: 'whatsapp_probe',
          incident_id: crypto.randomUUID(),
          event_number: 'DLR-ORPHAN',
          channel: 'whatsapp',
          recipient: ev.destination || 'unknown',
          status: ev.status,
          provider_message_id: mid,
          error_message: ev.errorMessage,
          dlr_event: ev.dlrEvent,
          dlr_error_code: ev.errorCode,
          payload_excerpt: ev.rawExcerpt,
          status_history: [historyEntry],
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        results.push({
          message_id: mid,
          action: insErr ? 'orphan_insert_failed' : 'orphan_inserted',
          status: ev.status,
          error: insErr?.message,
        });
        continue;
      }

      for (const row of rows) {
        const prevHistory = Array.isArray(row.status_history) ? row.status_history : [];
        const nextHistory = [...prevHistory, historyEntry];
        const shouldAdvance = preferStatus(row.status, ev.status);
        const patch: Record<string, unknown> = {
          status_history: nextHistory,
          dlr_event: ev.dlrEvent,
          payload_excerpt: ev.rawExcerpt,
          updated_at: new Date().toISOString(),
        };
        if (shouldAdvance) {
          patch.status = ev.status;
          patch.dlr_error_code = ev.errorCode;
          patch.error_message = ev.errorMessage ?? null;
          if (ev.status === 'sent' || ev.status === 'delivered' || ev.status === 'read') {
            patch.sent_at = new Date().toISOString();
          }
        }
        const { error: updErr } = await supabaseAdmin
          .from('incident_notification_deliveries')
          .update(patch)
          .eq('id', row.id);
        results.push({
          message_id: mid,
          action: updErr ? 'update_failed' : (shouldAdvance ? 'updated' : 'history_only'),
          from: row.status,
          to: shouldAdvance ? ev.status : row.status,
          error_code: ev.errorCode,
          error: updErr?.message,
        });
      }
    }
  }

  console.log('gupshup-webhook', JSON.stringify({ event_count: events.length, results }));

  // Gupshup requires empty 2xx body ideally
  return new Response('', { status: 200, headers: corsHeaders });
});
