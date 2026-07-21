/**
 * Staging only: one-way system-alert WhatsApp (no bot reply on Reply-to-alert).
 * 1) Deploy Edge: notify-accident-email (footer) + gupshup-webhook (check_system_alert)
 * 2) Patch Make Whatsapp Bot 5797671: early lookup → Ignore if Reply to alert msg id
 * 3) E2E: Reply→no Gupshup 87; free «היי»→bot replies; Active; queue clear
 * NO Production.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const makeToken = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const SUPABASE_HOOK = `https://${STAGING}.supabase.co/functions/v1/gupshup-webhook`;
const FOOTER = 'זוהי הודעת מערכת אוטומטית ואין להשיב לה.';
const MARKER = 'Skip bot for system-alert Reply';
const LOOKUP_NAME = 'Lookup system-alert by Message ID';
const ROUTER_NAME = 'One-way: alert Reply vs chat';

const OUT = 'public/project-001/wa-alert-one-way-result.json';
const SUMMARY = 'public/project-001/wa-alert-one-way-summary.json';

const out = {
  id: 'wa-alert-one-way',
  at: new Date().toISOString(),
  env: 'staging_only',
  production_touched: false,
  new_mechanism: false,
  footer: FOOTER,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function make(path, opts = {}) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Token ${makeToken}`,
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
    json = { raw: text.slice(0, 1200) };
  }
  return { status: res.status, json, text: text.slice(0, 2500) };
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
    if (Array.isArray(node.onerror)) walkModules(node.onerror, acc);
  }
  return acc;
}

function nextModuleId(bp) {
  const ids = walkModules(bp)
    .map((m) => Number(m.id))
    .filter((n) => Number.isFinite(n));
  return (ids.length ? Math.max(...ids) : 100) + 1;
}

function findByName(bp, name) {
  return walkModules(bp).find((m) => m.metadata?.designer?.name === name) || null;
}

async function getBlueprint() {
  const br = await make(`/scenarios/${BOT_ID}/blueprint`);
  must(br.status === 200, `blueprint GET HTTP ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  if (typeof bp === 'string') bp = JSON.parse(bp);
  return bp;
}

async function patchBlueprint(bp) {
  let patch = await make(`/scenarios/${BOT_ID}?confirmed=true`, {
    method: 'PATCH',
    body: { blueprint: JSON.stringify(bp) },
  });
  if (patch.status >= 400) {
    patch = await make(`/scenarios/${BOT_ID}?confirmed=true`, {
      method: 'PATCH',
      body: { blueprint: bp },
    });
  }
  return patch;
}

async function scenarioState() {
  for (let i = 0; i < 5; i++) {
    const sc = await make(
      `/scenarios/${BOT_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=hookId`,
    );
    if (sc.status === 429) {
      await sleep(2000 * (i + 1));
      continue;
    }
    const s = sc.json?.scenario || sc.json || {};
    return {
      http: sc.status,
      isActive: s.isActive === true,
      islinked: s.islinked === true,
      name: s.name,
      hookId: s.hookId,
    };
  }
  return { isActive: false, islinked: false };
}

async function activateBot() {
  const st = await scenarioState();
  if (st.isActive) return { already: true, ...st };
  const start = await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
  await sleep(2500);
  const st2 = await scenarioState();
  return { already: false, start_http: start.status, ...st2 };
}

async function getHookUrl() {
  const h = await make(`/hooks/${HOOK_ID}`);
  const hook = h.json?.hook || h.json || {};
  return hook.url || hook.hookUrl || null;
}

async function hookQueueCount() {
  const h = await make(`/hooks/${HOOK_ID}`);
  const hook = h.json?.hook || h.json || {};
  return {
    queueCount: hook.queueCount ?? null,
    enabled: hook.enabled,
  };
}

async function clearQueue() {
  const list = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const items = list.json?.hookIncomings || list.json?.incomings || [];
  const ids = (Array.isArray(items) ? items : []).map((x) => x.id).filter(Boolean);
  if (!ids.length) return { before: 0, deleted: 0, ok: true };
  const del = await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
    method: 'DELETE',
    body: { ids },
  });
  return {
    before: ids.length,
    deleted: Array.isArray(del.json?.incomings) ? del.json.incomings.length : ids.length,
    delete_http: del.status,
    ok: del.status >= 200 && del.status < 300,
  };
}

async function recentLogs(limit = 20) {
  const r = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.scenarioLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt || x.createdAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    duration: x.duration || null,
  }));
}

async function logDetail(id) {
  const d = await make(`/scenarios/${BOT_ID}/logs/${id}`);
  const log = d.json?.scenarioLog || d.json?.log || d.json;
  const ops = log?.operations || log?.data?.operations || [];
  const opsSummary = Array.isArray(ops)
    ? ops.map((op) => ({
        id: op.id ?? op.moduleId,
        module: op.module || op.name || op.moduleName,
        status: op.status ?? op.statusId ?? op.result,
        error: op.error?.message || (typeof op.error === 'string' ? op.error : null),
      }))
    : [];
  return {
    http: d.status,
    status: log?.status ?? log?.statusId,
    error: log?.error?.message || log?.error || null,
    operations: opsSummary,
  };
}

function waitForNewLog(beforeIds, sinceMs, logs, { requireSuccess = true } = {}) {
  return logs.find((x) => {
    if (beforeIds.has(x.id)) return false;
    if (x.timestamp && Date.parse(x.timestamp) < sinceMs - 15000) return false;
    if (requireSuccess) {
      if (x.error) return false;
      if (!(x.status === 1 || x.status === 2 || x.status === 'SUCCESS')) return false;
    }
    return true;
  });
}

function buildGupshupInbound({ text, contextGsId = null, contextWaId = null, suffix }) {
  const ts = Date.now();
  const payload = {
    id: `ABEGk.ONEWAY_${suffix}_${ts}`,
    source: OWNER_E164,
    type: 'text',
    payload: { text },
    sender: {
      phone: OWNER_E164,
      name: 'Owner',
      country_code: '972',
      dial_code: OWNER_E164.replace(/^972/, ''),
    },
  };
  if (contextGsId || contextWaId) {
    payload.context = {};
    if (contextWaId) payload.context.id = contextWaId;
    if (contextGsId) payload.context.gsId = contextGsId;
  }
  // Flat aliases so Make Custom Webhook maps Message IDs even if nested UDT is incomplete
  const flat = {};
  if (contextGsId) flat.reply_gsid = contextGsId;
  if (contextWaId || contextGsId) flat.reply_waid = contextWaId || contextGsId;
  return {
    app: 'DaliaVehicle',
    timestamp: ts,
    version: 2,
    type: 'message',
    payload,
    ...flat,
  };
}

async function moduleLogs(mid, limit = 10) {
  const r = await make(`/scenarios/${BOT_ID}/modules/${mid}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.moduleLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).slice(0, limit).map((x) => ({
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    executionId: x.executionId || x.scenarioLogId || null,
  }));
}

async function postHook(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

function buildMetaInbound({ text, contextId = null, suffix }) {
  const ts = String(Math.floor(Date.now() / 1000));
  const msg = {
    from: OWNER_E164,
    id: `wamid.ONEWAY_${suffix}_${Date.now()}`,
    timestamp: ts,
    type: 'text',
    text: { body: text },
  };
  if (contextId) {
    msg.context = { id: contextId, gsId: contextId };
  }
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'coco-one-way',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '972546500305',
                phone_number_id: '689295480929918',
              },
              contacts: [{ profile: { name: 'Owner' }, wa_id: OWNER_E164 }],
              messages: [msg],
            },
          },
        ],
      },
    ],
  };
}

function recentModuleHit(logs, sinceMs) {
  return (logs || []).find((x) => {
    if (x.timestamp && Date.parse(x.timestamp) < sinceMs - 10000) return false;
    return x.status === 1 || x.status === 2 || x.status === 'SUCCESS';
  });
}

/** IML unused for qs — Edge deep-searches POST body for context.gsId / context.id */
function removeOneWayModules(bp) {
  if (!Array.isArray(bp.flow)) return { removed: false };
  const router = bp.flow.find((m) => m?.metadata?.designer?.name === ROUTER_NAME);
  if (!router || !Array.isArray(router.routes) || router.routes.length < 2) {
    // Remove stray named modules if any
    const before = bp.flow.length;
    bp.flow = bp.flow.filter(
      (m) =>
        ![MARKER, LOOKUP_NAME, ROUTER_NAME].includes(m?.metadata?.designer?.name),
    );
    return { removed: bp.flow.length !== before, mode: 'filter_names' };
  }
  const wh = bp.flow.find((m) => /CustomWebHook|webhook/i.test(String(m?.module || '')));
  const botFlow = router.routes[1]?.flow || [];
  bp.flow = wh ? [wh, ...botFlow] : [...botFlow];
  return { removed: true, mode: 'unwrap_router', bot_modules: botFlow.length };
}

function applyOneWayPatch(bp) {
  must(Array.isArray(bp.flow), 'blueprint.flow missing');

  const unwrap = removeOneWayModules(bp);

  const wh = bp.flow.find((m) => /CustomWebHook|webhook/i.test(String(m?.module || '')));
  must(wh, 'Webhook module not found at top-level flow');
  const whIdx = bp.flow.findIndex((m) => m && Number(m.id) === Number(wh.id));
  must(whIdx >= 0, 'Webhook index not found');

  const rest = bp.flow.slice(whIdx + 1);
  let nextId = nextModuleId(bp);

  const lookupId = nextId++;
  const routerId = nextId++;
  const ignoreId = nextId++;

  // GET lookup — Message ID only (no createJSON; it breaks this Bot scenario).
  // qs covers Gupshup nested context + flat aliases used in Staging probes.
  const lookup = {
    id: lookupId,
    module: 'http:ActionSendData',
    version: 3,
    parameters: {
      handleErrors: false,
      useNewZLibDeCompress: true,
    },
    mapper: {
      url: SUPABASE_HOOK,
      serializeUrl: false,
      method: 'get',
      headers: [{ name: 'Accept', value: 'application/json' }],
      qs: [
        { name: 'check_system_alert', value: '1' },
        { name: 'gsId', value: `{{ifempty(${wh.id}.entry[].changes[].value.messages[].context.gsId; ifempty(${wh.id}.entry[].changes[].value.messages[].context.id; ifempty(${wh.id}.reply_gsid; ifempty(${wh.id}.payload.context.gsId; __none__))))}}` },
        { name: 'waId', value: `{{ifempty(${wh.id}.entry[].changes[].value.messages[].context.id; ifempty(${wh.id}.reply_waid; ifempty(${wh.id}.payload.context.id; __none__)))}}` },
      ],
      bodyType: 'raw',
      parseResponse: true,
      authUser: '',
      authPass: '',
      timeout: '20',
      shareCookies: false,
      ca: '',
      rejectUnauthorized: true,
      followRedirect: true,
      useQuerystring: false,
      gzip: true,
      useMtls: false,
      contentType: 'application/json',
      data: '',
      inputRaw: '',
      followAllRedirects: false,
    },
    metadata: {
      designer: {
        x: (wh.metadata?.designer?.x || 0) + 300,
        y: (wh.metadata?.designer?.y || 0),
        name: LOOKUP_NAME,
      },
    },
  };

  // NOTE: builtin:Ignore is ONLY valid inside onerror — using it in a route
  // causes: "Misplaced directive 'builtin:Ignore' outside of an error handler"
  // Terminal no-op SetVariable ends the alert-reply route without AI/Gupshup.
  const skipMod = {
    id: ignoreId,
    module: 'util:SetVariable2',
    version: 1,
    parameters: {},
    mapper: {
      name: 'system_alert_reply_skipped',
      scope: 'roundtrip',
      value: '1',
    },
    filter: {
      name: 'Reply to system alert Message ID',
      conditions: [
        [{ a: `{{${lookupId}.is_system_alert_flag}}`, b: 'yes', o: 'text:equal' }],
      ],
    },
    metadata: {
      designer: {
        x: (wh.metadata?.designer?.x || 0) + 900,
        y: (wh.metadata?.designer?.y || 0) - 120,
        name: MARKER,
      },
    },
  };

  // Make BasicRouter: routes WITHOUT filters ALWAYS run (parallel with matching routes).
  // Gate the bot path so it only runs when NOT a system-alert reply.
  const continueId = nextId++;
  const continueChat = {
    id: continueId,
    module: 'util:SetVariable2',
    version: 1,
    parameters: {},
    mapper: {
      name: 'continue_bot_chat',
      scope: 'roundtrip',
      value: '1',
    },
    filter: {
      name: 'Not a system-alert Reply',
      // Edge always returns is_system_alert_flag yes|no — equal only (notequal fails Make validation)
      conditions: [
        [{ a: `{{${lookupId}.is_system_alert_flag}}`, b: 'no', o: 'text:equal' }],
      ],
    },
    metadata: {
      designer: {
        x: (wh.metadata?.designer?.x || 0) + 900,
        y: (wh.metadata?.designer?.y || 0) + 120,
        name: 'Continue bot chat (non-alert)',
      },
    },
  };

  const router = {
    id: routerId,
    module: 'builtin:BasicRouter',
    version: 1,
    parameters: {},
    mapper: null,
    metadata: {
      designer: {
        x: (wh.metadata?.designer?.x || 0) + 600,
        y: (wh.metadata?.designer?.y || 0),
        name: ROUTER_NAME,
      },
    },
    routes: [
      {
        flow: [skipMod],
      },
      {
        flow: [continueChat, ...rest],
      },
    ],
  };

  bp.flow = [wh, lookup, router];
  return {
    skipped: false,
    unwrap,
    data_expr: 'GET qs Message ID (Meta context paths)',
    ids: {
      lookup: lookupId,
      router: routerId,
      ignore: ignoreId,
      skip: ignoreId,
      continue: continueId,
    },
    rest_modules_moved: rest.length,
  };
}

async function mgmt(sbToken, path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: { Authorization: `Bearer ${sbToken}`, apikey: sbToken },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function rest(srk, path, opts = {}) {
  const res = await fetch(`https://${STAGING}.supabase.co${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: srk,
      Authorization: `Bearer ${srk}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

async function main() {
  must(makeToken, 'MAKE_API_TOKEN missing');
  const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');
  must(!String(STAGING).includes(PROD), 'ABORT_PROD');

  // --- Deploy Edge Staging only ---
  process.env.SUPABASE_ACCESS_TOKEN = sbToken;
  try {
    execSync(
      `npx --yes supabase functions deploy notify-accident-email --project-ref ${STAGING} --use-api`,
      { encoding: 'utf8', timeout: 180000 },
    );
    execSync(
      `npx --yes supabase functions deploy gupshup-webhook --project-ref ${STAGING} --use-api`,
      { encoding: 'utf8', timeout: 180000 },
    );
    out.deploy = { ok: true, project: STAGING, functions: ['notify-accident-email', 'gupshup-webhook'] };
  } catch (e) {
    out.deploy = {
      ok: false,
      error: String(e.stderr || e.message || e).slice(0, 500),
    };
    must(false, `Edge deploy failed: ${out.deploy.error}`);
  }

  const keys = await mgmt(sbToken, `/projects/${STAGING}/api-keys`);
  const srk = Array.isArray(keys.json)
    ? keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))
        ?.api_key
    : null;
  must(srk, 'No Staging service_role');

  // Verify check_system_alert endpoint
  const probeNone = await fetch(`${SUPABASE_HOOK}?check_system_alert=1&gsId=__none__`);
  const probeNoneJson = await probeNone.json().catch(() => ({}));
  out.check_endpoint_probe = {
    http: probeNone.status,
    is_system_alert: probeNoneJson.is_system_alert,
    ok: probeNone.status === 200 && probeNoneJson.is_system_alert === false,
  };
  must(out.check_endpoint_probe.ok, 'check_system_alert probe failed');

  // --- Patch Make ---
  const bpBefore = await getBlueprint();
  out.patch = applyOneWayPatch(bpBefore);
  if (!out.patch.skipped) {
    const patchRes = await patchBlueprint(bpBefore);
    out.patch.patch_http = patchRes.status;
    must(patchRes.status >= 200 && patchRes.status < 300, `Make patch HTTP ${patchRes.status}: ${patchRes.text}`);
  }

  const bpAfter = await getBlueprint();
  const whAfter = bpAfter.flow?.find((m) => /CustomWebHook|webhook/i.test(String(m?.module || '')));
  const aiMods = walkModules(bpAfter).filter((m) => /ai-agent/i.test(String(m.module || '')));
  out.verify_blueprint = {
    has_ignore_marker: Boolean(findByName(bpAfter, MARKER)),
    has_lookup: Boolean(findByName(bpAfter, LOOKUP_NAME)),
    has_router: Boolean(findByName(bpAfter, ROUTER_NAME)),
    has_ai: aiMods.length > 0,
    has_gupshup_87: walkModules(bpAfter).some(
      (m) => Number(m.id) === 87 || (typeof m.mapper?.url === 'string' && /api\.gupshup\.io.*msg/i.test(m.mapper.url)),
    ),
    webhook_params: whAfter?.parameters || null,
    ai_input_preview: aiMods.slice(0, 2).map((m) => ({
      id: m.id,
      mapper_keys: Object.keys(m.mapper || {}),
      // redact long prompts; keep paths that look like webhook refs
      refs: JSON.stringify(m.mapper || {})
        .match(/\{\{\d+[\w.\[\]"`]*\}\}/g)
        ?.slice(0, 20),
    })),
    lookup_qs: findByName(bpAfter, LOOKUP_NAME)?.mapper?.qs || null,
  };

  // Hook diagnostics — learn how inbound JSON is exposed
  const hookInfo = await make(`/hooks/${HOOK_ID}`);
  const hookObj = hookInfo.json?.hook || hookInfo.json || {};
  out.hook_info = {
    http: hookInfo.status,
    stringify: hookObj.stringify ?? hookObj.flags?.stringify ?? null,
    method: hookObj.method ?? null,
    headers: hookObj.headers ?? null,
    udtType: hookObj.udtType || hookObj.typeName || null,
    keys: Object.keys(hookObj).slice(0, 40),
  };
  must(out.verify_blueprint.has_ignore_marker, 'Ignore marker missing after patch');
  must(out.verify_blueprint.has_lookup, 'Lookup module missing after patch');
  must(out.verify_blueprint.has_router, 'Router missing after patch');
  must(out.verify_blueprint.has_ai, 'AI path lost after patch');
  must(out.verify_blueprint.has_gupshup_87, 'Gupshup send path lost after patch');

  out.activate = await activateBot();
  must(out.activate.isActive, 'Bot not Active after activate');

  out.queue_clear = await clearQueue();
  must(out.queue_clear.ok, 'Queue clear failed');

  const hookUrl = await getHookUrl();
  must(hookUrl, 'Hook URL missing');
  out.hook_url_host = (() => {
    try {
      return new URL(hookUrl).host;
    } catch {
      return null;
    }
  })();

  // Seed / reuse a system-alert message id in deliveries
  let alertMsgId = null;
  const recentDel = await rest(
    srk,
    `/rest/v1/incident_notification_deliveries?channel=eq.whatsapp&provider_message_id=not.is.null&select=provider_message_id,event_number,created_at&order=created_at.desc&limit=5`,
  );
  if (Array.isArray(recentDel.json) && recentDel.json[0]?.provider_message_id) {
    alertMsgId = recentDel.json[0].provider_message_id;
    out.alert_message_id_source = 'existing_delivery';
  } else {
    // Insert a synthetic delivery row so Message ID lookup works without extra WA send
    alertMsgId = `oneway-test-${Date.now()}`;
    const synIncidentId = crypto.randomUUID();
    const ins = await rest(srk, `/rest/v1/incident_notification_deliveries`, {
      method: 'POST',
      body: {
        company_name: 'אכבים',
        incident_kind: 'fault',
        incident_id: synIncidentId,
        event_number: 'FLT-ONEWAY-TEST',
        channel: 'whatsapp',
        recipient: OWNER_E164,
        status: 'sent',
        provider_message_id: alertMsgId,
        payload_excerpt: `one-way test | ${FOOTER}`,
        sent_at: new Date().toISOString(),
      },
    });
    out.alert_message_id_source = 'synthetic_insert';
    out.synthetic_incident_id = synIncidentId;
    out.synthetic_insert_http = ins.status;
    must(ins.status >= 200 && ins.status < 300, `synthetic delivery insert HTTP ${ins.status}`);
  }
  out.alert_message_id = alertMsgId;

  // Confirm lookup matches (GET + POST deep-find)
  const matchProbe = await fetch(
    `${SUPABASE_HOOK}?check_system_alert=1&gsId=${encodeURIComponent(alertMsgId)}`,
  );
  const matchJson = await matchProbe.json().catch(() => ({}));
  out.lookup_match_probe = {
    http: matchProbe.status,
    is_system_alert: matchJson.is_system_alert,
    is_system_alert_flag: matchJson.is_system_alert_flag,
    matched_id: matchJson.matched_id || null,
  };
  must(out.lookup_match_probe.is_system_alert === true, 'Lookup did not match alert Message ID');

  const deepBody = buildGupshupInbound({
    text: 'probe',
    contextGsId: alertMsgId,
    suffix: 'probe',
  });
  const deepProbe = await fetch(`${SUPABASE_HOOK}?check_system_alert=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deepBody),
  });
  const deepJson = await deepProbe.json().catch(() => ({}));
  out.deep_find_probe = {
    http: deepProbe.status,
    is_system_alert: deepJson.is_system_alert,
    is_system_alert_flag: deepJson.is_system_alert_flag,
    checked: deepJson.checked || null,
  };
  must(out.deep_find_probe.is_system_alert === true, 'Deep-find POST did not match alert Message ID');

  // Footer check via source
  const notifySrc = fs.readFileSync('supabase/functions/notify-accident-email/index.ts', 'utf8');
  out.footer_in_edge_source = notifySrc.includes(FOOTER);

  const ignoreId = out.patch.ids?.ignore;
  const lookupId = out.patch.ids?.lookup;

  // --- E2E 1: Reply to alert → Ignore, no Gupshup 87 ---
  const logsBefore1 = await recentLogs(15);
  const beforeIds1 = new Set(logsBefore1.map((x) => x.id));
  const t1 = Date.now();
  const replyPayload = buildMetaInbound({
    text: 'תשובה להתראה — לא אמור לענות בוט',
    contextId: alertMsgId,
    suffix: 'reply',
  });
  // Also attach flat alias for Message ID mapping
  replyPayload.reply_gsid = alertMsgId;
  replyPayload.reply_waid = alertMsgId;
  out.e2e_reply = { post: await postHook(hookUrl, replyPayload), format: 'meta+context+flat' };
  must(out.e2e_reply.post.status >= 200 && out.e2e_reply.post.status < 300, 'Reply post failed');

  let replyLog = null;
  let replyLogAny = null;
  for (let i = 0; i < 24; i++) {
    await sleep(2000);
    const logs = await recentLogs(20);
    replyLogAny =
      logs.find((x) => !beforeIds1.has(x.id) && (!x.timestamp || Date.parse(x.timestamp) >= t1 - 15000)) ||
      replyLogAny;
    replyLog = waitForNewLog(beforeIds1, t1, logs, { requireSuccess: true });
    if (replyLog) break;
  }
  out.e2e_reply.log = replyLog || null;
  out.e2e_reply.log_any = replyLogAny || null;
  if (!replyLog && replyLogAny) {
    out.e2e_reply.failed_execution = replyLogAny;
    must(false, `Reply execution not success: status=${replyLogAny.status} error=${replyLogAny.error}`);
  }
  must(replyLog, 'No Make execution for Reply-to-alert');

  await sleep(1500);
  const logs87AfterReply = await moduleLogs(87, 8);
  const logs84AfterReply = await moduleLogs(84, 8);
  const logs63AfterReply = await moduleLogs(63, 8);
  const logsIgnore = ignoreId != null ? await moduleLogs(ignoreId, 8) : [];
  const logsLookup = lookupId != null ? await moduleLogs(lookupId, 8) : [];

  const replyHit87 = Boolean(recentModuleHit(logs87AfterReply, t1));
  const replyHit84 = Boolean(recentModuleHit(logs84AfterReply, t1));
  const replyHit63 = Boolean(recentModuleHit(logs63AfterReply, t1));
  const replyHitIgnore = Boolean(recentModuleHit(logsIgnore, t1));
  const replyHitLookup = Boolean(recentModuleHit(logsLookup, t1));

  out.e2e_reply.analysis = {
    duration_ms: replyLog.duration ?? null,
    hit_lookup: replyHitLookup,
    hit_skip_noop: replyHitIgnore,
    hit_ai_84: replyHit84,
    hit_ai_63: replyHit63,
    hit_gupshup_87: replyHit87,
    skip_module_id: ignoreId,
    lookup_module_id: lookupId,
    lookup_logs: logsLookup.slice(0, 3),
  };
  must(!replyHit84 && !replyHit63, 'Reply-to-alert reached AI — should skip');
  must(!replyHit87, 'Reply-to-alert reached Gupshup 87 — should skip');
  if (!replyHitIgnore) {
    must(
      typeof replyLog.duration === 'number' && replyLog.duration < 4000,
      `Reply path too slow (${replyLog.duration}ms) without skip — likely bot path`,
    );
  }

  // --- E2E 2: free «היי» (Meta format — proven bot path) → Gupshup 87 ---
  const logsBefore2 = await recentLogs(15);
  const beforeIds2 = new Set(logsBefore2.map((x) => x.id));
  const t2 = Date.now();
  const hiPayload = buildMetaInbound({ text: 'היי', suffix: 'hi' });
  out.e2e_hi = { post: await postHook(hookUrl, hiPayload) };
  must(out.e2e_hi.post.status >= 200 && out.e2e_hi.post.status < 300, 'היי post failed');

  let hiLog = null;
  for (let i = 0; i < 36; i++) {
    await sleep(2500);
    const logs = await recentLogs(20);
    hiLog = waitForNewLog(beforeIds2, t2, logs, { requireSuccess: true });
    if (hiLog) break;
  }
  out.e2e_hi.log = hiLog || null;
  must(hiLog, 'No Make success execution for free היי');

  await sleep(1500);
  const logs87AfterHi = await moduleLogs(87, 8);
  const logs84AfterHi = await moduleLogs(84, 8);
  const hiHit87 = Boolean(recentModuleHit(logs87AfterHi, t2));
  const hiHit84 = Boolean(recentModuleHit(logs84AfterHi, t2));
  out.e2e_hi.analysis = {
    duration_ms: hiLog.duration ?? null,
    hit_ai_84: hiHit84,
    hit_gupshup_87: hiHit87,
  };
  must(hiHit84 || hiHit87, 'Free היי did not reach AI 84 or Gupshup 87');

  out.scenario_final = await scenarioState();
  out.queue_final = await hookQueueCount();
  must(out.scenario_final.isActive, 'Scenario not Active after E2E');
  must(
    out.queue_final.queueCount === 0 || out.queue_final.queueCount === null,
    `Queue not empty: ${out.queue_final.queueCount}`,
  );

  out.checks = {
    reply_no_ai: !replyHit84 && !replyHit63,
    reply_no_gupshup_send: !replyHit87,
    reply_skipped: replyHitIgnore === true,
    hi_bot_path: Boolean(hiHit84 || hiHit87),
    scenario_active: out.scenario_final.isActive === true,
    queue_empty: out.queue_final.queueCount === 0 || out.queue_final.queueCount === null,
    footer_in_source: out.footer_in_edge_source === true,
    lookup_by_message_id: out.lookup_match_probe.is_system_alert === true,
    deep_find_by_context: out.deep_find_probe.is_system_alert === true,
    production_touched: false,
  };
  out.full_path_ok = Object.values(out.checks).every(Boolean);

  const summary = {
    id: 'wa-alert-one-way-summary',
    at: out.at,
    production_touched: false,
    full_path_ok: out.full_path_ok,
    alert_message_id: out.alert_message_id,
    footer: FOOTER,
    checks: out.checks,
    make_scenario: BOT_ID,
    report_doc: 'docs/audit-reports/claims-incident-process/WA-ALERT-ONE-WAY-HE.md',
  };

  fs.mkdirSync('public/project-001', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  must(out.full_path_ok, 'One-way E2E checks failed — see result JSON');
}

main().catch((e) => {
  out.error = String(e?.message || e);
  try {
    fs.mkdirSync('public/project-001', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    fs.writeFileSync(
      SUMMARY,
      JSON.stringify(
        {
          id: 'wa-alert-one-way-summary',
          at: new Date().toISOString(),
          full_path_ok: false,
          error: out.error,
          production_touched: false,
        },
        null,
        2,
      ),
    );
  } catch {
    /* ignore */
  }
  console.error(e);
  process.exit(1);
});
