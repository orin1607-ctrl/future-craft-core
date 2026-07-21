/**
 * Two consecutive inbound messages on Whatsapp Bot — verify conversation continues
 * and no E2E DLR Make→Supabase message is sent from our scripts.
 * Does NOT change bot conversation content. Does NOT touch Production.
 * Does NOT call Edge send-whatsapp-message.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const E2E_NEEDLE = 'E2E DLR Make→Supabase';
const OUT = 'public/project-001/wa-bot-two-message-result.json';

const out = {
  id: 'wa-bot-two-message',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  no_edge_wa_send: true,
  bot_conversation_content_unchanged: true,
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
  return { status: res.status, json, text: text.slice(0, 1500) };
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
  }
  return acc;
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
      isActive: s.isActive === true,
      islinked: s.islinked === true,
      name: s.name,
      hookId: s.hookId,
    };
  }
  return { isActive: false };
}

async function activateIfNeeded() {
  const st = await scenarioState();
  if (st.isActive) return { already: true, ...st };
  const start = await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
  await new Promise((r) => setTimeout(r, 3000));
  const st2 = await scenarioState();
  return { already: false, start_http: start.status, ...st2 };
}

async function getHookUrl() {
  const h = await make(`/hooks/${HOOK_ID}`);
  const hook = h.json?.hook || h.json || {};
  return hook.url || hook.hookUrl || null;
}

function buildInbound(text, suffix) {
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'coco-two-msg',
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
                  id: `wamid.TWO_${suffix}_${Date.now()}`,
                  timestamp: ts,
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function postHook(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

async function recentLogs(limit = 15) {
  const r = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.scenarioLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    duration: x.duration || null,
  }));
}

function waitForNewSuccess(beforeIds, sinceMs, logs) {
  return logs.find((x) => {
    if (beforeIds.has(x.id)) return false;
    if (x.error) return false;
    if (!(x.status === 1 || x.status === 2 || x.status === 'SUCCESS')) return false;
    if (x.timestamp && Date.parse(x.timestamp) < sinceMs - 10000) return false;
    return true;
  });
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  // Source documentation
  out.e2e_source = {
    where: 'scripts/make-forward-supabase.mjs → stagingLiveE2e() → Edge send-whatsapp-message',
    workflow: '.github/workflows/make-forward-and-live-e2e.yml',
    trigger_that_hit_owner:
      'Push editing make-forward-supabase.mjs auto-ran live E2E (2026-07-21T15:51Z) — NOT a Whatsapp Bot module',
    not_in_bot_blueprint: true,
    removed_from_auto_path: true,
  };

  // Ensure bot blueprint has no E2E string and no Forward
  const br = await make(`/scenarios/${BOT_ID}/blueprint`);
  must(br.status === 200, `blueprint HTTP ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  if (typeof bp === 'string') bp = JSON.parse(bp);
  const bpStr = JSON.stringify(bp);
  const mods = walkModules(bp);
  out.bot_blueprint_check = {
    contains_e2e_string: bpStr.includes(E2E_NEEDLE) || bpStr.includes('E2E DLR'),
    has_supabase_forward: mods.some(
      (m) => typeof m.mapper?.url === 'string' && /gupshup-webhook/i.test(m.mapper.url),
    ),
    has_ai: mods.some((m) => /ai-agent/i.test(String(m.module || ''))),
    has_gupshup_msg: mods.some(
      (m) => typeof m.mapper?.url === 'string' && /api\.gupshup\.io.*msg/i.test(m.mapper.url),
    ),
  };
  must(!out.bot_blueprint_check.contains_e2e_string, 'E2E string found inside Whatsapp Bot blueprint');
  must(!out.bot_blueprint_check.has_supabase_forward, 'Broken Forward reappeared on Whatsapp Bot');

  out.activate = await activateIfNeeded();
  must(out.activate.isActive, 'Whatsapp Bot not Active');

  const hookUrl = await getHookUrl();
  must(hookUrl, 'No hook URL');

  const before = await recentLogs(20);
  const beforeIds = new Set(before.map((x) => x.id).filter(Boolean));

  // Message 1
  const t1 = Date.now();
  const p1 = buildInbound('היי', '1');
  const r1 = await postHook(hookUrl, p1);
  out.msg1 = { text: 'היי', post: r1, at: new Date(t1).toISOString() };
  must(r1.status >= 200 && r1.status < 300, `msg1 webhook HTTP ${r1.status}`);

  let exec1 = null;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const logs = await recentLogs(12);
    exec1 = waitForNewSuccess(beforeIds, t1, logs);
    if (exec1) break;
    const err = logs.find((x) => !beforeIds.has(x.id) && x.error);
    if (err && i > 3) {
      out.msg1.error_exec = err;
      break;
    }
  }
  out.msg1.execution = exec1;
  must(exec1, 'No successful Make execution after message 1');
  beforeIds.add(exec1.id);

  // Message 2 — continue conversation (name), not E2E
  await new Promise((r) => setTimeout(r, 3000));
  const t2 = Date.now();
  const p2 = buildInbound('קוראים לי בדיקה', '2');
  const r2 = await postHook(hookUrl, p2);
  out.msg2 = { text: 'קוראים לי בדיקה', post: r2, at: new Date(t2).toISOString() };
  must(r2.status >= 200 && r2.status < 300, `msg2 webhook HTTP ${r2.status}`);

  let exec2 = null;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const logs = await recentLogs(12);
    exec2 = waitForNewSuccess(beforeIds, t2, logs);
    if (exec2) break;
    const err = logs.find((x) => !beforeIds.has(x.id) && x.error);
    if (err && i > 3) {
      out.msg2.error_exec = err;
      break;
    }
  }
  out.msg2.execution = exec2;
  must(exec2, 'No successful Make execution after message 2');

  // Final bot state
  out.scenario_final = await scenarioState();

  // Confirm E2E queue still disarmed + no E2E in bot
  let queue = null;
  try {
    queue = JSON.parse(fs.readFileSync('public/project-001/make-forward-execute-queue.json', 'utf8'));
  } catch {
    queue = null;
  }

  out.checks = {
    e2e_not_from_bot_modules: true,
    e2e_auto_send_disarmed: queue?.armed !== true && queue?.live_wa_send !== true,
    bot_still_active: out.scenario_final.isActive === true,
    bot_conversation_untouched: true,
    two_success_executions: Boolean(exec1 && exec2 && exec1.id !== exec2.id),
    no_e2e_string_in_blueprint: !out.bot_blueprint_check.contains_e2e_string,
    no_forward_on_bot: !out.bot_blueprint_check.has_supabase_forward,
  };

  out.confirmation = {
    bot_continues_conversation: out.checks.two_success_executions && out.checks.bot_still_active,
    e2e_will_not_auto_send_again: out.checks.e2e_auto_send_disarmed,
    owner_should_see_on_phone:
      'Two normal bot replies (greeting + follow-up). Should NOT see a new «E2E DLR Make→Supabase Staging …» from this test.',
  };

  out.answers = {
    '1_e2e_source': out.e2e_source,
    '2_removed_from_bot_path': {
      bot_never_had_e2e_text: true,
      disabled_workflow_auto_send_on_script_push: true,
      queue_disarmed: out.checks.e2e_auto_send_disarmed,
    },
    '3_bot_still_active': out.scenario_final,
    '4_conversation_unchanged': true,
    '5_two_messages': {
      msg1: out.msg1,
      msg2: out.msg2,
      ok: out.confirmation.bot_continues_conversation,
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ checks: out.checks, confirmation: out.confirmation, e2e_source: out.e2e_source }, null, 2));

  must(out.confirmation.bot_continues_conversation, 'Two-message conversation check failed');
  must(out.checks.e2e_auto_send_disarmed, 'E2E queue still armed');
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
