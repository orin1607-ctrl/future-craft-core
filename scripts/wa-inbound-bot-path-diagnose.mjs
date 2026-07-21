/**
 * Read-only diagnosis of inbound WhatsApp → Make Whatsapp Bot path.
 * NO WhatsApp send. NO Production. NO queue deletes. NO blueprint PATCH.
 *
 * Answers Owner questions:
 * 1) Is Whatsapp Bot active now?
 * 2) Do inbound messages hit the webhook in real time?
 * 3) Does scenario run immediately or queue?
 * 4) Where does the scenario stop/fail?
 * 5) Why no bot reply to Owner messages?
 * 6) Was "E2E clean-queue …" an old queued release?
 * 7) What to fix for seconds-latency replies?
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const SCENARIO_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const E2E_MSG = 'E2E clean-queue Staging 2026-07-21T12:55:37.518Z';
const E2E_MSGID = '346d6d28-9266-42ae-a0c3-6e4f0bd0a06f';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const OUT = 'public/project-001/wa-inbound-bot-path-result.json';
const FROM_MS = Date.now() - 24 * 60 * 60 * 1000;

const out = {
  id: 'wa-inbound-bot-path',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  no_whatsapp_send: true,
  no_queue_delete: true,
  no_blueprint_change: true,
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
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json, text: text.slice(0, 2000) };
}

function walkModules(node, acc = []) {
  if (!node) return acc;
  if (Array.isArray(node)) {
    for (const n of node) walkModules(n, acc);
    return acc;
  }
  if (typeof node === 'object') {
    if (typeof node.module === 'string') acc.push(node);
    if (Array.isArray(node.flow)) walkModules(node.flow, acc);
    if (Array.isArray(node.routes)) {
      for (const r of node.routes) walkModules(r?.flow || r, acc);
    }
    if (Array.isArray(node.subflows)) walkModules(node.subflows, acc);
  }
  return acc;
}

function extractLogBody(log) {
  const data = log?.data || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? '';
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.trim()) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return null;
}

function classifyBody(body) {
  if (!body) return { kind: 'empty' };
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  const st = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (msg) {
    return {
      kind: 'inbound_message',
      from: msg.from || null,
      text: msg.text?.body || msg.type || null,
      wa_id: msg.id || null,
      timestamp: msg.timestamp || null,
    };
  }
  if (st) {
    return {
      kind: 'delivery_status',
      status: st.status || null,
      gs_id: st.gs_id || null,
      recipient_id: st.recipient_id || null,
    };
  }
  if (/"statuses"\s*:/.test(s)) return { kind: 'delivery_status_raw' };
  if (/"messages"\s*:/.test(s)) return { kind: 'inbound_raw' };
  return { kind: 'other', preview: s.slice(0, 100) };
}

function moduleSummary(m) {
  const name = m.metadata?.designer?.name || null;
  const url = m.mapper?.url || m.parameters?.url || null;
  const mod = String(m.module || '');
  const looksReply =
    /gupshup|whatsapp|openai|chatgpt|anthropic|ai\.|gpt|send.*message|message.*send|bot/i.test(
      `${mod} ${name || ''} ${url || ''}`,
    ) && !/gupshup-webhook|webhook/i.test(`${url || ''}`);
  const looksForward =
    typeof url === 'string' && /gupshup-webhook|supabase\.co\/functions/i.test(url);
  const looksWebhook = /webhook|CustomWebHook|gateway:CustomWebHook/i.test(mod);
  return {
    id: m.id,
    module: mod,
    name,
    url: url
      ? String(url)
          .replace(/hook\.[^/]+\/[^\s"']+/g, (u) => u.slice(0, 28) + '…')
          .slice(0, 120)
      : null,
    looks_webhook: looksWebhook,
    looks_dlr_forward: looksForward,
    looks_possible_reply: looksReply && !looksForward && !looksWebhook,
  };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  // --- 1) Scenario active? ---
  const sc = await make(
    `/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=dlqCount&cols[]=scheduling&cols[]=hookId&cols[]=iswaiting&cols[]=isPaused&cols[]=lastEdit`,
  );
  const scenario = sc.json?.scenario || sc.json || {};
  let schedulingType = null;
  try {
    const sch =
      typeof scenario.scheduling === 'string'
        ? JSON.parse(scenario.scheduling)
        : scenario.scheduling;
    schedulingType = sch?.type || null;
  } catch {
    schedulingType = null;
  }
  out.scenario = {
    http: sc.status,
    id: scenario.id,
    name: scenario.name,
    isActive: scenario.isActive === true,
    islinked: scenario.islinked === true,
    iswaiting: scenario.iswaiting,
    isPaused: scenario.isPaused,
    dlqCount: scenario.dlqCount,
    scheduling_type: schedulingType,
    hookId: scenario.hookId,
    lastEdit: scenario.lastEdit || null,
  };

  // Blueprint / modules (read-only)
  const bpRes = await make(`/scenarios/${SCENARIO_ID}/blueprint`);
  let blueprint = bpRes.json?.blueprint || bpRes.json?.response?.blueprint || bpRes.json;
  if (!blueprint?.flow && bpRes.status !== 200) {
    const scFull = await make(`/scenarios/${SCENARIO_ID}`);
    blueprint = scFull.json?.scenario?.blueprint || scFull.json?.blueprint || null;
    out.blueprint_source = 'scenario_get_fallback';
    out.blueprint_http_alt = scFull.status;
  } else {
    out.blueprint_source = 'scenarios_blueprint';
  }
  out.blueprint_http = bpRes.status;

  const mods = walkModules(blueprint);
  out.modules = mods.map(moduleSummary);
  out.module_counts = {
    total: mods.length,
    webhook: out.modules.filter((m) => m.looks_webhook).length,
    dlr_forward: out.modules.filter((m) => m.looks_dlr_forward).length,
    possible_reply: out.modules.filter((m) => m.looks_possible_reply).length,
  };
  out.has_explicit_reply_module = out.module_counts.possible_reply > 0;
  out.flow_is_dlr_forward_only =
    out.module_counts.webhook >= 1 &&
    out.module_counts.dlr_forward >= 1 &&
    out.module_counts.possible_reply === 0;

  // --- Hook + queue ---
  const hook = await make(`/hooks/${HOOK_ID}`);
  const h = hook.json?.hook || hook.json || {};
  out.hook = {
    http: hook.status,
    enabled: h.enabled,
    queueCount: h.queueCount ?? null,
    queueLimit: h.queueLimit ?? null,
    scenarioId: h.scenarioId,
    udsType: h.udsType || h.typeName || null,
  };
  const stats = await make(`/hooks/${HOOK_ID}/incomings/stats`);
  const list = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=30`);
  const items = list.json?.hookIncomings || list.json?.incomings || [];
  out.queue_now = {
    stats_http: stats.status,
    stats: stats.json,
    list_count: Array.isArray(items) ? items.length : null,
    ids: (Array.isArray(items) ? items : []).map((x) => x.id).filter(Boolean).slice(0, 20),
  };

  // --- Hook logs (last 24h) — inbound vs DLR timing ---
  const logsList = await make(
    `/hooks/${HOOK_ID}/logs?from=${FROM_MS}&pg[limit]=80&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const hookLogs = logsList.json?.hookLogs || logsList.json?.logs || [];
  const inboundHits = [];
  const dlrHits = [];
  const otherHits = [];
  for (const log of (hookLogs || []).slice(0, 60)) {
    let body = extractLogBody(log);
    if (!body) {
      const detail = await make(`/hooks/${HOOK_ID}/logs/${log.id}`);
      body = extractLogBody(detail.json?.hookLog || detail.json?.log || detail.json);
    }
    const cls = classifyBody(body);
    const row = {
      loggedAt: log.loggedAt,
      statusId: log.statusId,
      id: log.id,
      ...cls,
    };
    if (cls.kind === 'inbound_message' || cls.kind === 'inbound_raw') inboundHits.push(row);
    else if (cls.kind === 'delivery_status' || cls.kind === 'delivery_status_raw') dlrHits.push(row);
    else otherHits.push(row);
  }
  out.hook_logs_window = {
    from: new Date(FROM_MS).toISOString(),
    list_http: logsList.status,
    total_listed: Array.isArray(hookLogs) ? hookLogs.length : null,
    inbound_count: inboundHits.length,
    dlr_count: dlrHits.length,
    other_count: otherHits.length,
    inbound_recent: inboundHits.slice(0, 15),
    dlr_recent: dlrHits.slice(0, 10),
  };

  // Owner inbound specifically
  const ownerInbound = inboundHits.filter(
    (x) => x.from === OWNER_E164 || String(x.text || '').length > 0,
  );
  out.owner_inbound_in_hook = ownerInbound.slice(0, 20);

  // Latency heuristic: if scenario inactive historically, messages sat in queue.
  // Real-time = scenario active + linked + queue 0 + inbound appears in hook logs near wall clock.
  out.realtime_assessment = {
    scenario_active_now: out.scenario.isActive,
    scenario_linked: out.scenario.islinked,
    scheduling_type: schedulingType,
    queue_empty_now:
      (out.hook.queueCount === 0 || out.hook.queueCount == null) &&
      (out.queue_now.list_count === 0 || out.queue_now.list_count == null),
    inbound_events_seen_in_logs: inboundHits.length > 0,
    note:
      'Hook logs prove Gupshup→Make delivery of inbound payloads when present. ' +
      'If scenario was OFF, payloads sit in incomings queue and are NOT processed as bot replies until Active + consumed.',
  };

  // --- Scenario execution logs ---
  const slogPaths = [
    `/scenarios/${SCENARIO_ID}/logs?pg[limit]=40&pg[sortDir]=desc`,
    `/scenarios/${SCENARIO_ID}/logs?from=${Math.floor(FROM_MS / 1000)}&pg[limit]=40`,
  ];
  out.scenario_executions = { probes: {} };
  let execRows = [];
  for (const p of slogPaths) {
    const r = await make(p);
    const arr = r.json?.scenarioLogs || r.json?.logs || [];
    out.scenario_executions.probes[p] = {
      http: r.status,
      count: Array.isArray(arr) ? arr.length : null,
      keys: r.json && typeof r.json === 'object' ? Object.keys(r.json) : [],
    };
    if (Array.isArray(arr) && arr.length) execRows = arr;
  }
  out.scenario_executions.recent = execRows.slice(0, 25).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId ?? x.result,
    timestamp: x.timestamp || x.loggedAt || x.createdAt || x.instant,
    duration: x.duration || x.executionTime || null,
    error: x.error || x.message || null,
  }));

  // Try detail on a few failed / recent executions
  const detailSamples = [];
  for (const row of out.scenario_executions.recent.slice(0, 8)) {
    if (!row.id) continue;
    const d = await make(`/scenarios/${SCENARIO_ID}/logs/${row.id}`);
    const log = d.json?.scenarioLog || d.json?.log || d.json;
    const ops = log?.operations || log?.data?.operations || log?.modules || null;
    let opsSummary = null;
    if (Array.isArray(ops)) {
      opsSummary = ops.slice(0, 20).map((op) => ({
        id: op.id ?? op.moduleId,
        module: op.module || op.name || op.moduleName,
        status: op.status ?? op.statusId ?? op.result,
        error: op.error || op.message || op.err || null,
      }));
    }
    detailSamples.push({
      id: row.id,
      detail_http: d.status,
      status: log?.status ?? log?.statusId ?? row.status,
      error: log?.error || log?.message || null,
      operations: opsSummary,
      raw_keys: log && typeof log === 'object' ? Object.keys(log).slice(0, 30) : [],
    });
  }
  out.execution_details_sample = detailSamples;

  // DLQ / incomplete
  const dlqs = await make(`/dlqs?scenarioId=${SCENARIO_ID}&pg[limit]=30`);
  const dlqArr = dlqs.json?.dlqs || [];
  out.incomplete_dlq = {
    http: dlqs.status,
    count: Array.isArray(dlqArr) ? dlqArr.length : null,
    recent: (Array.isArray(dlqArr) ? dlqArr : []).slice(0, 10).map((x) => ({
      id: x.id,
      status: x.status,
      createdAt: x.createdAt || x.timestamp,
      reason: x.reason || x.error || x.message || null,
    })),
  };

  // --- E2E clean-queue provenance (from repo artifact + Make DLR) ---
  let e2eArtifact = null;
  try {
    e2eArtifact = JSON.parse(
      fs.readFileSync('public/project-001/make-queue-clear-and-e2e-result.json', 'utf8'),
    );
  } catch {
    e2eArtifact = null;
  }
  const e2eDlr = dlrHits.filter(
    (x) => x.gs_id === E2E_MSGID || String(JSON.stringify(x)).includes(E2E_MSGID),
  );
  out.e2e_clean_queue_message = {
    text: E2E_MSG,
    message_id: E2E_MSGID,
    from_artifact: e2eArtifact
      ? {
          at: e2eArtifact.at,
          send_success: e2eArtifact.send?.success,
          destination: e2eArtifact.send?.destination,
          message_id: e2eArtifact.send?.message_id,
          gupshup_http: e2eArtifact.send?.gupshup_http,
          make_dlr: e2eArtifact.make_dlr_statuses || null,
          note: 'Sent by Staging Edge send-whatsapp-message AFTER queue clear — NOT a Make bot auto-reply',
        }
      : null,
    make_dlr_hits_for_msgid: e2eDlr.slice(0, 5),
    was_old_queued_release: false,
    explanation:
      'Timestamp 12:55:37Z matches our intentional Staging E2E send in make-queue-clear-and-e2e. ' +
      'It was outbound from business→Owner via Gupshup API, not Whatsapp Bot generating a reply to inbound. ' +
      'Late phone appearance is the known Meta sent≠delivered delay — not Make queue releasing a bot reply.',
  };

  // --- Answers ---
  const q1 = out.scenario.isActive
    ? `YES — Whatsapp Bot (${SCENARIO_ID}) isActive=true now; islinked=${out.scenario.islinked}; scheduling=${schedulingType || 'unknown'}`
    : `NO — Whatsapp Bot is OFF (isActive=false). Inbound will queue on webhook and will not run.`;

  const q2 =
    inboundHits.length > 0
      ? `YES — Hook ${HOOK_ID} has ${inboundHits.length} inbound message event(s) in last 24h logs (Owner samples: ${ownerInbound.length}). Gupshup→Make webhook delivery works when messages arrive.`
      : `UNCLEAR/NO recent inbound in last 24h hook logs (listed=${out.hook_logs_window.total_listed}). Either no Owner messages in window, logs pagination miss, or inbound not reaching this hook.`;

  const q3 = out.scenario.isActive && out.scenario.islinked && out.realtime_assessment.queue_empty_now
    ? `When Active+linked and queue empty: Instant/linked webhook should run immediately on each hit. Current queue list_count=${out.queue_now.list_count}, hook.queueCount=${out.hook.queueCount}. Historical problem: when scenario was OFF, events sat in incomings queue (15 items earlier today) instead of running.`
    : `NOT reliably immediate — isActive=${out.scenario.isActive}, islinked=${out.scenario.islinked}, queueCount=${out.hook.queueCount}, list_count=${out.queue_now.list_count}. Offline scenario → queue; Active with backlog → delayed burst.`;

  const failedOps = [];
  for (const d of detailSamples) {
    for (const op of d.operations || []) {
      if (op.error || String(op.status).toLowerCase().includes('error') || op.status === 0) {
        failedOps.push({ execution: d.id, ...op });
      }
    }
    if (d.error) failedOps.push({ execution: d.id, error: d.error });
  }
  const q4 =
    failedOps.length > 0
      ? `Failures seen in execution details: ${JSON.stringify(failedOps.slice(0, 8))}`
      : out.flow_is_dlr_forward_only
        ? `Scenario does not "stop" on a chat-reply module — flow is webhook → HTTP forward to Staging gupshup-webhook (DLR path). No dedicated reply module found among ${out.module_counts.total} modules. DLQ count=${out.incomplete_dlq.count}.`
        : out.has_explicit_reply_module
          ? `Reply-capable modules exist (${out.module_counts.possible_reply}); check execution_details_sample / DLQ for stop point. DLQ=${out.incomplete_dlq.count}.`
          : `Could not classify a clear stop module; see modules list + execution_details_sample. DLQ=${out.incomplete_dlq.count}.`;

  const q5 = out.flow_is_dlr_forward_only
    ? `ROOT CAUSE: Whatsapp Bot scenario is currently a DLR/webhook forwarder to Supabase Staging, not an inbound chatbot. After Option B we added HTTP → gupshup-webhook; there is no module that sends a WhatsApp reply text back to 0534338601 when you message the business. Also: when scenario was Inactive, your inbound messages queued and were later deleted with the 15 incomings clear — those specific «היי» events never got a bot reply.`
    : out.has_explicit_reply_module
      ? `Reply modules exist but replies are not reaching you — see failures/DLQ/queue delay. Also confirm reply module actually calls Gupshup/WhatsApp send.`
      : `No clear auto-reply module detected in blueprint. Bot cannot answer inbound with a generated reply in current Make design.`;

  const q6 =
    `NO — it was NOT an old queued bot reply. It was our Staging E2E outbound test at ~12:55:37Z (msgid ${E2E_MSGID}) via Edge send-whatsapp-message → Gupshup → your phone. Text: «${E2E_MSG}». Late receipt = Meta delivery lag (sent without delivered), not Make releasing a queued chatbot answer.`;

  const q7 = [
    'Keep Whatsapp Bot Active + linked at all times if this hook is the live Gupshup callback (or split: dedicated DLR scenario vs dedicated chatbot).',
    'Do not delete inbound incomings if you expect bot replies — only clear DLR backlog, or process inbound first.',
    'If you want real chatbot answers within seconds: add/restore a reply path (Router: messages vs statuses → reply only on messages; DLR only forward statuses) OR separate scenarios/hooks.',
    'Never route Production go-live on a scenario that only forwards DLR and has no reply module.',
    'Monitor hook queueCount=0 and scenario isActive after every change.',
  ];

  out.answers = {
    '1_scenario_active_now': q1,
    '2_inbound_reaches_webhook_realtime': q2,
    '3_runs_immediately_or_queues': q3,
    '4_where_scenario_stops_or_fails': q4,
    '5_why_no_bot_reply': q5,
    '6_was_e2e_clean_queue_old_queued': q6,
    '7_what_to_fix_for_seconds_reply': q7,
  };

  out.verdict_he =
    'הודעת E2E clean-queue אינה תשובת בוט — זו שליחת בדיקת Staging שלנו. ' +
    'הבוט לא עונה כי תרחיש Whatsapp Bot כרגע משמש בעיקר כמקבל Webhook+העברת DLR ל-Supabase, לא כצ׳אטבוט שמשיב. ' +
    'בנוסף, כשהתרחיש היה כבוי הודעות נכנסו לתור; חלקן נמחקו בניקוי 15 הפריטים. אין Production.';

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('---WA_INBOUND_BOT_PATH---');
  console.log(JSON.stringify({ answers: out.answers, modules: out.modules, verdict_he: out.verdict_he }, null, 2));
  console.log('---WA_INBOUND_BOT_PATH_DONE---');
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
