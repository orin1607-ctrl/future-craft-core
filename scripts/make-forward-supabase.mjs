/**
 * Make.com → add HTTP forward to Staging gupshup-webhook (Option B)
 * then one Staging live WhatsApp + DLR poll.
 * Never prints secret values. Production untouched.
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
  return { status: res.status, json, text: text.slice(0, 800) };
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

function alreadyForwards(mods) {
  return mods.some((m) => {
    const url = m?.mapper?.url || m?.mapper?.URL || '';
    return typeof url === 'string' && url.includes('gupshup-webhook') && url.includes(STAGING);
  });
}

function findWebhookModule(mods) {
  return mods.find((m) =>
    /webhook|CustomWebHook|gateway:CustomWebHook|webhooks/i.test(String(m.module || '')),
  ) || null;
}

function insertHttpAfterWebhook(blueprint) {
  // blueprint may be { flow: [...] } or { response: { blueprint... } } already unwrapped
  const bp = blueprint.flow ? blueprint : (blueprint.blueprint || blueprint);
  must(bp && Array.isArray(bp.flow), 'Blueprint has no top-level flow array — unsupported shape');

  const mods = walkModules(bp);
  if (alreadyForwards(mods)) {
    return { bp, changed: false, reason: 'already_forwards_to_supabase' };
  }

  const wh = findWebhookModule(mods);
  must(wh, 'No webhook module found in scenario flow');

  const newId = maxModuleId(mods) + 1;
  const whId = wh.id;
  // Prefer raw JSON pass-through field names used by Make webhooks
  const dataExpr = `{{${whId}.value}}`;

  const httpModule = {
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
      inputRaw: dataExpr,
      data: dataExpr,
      followAllRedirects: false,
    },
    metadata: {
      designer: {
        x: (wh.metadata?.designer?.x || 0) + 300,
        y: (wh.metadata?.designer?.y || 0) + 80,
        name: 'Forward DLR to Supabase Staging',
      },
      restore: {
        expect: {
          contentType: { mode: 'chose' },
        },
      },
      parameters: [
        {
          name: 'handleErrors',
          type: 'boolean',
          label: 'Evaluate all states as errors (except for 2xx and 3xx )',
          required: true,
        },
      ],
    },
  };

  // Insert immediately after webhook module in the same flow array
  const idx = bp.flow.findIndex((m) => m && m.id === whId);
  if (idx >= 0) {
    bp.flow.splice(idx + 1, 0, httpModule);
  } else {
    // webhook nested deeper — append to top flow as best-effort
    bp.flow.push(httpModule);
  }

  return { bp, changed: true, webhook_module_id: whId, http_module_id: newId };
}

async function discoverTeams() {
  const teams = [];
  // Try user + orgs
  const me = await make('/users/me');
  out.make_user = {
    http: me.status,
    ok: me.status === 200,
    // no email dump if present beyond domain
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

  // Fallback: some accounts expose /teams without org
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

function scoreScenario(s, mods) {
  let score = 0;
  const name = `${s.name || ''} ${s.description || ''}`.toLowerCase();
  if (/gupshup|whatsapp|dalia|wa\b|dlr|delivery/i.test(name)) score += 50;
  if (s.isActive || s.islinked) score += 10;
  if (findWebhookModule(mods)) score += 30;
  if (alreadyForwards(mods)) score += 5;
  return score;
}

async function configureMake() {
  must(token, 'MAKE_API_TOKEN missing in Actions secrets');
  const teams = await discoverTeams();

  const candidates = [];
  for (const team of teams) {
    const scenarios = await listScenarios(team.id);
    for (const s of scenarios) {
      const br = await make(`/scenarios/${s.id}/blueprint`);
      if (br.status !== 200) continue;
      const rawBp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
      const mods = walkModules(rawBp);
      const hasWh = Boolean(findWebhookModule(mods));
      if (!hasWh) continue;
      candidates.push({
        teamId: team.id,
        teamName: team.name,
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        score: scoreScenario(s, mods),
        already: alreadyForwards(mods),
        module_count: mods.length,
        modules: mods.map((m) => m.module).slice(0, 12),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  out.candidates = candidates.slice(0, 15);
  must(candidates.length, 'No scenarios with webhook modules found');

  // Prefer already-forwarding, else highest score
  let chosen = candidates.find((c) => c.already) || candidates[0];
  // Prefer gupshup-named if score close
  const named = candidates.find((c) => /gupshup|dalia|whatsapp/i.test(c.name || ''));
  if (named && named.score >= chosen.score - 10) chosen = named;

  out.chosen = {
    id: chosen.id,
    name: chosen.name,
    teamId: chosen.teamId,
    teamName: chosen.teamName,
    already: chosen.already,
    score: chosen.score,
  };

  if (chosen.already) {
    out.make_configure = { changed: false, reason: 'HTTP forward to Supabase already present' };
    return chosen;
  }

  // Fetch blueprint again and modify
  const br = await make(`/scenarios/${chosen.id}/blueprint`);
  must(br.status === 200, `Get blueprint failed HTTP ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  // Some APIs wrap as string
  if (typeof bp === 'string') bp = JSON.parse(bp);

  const { bp: nextBp, changed, reason, webhook_module_id, http_module_id } = insertHttpAfterWebhook(bp);
  if (!changed) {
    out.make_configure = { changed: false, reason };
    return chosen;
  }

  // PATCH scenario — Make expects blueprint as object or string depending on API version
  const patchBody = {
    blueprint: typeof nextBp === 'string' ? nextBp : nextBp,
  };
  // Try object first
  let patch = await make(`/scenarios/${chosen.id}`, { method: 'PATCH', body: patchBody });
  if (patch.status >= 400) {
    // Retry with stringified blueprint (documented variant)
    patch = await make(`/scenarios/${chosen.id}`, {
      method: 'PATCH',
      body: { blueprint: JSON.stringify(nextBp) },
    });
  }
  out.make_configure = {
    changed: true,
    patch_http: patch.status,
    webhook_module_id,
    http_module_id,
    ok: patch.status >= 200 && patch.status < 300,
    error: patch.status >= 300 ? patch.text.slice(0, 300) : null,
  };
  must(out.make_configure.ok, `Make PATCH failed HTTP ${patch.status}: ${patch.text.slice(0, 300)}`);

  // Ensure scenario is active/on
  if (chosen.isActive === false) {
    const act = await make(`/scenarios/${chosen.id}`, { method: 'PATCH', body: { isActive: true } });
    out.make_activate = { http: act.status };
  }

  return chosen;
}

async function stagingLiveE2e() {
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

  // Redeploy webhook + send function to be safe
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
    await configureMake();
    await stagingLiveE2e();
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
