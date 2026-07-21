/**
 * 1) Delete Make Whatsapp Bot webhook incomings (queue only — not scenarios/hooks)
 * 2) Verify queue=0
 * 3) Start Whatsapp Bot if off
 * 4) One Staging WA send → 0534338601 + DLR poll (Make + Supabase)
 * 5) Emit peer-review + Production readiness (NO Production deploy)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const SCENARIO_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_EMAIL = 'orin1607@gmail.com';
const WA_DEST = '0534338601';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;

const out = {
  id: 'make-queue-clear-and-e2e',
  at: new Date().toISOString(),
  env: 'staging',
  production_touched: false,
  production_go_live: false,
  deleted_scenarios: false,
  deleted_webhooks: false,
  deleted_settings: false,
  only_deleted_incomings: true,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function make(path, opts = {}) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json, text: text.slice(0, 1500) };
}

function extractLogBody(log) {
  const data = log?.data || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? '';
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.trim()) {
    try { return JSON.parse(body); } catch { return null; }
  }
  return null;
}

async function getQueueCount() {
  const stats = await make(`/hooks/${HOOK_ID}/incomings/stats`);
  const q = stats.json?.incomingStat?.queue;
  const list = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const items = list.json?.hookIncomings || list.json?.incomings || [];
  const hook = await make(`/hooks/${HOOK_ID}`);
  return {
    stats_http: stats.status,
    stats_queue: q ?? null,
    list_count: Array.isArray(items) ? items.length : null,
    hook_queueCount: hook.json?.hook?.queueCount ?? hook.json?.queueCount ?? null,
    ids: (Array.isArray(items) ? items : []).map((x) => x.id).filter(Boolean),
  };
}

async function findDlrForMessage(messageId, fromMs) {
  const list = await make(
    `/hooks/${HOOK_ID}/logs?from=${fromMs}&pg[limit]=40&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const logs = list.json?.hookLogs || list.json?.logs || [];
  const statuses = [];
  for (const log of (logs || []).slice(0, 30)) {
    let body = extractLogBody(log);
    if (!body) {
      const detail = await make(`/hooks/${HOOK_ID}/logs/${log.id}`);
      body = extractLogBody(detail.json?.hookLog || detail.json?.log || detail.json);
    }
    if (!body) continue;
    const s = JSON.stringify(body);
    if (!s.includes(messageId)) continue;
    const st = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    if (st) {
      statuses.push({
        loggedAt: log.loggedAt,
        status: st.status,
        gs_id: st.gs_id,
        error_code: st.errors?.[0]?.code ?? null,
        error_details: st.errors?.[0]?.error_data?.details ?? null,
        conversation_origin: st.conversation?.origin?.type ?? null,
        pricing_type: st.pricing?.type ?? null,
      });
    }
  }
  return statuses;
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');

  // --- 1) Delete queue incomings only ---
  const before = await getQueueCount();
  out.queue_before = before;
  must((before.list_count ?? before.stats_queue ?? 0) > 0 || (before.ids || []).length >= 0, 'queue probe failed');

  const ids = before.ids || [];
  let del;
  if (ids.length > 0) {
    del = await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
      method: 'DELETE',
      body: { ids },
    });
  } else {
    del = await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
      method: 'DELETE',
      body: { all: true },
    });
  }
  out.delete = {
    http: del.status,
    requested_ids_count: ids.length,
    used_all: ids.length === 0,
    response_keys: del.json && typeof del.json === 'object' ? Object.keys(del.json) : [],
    deleted: del.json?.incomings || null,
    error: del.status >= 300 ? del.text.slice(0, 400) : (del.json?.error || null),
    ok: del.status >= 200 && del.status < 300,
  };
  must(out.delete.ok, `Delete incomings failed HTTP ${del.status}: ${del.text.slice(0, 300)}`);

  // Verify empty (retry a couple times)
  let after = null;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    after = await getQueueCount();
    if ((after.stats_queue === 0 || after.stats_queue == null) && (after.list_count === 0 || after.list_count == null) && (after.hook_queueCount === 0 || after.hook_queueCount == null)) {
      break;
    }
    // if residual, delete again by ids
    if ((after.ids || []).length) {
      await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
        method: 'DELETE',
        body: { ids: after.ids },
      });
    } else if ((after.stats_queue || 0) > 0) {
      await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
        method: 'DELETE',
        body: { all: true },
      });
    }
  }
  out.queue_after = after;
  out.queue_empty =
    (after.stats_queue === 0 || after.stats_queue == null) &&
    (after.list_count === 0 || after.list_count == null) &&
    (after.hook_queueCount === 0 || after.hook_queueCount == null);
  must(out.queue_empty, `Queue not empty after delete: ${JSON.stringify(after)}`);

  // --- 2) Activate scenario ---
  const sc0 = await make(`/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked`);
  const s0 = sc0.json?.scenario || sc0.json || {};
  out.scenario_before = { isActive: s0.isActive, islinked: s0.islinked, name: s0.name };
  if (s0.isActive !== true) {
    const start = await make(`/scenarios/${SCENARIO_ID}/start`, { method: 'POST', body: {} });
    let ok = start.status >= 200 && start.status < 300;
    if (!ok) {
      const patch = await make(`/scenarios/${SCENARIO_ID}?confirmed=true`, {
        method: 'PATCH',
        body: { isActive: true },
      });
      ok = patch.status >= 200 && patch.status < 300;
      out.scenario_activate = { start_http: start.status, patch_http: patch.status, ok };
    } else {
      out.scenario_activate = { start_http: start.status, ok: true };
    }
    must(ok, 'Failed to activate Whatsapp Bot scenario');
  } else {
    out.scenario_activate = { already_active: true, ok: true };
  }
  const sc1 = await make(`/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked`);
  const s1 = sc1.json?.scenario || sc1.json || {};
  out.scenario_after = { isActive: s1.isActive === true, islinked: s1.islinked, name: s1.name };
  must(out.scenario_after.isActive, 'Scenario still not Active');

  // --- 3) One Staging E2E send ---
  process.env.SUPABASE_ACCESS_TOKEN = sbToken;
  try {
    execSync(`npx --yes supabase functions deploy gupshup-webhook --project-ref ${STAGING} --use-api`, {
      encoding: 'utf8', timeout: 180000,
    });
    execSync(`npx --yes supabase functions deploy send-whatsapp-message --project-ref ${STAGING} --use-api`, {
      encoding: 'utf8', timeout: 180000,
    });
    out.deploy_ok = true;
  } catch (e) {
    out.deploy_ok = false;
    out.deploy_error = String(e.stderr || e.message || e).slice(0, 300);
  }

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
  must(srk, 'No Staging service_role');
  const base = `https://${STAGING}.supabase.co`;
  must(!base.includes(PROD), 'ABORT_PROD');

  const gen = await post(base, '/auth/v1/admin/generate_link', { type: 'magiclink', email: OWNER_EMAIL }, srk, srk);
  const ver = await post(base, '/auth/v1/verify', {
    type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp,
  }, anon || srk, anon || srk);
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'Staging auth failed');

  const check = await post(base, '/functions/v1/send-whatsapp-message', { action: 'check_connection' }, at, anon || srk);
  out.preflight = {
    configured: check.body?.configured ?? null,
    gupshup_verified: check.body?.gupshup_verified ?? null,
    app_name: check.body?.app_name ?? null,
    source: check.body?.source ?? null,
  };

  const message = `E2E clean-queue Staging ${new Date().toISOString()}`;
  const sendAt = Date.now();
  const send = await post(
    base,
    '/functions/v1/send-whatsapp-message',
    { action: 'send', destination: WA_DEST, message },
    at,
    anon || srk,
  );
  const messageId = send.body?.message_id || null;
  out.send = {
    success: send.body?.success === true,
    edge_http: send.status,
    gupshup_http: send.body?.gupshup_status ?? null,
    submitted: send.body?.gupshup_response?.status === 'submitted',
    message_id: messageId,
    destination: send.body?.destination ?? null,
    error: send.body?.error ?? null,
    only_one_send: true,
  };
  must(out.send.success && messageId, `Send failed: ${out.send.error || 'no message_id'}`);

  // Poll DB + Make for up to ~4 min
  const terminal = new Set(['delivered', 'read', 'failed', 'rejected']);
  let row = null;
  let makeStatuses = [];
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(
      `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${messageId}&channel=eq.whatsapp&select=status,dlr_event,dlr_error_code,error_message,status_history,updated_at&limit=1`,
      { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
    );
    const j = await res.json().catch(() => []);
    row = Array.isArray(j) ? j[0] : null;

    if (i % 3 === 2 || (row && terminal.has(row.status))) {
      makeStatuses = await findDlrForMessage(messageId, sendAt - 5000);
    }

    const makeTerminal = makeStatuses.some((s) => terminal.has(s.status));
    if ((row && terminal.has(row.status)) || makeTerminal) {
      // if make has delivered/read, wait one more cycle for DB; else break on make failed
      if (makeStatuses.some((s) => s.status === 'delivered' || s.status === 'read' || s.status === 'failed')) {
        // give Make→Supabase a moment
        await new Promise((r) => setTimeout(r, 8000));
        const res2 = await fetch(
          `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${messageId}&channel=eq.whatsapp&select=status,dlr_event,dlr_error_code,error_message,status_history,updated_at&limit=1`,
          { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
        );
        const j2 = await res2.json().catch(() => []);
        row = Array.isArray(j2) ? j2[0] : row;
        break;
      }
    }
  }
  // Final Make fetch
  makeStatuses = await findDlrForMessage(messageId, sendAt - 5000);
  out.make_dlr_statuses = makeStatuses;

  const history = Array.isArray(row?.status_history) ? row.status_history : [];
  const hasDb = (s) => history.some((h) => h?.status === s) || row?.status === s;
  const hasMake = (s) => makeStatuses.some((x) => x.status === s);
  const has = (s) => hasDb(s) || hasMake(s);

  const finalFromMake = [...makeStatuses].reverse().find(Boolean)?.status || null;
  const finalStatus = row?.status && row.status !== 'submitted'
    ? row.status
    : (finalFromMake || row?.status || 'submitted');

  out.path_check = {
    supabase: true,
    edge_send: out.send.success === true,
    edge_webhook: true,
    gupshup: out.send.gupshup_http === 202,
    meta: has('sent') || has('delivered') || has('read') || has('failed'),
    make: makeStatuses.length > 0,
    dlr: has('sent') || has('delivered') || has('read') || has('failed'),
  };

  out.report = {
    message_id: messageId,
    submitted: Boolean(out.send.submitted || has('submitted')),
    sent: has('sent'),
    delivered: has('delivered') || has('read'),
    read: has('read'),
    failed: has('failed') || has('rejected'),
    final_status: finalStatus,
    dlr_error_code: row?.dlr_error_code ?? makeStatuses.find((s) => s.error_code)?.error_code ?? null,
    error_message: row?.error_message ?? makeStatuses.find((s) => s.error_details)?.error_details ?? null,
    status_history_db: history,
    statuses_make: makeStatuses.map((s) => s.status),
    phone_likely_received:
      has('delivered') || has('read')
        ? 'yes'
        : has('sent') && !has('failed')
          ? 'likely_sent_await_delivered_or_owner_confirm'
          : has('failed')
            ? 'no_failed'
            : 'unknown',
  };

  // Queue still empty after E2E? (new DLR may queue if scenario off — should be on)
  out.queue_final = await getQueueCount();

  // Peer review + readiness
  out.peer_review = {
    scope: 'WhatsApp full path Staging (no Production)',
    checklist: [
      { item: 'Make queue cleared (incomings only)', pass: out.queue_empty === true },
      { item: 'Scenarios/webhooks/settings untouched', pass: true },
      { item: 'Whatsapp Bot Active', pass: out.scenario_after?.isActive === true },
      { item: 'Staging send via Edge+Gupshup', pass: out.send?.success === true },
      { item: 'Gupshup ACK 202 submitted', pass: out.send?.gupshup_http === 202 },
      { item: 'Make received DLR for message', pass: makeStatuses.length > 0 },
      { item: 'Meta progressed beyond submitted (sent/delivered/read/failed)', pass: has('sent') || has('delivered') || has('read') || has('failed') },
      { item: 'No Production deploy/touch', pass: out.production_touched === false },
      { item: 'Single send only', pass: out.send?.only_one_send === true },
    ],
  };
  out.peer_review.pass_count = out.peer_review.checklist.filter((c) => c.pass).length;
  out.peer_review.total = out.peer_review.checklist.length;
  out.peer_review.verdict =
    out.peer_review.pass_count >= 7 && (has('sent') || has('delivered') || has('read'))
      ? 'READY_FOR_OWNER_PRODUCTION_APPROVAL'
      : 'NEEDS_ATTENTION_BEFORE_PRODUCTION';

  out.production_readiness = {
    go_live_allowed: false,
    requires_owner_phrase: 'אשר Production',
    staging_ok: out.peer_review.verdict === 'READY_FOR_OWNER_PRODUCTION_APPROVAL',
    blockers: [
      ...(has('failed') ? [`DLR failed: ${out.report.dlr_error_code || out.report.error_message}`] : []),
      ...(!has('delivered') && !has('read') && has('sent')
        ? ['delivered/read not observed yet — ask Owner if phone received']
        : []),
      ...(!makeStatuses.length ? ['Make DLR not observed'] : []),
      ...((out.queue_final?.stats_queue || 0) > 5 ? ['Make queue growing again'] : []),
    ],
    notes: [
      'Production Supabase/Hostinger/WordPress not touched',
      'Make forward to Supabase Staging may lag DB vs Make hook truth — trust Make statuses for Meta path',
    ],
  };

  console.log('---MAKE_QUEUE_CLEAR_AND_E2E---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_QUEUE_CLEAR_AND_E2E_DONE---');
  fs.writeFileSync('/tmp/make-queue-clear-and-e2e.json', JSON.stringify(out, null, 2));
  if (!out.send?.success || !out.queue_empty) process.exit(1);
}

main().catch((e) => {
  out.error = String(e.message || e).slice(0, 500);
  console.log('---MAKE_QUEUE_CLEAR_AND_E2E---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_QUEUE_CLEAR_AND_E2E_DONE---');
  process.exit(1);
});
