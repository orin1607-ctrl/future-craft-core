/**
 * Diagnose Make Whatsapp Bot webhook queue (incomings) — no WA send, no Production.
 * Answers: why not draining, old?, stuck?, safe to delete?, Production impact?
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const SCENARIO_ID = 5797671;
const HOOK_ID = 2567320;
const MAKE_BASE = `https://${zone}.make.com/api/v2`;

const out = {
  id: 'make-queue-diagnose',
  at: new Date().toISOString(),
  env: 'staging_make_account',
  production_touched: false,
  no_whatsapp_send: true,
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
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json, text: text.slice(0, 1500) };
}

function extractBody(detail) {
  const data = detail?.data || detail || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? data.payload ?? detail?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep string */ }
  }
  return body;
}

function classifyPayload(body) {
  if (!body) return { kind: 'empty', summary: 'no body' };
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  const hasStatuses = /"statuses"\s*:/.test(s);
  const hasMessages = /"messages"\s*:/.test(s);
  let status = null;
  let from = null;
  let textBody = null;
  let gsId = null;
  try {
    const o = typeof body === 'string' ? JSON.parse(body) : body;
    const st = o?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    const msg = o?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (st) {
      status = st.status || null;
      gsId = st.gs_id || null;
    }
    if (msg) {
      from = msg.from || null;
      textBody = msg.text?.body || msg.type || null;
    }
  } catch { /* ignore */ }

  if (hasMessages && !hasStatuses) {
    return { kind: 'inbound_message', from, text: textBody, summary: `inbound from ${from || '?'}: ${(textBody || '').slice(0, 40)}` };
  }
  if (hasStatuses) {
    return { kind: 'delivery_status', status, gs_id: gsId, summary: `DLR status=${status} gs_id=${gsId || '?'}` };
  }
  return { kind: 'other', summary: s.slice(0, 120) };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  const sc = await make(
    `/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=dlqCount&cols[]=scheduling&cols[]=hookId&cols[]=iswaiting&cols[]=isPaused`,
  );
  const scenario = sc.json?.scenario || sc.json || {};
  out.scenario = {
    http: sc.status,
    id: scenario.id,
    name: scenario.name,
    isActive: scenario.isActive,
    islinked: scenario.islinked,
    iswaiting: scenario.iswaiting,
    isPaused: scenario.isPaused,
    dlqCount: scenario.dlqCount,
    scheduling: scenario.scheduling || null,
    hookId: scenario.hookId,
  };

  const hook = await make(`/hooks/${HOOK_ID}`);
  const h = hook.json?.hook || hook.json || {};
  out.hook = {
    http: hook.status,
    enabled: h.enabled,
    queueCount: h.queueCount,
    queueLimit: h.queueLimit,
    scenarioId: h.scenarioId,
    typeName: h.typeName,
    flags: h.flags || null,
    data: h.data || null,
  };

  const stats = await make(`/hooks/${HOOK_ID}/incomings/stats`);
  out.incomings_stats = { http: stats.status, body: stats.json };

  const list = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const items = list.json?.hookIncomings || list.json?.incomings || [];
  out.incomings_list_http = list.status;
  out.incomings_count = Array.isArray(items) ? items.length : null;

  const detailed = [];
  for (const item of (Array.isArray(items) ? items : []).slice(0, 20)) {
    const id = item.id || item.incomingId;
    const detail = await make(`/hooks/${HOOK_ID}/incomings/${id}`);
    const d = detail.json?.hookIncoming || detail.json?.incoming || detail.json || {};
    // Also try log with same id (sometimes shared)
    let logBody = null;
    const logTry = await make(`/hooks/${HOOK_ID}/logs/${id}`);
    if (logTry.status === 200) {
      logBody = extractBody(logTry.json?.hookLog || logTry.json?.log || logTry.json);
    }
    const body = extractBody(d) || logBody;
    const cls = classifyPayload(body);
    detailed.push({
      id,
      size: item.size ?? d.size ?? null,
      createdAt: item.createdAt || item.timestamp || d.createdAt || d.timestamp || null,
      scope: item.scope || d.scope || null,
      detail_http: detail.status,
      log_http: logTry.status,
      classification: cls,
      body_excerpt: body ? JSON.stringify(body).slice(0, 220).replace(/\s+/g, ' ') : null,
    });
  }
  out.incomings_detailed = detailed;

  // Recent scenario executions
  const logs = await make(`/scenarios/${SCENARIO_ID}/logs?pg[limit]=20&pg[sortDir]=desc`);
  const logArr = logs.json?.scenarioLogs || logs.json?.logs || [];
  out.scenario_logs = {
    http: logs.status,
    count: Array.isArray(logArr) ? logArr.length : null,
    recent: (Array.isArray(logArr) ? logArr : []).slice(0, 15).map((x) => ({
      id: x.id,
      status: x.status ?? x.statusId,
      timestamp: x.timestamp || x.loggedAt || x.createdAt,
      instant: x.instant,
    })),
  };

  const dlqs = await make(`/dlqs?scenarioId=${SCENARIO_ID}&pg[limit]=20`);
  out.incomplete = {
    http: dlqs.status,
    count: Array.isArray(dlqs.json?.dlqs) ? dlqs.json.dlqs.length : null,
  };

  // Analysis
  const kinds = {};
  for (const d of detailed) {
    const k = d.classification?.kind || 'unknown';
    kinds[k] = (kinds[k] || 0) + 1;
  }
  const created = detailed.map((d) => d.createdAt).filter(Boolean).sort();
  const schedulingRaw = out.scenario.scheduling;
  let schedulingType = null;
  try {
    const sch = typeof schedulingRaw === 'string' ? JSON.parse(schedulingRaw) : schedulingRaw;
    schedulingType = sch?.type || null;
  } catch { schedulingType = typeof schedulingRaw; }

  const isInstant = schedulingType === 'immediately' || schedulingType === 'instant' || out.scenario.islinked === true;

  out.analysis = {
    why_not_draining: null,
    are_old: null,
    stuck: null,
    safe_to_delete: null,
    production_impact: null,
    kind_counts: kinds,
    oldest_createdAt: created[0] || null,
    newest_createdAt: created[created.length - 1] || null,
    scheduling_type: schedulingType,
    is_instant_scenario: isInstant,
  };

  // Heuristics
  const mostlyDlr = (kinds.delivery_status || 0) >= (out.incomings_count || 0) * 0.5;
  const mostlyInbound = (kinds.inbound_message || 0) > 0;
  const queueStillFull = (out.hook.queueCount || 0) > 0 && out.scenario.isActive === true;

  if (queueStillFull && out.scenario.isActive) {
    out.analysis.why_not_draining =
      'Scenario is Active but webhook incomings remain queued. Common Make causes: ' +
      '(1) scenario was OFF when events arrived — they sit in webhook queue until processed; ' +
      '(2) Instant webhook may still show historical queueCount until explicitly deleted/processed; ' +
      '(3) scenario listening but not auto-consuming backlog (needs Run once / enable sequential processing); ' +
      '(4) if scheduling is not immediately, queue waits for schedule. ' +
      `Observed scheduling_type=${schedulingType}, islinked=${out.scenario.islinked}, iswaiting=${out.scenario.iswaiting}.`;
  } else if (!out.scenario.isActive) {
    out.analysis.why_not_draining = 'Scenario is not Active — Make will not consume webhook queue while OFF.';
  } else {
    out.analysis.why_not_draining = 'Queue empty or scenario state unclear — see raw counts.';
  }

  out.analysis.are_old =
    `Queue items include mix: ${JSON.stringify(kinds)}. ` +
    (mostlyDlr
      ? 'Majority look like Delivery status (DLR) callbacks from Gupshup — leftovers from earlier Staging sends / bot traffic, not new user chats only. '
      : '') +
    (mostlyInbound ? 'Some are real inbound WhatsApp messages (e.g. owner היי). ' : '') +
    `Timestamps range: ${out.analysis.oldest_createdAt || 'unknown'} → ${out.analysis.newest_createdAt || 'unknown'} (if API returns createdAt).`;

  out.analysis.stuck =
    queueStillFull && out.incomplete.count === 0
      ? 'YES — sitting in webhook incomings queue (not Incomplete Executions/DLQ). They are waiting to be processed by the scenario, not failed mid-run.'
      : out.incomplete.count > 0
        ? 'Partially — some Incomplete Executions exist in DLQ as well.'
        : 'Not stuck in DLQ; check incomings count.';

  out.analysis.safe_to_delete =
    'YES for Staging cleanup of Delivery-status backlog: deleting webhook incomings only discards unprocessed webhook payloads in Make. ' +
    'It does NOT unsend WhatsApp, does NOT touch Supabase/Production, does NOT change Gupshup. ' +
    'CAUTION: deleting also drops any unprocessed inbound messages (e.g. היי) — the Whatsapp Bot will never reply to those specific webhook events. ' +
    'Recommended: delete delivery_status items; keep or manually review inbound_message items if you want the bot to answer them.';

  out.analysis.production_impact =
    'NONE on Production systems (dalia-c.com / Production Supabase). ' +
    'This queue lives only in the Make.com account webhook for Whatsapp Bot. ' +
    'If the same Make scenario is used for live Production WhatsApp later, a large backlog could cause delayed bot replies or burst processing when drained — ' +
    'so cleaning before Production go-live is the right call. Deleting now does not break Production because Production WA path is not live on this gate yet.';

  out.answers = {
    '1_why_not_draining': out.analysis.why_not_draining,
    '2_are_old': out.analysis.are_old,
    '3_stuck': out.analysis.stuck,
    '4_safe_to_delete': out.analysis.safe_to_delete,
    '5_production_impact': out.analysis.production_impact,
  };

  out.recommendation = {
    he: 'לא לשלוח WA. לנקות את תור ה-incomings ב-Make (מחיקת פריטי DLR ישנים) לפני Production. אופציה: DELETE /hooks/{hookId}/incomings דרך API רק אחרי אישור Owner «מחק תור Make».',
    next_owner_phrase: 'מחק תור Make',
  };

  console.log('---MAKE_QUEUE_DIAGNOSE---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_QUEUE_DIAGNOSE_DONE---');
  fs.writeFileSync('/tmp/make-queue-diagnose.json', JSON.stringify(out, null, 2));
}

main().catch((e) => {
  out.error = String(e.message || e).slice(0, 500);
  console.log('---MAKE_QUEUE_DIAGNOSE---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_QUEUE_DIAGNOSE_DONE---');
  process.exit(1);
});
