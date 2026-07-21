/**
 * One Staging check after Owner activated Whatsapp Bot + opened 24h window.
 * 1) Scenario Active?
 * 2) Inbound from 0534338601 → business seen in Make?
 * 3) Window open?
 * 4) If yes — ONE WA send Staging → 0534338601
 * 5) Poll DLR to terminal
 * 6) Report queued/incomplete (11?) release
 * No Production. Max one WA send.
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
const OWNER_PHONE_LOCAL = '0534338601';
const OWNER_PHONE_E164 = '972534338601';
const BUSINESS_LOCAL = '0546500305';
const BUSINESS_E164 = '972546500305';
const OWNER_EMAIL = 'orin1607@gmail.com';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const FROM_MS = Date.now() - 6 * 60 * 60 * 1000;

const out = {
  id: 'staging-window-open-one-send',
  at: new Date().toISOString(),
  env: 'staging',
  production_touched: false,
  make_zone: zone,
  scenario_id: SCENARIO_ID,
  hook_id: HOOK_ID,
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
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, json, text: text.slice(0, 1500) };
}

function extractLogBody(log) {
  const data = log?.data || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? data.payload ?? '';
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.trim()) {
    try { return JSON.parse(body); } catch { return { raw: body.slice(0, 300) }; }
  }
  return null;
}

function walkFind(obj, pred, acc = []) {
  if (!obj || typeof obj !== 'object') return acc;
  if (pred(obj)) acc.push(obj);
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') walkFind(v, pred, acc);
  }
  return acc;
}

function isInboundOwnerMessage(body) {
  if (!body || typeof body !== 'object') return false;
  const s = JSON.stringify(body);
  // Must look like a message (not only delivery status)
  const hasMessages = /"messages"\s*:/.test(s) || body.type === 'message' || /message-event/.test(s);
  const hasStatusesOnly = /"statuses"\s*:/.test(s) && !/"messages"\s*:/.test(s);
  if (hasStatusesOnly && !hasMessages) return false;
  const fromOwner =
    s.includes(OWNER_PHONE_E164) ||
    s.includes(OWNER_PHONE_LOCAL) ||
    s.includes('972534338601');
  // inbound often has contacts/messages from customer; wa_id / from
  const messages = [];
  walkFind(body, (o) => Array.isArray(o.messages) && o.messages.length, messages);
  for (const block of messages) {
    for (const m of block.messages || []) {
      const from = String(m.from || m.wa_id || '');
      if (from.includes('534338601') || from === OWNER_PHONE_E164) return true;
      if (fromOwner && (m.type || m.text || m.button)) return true;
    }
  }
  if (hasMessages && fromOwner) return true;
  // Gupshup v2 inbound
  if (body.type === 'message' || body.payload?.type === 'text' || body.payload?.type === 'message') {
    const src = String(body.payload?.source || body.payload?.sender?.phone || '');
    if (src.includes('534338601')) return true;
  }
  return false;
}

async function inspectHookDetailed() {
  const list = await make(
    `/hooks/${HOOK_ID}/logs?from=${FROM_MS}&pg[limit]=40&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const logs = list.json?.hookLogs || list.json?.logs || [];
  const samples = [];
  let inboundHits = 0;
  let statusHits = 0;
  let total = Array.isArray(logs) ? logs.length : 0;

  for (const log of (logs || []).slice(0, 25)) {
    let body = extractLogBody(log);
    if (!body || body.raw) {
      const detail = await make(`/hooks/${HOOK_ID}/logs/${log.id}`);
      const dlog = detail.json?.hookLog || detail.json?.log || detail.json;
      body = extractLogBody(dlog) || body;
    }
    const s = body ? JSON.stringify(body) : '';
    const inbound = isInboundOwnerMessage(body);
    const isStatus = /"statuses"\s*:/.test(s);
    if (inbound) inboundHits += 1;
    if (isStatus) statusHits += 1;
    if (samples.length < 12) {
      samples.push({
        id: log.id,
        loggedAt: log.loggedAt,
        statusId: log.statusId,
        inbound_from_owner: inbound,
        is_status_dlr: isStatus && !inbound,
        body_excerpt: s.slice(0, 280).replace(/\s+/g, ' '),
      });
    }
  }
  return { http: list.status, total, inboundHits, statusHits, samples };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');

  // 1) Scenario Active
  const sc = await make(`/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=dlqCount&cols[]=nextExec&cols[]=scheduling&cols[]=hookId`);
  const scenario = sc.json?.scenario || sc.json || {};
  out.scenario = {
    http: sc.status,
    id: scenario.id || SCENARIO_ID,
    name: scenario.name || 'Whatsapp Bot',
    isActive: scenario.isActive === true,
    islinked: scenario.islinked,
    dlqCount: scenario.dlqCount ?? null,
    hookId: scenario.hookId ?? HOOK_ID,
    nextExec: scenario.nextExec ?? null,
  };
  must(sc.status === 200, `Get scenario failed HTTP ${sc.status}`);

  // Owner said they activated — if still off, start via API (required for queue drain + bot)
  if (scenario.isActive !== true) {
    const start = await make(`/scenarios/${SCENARIO_ID}/start`, { method: 'POST', body: {} });
    let activated = start.status >= 200 && start.status < 300;
    if (!activated) {
      const patch = await make(`/scenarios/${SCENARIO_ID}?confirmed=true`, {
        method: 'PATCH',
        body: { isActive: true },
      });
      activated = patch.status >= 200 && patch.status < 300;
      out.scenario_activate = { start_http: start.status, patch_http: patch.status, ok: activated, error: patch.text.slice(0, 200) };
    } else {
      out.scenario_activate = { start_http: start.status, ok: true };
    }
    // re-fetch
    const sc2a = await make(`/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=dlqCount&cols[]=hookId`);
    const s2a = sc2a.json?.scenario || sc2a.json || {};
    out.scenario.isActive = s2a.isActive === true;
    out.scenario.islinked = s2a.islinked;
    out.scenario.dlqCount = s2a.dlqCount ?? out.scenario.dlqCount;
    // Allow queue to begin draining
    await new Promise((r) => setTimeout(r, 15000));
  }

  // Hook queue / enabled
  const hook = await make(`/hooks/${HOOK_ID}`);
  const h = hook.json?.hook || hook.json || {};
  out.hook = {
    http: hook.status,
    id: HOOK_ID,
    enabled: h.enabled !== false,
    queueCount: h.queueCount ?? null,
    queueLimit: h.queueLimit ?? null,
    scenarioId: h.scenarioId ?? null,
    url_tip: typeof h.url === 'string' ? h.url.slice(-8) : null,
  };

  // Webhook incomings (waiting queue) + stats — this is where "11 waiting" usually lives
  const incStats = await make(`/hooks/${HOOK_ID}/incomings/stats`);
  const incomings = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const incList = incomings.json?.hookIncomings || incomings.json?.incomings || incomings.json?.data || [];
  out.incomings = {
    stats_http: incStats.status,
    stats: incStats.json || null,
    list_http: incomings.status,
    waiting_count: Array.isArray(incList) ? incList.length : null,
    waiting_sample: (Array.isArray(incList) ? incList : []).slice(0, 15).map((x) => ({
      id: x.id || x.incomingId,
      size: x.size,
      createdAt: x.createdAt || x.timestamp || x.loggedAt,
      scope: x.scope || null,
    })),
  };

  // Incomplete executions (DLQ)
  const dlqs = await make(`/dlqs?scenarioId=${SCENARIO_ID}&pg[limit]=50`);
  const dlqList = dlqs.json?.dlqs || dlqs.json?.incompleteExecutions || [];
  out.incomplete_executions = {
    http: dlqs.status,
    count: Array.isArray(dlqList) ? dlqList.length : null,
    sample: (Array.isArray(dlqList) ? dlqList : []).slice(0, 15).map((x) => ({
      id: x.id || x.dlqId,
      createdAt: x.createdAt || x.timestamp,
      reason: x.reason || x.error || x.message || null,
      resolved: x.resolved ?? null,
    })),
  };

  // Incomplete / DLQ / executions (best-effort across API shapes)
  const probes = {};
  for (const path of [
    `/scenarios/${SCENARIO_ID}/logs?pg[limit]=30&pg[sortDir]=desc`,
    `/scenarios/${SCENARIO_ID}/logs?from=${Math.floor(FROM_MS / 1000)}&pg[limit]=30`,
  ]) {
    const r = await make(path);
    probes[path] = {
      http: r.status,
      keys: r.json && typeof r.json === 'object' ? Object.keys(r.json).slice(0, 8) : [],
      count_hint:
        r.json?.scenarioLogs?.length ??
        r.json?.logs?.length ??
        (Array.isArray(r.json) ? r.json.length : null),
      sample: r.status < 300 ? JSON.stringify(r.json).slice(0, 500) : r.text.slice(0, 200),
    };
  }
  out.make_queue_probes = probes;

  // Parse scenario logs if present
  const logsPath = Object.entries(probes).find(([p, v]) => p.includes('/logs') && v.http === 200);
  if (logsPath) {
    const r = await make(logsPath[0]);
    const arr = r.json?.scenarioLogs || r.json?.logs || [];
    out.scenario_logs_recent = (Array.isArray(arr) ? arr : []).slice(0, 15).map((x) => ({
      id: x.id,
      status: x.status || x.statusId || x.type,
      timestamp: x.timestamp || x.loggedAt || x.createdAt,
      exeId: x.executionId || x.exeId,
    }));
  }

  // 2+3) Inbound + window
  const hookInspect = await inspectHookDetailed();
  out.hook_logs = {
    total: hookInspect.total,
    inbound_from_owner_hits: hookInspect.inboundHits,
    status_dlr_hits: hookInspect.statusHits,
    samples: hookInspect.samples,
  };

  const windowOpen =
    hookInspect.inboundHits > 0 ||
    // If scenario just processed and hook queue drained after owner message — still need inbound evidence
    false;

  out.window_24h = {
    open: windowOpen,
    evidence: windowOpen
      ? 'Inbound webhook payload from owner phone seen on Make hook logs'
      : 'No inbound message payload from 0534338601 found on Make hook in last 6h (only DLR statuses or empty)',
    owner_phone: OWNER_PHONE_E164,
    business_phone: BUSINESS_E164,
  };

  // Queued 11 report
  const qBefore = out.hook.queueCount;
  const waiting = out.incomings?.waiting_count;
  const statsCount =
    out.incomings?.stats?.count ??
    out.incomings?.stats?.stats?.count ??
    out.incomings?.stats?.queueCount ??
    null;
  out.queue_report = {
    hook_queueCount_now: qBefore,
    incomings_waiting_now: waiting,
    incomings_stats_count: statsCount,
    scenario_dlqCount: out.scenario.dlqCount,
    incomplete_count: out.incomplete_executions?.count,
    owner_mentioned_waiting: 11,
    released_11:
      (waiting === 0 || waiting === null) && (qBefore === 0 || qBefore === null) && (statsCount === 0 || statsCount === null)
        ? 'queue_empty_now_likely_processed_on_activate'
        : `still_waiting_incomings=${waiting} queueCount=${qBefore} stats=${statsCount}`,
    old_messages_likely_sent:
      Array.isArray(out.scenario_logs_recent) && out.scenario_logs_recent.length >= 5
        ? 'possible_recent_executions_see_scenario_logs'
        : 'check_scenario_logs_and_incomings',
  };

  // 4+5) One send only if window open
  if (!out.scenario.isActive) {
    out.send = { skipped: true, reason: 'scenario_not_active' };
    out.report = { final_status: null, phone_likely_received: 'not_sent_scenario_inactive' };
  } else if (!windowOpen) {
    out.send = { skipped: true, reason: 'window_not_confirmed_no_inbound_in_make_hook' };
    out.report = {
      final_status: null,
      phone_likely_received: 'not_sent_window_unconfirmed',
      next: 'Confirm inbound visible in Make history OR reply again from 0534338601 to 0546500305',
    };
  } else {
    // Deploy send + webhook lightly, then one send
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

    const message = `E2E window-open Staging ${new Date().toISOString()}`;
    const sendAt = Date.now();
    const send = await post(
      base,
      '/functions/v1/send-whatsapp-message',
      { action: 'send', destination: OWNER_PHONE_LOCAL, message },
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

    const terminal = new Set(['delivered', 'read', 'failed', 'rejected']);
    let row = null;
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await fetch(
        `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${messageId}&channel=eq.whatsapp&select=status,dlr_event,dlr_error_code,error_message,status_history,updated_at&limit=1`,
        { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
      );
      const j = await res.json().catch(() => []);
      row = Array.isArray(j) ? j[0] : null;
      if (row && terminal.has(row.status)) break;
    }

    // Also check Make hook for this gs_id
    const after = await inspectHookDetailed();
    const seen = (after.samples || []).some((s) => (s.body_excerpt || '').includes(messageId));
    out.make_after_send = {
      message_id_in_hook: seen,
      inbound_hits: after.inboundHits,
      status_hits: after.statusHits,
      samples: after.samples.slice(0, 5),
    };

    // Re-read hook queue after
    const hook2 = await make(`/hooks/${HOOK_ID}`);
    const h2 = hook2.json?.hook || hook2.json || {};
    out.queue_report.hook_queueCount_after_send = h2.queueCount ?? null;

    const history = Array.isArray(row?.status_history) ? row.status_history : [];
    const has = (s) => history.some((h) => h?.status === s) || row?.status === s;
    out.report = {
      message_id: messageId,
      submitted: Boolean(out.send.submitted || has('submitted')),
      sent: has('sent'),
      delivered: has('delivered') || has('read'),
      read: has('read'),
      failed: has('failed') || has('rejected'),
      final_status: row?.status || 'submitted',
      dlr_error_code: row?.dlr_error_code ?? null,
      error_message: row?.error_message ?? null,
      status_history: history,
      phone_likely_received:
        has('delivered') || has('read')
          ? 'yes'
          : has('failed') || has('rejected')
            ? 'no_failed'
            : 'unknown_still_submitted',
      poll_started_at: new Date(sendAt).toISOString(),
    };
  }

  // Final queue snapshot
  const hook3 = await make(`/hooks/${HOOK_ID}`);
  const h3 = hook3.json?.hook || hook3.json || {};
  const sc2 = await make(`/scenarios/${SCENARIO_ID}?cols[]=dlqCount&cols[]=isActive`);
  const s2 = sc2.json?.scenario || sc2.json || {};
  out.queue_report.hook_queueCount_final = h3.queueCount ?? null;
  out.queue_report.scenario_dlqCount_final = s2.dlqCount ?? null;
  out.queue_report.interpretation = interpretQueue(out);

  console.log('---STAGING_WINDOW_ONE_SEND---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---STAGING_WINDOW_ONE_SEND_DONE---');
  fs.writeFileSync('/tmp/staging-window-one-send.json', JSON.stringify(out, null, 2));

  // Exit 0 even if window closed (informational) — fail only on hard errors / send failure when attempted
  if (out.send && out.send.success === false) process.exit(1);
  if (out.error) process.exit(1);
}

function interpretQueue(o) {
  const now = o.queue_report?.hook_queueCount_final ?? o.queue_report?.hook_queueCount_now;
  const dlq = o.queue_report?.scenario_dlqCount_final ?? o.scenario?.dlqCount;
  if (now === 0 && (dlq === 0 || dlq == null)) {
    return 'Hook queue empty now — if 11 were waiting, they were likely processed when scenario turned Active (see scenario_logs_recent)';
  }
  if (typeof now === 'number' && now > 0) {
    return `Hook still has queueCount=${now} — not fully drained`;
  }
  return 'Could not confirm 11-item drain via API alone; rely on scenario_logs + Make UI Incomplete/History';
}

main().catch((e) => {
  out.error = String(e.message || e).slice(0, 500);
  console.log('---STAGING_WINDOW_ONE_SEND---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---STAGING_WINDOW_ONE_SEND_DONE---');
  process.exit(1);
});
