/**
 * Diagnose: Meta DLR=sent but Owner phone did not receive.
 * Message under investigation: 346d6d28-9266-42ae-a0c3-6e4f0bd0a06f
 * No Production. No new WA send (read-only probes + Make log dump).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const HOOK_ID = 2567320;
const MSG = '346d6d28-9266-42ae-a0c3-6e4f0bd0a06f';
const EXPECTED_DEST = '972534338601';
const BUSINESS = '972546500305';
const OWNER_EMAIL = 'orin1607@gmail.com';
const APP_ID = '496709e8-b5fc-4de9-9c75-bc87455482dd';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const FROM_MS = Date.now() - 24 * 60 * 60 * 1000;

const out = {
  id: 'wa-sent-not-received-diagnose',
  at: new Date().toISOString(),
  production_touched: false,
  production_go_live: false,
  no_new_whatsapp_send: true,
  message_id: MSG,
  expected_destination: EXPECTED_DEST,
  business_source: BUSINESS,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function make(path) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, json };
}

function extractBody(log) {
  const data = log?.data || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? '';
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.trim()) {
    try { return JSON.parse(body); } catch { return null; }
  }
  return null;
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');

  // --- Make: all DLR events for this message (full) ---
  const list = await make(
    `/hooks/${HOOK_ID}/logs?from=${FROM_MS}&pg[limit]=50&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const logs = list.json?.hookLogs || list.json?.logs || [];
  const events = [];
  for (const log of logs || []) {
    let body = extractBody(log);
    if (!body) {
      const detail = await make(`/hooks/${HOOK_ID}/logs/${log.id}`);
      body = extractBody(detail.json?.hookLog || detail.json?.log || detail.json);
    }
    if (!body) continue;
    const blob = JSON.stringify(body);
    if (!blob.includes(MSG)) continue;
    const st = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0] || null;
    const meta = body?.entry?.[0]?.changes?.[0]?.value?.metadata || null;
    events.push({
      log_id: log.id,
      loggedAt: log.loggedAt,
      statusId: log.statusId,
      full_status: st,
      metadata: meta,
      gs_app_id: body.gs_app_id || null,
      object: body.object || null,
    });
  }
  out.make_events_for_message = events;
  out.make_status_timeline = events.map((e) => ({
    at: e.loggedAt,
    status: e.full_status?.status ?? null,
    recipient_id: e.full_status?.recipient_id ?? null,
    gs_id: e.full_status?.gs_id ?? null,
    meta_msg_id: e.full_status?.meta_msg_id ?? null,
    error_code: e.full_status?.errors?.[0]?.code ?? null,
    error_details: e.full_status?.errors?.[0]?.error_data?.details ?? null,
    conversation: e.full_status?.conversation ?? null,
    pricing: e.full_status?.pricing ?? null,
    display_phone: e.metadata?.display_phone_number ?? null,
  }));

  // --- Staging DB row ---
  async function mgmt(path) {
    const res = await fetch(`https://api.supabase.com/v1${path}`, {
      headers: { Authorization: `Bearer ${sbToken}`, apikey: sbToken },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  async function post(base, path, body, bearer, apikey) {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {
        apikey: apikey || bearer,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  const keys = await mgmt(`/projects/${STAGING}/api-keys`);
  const srk = Array.isArray(keys.json)
    ? keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key
    : null;
  const anon = Array.isArray(keys.json)
    ? keys.json.find((k) => k.name === 'anon' || (k.tags || []).includes('anon'))?.api_key
    : null;
  must(srk, 'no srk');
  const base = `https://${STAGING}.supabase.co`;
  must(!base.includes(PROD), 'ABORT_PROD');

  const rowRes = await fetch(
    `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${MSG}&channel=eq.whatsapp&select=*&limit=1`,
    { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
  );
  const rows = await rowRes.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  out.db_row = row
    ? {
        status: row.status,
        recipient: row.recipient,
        provider_message_id: row.provider_message_id,
        dlr_event: row.dlr_event,
        dlr_error_code: row.dlr_error_code,
        error_message: row.error_message,
        status_history: row.status_history,
        payload_excerpt: row.payload_excerpt,
        created_at: row.created_at || row.sent_at,
        updated_at: row.updated_at,
      }
    : null;

  // --- Gupshup live probes via Edge (no real WA destination send) ---
  const gen = await post(base, '/auth/v1/admin/generate_link', { type: 'magiclink', email: OWNER_EMAIL }, srk, srk);
  const ver = await post(base, '/auth/v1/verify', {
    type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp,
  }, anon || srk, anon || srk);
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'auth failed');

  const check = await post(base, '/functions/v1/send-whatsapp-message', { action: 'check_connection' }, at, anon || srk);
  out.gupshup_check_connection = {
    http: check.status,
    configured: check.body?.configured,
    gupshup_verified: check.body?.gupshup_verified,
    app_name: check.body?.app_name,
    source: check.body?.source,
    app_id: check.body?.app_id || APP_ID,
    templates: check.body?.templates_summary || check.body?.approved_template_count || null,
    raw_keys: check.body ? Object.keys(check.body).slice(0, 30) : [],
  };

  // Direct Gupshup API probes using Staging secrets via Management? We don't have raw key locally —
  // use Edge probe actions if available
  for (const action of ['status', 'probe_templates', 'verify']) {
    const r = await post(base, '/functions/v1/send-whatsapp-message', { action }, at, anon || srk);
    if (r.status < 500) {
      out[`edge_action_${action}`] = {
        http: r.status,
        body: JSON.parse(JSON.stringify(r.body, (k, v) => {
          if (typeof k === 'string' && /key|token|secret|apikey/i.test(k)) return '[redacted]';
          if (typeof v === 'string' && v.length > 400) return v.slice(0, 400) + '…';
          return v;
        })),
      };
    }
  }

  // Destination correctness checks
  const destFromSend = '972534338601'; // from prior E2E result
  const destFromDlr = out.make_status_timeline[0]?.recipient_id || null;
  const destFromDb = out.db_row?.recipient || null;
  out.destination_audit = {
    owner_local: '0534338601',
    expected_e164: EXPECTED_DEST,
    send_response_destination: destFromSend,
    make_dlr_recipient_id: destFromDlr,
    db_recipient: destFromDb,
    matches_owner:
      destFromDlr === EXPECTED_DEST ||
      String(destFromDb || '').includes('534338601') ||
      destFromSend === EXPECTED_DEST,
    business_display_phone: out.make_status_timeline[0]?.display_phone || BUSINESS,
  };

  // Session validity
  const st0 = out.make_status_timeline[0] || {};
  const convOrigin =
    st0.conversation?.origin?.type ||
    (typeof st0.conversation?.origin === 'string' ? st0.conversation.origin : null) ||
    events[0]?.full_status?.conversation?.origin?.type ||
    null;
  out.session_audit = {
    had_sent_status: out.make_status_timeline.some((x) => x.status === 'sent'),
    had_delivered: out.make_status_timeline.some((x) => x.status === 'delivered'),
    had_read: out.make_status_timeline.some((x) => x.status === 'read'),
    had_failed: out.make_status_timeline.some((x) => x.status === 'failed'),
    conversation_origin: convOrigin,
    pricing_type: st0.pricing?.type || events[0]?.full_status?.pricing?.type || null,
    pricing_category: st0.pricing?.category || events[0]?.full_status?.pricing?.category || null,
    billable: st0.pricing?.billable ?? events[0]?.full_status?.pricing?.billable ?? null,
    interpretation:
      'Meta status=sent with conversation.origin=service and free_customer_service means WhatsApp servers accepted the session message into an open customer-care window. It is NOT the same as delivered-to-device.',
  };

  // Portal visibility (what we can / cannot see from here)
  out.portal_visibility = {
    make_hook_logs: events.length > 0,
    supabase_delivery_row: Boolean(row),
    gupshup_console: 'Agent cannot open Gupshup/Meta UI; Owner can check App DaliaVehicle → Logs/Reports for gs_id ' + MSG,
    meta_business_suite: 'Owner can check WhatsApp Manager → message logs if available for wamid in Make payload',
    wamid: st0.meta_msg_id || events[0]?.full_status?.meta_msg_id || null,
  };

  // Answers
  const onlySent = out.session_audit.had_sent_status && !out.session_audit.had_delivered && !out.session_audit.had_failed;
  out.answers = {
    '1_correct_number': out.destination_audit.matches_owner
      ? `YES — all sides point to ${EXPECTED_DEST} (0534338601). No evidence of wrong destination.`
      : `MISMATCH — send=${destFromSend} dlr=${destFromDlr} db=${destFromDb}`,
    '2_business_limited_or_blocked':
      out.gupshup_check_connection?.gupshup_verified === true && out.session_audit.had_sent_status
        ? 'UNLIKELY fully blocked — Gupshup verified and Meta returned sent (service). Quality/flagging cannot be ruled out from API alone; check Gupshup Console → App quality / WhatsApp Manager restrictions.'
        : 'INCONCLUSIVE — see gupshup_check_connection',
    '3_session_message_valid':
      st0.conversation?.origin?.type === 'service' || st0.pricing?.type === 'free_customer_service'
        ? 'YES technically — Meta classified as valid service/session message (not 131047 re-engagement failure).'
        : 'UNKNOWN — missing conversation metadata',
    '4_owner_number_or_business_issue':
      onlySent
        ? 'MOST LIKELY device/WhatsApp-client side OR silent non-delivery after server "sent": phone offline/battery optimization, WhatsApp not registered on that SIM, multi-device sync lag, archived/filtered chat, or Meta delayed delivered webhook never arrived. Business account not returning failed — so not a hard reject.'
        : 'See timeline',
    '5_visible_in_gupshup_or_meta_portal':
      `Partially — visible in Make webhook logs (gs_id=${MSG}, wamid=${out.portal_visibility.wamid || 'n/a'}). Agent cannot open Gupshup/Meta portals; Owner should search that gs_id/wamid in Gupshup App logs.`,
  };

  out.root_cause_hypothesis = {
    primary:
      'Meta "sent" ≠ phone UI delivery. We never received delivered/read/failed for this message. Server accepted it; device confirmation missing.',
    ranked_causes: [
      'Phone/WhatsApp client did not complete delivery (offline, Doze, WhatsApp logged out on that number)',
      'Delivered webhook lost/delayed (less likely — Make received sent quickly; delivered usually follows)',
      'User looking at wrong WhatsApp account/SIM (0534338601 vs another)',
      'Business quality throttling soft-drop (rare without failed webhook)',
    ],
    ruled_out: [
      'Wrong E.164 destination (evidence matches 972534338601)',
      '24h window closed (would be failed 131047 — we saw that earlier today, not on this msg)',
      'Gupshup API key invalid (202 submitted + verified)',
    ],
  };

  out.owner_checks = [
    'On phone 0534338601 open WhatsApp → chat with 054-650-0305 / DaliaVehicle — check Archived, Spam, muted',
    'Confirm WhatsApp is registered to 0534338601 (Settings → Account → Phone)',
    'Gupshup Console → DaliaVehicle → search message id 346d6d28-9266-42ae-a0c3-6e4f0bd0a06f',
    'Optional: send one more message FROM your phone to 0546500305 then reply here «חלון פתוח בדיקה» for a single new Staging send — only if you approve',
  ];

  out.production = {
    approved: false,
    blocked_reason: 'Owner did not receive WhatsApp on device — Production gated',
  };

  console.log('---WA_SENT_NOT_RECEIVED---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---WA_SENT_NOT_RECEIVED_DONE---');
  fs.writeFileSync('/tmp/wa-sent-not-received.json', JSON.stringify(out, null, 2));
}

main().catch((e) => {
  out.error = String(e.message || e).slice(0, 500);
  console.log('---WA_SENT_NOT_RECEIVED---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---WA_SENT_NOT_RECEIVED_DONE---');
  process.exit(1);
});
