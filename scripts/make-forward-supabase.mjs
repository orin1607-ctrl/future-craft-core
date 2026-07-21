/**
 * Make.com → diagnose hooks + ensure HTTP forward to Staging gupshup-webhook (Option B)
 * then one Staging live WhatsApp + DLR poll.
 * Never prints secret values. Production untouched. Gupshup portal webhook untouched.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zoneRaw = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '');
const zone = zoneRaw || 'eu1';
const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const SUPABASE_HOOK = `https://${STAGING}.supabase.co/functions/v1/gupshup-webhook`;
const OWNER_EMAIL = 'orin1607@gmail.com';
const WA_DEST = '0534338601';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
/** Gupshup callback hook is Whatsapp Bot — do NOT re-inject HTTP Forward there (breaks AI replies). */
const MATCHED_HOOK_ID = Number(process.env.MAKE_MATCHED_HOOK_ID || 2567320);
const WHATSAPP_BOT_SCENARIO_ID = 5797671;
/** Prefer dedicated DLR scenario for Supabase forward patches. */
const MATCHED_SCENARIO_ID = Number(process.env.MAKE_MATCHED_SCENARIO_ID || 9553017);
const MATCHED_URL_TIP = (process.env.MAKE_MATCHED_URL_TIP || 'plyk4s').toLowerCase();
/** toJSON/createJSON both failed in Bot HTTP module — keep Forward off Whatsapp Bot. */
const DATA_EXPR_PREFERRED = (whId) => `{{createJSON(${whId})}}`;
const DATA_EXPR_FALLBACK = (whId) => `{{${whId}.value}}`;

const out = {
  env: 'staging',
  production_touched: false,
  gupshup_portal_untouched: true,
  make_zone: zone,
  make_token_present: Boolean(token),
  supabase_hook: SUPABASE_HOOK,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function redactUrl(u) {
  if (!u || typeof u !== 'string') return null;
  // keep host + last 6 of path token
  try {
    const url = new URL(u);
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const tip = last.slice(-6);
    return `${url.host}/…${tip}`;
  } catch {
    return String(u).slice(0, 24) + '…';
  }
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
  return { status: res.status, json, text: text.slice(0, 1200) };
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

function maxModuleId(mods) {
  let m = 0;
  for (const x of mods) {
    const id = Number(x.id) || 0;
    if (id > m) m = id;
  }
  return m;
}

function findForwardModules(mods) {
  return mods.filter((m) => {
    const url = m?.mapper?.url || m?.mapper?.URL || '';
    return typeof url === 'string' && url.includes('gupshup-webhook') && url.includes(STAGING);
  });
}

function alreadyForwards(mods) {
  return findForwardModules(mods).length > 0;
}

function findWebhookModule(mods) {
  return mods.find((m) =>
    /webhook|CustomWebHook|gateway:CustomWebHook|webhooks/i.test(String(m.module || '')),
  ) || null;
}

function hookIdFromWebhookModule(wh) {
  return wh?.parameters?.hook || wh?.parameters?.hookId || wh?.mapper?.hook || null;
}

function buildHttpModule(wh, newId) {
  const whId = wh.id;
  const dataExpr = DATA_EXPR_PREFERRED(whId);
  return {
    id: newId,
    module: 'http:ActionSendData',
    version: 3,
    parameters: {
      handleErrors: false,
      useNewZLibDeCompress: true,
    },
    mapper: {
      url: SUPABASE_HOOK,
      serializeUrl: false,
      method: 'post',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
      ],
      qs: [],
      bodyType: 'raw',
      parseResponse: true,
      authUser: '',
      authPass: '',
      timeout: '',
      shareCookies: false,
      ca: '',
      rejectUnauthorized: true,
      followRedirect: true,
      useQuerystring: false,
      gzip: true,
      useMtls: false,
      contentType: 'application/json',
      data: dataExpr,
      inputRaw: dataExpr,
      followAllRedirects: false,
    },
    metadata: {
      designer: {
        x: (wh.metadata?.designer?.x || 300) + 300,
        y: (wh.metadata?.designer?.y || 0),
        name: 'Forward DLR to Supabase Staging',
      },
    },
  };
}

function insertInFlow(flow, whId, httpModule) {
  if (!Array.isArray(flow)) return false;
  const idx = flow.findIndex((m) => m && m.id === whId);
  if (idx >= 0) {
    flow.splice(idx + 1, 0, httpModule);
    return true;
  }
  for (const m of flow) {
    if (Array.isArray(m?.routes)) {
      for (const r of m.routes) {
        if (insertInFlow(r?.flow, whId, httpModule)) return true;
      }
    }
    if (Array.isArray(m?.flow) && insertInFlow(m.flow, whId, httpModule)) return true;
  }
  return false;
}

function ensureHttpAfterWebhook(blueprint, { forceRemap = false } = {}) {
  const bp = blueprint.flow
    ? structuredClone(blueprint)
    : structuredClone(blueprint.blueprint || blueprint);
  must(bp && Array.isArray(bp.flow), 'Blueprint has no top-level flow array — unsupported shape');

  const mods = walkModules(bp);
  const wh = findWebhookModule(mods);
  must(wh, 'No webhook module found in scenario flow');

  const existing = findForwardModules(mods);
  if (existing.length) {
    let remapped = 0;
    for (const m of existing) {
      const want = DATA_EXPR_PREFERRED(wh.id);
      const cur = m.mapper?.data || m.mapper?.inputRaw || '';
      if (forceRemap || cur !== want) {
        m.mapper = m.mapper || {};
        m.mapper.url = SUPABASE_HOOK;
        m.mapper.method = 'post';
        m.mapper.bodyType = 'raw';
        m.mapper.contentType = 'application/json';
        m.mapper.data = want;
        m.mapper.inputRaw = want;
        remapped += 1;
      }
    }
    return {
      bp,
      changed: remapped > 0,
      reason: remapped ? 'remapped_forward_body_createJSON' : 'already_forwards_to_supabase',
      webhook_module_id: wh.id,
      http_module_id: existing[0].id,
      remapped,
    };
  }

  const newId = maxModuleId(mods) + 1;
  const httpModule = buildHttpModule(wh, newId);
  const inserted = insertInFlow(bp.flow, wh.id, httpModule);
  if (!inserted) bp.flow.push(httpModule);

  return {
    bp,
    changed: true,
    reason: 'inserted_http_forward',
    webhook_module_id: wh.id,
    http_module_id: newId,
  };
}

async function discoverTeams() {
  const teams = [];
  const me = await make('/users/me');
  out.make_user = {
    http: me.status,
    ok: me.status === 200,
    id: me.json?.authUser?.id || me.json?.user?.id || me.json?.id || null,
  };
  must(me.status === 200, `Make auth failed HTTP ${me.status}: ${me.text.slice(0, 200)}`);

  const orgs = await make('/organizations');
  const orgList = orgs.json?.organizations || orgs.json || [];
  out.organizations_count = Array.isArray(orgList) ? orgList.length : 0;

  if (Array.isArray(orgList)) {
    for (const org of orgList) {
      const oid = org.id || org.organizationId;
      if (!oid) continue;
      const tr = await make(`/teams?organizationId=${oid}`);
      const tlist = tr.json?.teams || tr.json || [];
      if (Array.isArray(tlist)) {
        for (const t of tlist) {
          teams.push({
            id: t.id,
            name: t.name,
            organizationId: oid,
            organizationName: org.name,
          });
        }
      }
    }
  }

  if (!teams.length) {
    const tr = await make('/teams');
    const tlist = tr.json?.teams || tr.json || [];
    if (Array.isArray(tlist)) {
      for (const t of tlist) teams.push({ id: t.id, name: t.name });
    }
  }

  out.teams = teams.map((t) => ({ id: t.id, name: t.name, org: t.organizationName || null }));
  must(teams.length, 'No Make teams found — check token scopes (teams:read)');
  return teams;
}

async function listScenarios(teamId) {
  const all = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const r = await make(`/scenarios?teamId=${teamId}&pg[offset]=${offset}&pg[limit]=50`);
    const list = r.json?.scenarios || [];
    if (!Array.isArray(list) || !list.length) break;
    all.push(...list);
    if (list.length < 50) break;
    offset += 50;
  }
  return all;
}

async function listHooks(teamId) {
  const all = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const r = await make(`/hooks?teamId=${teamId}&typeName=gateway-webhook&pg[offset]=${offset}&pg[limit]=50`);
    const list = r.json?.hooks || [];
    if (!Array.isArray(list) || !list.length) break;
    all.push(...list);
    if (list.length < 50) break;
    offset += 50;
  }
  return all;
}

function scoreHookLogPayload(text) {
  const s = String(text || '').toLowerCase();
  let score = 0;
  if (s.includes('message-event')) score += 40;
  if (s.includes('"type":"delivered"') || s.includes('"type":"sent"') || s.includes('"type":"read"')) score += 30;
  if (s.includes('eventtype') || s.includes('externalid')) score += 20;
  if (s.includes('gsid') || s.includes('gs_id')) score += 15;
  if (s.includes('whatsapp') || s.includes('gupshup')) score += 10;
  if (s.includes('destination') || s.includes('destaddr')) score += 5;
  return score;
}

function extractLogBody(log) {
  const data = log?.data || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? data.payload ?? '';
  if (body && typeof body === 'object') body = JSON.stringify(body);
  if ((!body || body === '{}' || body === '') && log?.request) {
    const b2 = log.request.body ?? log.request.parsed ?? '';
    body = typeof b2 === 'string' ? b2 : JSON.stringify(b2 || '');
  }
  return String(body || '');
}

async function inspectHookLogs(hookId, fromMs) {
  const r = await make(
    `/hooks/${hookId}/logs?from=${fromMs}&pg[limit]=25&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const logs = r.json?.hookLogs || r.json?.logs || [];
  if (!Array.isArray(logs)) return { http: r.status, count: 0, dlr_hits: 0, samples: [] };
  let dlrHits = 0;
  const samples = [];
  for (const log of logs.slice(0, 15)) {
    let bodyStr = extractLogBody(log);
    // List endpoint often omits body — fetch log detail
    if ((!bodyStr || bodyStr === '{}') && log.id != null) {
      const detail = await make(`/hooks/${hookId}/logs/${log.id}`);
      const dlog = detail.json?.hookLog || detail.json?.log || detail.json;
      bodyStr = extractLogBody(dlog) || bodyStr;
    }
    const sc = scoreHookLogPayload(bodyStr);
    if (sc >= 20) dlrHits += 1;
    if (samples.length < 5) {
      samples.push({
        id: log.id,
        loggedAt: log.loggedAt,
        statusId: log.statusId,
        score: sc,
        body_excerpt: bodyStr.slice(0, 220).replace(/\s+/g, ' '),
      });
    }
  }
  return { http: r.status, count: logs.length, dlr_hits: dlrHits, samples };
}

function scoreScenario(s, mods, hookMeta) {
  let score = 0;
  const name = `${s.name || ''} ${s.description || ''}`.toLowerCase();
  if (/gupshup|whatsapp|dalia|wa\b|dlr|delivery|make\.com/i.test(name)) score += 50;
  if (s.isActive || s.islinked) score += 10;
  if (findWebhookModule(mods)) score += 30;
  if (alreadyForwards(mods)) score += 5;
  if (hookMeta?.dlr_hits) score += 80 + Math.min(40, hookMeta.dlr_hits * 5);
  if (hookMeta?.recent_count) score += Math.min(20, hookMeta.recent_count);
  return score;
}

async function patchScenarioBlueprint(scenarioId, nextBp) {
  const bpString = typeof nextBp === 'string' ? nextBp : JSON.stringify(nextBp);
  // Prefer stringified blueprint + confirmed (Make docs)
  let patch = await make(`/scenarios/${scenarioId}?confirmed=true`, {
    method: 'PATCH',
    body: { blueprint: bpString },
  });
  if (patch.status >= 400) {
    patch = await make(`/scenarios/${scenarioId}?confirmed=true`, {
      method: 'PATCH',
      body: { blueprint: nextBp },
    });
  }
  return patch;
}

async function configureMake() {
  must(token, 'MAKE_API_TOKEN missing in Actions secrets');
  const teams = await discoverTeams();
  const fromMs = Date.now() - 6 * 60 * 60 * 1000;

  const hookIndex = [];
  for (const team of teams) {
    const hooks = await listHooks(team.id);
    for (const h of hooks) {
      const logs = await inspectHookLogs(h.id, fromMs);
      hookIndex.push({
        teamId: team.id,
        teamName: team.name,
        id: h.id,
        name: h.name || h.hookName || null,
        enabled: h.enabled !== false,
        scenarioId: h.scenarioId || null,
        url_redacted: redactUrl(h.url),
        recent_count: logs.count,
        dlr_hits: logs.dlr_hits,
        log_samples: logs.samples,
      });
    }
  }
  out.hooks = hookIndex.map((h) => ({
    id: h.id,
    name: h.name,
    enabled: h.enabled,
    scenarioId: h.scenarioId,
    url_redacted: h.url_redacted,
    recent_count: h.recent_count,
    dlr_hits: h.dlr_hits,
    top_sample: h.log_samples[0] || null,
  }));

  const candidates = [];
  for (const team of teams) {
    const scenarios = await listScenarios(team.id);
    for (const s of scenarios) {
      const br = await make(`/scenarios/${s.id}/blueprint`);
      if (br.status !== 200) continue;
      let rawBp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
      if (typeof rawBp === 'string') {
        try { rawBp = JSON.parse(rawBp); } catch { continue; }
      }
      const mods = walkModules(rawBp);
      const wh = findWebhookModule(mods);
      if (!wh) continue;
      const hid = hookIdFromWebhookModule(wh) || s.hookId;
      const hookMeta = hookIndex.find((h) => h.id === hid || h.scenarioId === s.id) || null;
      candidates.push({
        teamId: team.id,
        teamName: team.name,
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        hookId: hid || hookMeta?.id || null,
        score: scoreScenario(s, mods, hookMeta),
        already: alreadyForwards(mods),
        module_count: mods.length,
        modules: mods.map((m) => m.module).slice(0, 12),
        forward_data: findForwardModules(mods).map((m) => m.mapper?.data || null),
        dlr_hits: hookMeta?.dlr_hits || 0,
        recent_hook_logs: hookMeta?.recent_count || 0,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  out.candidates = candidates.slice(0, 20);
  must(candidates.length, 'No scenarios with webhook modules found');

  // Owner MATCH pin: prefer dedicated DLR scenario — never re-inject Forward into Whatsapp Bot
  let chosen =
    candidates.find((c) => c.id === MATCHED_SCENARIO_ID) ||
    candidates.find((c) => /CO\.CO Dalia DLR/i.test(c.name || '')) ||
    candidates.find((c) => c.hookId === MATCHED_HOOK_ID && c.id !== WHATSAPP_BOT_SCENARIO_ID) ||
    candidates.find((c) => {
      const tip = (hookIndex.find((h) => h.id === c.hookId)?.url_redacted || '').toLowerCase();
      return tip.includes(MATCHED_URL_TIP) && c.id !== WHATSAPP_BOT_SCENARIO_ID;
    }) ||
    candidates.find((c) => c.dlr_hits > 0 && c.id !== WHATSAPP_BOT_SCENARIO_ID) ||
    candidates.find((c) => c.already && /dlr/i.test(c.name || '')) ||
    candidates.find((c) => c.id !== WHATSAPP_BOT_SCENARIO_ID) ||
    candidates[0];

  if (chosen.id === WHATSAPP_BOT_SCENARIO_ID) {
    out.make_configure = {
      changed: false,
      reason: 'skip_whatsapp_bot_forward_injection',
      note: 'Whatsapp Bot must stay free of broken HTTP Forward so AI→Gupshup replies work',
    };
    out.chosen = {
      id: chosen.id,
      name: chosen.name,
      skipped_forward_patch: true,
    };
    return chosen;
  }

  out.chosen = {
    id: chosen.id,
    name: chosen.name,
    teamId: chosen.teamId,
    teamName: chosen.teamName,
    already: chosen.already,
    score: chosen.score,
    hookId: chosen.hookId,
    dlr_hits: chosen.dlr_hits,
    pinned_match: chosen.id === MATCHED_SCENARIO_ID || chosen.hookId === MATCHED_HOOK_ID,
  };

  // Always force remap of body if forward exists with wrong expr
  const br = await make(`/scenarios/${chosen.id}/blueprint`);
  must(br.status === 200, `Get blueprint failed HTTP ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  if (typeof bp === 'string') bp = JSON.parse(bp);

  const { bp: nextBp, changed, reason, webhook_module_id, http_module_id, remapped } =
    ensureHttpAfterWebhook(bp, { forceRemap: true });

  if (!changed) {
    out.make_configure = { changed: false, reason, webhook_module_id, http_module_id };
  } else {
    const patch = await patchScenarioBlueprint(chosen.id, nextBp);
    out.make_configure = {
      changed: true,
      reason,
      remapped: remapped || 0,
      patch_http: patch.status,
      webhook_module_id,
      http_module_id,
      ok: patch.status >= 200 && patch.status < 300,
      error: patch.status >= 300 ? patch.text.slice(0, 300) : null,
      data_expr: DATA_EXPR_PREFERRED(webhook_module_id),
      fallback_expr: DATA_EXPR_FALLBACK(webhook_module_id),
    };
    must(out.make_configure.ok, `Make PATCH failed HTTP ${patch.status}: ${patch.text.slice(0, 300)}`);
  }

  // Ensure scenario + hook enabled
  if (chosen.isActive === false) {
    const act = await make(`/scenarios/${chosen.id}/start`, { method: 'POST', body: {} });
    // fallback
    if (act.status >= 400) {
      await make(`/scenarios/${chosen.id}?confirmed=true`, { method: 'PATCH', body: { isActive: true } });
    }
    out.make_activate = { attempted: true };
  }
  if (chosen.hookId) {
    const en = await make(`/hooks/${chosen.hookId}/enable`, { method: 'POST', body: {} });
    out.hook_enable = { hookId: chosen.hookId, http: en.status };
  }

  // Also add/remap forward on any OTHER active scenario whose hook saw DLR hits
  const extras = [];
  for (const c of candidates) {
    if (c.id === chosen.id) continue;
    if (!(c.dlr_hits > 0 || (c.isActive && /delivery|dlr|gupshup/i.test(c.name || '')))) continue;
    const br2 = await make(`/scenarios/${c.id}/blueprint`);
    if (br2.status !== 200) continue;
    let bp2 = br2.json?.response?.blueprint || br2.json?.blueprint || br2.json;
    if (typeof bp2 === 'string') bp2 = JSON.parse(bp2);
    const ens = ensureHttpAfterWebhook(bp2, { forceRemap: true });
    if (!ens.changed) {
      extras.push({ id: c.id, name: c.name, changed: false, reason: ens.reason });
      continue;
    }
    const p2 = await patchScenarioBlueprint(c.id, ens.bp);
    extras.push({
      id: c.id,
      name: c.name,
      changed: true,
      patch_http: p2.status,
      ok: p2.status >= 200 && p2.status < 300,
    });
  }
  if (extras.length) out.extra_forwards = extras;

  return chosen;
}

async function stagingLiveE2e(chosen) {
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');

  async function mgmt(path) {
    const res = await fetch(`https://api.supabase.com/v1${path}`, {
      headers: { Authorization: `Bearer ${sbToken}`, apikey: sbToken },
    });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json };
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

  process.env.SUPABASE_ACCESS_TOKEN = sbToken;
  try {
    execSync(`npx --yes supabase functions deploy gupshup-webhook --project-ref ${STAGING} --use-api`, {
      encoding: 'utf8',
      timeout: 180000,
    });
    execSync(`npx --yes supabase functions deploy send-whatsapp-message --project-ref ${STAGING} --use-api`, {
      encoding: 'utf8',
      timeout: 180000,
    });
    out.deploy_ok = true;
  } catch (e) {
    out.deploy_ok = false;
    out.deploy_error = String(e.stderr || e.message || e).slice(0, 400);
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

  // Sanity: direct POST to our webhook still works
  const simId = `sim-make-${Date.now()}`;
  const sim = await post(
    base,
    '/functions/v1/gupshup-webhook',
    {
      type: 'message-event',
      payload: {
        id: simId,
        gsId: simId,
        type: 'delivered',
        destination: '972534338601',
        payload: {},
      },
    },
    srk,
    srk,
  );
  out.webhook_self_test = { http: sim.status, ok: sim.status >= 200 && sim.status < 300, sim_id: simId };

  const gen = await post(base, '/auth/v1/admin/generate_link', { type: 'magiclink', email: OWNER_EMAIL }, srk, srk);
  const ver = await post(base, '/auth/v1/verify', { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp }, anon || srk, anon || srk);
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'Staging auth failed');

  const check = await post(base, '/functions/v1/send-whatsapp-message', { action: 'check_connection' }, at, anon || srk);
  out.preflight = {
    configured: check.body?.configured ?? null,
    gupshup_verified: check.body?.gupshup_verified ?? null,
    app_name: check.body?.app_name ?? null,
    source: check.body?.source ?? null,
  };

  const message = `E2E DLR Make→Supabase Staging ${new Date().toISOString()}`;
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
    delivery_log: send.body?.delivery_log ?? null,
  };
  must(out.send.success && messageId, `Send failed: ${out.send.error || 'no message_id'}`);

  const terminal = new Set(['delivered', 'read', 'failed', 'rejected']);
  let row = null;
  const polls = [];
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(
      `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${messageId}&channel=eq.whatsapp&select=status,dlr_event,dlr_error_code,error_message,status_history,updated_at&limit=1`,
      { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
    );
    const j = await res.json().catch(() => []);
    row = Array.isArray(j) ? j[0] : null;
    polls.push({ n: i + 1, status: row?.status ?? null, dlr_event: row?.dlr_event ?? null });
    if (row && terminal.has(row.status)) break;
  }
  out.polls_summary = { count: polls.length, last: polls[polls.length - 1] || null };

  // After poll: inspect MATCHED hook (and chosen) for this message id
  const hooksToCheck = [...new Set([MATCHED_HOOK_ID, chosen?.hookId].filter(Boolean))];
  const after = [];
  for (const hid of hooksToCheck) {
    const logs = await inspectHookLogs(hid, sendAt - 5000);
    const hit = (logs.samples || []).some((s) => (s.body_excerpt || '').includes(messageId));
    after.push({
      hookId: hid,
      recent_count: logs.count,
      dlr_hits: logs.dlr_hits,
      message_id_seen_in_hook_logs: hit,
      samples: logs.samples,
    });
  }
  out.make_hook_after_send = after.find((a) => a.hookId === MATCHED_HOOK_ID) || after[0] || null;
  out.make_hooks_after_send = after;

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
    status_history: history,
    dlr_error_code: row?.dlr_error_code ?? null,
    error_message: row?.error_message ?? null,
    phone_likely_received:
      has('delivered') || has('read')
        ? 'yes_if_dlr_truthful'
        : has('failed') || has('rejected')
          ? 'no_failed'
          : 'unknown_still_submitted_check_make_forward',
  };
}

async function main() {
  try {
    const chosen = await configureMake();
    await stagingLiveE2e(chosen);
  } catch (e) {
    out.error = String(e.message || e).slice(0, 500);
  }
  console.log('---MAKE_FORWARD_LIVE_E2E---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_FORWARD_LIVE_E2E_DONE---');
  fs.writeFileSync('/tmp/make-forward-live-e2e.json', JSON.stringify(out, null, 2));
  if (out.error || !out.send?.success) process.exit(1);
}

main();
