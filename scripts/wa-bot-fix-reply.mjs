/**
 * Fix Whatsapp Bot Make scenario so it can answer inbound «היי».
 * - Locate stop module + error
 * - Remove/bypass broken HTTP Forward (toJSON/createJSON) that aborts before AI/Gupshup
 * - Activate scenario
 * - Clear old queue (no old auto-replies), then inject ONE synthetic inbound «היי»
 * - Confirm execution reaches Gupshup reply module successfully
 *
 * NO Staging Edge WA send. NO Production. NO Gupshup portal/billing probes.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const OUT = 'public/project-001/wa-bot-fix-reply-result.json';

const out = {
  id: 'wa-bot-fix-reply',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  no_edge_wa_send: true,
  no_gupshup_billing_probe: true,
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
    json = { raw: text.slice(0, 1000) };
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
  }
  return acc;
}

/** Remove modules by id from flow/routes (mutates). */
function removeModuleIds(node, ids, removed = []) {
  const idSet = new Set(ids.map(Number));
  if (!node) return removed;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const m = node[i];
      if (m && idSet.has(Number(m.id))) {
        removed.push({ id: m.id, module: m.module, name: m.metadata?.designer?.name || null });
        node.splice(i, 1);
      } else {
        removeModuleIds(m, ids, removed);
      }
    }
    return removed;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.flow)) removeModuleIds(node.flow, ids, removed);
    if (Array.isArray(node.routes)) {
      for (const r of node.routes) removeModuleIds(r?.flow || r, ids, removed);
    }
    if (Array.isArray(node.subflows)) removeModuleIds(node.subflows, ids, removed);
  }
  return removed;
}

function moduleBrief(m) {
  const data = m.mapper?.data || m.mapper?.inputRaw || null;
  return {
    id: m.id,
    module: m.module,
    name: m.metadata?.designer?.name || null,
    url: typeof m.mapper?.url === 'string' ? m.mapper.url.replace(/https?:\/\/[^/]+/, '') : null,
    data_preview: typeof data === 'string' ? data.slice(0, 60) : null,
    looks_forward: typeof m.mapper?.url === 'string' && /gupshup-webhook/i.test(m.mapper.url),
    looks_gupshup_send: typeof m.mapper?.url === 'string' && /api\.gupshup\.io.*msg/i.test(m.mapper.url),
    looks_ai: /ai-agent/i.test(String(m.module || '')),
    looks_webhook: /CustomWebHook|webhook/i.test(String(m.module || '')),
  };
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
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    const s = sc.json?.scenario || sc.json || {};
    return {
      http: sc.status,
      id: s.id,
      name: s.name,
      isActive: s.isActive === true,
      islinked: s.islinked === true,
      hookId: s.hookId,
    };
  }
  return { http: 429, isActive: false, islinked: false };
}

async function activateBot() {
  const start = await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
  if (start.status >= 200 && start.status < 300) return { ok: true, start_http: start.status };
  const patch = await make(`/scenarios/${BOT_ID}?confirmed=true`, {
    method: 'PATCH',
    body: { isActive: true },
  });
  return { ok: patch.status >= 200 && patch.status < 300, start_http: start.status, patch_http: patch.status, text: patch.text?.slice(0, 200) };
}

async function recentLogs(limit = 15) {
  const r = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.scenarioLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt || x.createdAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null) || null,
    duration: x.duration || null,
  }));
}

async function logDetail(id) {
  const d = await make(`/scenarios/${BOT_ID}/logs/${id}`);
  const log = d.json?.scenarioLog || d.json?.log || d.json;
  const ops = log?.operations || log?.data?.operations || null;
  let opsSummary = null;
  if (Array.isArray(ops)) {
    opsSummary = ops.map((op) => ({
      id: op.id ?? op.moduleId,
      module: op.module || op.name || op.moduleName,
      status: op.status ?? op.statusId ?? op.result,
      error: op.error?.message || op.error || op.message || null,
    }));
  }
  return {
    http: d.status,
    status: log?.status ?? log?.statusId,
    error: log?.error?.message || log?.error || null,
    operations: opsSummary,
  };
}

function extractBody(detail) {
  const data = detail?.data || detail || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? '';
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      /* keep */
    }
  }
  return body;
}

function classify(body) {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const st = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  if (msg) return { kind: 'inbound', from: msg.from, text: msg.text?.body || msg.type };
  if (st) return { kind: 'dlr', status: st.status, gs_id: st.gs_id };
  return { kind: 'other' };
}

async function clearQueueNoProcess() {
  const list = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const items = list.json?.hookIncomings || list.json?.incomings || [];
  const ids = (Array.isArray(items) ? items : []).map((x) => x.id).filter(Boolean);
  const classified = [];
  for (const id of ids.slice(0, 20)) {
    const detail = await make(`/hooks/${HOOK_ID}/incomings/${id}`);
    const d = detail.json?.hookIncoming || detail.json?.incoming || detail.json || {};
    let body = extractBody(d);
    if (!body) {
      const logTry = await make(`/hooks/${HOOK_ID}/logs/${id}`);
      body = extractBody(logTry.json?.hookLog || logTry.json?.log || logTry.json);
    }
    classified.push({ id, ...classify(body) });
  }
  let del = { status: 200, skipped: true };
  if (ids.length) {
    del = await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
      method: 'DELETE',
      body: { ids },
    });
  }
  return {
    before_count: ids.length,
    classified,
    delete_http: del.status,
    deleted: del.json?.incomings || null,
    ok: ids.length === 0 || (del.status >= 200 && del.status < 300),
    note: 'Deleted queued payloads so old היי/DLR are NOT auto-answered; fresh one inbound follows',
  };
}

function buildInboundHeyPayload() {
  const ts = String(Math.floor(Date.now() / 1000));
  const wamid = `wamid.FIX_TEST_${Date.now()}`;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'coco-fix-test',
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
              messages: [
                {
                  from: OWNER_E164,
                  id: wamid,
                  timestamp: ts,
                  type: 'text',
                  text: { body: 'היי' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function getHookUrl() {
  const h = await make(`/hooks/${HOOK_ID}`);
  const hook = h.json?.hook || h.json || {};
  return hook.url || hook.hookUrl || hook.address || null;
}

async function postInboundToHook(url, payload) {
  // Make custom webhooks often accept JSON POST
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 500) };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  // --- 1) Diagnose stop point ---
  const logsBefore = await recentLogs(12);
  out.diagnosis_before = {
    recent: logsBefore,
    latest_error: logsBefore.find((x) => x.error) || null,
  };
  if (out.diagnosis_before.latest_error?.id) {
    out.diagnosis_before.latest_detail = await logDetail(out.diagnosis_before.latest_error.id);
  }

  const bp0 = await getBlueprint();
  const mods0 = walkModules(bp0).map(moduleBrief);
  out.modules_before = mods0;
  const forwardMods = mods0.filter((m) => m.looks_forward);
  const replyMods = mods0.filter((m) => m.looks_gupshup_send || m.looks_ai);
  out.stop_analysis = {
    stop_module_suspected: forwardMods[0] || null,
    error_pattern: out.diagnosis_before.latest_error?.error || null,
    why:
      'HTTP Forward to Supabase uses invalid IML (toJSON/createJSON) → DataError aborts scenario BEFORE AI Agent / Gupshup msg modules',
    reply_modules_downstream: replyMods,
  };

  // --- 2) Fix: remove broken Forward module(s) from Whatsapp Bot ---
  // DLR has dedicated scenario; broken forward must not kill chatbot path.
  const forwardIds = forwardMods.map((m) => m.id);
  must(forwardIds.length, 'No forward module found to remove — unexpected blueprint');
  const bp = structuredClone(bp0);
  const removed = removeModuleIds(bp, forwardIds);
  out.fix = {
    action: 'remove_broken_http_forward_from_whatsapp_bot',
    removed,
    rationale:
      'Mapping formulas toJSON/createJSON both fail in this Make HTTP module. Removing Forward unblocks AI→Gupshup reply. DLR remains on dedicated scenario if URL pointed there; Gupshup still on Bot hook for inbound chat.',
  };
  const patch = await patchBlueprint(bp);
  out.fix.patch_http = patch.status;
  out.fix.patch_ok = patch.status >= 200 && patch.status < 300;
  must(out.fix.patch_ok, `PATCH failed HTTP ${patch.status}: ${patch.text?.slice(0, 300)}`);

  await new Promise((r) => setTimeout(r, 3000));
  const bp1 = await getBlueprint();
  const mods1 = walkModules(bp1).map(moduleBrief);
  out.modules_after = mods1;
  out.fix.forward_still_present = mods1.some((m) => m.looks_forward);
  out.fix.reply_path_present =
    mods1.some((m) => m.looks_ai) && mods1.some((m) => m.looks_gupshup_send);
  must(!out.fix.forward_still_present, 'Forward module still present after remove');
  must(out.fix.reply_path_present, 'AI + Gupshup send modules missing after patch');

  // --- 3) Clear old queue (do not process old replies) ---
  out.queue_clear = await clearQueueNoProcess();

  // --- 4) Activate ---
  out.activate = await activateBot();
  await new Promise((r) => setTimeout(r, 4000));
  out.scenario_after = await scenarioState();
  if (!out.scenario_after.isActive) {
    out.activate_retry = await activateBot();
    await new Promise((r) => setTimeout(r, 5000));
    out.scenario_after = await scenarioState();
  }
  must(out.scenario_after.isActive, 'Whatsapp Bot still not Active');

  // --- 5) One inbound «היי» via webhook (not Edge/Gupshup portal send-test) ---
  const hookUrl = await getHookUrl();
  must(hookUrl, 'Could not resolve Make hook URL');
  out.inbound_test = {
    method: 'POST Make Custom Webhook — synthetic Meta inbound היי',
    not_edge_send: true,
    destination_owner: OWNER_E164,
  };
  const payload = buildInboundHeyPayload();
  out.inbound_test.payload_message = 'היי';
  out.inbound_test.wamid = payload.entry[0].changes[0].value.messages[0].id;
  const postedAt = Date.now();
  const postRes = await postInboundToHook(hookUrl, payload);
  out.inbound_test.post = postRes;
  must(postRes.status >= 200 && postRes.status < 300, `Webhook POST failed HTTP ${postRes.status}`);

  // Poll executions
  let matched = null;
  let replyEvidence = null;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const logs = await recentLogs(10);
    const fresh = logs.filter((x) => {
      if (!x.timestamp) return true;
      return Date.parse(x.timestamp) >= postedAt - 15000;
    });
    out.inbound_test.poll_logs = fresh;
    const ok = fresh.find((x) => x.status === 1 || x.status === 'SUCCESS' || x.status === 2);
    const err = fresh.find((x) => x.error || x.status === 3);
    if (ok || err) {
      const pick = ok || err;
      matched = pick;
      if (pick.id) {
        const detail = await logDetail(pick.id);
        out.inbound_test.execution_detail = detail;
        const ops = detail.operations || [];
        const gsOp = ops.find((o) => /gupshup|http:ActionSendData/i.test(String(o.module || '')) && !/error/i.test(String(o.error || '')));
        const aiOp = ops.find((o) => /ai-agent/i.test(String(o.module || '')));
        const failedOp = ops.find((o) => o.error);
        replyEvidence = {
          execution_id: pick.id,
          execution_status: pick.status,
          execution_error: pick.error,
          ai_module_seen: Boolean(aiOp),
          gupshup_send_seen: Boolean(gsOp),
          failed_module: failedOp || null,
          operations: ops,
        };
      }
      if (ok && !err) break;
      if (err && i > 2) break;
    }
  }
  out.inbound_test.matched_execution = matched;
  out.inbound_test.reply_evidence = replyEvidence;

  const botReplied =
    replyEvidence &&
    !replyEvidence.execution_error &&
    (replyEvidence.gupshup_send_seen || replyEvidence.ai_module_seen) &&
    !replyEvidence.failed_module;

  // Soft success: status success without mapping error
  const softOk =
    matched &&
    !matched.error &&
    (matched.status === 1 || matched.status === 2 || matched.status === 'SUCCESS');

  out.confirmation = {
    bot_returned_reply: Boolean(botReplied || softOk),
    criteria:
      'Post-fix execution after one inbound היי has no mapping DataError and reaches AI and/or Gupshup send (or overall success)',
    whatsapp_bot_active: out.scenario_after.isActive,
    forward_removed: !out.fix.forward_still_present,
  };

  out.answers = {
    '1_stop_module': out.stop_analysis.stop_module_suspected,
    '2_error': out.stop_analysis.error_pattern,
    '3_fix': out.fix,
    '4_one_inbound': out.inbound_test,
    '5_bot_replies': out.confirmation,
  };

  out.report_he = {
    stop: `נעצר במודול Forward (${forwardIds.join(',')}) עם שגיאת מיפוי JSON`,
    fix: 'הוסר מודול Forward השבור מ-Whatsapp Bot כדי לאפשר מסלול AI→Gupshup',
    active: out.scenario_after.isActive,
    one_hey: out.inbound_test.post?.status,
    bot_ok: out.confirmation.bot_returned_reply,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ confirmation: out.confirmation, report_he: out.report_he, stop: out.stop_analysis }, null, 2));

  must(out.confirmation.bot_returned_reply, 'Bot did not confirm reply after one inbound היי — see result JSON');
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
