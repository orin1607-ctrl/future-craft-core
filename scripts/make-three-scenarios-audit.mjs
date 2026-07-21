/**
 * Staging-only Make audit after Owner activated bot + 3 related scenarios.
 * NO WhatsApp send. NO Production. NO queue delete. NO auto-reply to old incomings.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const KNOWN = {
  whatsapp_bot: 5797671,
  bot_hook: 2567320,
  dedicated_dlr_name: 'CO.CO Dalia DLR → Staging',
};
const OWNER_E164 = '972534338601';
const OUT = 'public/project-001/make-three-scenarios-audit-result.json';
const FROM_MS = Date.now() - 6 * 60 * 60 * 1000;

const out = {
  id: 'make-three-scenarios-audit',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  no_whatsapp_send: true,
  no_queue_delete: true,
  no_auto_reply_old_queue: true,
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

function redactUrl(u) {
  if (!u || typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    return `${url.host}/…${last.slice(-8)}`;
  } catch {
    return String(u).slice(0, 40) + '…';
  }
}

function moduleBrief(m) {
  const name = m.metadata?.designer?.name || null;
  const url = m.mapper?.url || m.parameters?.url || null;
  const data = m.mapper?.data || m.mapper?.inputRaw || null;
  const mod = String(m.module || '');
  return {
    id: m.id,
    module: mod,
    name,
    url: redactUrl(url),
    url_full_host: url ? (() => { try { return new URL(url).host + new URL(url).pathname.split('/').slice(0, 3).join('/'); } catch { return null; } })() : null,
    data_expr_preview: typeof data === 'string' ? data.slice(0, 80) : data == null ? null : typeof data,
    has_toJSON: typeof data === 'string' && /toJSON/i.test(data),
    looks_webhook: /webhook|CustomWebHook/i.test(mod),
    looks_dlr_forward: typeof url === 'string' && /gupshup-webhook/i.test(url),
    looks_gupshup_send: typeof url === 'string' && /api\.gupshup\.io.*msg/i.test(url),
    looks_ai: /ai-agent|openai|chatgpt|anthropic/i.test(mod),
    looks_router: /BasicRouter|router/i.test(mod),
    looks_sheets: /google-sheets/i.test(mod),
    hook_param: m.parameters?.hook || m.parameters?.hookId || null,
  };
}

function classifyRole(name, mods) {
  const n = String(name || '').toLowerCase();
  const hasAi = mods.some((m) => m.looks_ai);
  const hasGsSend = mods.some((m) => m.looks_gupshup_send);
  const hasDlr = mods.some((m) => m.looks_dlr_forward);
  const hasWh = mods.some((m) => m.looks_webhook);
  if (/dlr|delivery|staging/i.test(n) && hasDlr && !hasAi && !hasGsSend) {
    return { role: 'dlr_forward_only', he: 'העברת סטטוסי DLR ל-Supabase Staging בלבד' };
  }
  if (/whatsapp bot|bot/i.test(n) || (hasAi && hasGsSend)) {
    return {
      role: 'inbound_chatbot',
      he: 'בוט נכנס: Webhook → (Sheets/AI) → תשובת Gupshup; עלול לכלול גם forward DLR',
    };
  }
  if (hasDlr && hasWh) {
    return { role: 'dlr_or_mixed_forward', he: 'Webhook + forward ל-Supabase (DLR/mixed)' };
  }
  if (hasWh) return { role: 'webhook_consumer', he: 'צרכן Webhook (תפקיד לא מסווג במלואו)' };
  return { role: 'other', he: 'אחר / לא מזוהה כמסלול WA' };
}

function extractBody(detail) {
  const data = detail?.data || detail || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? data.payload ?? detail?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      /* keep */
    }
  }
  return body;
}

function classifyPayload(body) {
  if (!body) return { kind: 'empty' };
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const st = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  if (msg) {
    return {
      kind: 'inbound_message',
      from: msg.from || null,
      text: (msg.text?.body || msg.type || '').slice(0, 80),
      wa_id: msg.id || null,
      ts: msg.timestamp || null,
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
  return { kind: 'other', preview: JSON.stringify(body).slice(0, 100) };
}

async function listAllScenarios(teamId) {
  const all = [];
  let offset = 0;
  for (let p = 0; p < 20; p++) {
    const r = await make(
      `/scenarios?teamId=${teamId}&pg[offset]=${offset}&pg[limit]=50&cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=hookId&cols[]=scheduling&cols[]=dlqCount&cols[]=iswaiting&cols[]=isPaused&cols[]=lastEdit`,
    );
    const list = r.json?.scenarios || [];
    all.push(...list);
    if (list.length < 50) break;
    offset += 50;
  }
  return all;
}

async function listHooks(teamId) {
  const all = [];
  let offset = 0;
  for (let p = 0; p < 10; p++) {
    const r = await make(`/hooks?teamId=${teamId}&pg[offset]=${offset}&pg[limit]=50`);
    const list = r.json?.hooks || [];
    all.push(...list);
    if (list.length < 50) break;
    offset += 50;
  }
  return all;
}

async function getBlueprint(scenarioId) {
  const bpRes = await make(`/scenarios/${scenarioId}/blueprint`);
  let blueprint = bpRes.json?.blueprint || bpRes.json?.response?.blueprint || bpRes.json;
  if (!blueprint?.flow) {
    const scFull = await make(`/scenarios/${scenarioId}`);
    blueprint = scFull.json?.scenario?.blueprint || scFull.json?.blueprint || null;
  }
  return { http: bpRes.status, blueprint };
}

async function recentExecErrors(scenarioId) {
  const r = await make(`/scenarios/${scenarioId}/logs?pg[limit]=15&pg[sortDir]=desc`);
  const arr = r.json?.scenarioLogs || r.json?.logs || [];
  const recent = (Array.isArray(arr) ? arr : []).slice(0, 12).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt || x.createdAt,
    duration: x.duration || null,
    error: x.error?.message || x.error || x.message || null,
  }));
  const details = [];
  for (const row of recent.slice(0, 5)) {
    if (!row.id) continue;
    const d = await make(`/scenarios/${scenarioId}/logs/${row.id}`);
    const log = d.json?.scenarioLog || d.json?.log || d.json;
    details.push({
      id: row.id,
      detail_http: d.status,
      status: log?.status ?? log?.statusId ?? row.status,
      error: log?.error?.message || log?.error || log?.message || null,
      has_toJSON_error:
        typeof (log?.error?.message || log?.error || '') === 'string' &&
        /toJSON/i.test(String(log?.error?.message || log?.error || '')),
    });
  }
  return { http: r.status, recent, details };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  const me = await make('/users/me');
  must(me.status === 200, `Make auth failed ${me.status}`);
  const orgs = await make('/organizations');
  const orgId = (orgs.json?.organizations || [])[0]?.id;
  must(orgId, 'No org');
  const teams = await make(`/teams?organizationId=${orgId}`);
  const teamId = (teams.json?.teams || [])[0]?.id;
  must(teamId, 'No team');
  out.teamId = teamId;

  const scenarios = await listAllScenarios(teamId);
  const active = scenarios.filter((s) => s.isActive === true);
  out.scenarios_total = scenarios.length;
  out.active_count = active.length;
  out.active_names = active.map((s) => ({ id: s.id, name: s.name }));

  const hooks = await listHooks(teamId);
  const hookById = Object.fromEntries(hooks.map((h) => [h.id, h]));
  out.hooks_summary = hooks.map((h) => ({
    id: h.id,
    name: h.name || null,
    enabled: h.enabled,
    queueCount: h.queueCount,
    scenarioId: h.scenarioId,
    tip: redactUrl(h.url || h.address || h.hookUrl || ''),
  }));

  // Enrich each ACTIVE scenario
  const activeDetailed = [];
  for (const s of active) {
    const { blueprint } = await getBlueprint(s.id);
    const mods = walkModules(blueprint).map(moduleBrief);
    const role = classifyRole(s.name, mods);
    let schedulingType = null;
    try {
      const sch = typeof s.scheduling === 'string' ? JSON.parse(s.scheduling) : s.scheduling;
      schedulingType = sch?.type || null;
    } catch {
      schedulingType = null;
    }
    const hookId = s.hookId || mods.find((m) => m.hook_param)?.hook_param || null;
    const hook = hookId ? hookById[hookId] : null;
    const exec = await recentExecErrors(s.id);
    activeDetailed.push({
      id: s.id,
      name: s.name,
      isActive: true,
      islinked: s.islinked === true,
      iswaiting: s.iswaiting,
      isPaused: s.isPaused,
      dlqCount: s.dlqCount,
      scheduling_type: schedulingType,
      hookId,
      hook_queueCount: hook?.queueCount ?? null,
      hook_enabled: hook?.enabled ?? null,
      role: role.role,
      role_he: role.he,
      modules: mods,
      module_flags: {
        webhook: mods.some((m) => m.looks_webhook),
        dlr_forward: mods.some((m) => m.looks_dlr_forward),
        gupshup_send: mods.some((m) => m.looks_gupshup_send),
        ai: mods.some((m) => m.looks_ai),
        router: mods.some((m) => m.looks_router),
        toJSON_in_mapper: mods.some((m) => m.has_toJSON),
        module_98: mods.find((m) => m.id === 98) || null,
      },
      recent_executions: exec,
    });
  }
  out.active_scenarios = activeDetailed;

  // Focus known + WA-related actives
  const waRelated = activeDetailed.filter(
    (s) =>
      s.id === KNOWN.whatsapp_bot ||
      s.role.includes('dlr') ||
      s.role.includes('bot') ||
      s.role.includes('webhook') ||
      /whatsapp|gupshup|dalia|dlr|bot/i.test(s.name),
  );
  out.wa_related_active = waRelated.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    role_he: s.role_he,
    hookId: s.hookId,
    islinked: s.islinked,
  }));

  // Duplication: same hookId shared by 2+ active scenarios
  const hookOwners = {};
  for (const s of activeDetailed) {
    if (!s.hookId) continue;
    hookOwners[s.hookId] = hookOwners[s.hookId] || [];
    hookOwners[s.hookId].push({ id: s.id, name: s.name, role: s.role });
  }
  const sharedHooks = Object.entries(hookOwners)
    .filter(([, owners]) => owners.length > 1)
    .map(([hookId, owners]) => ({ hookId: Number(hookId), owners }));

  // Also: multiple actives with gupshup-webhook forward AND chatbot on same hook as Gupshup callback
  const botHookConsumers = activeDetailed.filter((s) => s.hookId === KNOWN.bot_hook);
  out.duplication = {
    shared_hooks_among_active: sharedHooks,
    bot_hook_2567320_active_consumers: botHookConsumers.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
    })),
    risk:
      sharedHooks.length > 0
        ? 'HIGH — two+ active scenarios share one Make hook; Make usually binds one scenario per hook, verify UI'
        : botHookConsumers.length > 1
          ? 'MEDIUM — multiple active scenarios claim bot hook'
          : 'OK — no two active scenarios share the same hookId in API listing',
  };

  // Whatsapp Bot specifically
  const bot =
    activeDetailed.find((s) => s.id === KNOWN.whatsapp_bot) ||
    activeDetailed.find((s) => /whatsapp bot/i.test(s.name)) ||
    null;
  const botInactive = scenarios.find((s) => s.id === KNOWN.whatsapp_bot);
  out.whatsapp_bot = bot
    ? {
        active: true,
        id: bot.id,
        name: bot.name,
        islinked: bot.islinked,
        scheduling_type: bot.scheduling_type,
        hookId: bot.hookId,
        hook_queueCount: bot.hook_queueCount,
        realtime_ok: bot.islinked === true && bot.scheduling_type === 'immediately' && bot.isActive !== false,
        module_98: bot.module_flags.module_98,
        toJSON_still_in_blueprint: bot.module_flags.toJSON_in_mapper,
        recent_toJSON_errors: (bot.recent_executions.details || []).filter((d) => d.has_toJSON_error),
        latest_executions: bot.recent_executions.recent,
        has_ai: bot.module_flags.ai,
        has_gupshup_send: bot.module_flags.gupshup_send,
        has_router: bot.module_flags.router,
        has_dlr_forward: bot.module_flags.dlr_forward,
      }
    : {
        active: false,
        listed: botInactive
          ? { id: botInactive.id, name: botInactive.name, isActive: botInactive.isActive, islinked: botInactive.islinked }
          : null,
      };

  // Module 98 live check from recent errors + blueprint
  out.module_98_status = {
    present_in_bot_blueprint: Boolean(out.whatsapp_bot?.module_98),
    still_uses_toJSON: Boolean(out.whatsapp_bot?.toJSON_still_in_blueprint),
    recent_failures_with_toJSON: out.whatsapp_bot?.recent_toJSON_errors || [],
    still_broken:
      Boolean(out.whatsapp_bot?.toJSON_still_in_blueprint) ||
      (out.whatsapp_bot?.recent_toJSON_errors || []).length > 0,
  };

  // Queue inspect (read-only) on bot hook
  const hookId = KNOWN.bot_hook;
  const stats = await make(`/hooks/${hookId}/incomings/stats`);
  const list = await make(`/hooks/${hookId}/incomings?pg[limit]=20`);
  const items = list.json?.hookIncomings || list.json?.incomings || [];
  const queued = [];
  for (const item of Array.isArray(items) ? items : []) {
    const id = item.id;
    const detail = await make(`/hooks/${hookId}/incomings/${id}`);
    const d = detail.json?.hookIncoming || detail.json?.incoming || detail.json || {};
    let body = extractBody(d);
    if (!body) {
      const logTry = await make(`/hooks/${hookId}/logs/${id}`);
      body = extractBody(logTry.json?.hookLog || logTry.json?.log || logTry.json);
    }
    const cls = classifyPayload(body);
    queued.push({
      id,
      size: item.size ?? d.size ?? null,
      createdAt: item.createdAt || d.createdAt || null,
      classification: cls,
      action: 'HOLD — do not process/reply without Owner approval',
    });
  }
  out.queue_inspect = {
    hook_id: hookId,
    stats: stats.json,
    list_count: Array.isArray(items) ? items.length : null,
    items: queued,
    policy: 'No auto-reply to old queued messages without Owner approval',
  };

  // Path separation assessment
  const dlrOnlyActives = activeDetailed.filter((s) => s.role === 'dlr_forward_only');
  const chatbotActives = activeDetailed.filter((s) => s.role === 'inbound_chatbot');
  out.path_separation = {
    chatbot_scenarios: chatbotActives.map((s) => s.id),
    dlr_only_scenarios: dlrOnlyActives.map((s) => s.id),
    bot_still_has_dlr_forward_inline: Boolean(out.whatsapp_bot?.has_dlr_forward),
    dlr_can_abort_bot:
      Boolean(out.whatsapp_bot?.has_dlr_forward) && Boolean(out.module_98_status.still_broken),
    assessment_he: null,
  };

  // Recent hook logs after activation (inbound vs dlr)
  const logsList = await make(
    `/hooks/${hookId}/logs?from=${FROM_MS}&pg[limit]=40&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const hookLogs = logsList.json?.hookLogs || logsList.json?.logs || [];
  const inbound = [];
  const dlr = [];
  for (const log of (hookLogs || []).slice(0, 30)) {
    let body = extractBody(log);
    if (!body) {
      const detail = await make(`/hooks/${hookId}/logs/${log.id}`);
      body = extractBody(detail.json?.hookLog || detail.json?.log || detail.json);
    }
    const cls = classifyPayload(body);
    const row = { loggedAt: log.loggedAt, id: log.id, ...cls };
    if (cls.kind === 'inbound_message') inbound.push(row);
    if (cls.kind === 'delivery_status') dlr.push(row);
  }
  out.hook_traffic_6h = {
    inbound_count: inbound.length,
    dlr_count: dlr.length,
    inbound_recent: inbound.slice(0, 8),
    dlr_recent: dlr.slice(0, 8),
  };

  // Gates for "tell Owner to send היי"
  const checks = {
    whatsapp_bot_active: out.whatsapp_bot?.active === true,
    whatsapp_bot_linked: out.whatsapp_bot?.islinked === true,
    module_98_toJSON_fixed: out.module_98_status.still_broken !== true,
    no_hook_duplication: sharedHooks.length === 0,
    dlr_does_not_abort_bot: out.path_separation.dlr_can_abort_bot !== true,
    queue_old_not_auto_replied: true, // we did not process
    queue_empty_or_held: true, // held by policy; prefer empty for clean היי test
  };
  // Prefer queue empty for clean realtime test — if queue has old inbounds, warn but can still test NEW message if Active
  const queueHasOldInbound = queued.some((q) => q.classification?.kind === 'inbound_message');
  checks.queue_has_old_inbound_held = queueHasOldInbound;
  checks.safe_to_ask_owner_hey =
    checks.whatsapp_bot_active &&
    checks.whatsapp_bot_linked &&
    checks.module_98_toJSON_fixed &&
    checks.no_hook_duplication &&
    checks.dlr_does_not_abort_bot;

  out.path_separation.assessment_he = out.path_separation.dlr_can_abort_bot
    ? 'DLR עדיין בתוך Whatsapp Bot עם toJSON שבור — עלול לעצור את מסלול הבוט/AI'
    : out.whatsapp_bot?.has_dlr_forward && dlrOnlyActives.length
      ? 'יש גם DLR ייעודי וגם forward בתוך הבוט — לבדוק כפילות DLR; לפחות toJSON לא שובר כרגע'
      : dlrOnlyActives.length && !out.whatsapp_bot?.has_dlr_forward
        ? 'הפרדה טובה: בוט בלי forward DLR + תרחיש DLR נפרד'
        : 'בדוק ידנית — ראה active_scenarios';

  out.checks = checks;
  out.owner_next = checks.safe_to_ask_owner_hey
    ? {
        ask_hey: true,
        phrase_he:
          'הכול תקין לבדיקת זמן-אמת. שלח עכשיו «היי» מ-0534338601 אל 054-650-0305. אל תצפה לתשובות על ההודעות הישנות שבתור עד אישור נפרד.',
        note_queue: queueHasOldInbound
          ? 'יש הודעות ישנות בתור — לא עיבדנו אותן. היי חדש אמור לרוץ מיד אם Active+linked; הישנות נשארות HOLD.'
          : 'תור ריק או בלי inbound ישן — מוכן ל-היי נקי.',
      }
    : {
        ask_hey: false,
        blockers: Object.entries(checks)
          .filter(([k, v]) => k.startsWith('safe') === false && v === false)
          .map(([k]) => k),
        phrase_he:
          'עדיין לא מוכן ל-«היי». יש לתקן את ה-blockers לפני בדיקת זמן-אמת.',
      };

  out.answers = {
    '1_three_active_scenarios': out.wa_related_active.length
      ? out.wa_related_active
      : out.active_scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          role_he: s.role_he,
          hookId: s.hookId,
        })),
    '2_duplication': out.duplication,
    '3_whatsapp_bot_realtime': out.whatsapp_bot,
    '4_module_98_toJSON': out.module_98_status,
    '5_inbound_to_bot_ai': {
      has_ai: out.whatsapp_bot?.has_ai,
      has_gupshup_send: out.whatsapp_bot?.has_gupshup_send,
      bot_active: out.whatsapp_bot?.active,
      note: 'Structural path present if AI+Gupshup send modules exist and bot Active; live proof needs Owner היי after gates pass',
    },
    '6_dlr_separate': out.path_separation,
    '7_queue_three': out.queue_inspect,
    '8_ask_hey': out.owner_next,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        active_count: out.active_count,
        wa_related: out.wa_related_active,
        checks: out.checks,
        owner_next: out.owner_next,
        module_98: out.module_98_status,
        queue_count: out.queue_inspect.list_count,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
