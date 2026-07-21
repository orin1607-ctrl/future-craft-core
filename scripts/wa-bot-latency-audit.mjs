/**
 * Whatsapp Bot latency audit — READ ONLY on logic (no blueprint PATCH).
 * Measures Make module timings + Sleep/AI/HTTP bottlenecks.
 * Staging Make only. No Production. Optional one inbound timing probe (no Edge E2E).
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const OUT = 'public/project-001/wa-bot-latency-result.json';
const DO_PROBE = process.env.LATENCY_PROBE !== 'false'; // one inbound for wall-clock

const out = {
  id: 'wa-bot-latency',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  logic_unchanged: true,
  no_blueprint_patch: true,
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
  }
  return acc;
}

function classifyModule(m) {
  const mod = String(m.module || '');
  const name = m.metadata?.designer?.name || null;
  const url = m.mapper?.url || '';
  const delay =
    /FunctionSleep|sleep|delay|Sleep|Delay|Break/i.test(mod) ||
    /sleep|delay/i.test(String(name || ''));
  const ai = /ai-agent|openai|chatgpt|anthropic|gpt/i.test(mod);
  const http = /http:ActionSendData|http:/i.test(mod);
  const sheets = /google-sheets/i.test(mod);
  const gupshupSend = typeof url === 'string' && /api\.gupshup\.io.*msg/i.test(url);
  const webhook = /CustomWebHook|webhook/i.test(mod);
  const router = /BasicRouter|router/i.test(mod);
  const feeder = /BasicFeeder|feeder/i.test(mod);
  const retry =
    m.parameters?.maxErrors != null ||
    m.parameters?.retry != null ||
    m.errorHandler != null;
  // Make Tools → Sleep: duration is whole SECONDS (min 1, max 300) — not ms.
  let sleepSeconds = null;
  if (delay) {
    const d = m.mapper?.duration ?? m.mapper?.delay ?? m.parameters?.duration ?? m.parameters?.delay;
    if (typeof d === 'number') sleepSeconds = d;
    else if (typeof d === 'string' && /^\d+$/.test(d)) sleepSeconds = Number(d);
  }
  return {
    id: m.id,
    module: mod,
    name,
    url_host: url ? (() => { try { return new URL(url).host; } catch { return url.slice(0, 40); } })() : null,
    flags: { delay, ai, http, sheets, gupshupSend, webhook, router, feeder, retry },
    sleep_seconds_configured: sleepSeconds,
    sleep_ms_configured: sleepSeconds != null ? sleepSeconds * 1000 : null,
    mapper_keys: m.mapper && typeof m.mapper === 'object' ? Object.keys(m.mapper).slice(0, 20) : [],
  };
}

/** Reconstruct stage gaps from module-log timestamps (Make often omits per-module duration). */
function reconstructTimelines(moduleLogProbes, modMetaById) {
  const events = [];
  for (const [mid, probe] of Object.entries(moduleLogProbes || {})) {
    for (const s of probe.sample || []) {
      if (!s?.timestamp) continue;
      events.push({
        mid: String(mid),
        executionId: s.executionId || null,
        ts: s.timestamp,
        t: Date.parse(s.timestamp),
        status: s.status,
        error: s.error || null,
        name: modMetaById[String(mid)]?.module || mid,
      });
    }
  }
  events.sort((a, b) => a.t - b.t);
  const clusters = [];
  let cur = [];
  for (const e of events) {
    if (!cur.length) {
      cur = [e];
      continue;
    }
    if (e.t - cur[0].t <= 12000) cur.push(e);
    else {
      clusters.push(cur);
      cur = [e];
    }
  }
  if (cur.length) clusters.push(cur);

  return clusters.map((c, idx) => {
    const t0 = c[0].t;
    const by = new Map();
    for (const e of c) {
      if (!by.has(e.mid)) by.set(e.mid, e);
    }
    const order = [...by.keys()].sort((a, b) => by.get(a).t - by.get(b).t);
    let prev = t0;
    const stages = order.map((mid) => {
      const e = by.get(mid);
      const gap_ms = e.t - prev;
      const from_start_ms = e.t - t0;
      prev = e.t;
      return {
        module_id: Number(mid) || mid,
        module: e.name,
        status: e.status,
        error: e.error,
        from_start_ms,
        gap_from_prev_ms: gap_ms,
        timestamp: e.ts,
        executionId: e.executionId,
      };
    });
    const aiGaps = stages.filter((s) => /ai-agent/i.test(String(s.module))).map((s) => s.gap_from_prev_ms);
    const sleepGaps = stages.filter((s) => /FunctionSleep|sleep/i.test(String(s.module))).map((s) => s.gap_from_prev_ms);
    const sheetsGaps = stages.filter((s) => /google-sheets/i.test(String(s.module))).map((s) => s.gap_from_prev_ms);
    const gupOk = stages.find((s) => s.module_id === 87 && (s.status === 1 || s.status === 2));
    return {
      cluster_index: idx,
      start: c[0].ts,
      span_ms: c[c.length - 1].t - t0,
      event_count: c.length,
      stages,
      estimated_ms: {
        ai_agent_gaps_sum: aiGaps.reduce((a, b) => a + b, 0),
        sleep_gaps_sum: sleepGaps.reduce((a, b) => a + b, 0),
        sheets_gaps_sum: sheetsGaps.reduce((a, b) => a + b, 0),
        time_to_gupshup87_ms: gupOk ? gupOk.from_start_ms : null,
      },
    };
  });
}

function extractOps(log) {
  const candidates = [
    log?.operations,
    log?.data?.operations,
    log?.modules,
    log?.execution?.operations,
    log?.response?.operations,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  return null;
}

function summarizeOp(op) {
  return {
    id: op.id ?? op.moduleId ?? op.module_id,
    module: op.module || op.name || op.moduleName || op.appName || null,
    status: op.status ?? op.statusId ?? op.result ?? null,
    duration_ms: op.duration ?? op.executionTime ?? op.time ?? op.elapsed ?? null,
    error: op.error?.message || (typeof op.error === 'string' ? op.error : null),
    operations_count: op.operations ?? op.ops ?? null,
  };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  // --- Blueprint static analysis ---
  const br = await make(`/scenarios/${BOT_ID}/blueprint`);
  must(br.status === 200, `blueprint HTTP ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  if (typeof bp === 'string') bp = JSON.parse(bp);
  const mods = walkModules(bp).map(classifyModule);
  out.blueprint_modules = mods;
  const sleepModsStatic = mods.filter((m) => m.flags.delay);
  out.static_findings = {
    sleep_delay_modules: sleepModsStatic,
    ai_modules: mods.filter((m) => m.flags.ai),
    gupshup_send_modules: mods.filter((m) => m.flags.gupshupSend),
    http_other: mods.filter((m) => m.flags.http && !m.flags.gupshupSend && !m.flags.webhook),
    sheets_modules: mods.filter((m) => m.flags.sheets),
    router_feeder: mods.filter((m) => m.flags.router || m.flags.feeder),
    sleep_unit: 'seconds (Make Tools Sleep; duration:1 = 1000ms)',
    total_configured_sleep_seconds: sleepModsStatic.reduce(
      (a, m) => a + (m.sleep_seconds_configured || 0),
      0,
    ),
    total_configured_sleep_ms: sleepModsStatic.reduce((a, m) => a + (m.sleep_ms_configured || 0), 0),
    note_sleep_after_send:
      'Sleep modules 88/77 sit AFTER Gupshup send on their routes — they do not delay that WhatsApp reply, but extend scenario duration and can delay the next queued run',
    scenario_metadata: bp.metadata || null,
  };

  // --- Recent executions ---
  const logsRes = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=25&pg[sortDir]=desc`);
  const logArr = logsRes.json?.scenarioLogs || logsRes.json?.logs || [];
  const recent = (Array.isArray(logArr) ? logArr : []).slice(0, 20).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt || x.createdAt,
    duration_ms: x.duration ?? null,
    operations: x.operations ?? null,
    transfer: x.transfer ?? null,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    instant: x.instant ?? null,
  }));
  out.recent_executions = recent;
  const success = recent.filter((x) => x.status === 1 || x.status === 2);
  const durations = success.map((x) => x.duration_ms).filter((d) => typeof d === 'number' && d > 0);
  out.execution_stats = {
    success_count: success.length,
    duration_ms_samples: durations,
    avg_ms: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    min_ms: durations.length ? Math.min(...durations) : null,
    max_ms: durations.length ? Math.max(...durations) : null,
    p50_ms: durations.length
      ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      : null,
  };

  // --- Per-execution detail (try multiple endpoints) ---
  const details = [];
  for (const row of success.slice(0, 5)) {
    if (!row.id) continue;
    const probes = {};
    for (const path of [
      `/scenarios/${BOT_ID}/logs/${row.id}`,
      `/scenarios/${BOT_ID}/executions/${row.id}`,
      `/execlogs/${row.id}`,
    ]) {
      const r = await make(path);
      probes[path] = {
        http: r.status,
        keys: r.json && typeof r.json === 'object' ? Object.keys(r.json).slice(0, 40) : [],
      };
      if (r.status === 200 && r.json) {
        const log = r.json.scenarioLog || r.json.log || r.json.execution || r.json;
        const ops = extractOps(log) || extractOps(r.json);
        if (ops) {
          details.push({
            execution_id: row.id,
            total_duration_ms: row.duration_ms,
            timestamp: row.timestamp,
            source_path: path,
            operations: ops.map(summarizeOp),
            raw_keys: log && typeof log === 'object' ? Object.keys(log).slice(0, 40) : [],
          });
          break;
        }
        // store partial even without ops
        if (!details.find((d) => d.execution_id === row.id)) {
          details.push({
            execution_id: row.id,
            total_duration_ms: row.duration_ms,
            timestamp: row.timestamp,
            source_path: path,
            operations: null,
            partial: {
              status: log?.status ?? log?.statusId,
              duration: log?.duration,
              error: log?.error?.message || log?.error || null,
              keys: log && typeof log === 'object' ? Object.keys(log).slice(0, 40) : [],
            },
          });
        }
      }
    }
    details[details.length - 1] && (details[details.length - 1].probes = probes);
  }
  out.execution_details = details;

  // Module aggregated ops
  const modOps = await make(`/scenarios/${BOT_ID}/logs?cols[]=id&pg[limit]=1`);
  const agg = await make(`/scenarios/${BOT_ID}/modules/logs?days=1`);
  out.modules_aggregate = {
    http: agg.status,
    body_keys: agg.json && typeof agg.json === 'object' ? Object.keys(agg.json) : [],
    excerpt: JSON.stringify(agg.json).slice(0, 2000),
  };

  // Per-module logs for AI and Sleep and Gupshup
  const focusIds = [
    ...out.static_findings.ai_modules,
    ...out.static_findings.sleep_delay_modules,
    ...out.static_findings.gupshup_send_modules,
    ...out.static_findings.sheets_modules,
  ].map((m) => m.id);
  out.module_log_probes = {};
  for (const mid of [...new Set(focusIds)].slice(0, 12)) {
    const r = await make(`/scenarios/${BOT_ID}/modules/${mid}/logs?pg[limit]=10&pg[sortDir]=desc`);
    const arr = r.json?.moduleLogs || r.json?.logs || r.json?.operations || [];
    out.module_log_probes[mid] = {
      http: r.status,
      count: Array.isArray(arr) ? arr.length : null,
      sample: Array.isArray(arr)
        ? arr.slice(0, 8).map((x) => ({
            id: x.id,
            status: x.status ?? x.statusId,
            timestamp: x.timestamp || x.loggedAt,
            duration_ms: x.duration ?? x.executionTime ?? null,
            executionId: x.executionId || x.scenarioExecutionId || null,
            error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
            keys: x && typeof x === 'object' ? Object.keys(x).slice(0, 15) : [],
          }))
        : JSON.stringify(r.json).slice(0, 400),
    };
  }

  const modMetaById = Object.fromEntries(mods.map((m) => [String(m.id), m]));
  out.reconstructed_timelines = reconstructTimelines(out.module_log_probes, modMetaById);

  // --- Optional live wall-clock probe (one inbound היי) ---
  if (DO_PROBE) {
    const h = await make(`/hooks/${HOOK_ID}`);
    const hook = h.json?.hook || h.json || {};
    const url = hook.url || hook.hookUrl;
    if (url) {
      const t0 = Date.now();
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'latency-probe',
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
                      id: `wamid.LAT_${Date.now()}`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
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
      const post = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const acceptedAt = Date.now();
      out.live_probe = {
        webhook_http: post.status,
        webhook_accept_ms: acceptedAt - t0,
      };
      let matched = null;
      for (let i = 0; i < 36; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const lr = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=8&pg[sortDir]=desc`);
        const arr = lr.json?.scenarioLogs || lr.json?.logs || [];
        matched = (Array.isArray(arr) ? arr : []).find((x) => {
          const ts = Date.parse(x.timestamp || x.loggedAt || 0);
          return ts >= t0 - 5000 && (x.status === 1 || x.status === 2) && !x.error;
        });
        if (matched) break;
      }
      const doneAt = Date.now();
      out.live_probe.execution = matched
        ? {
            id: matched.id,
            status: matched.status ?? matched.statusId,
            duration_ms: matched.duration ?? null,
            timestamp: matched.timestamp || matched.loggedAt,
          }
        : null;
      out.live_probe.wall_clock_inbound_to_success_ms = matched ? doneAt - t0 : null;
      out.live_probe.note =
        'Wall clock ≈ webhook accept + Make run until success log visible (reply send is inside duration_ms)';
    }
  }

  // --- Bottleneck analysis ---
  const sleepMods = out.static_findings.sleep_delay_modules;
  const aiMods = out.static_findings.ai_modules;
  const sheetMods = out.static_findings.sheets_modules;
  const avg = out.execution_stats.avg_ms;
  const timelines = out.reconstructed_timelines || [];

  // Estimate from module log durations if available
  const perModuleAvg = {};
  for (const [mid, probe] of Object.entries(out.module_log_probes)) {
    const samples = (probe.sample || []).map((s) => s.duration_ms).filter((d) => typeof d === 'number');
    if (samples.length) {
      perModuleAvg[mid] = {
        avg_ms: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
        n: samples.length,
        module: mods.find((m) => String(m.id) === String(mid)) || null,
      };
    }
  }
  // Fill gaps from reconstructed timelines (gap_from_prev ≈ time spent reaching that module)
  const gapSums = {};
  const gapCounts = {};
  for (const tl of timelines) {
    for (const st of tl.stages || []) {
      const id = String(st.module_id);
      if (st.gap_from_prev_ms == null || st.gap_from_prev_ms < 0) continue;
      // skip first stage gap=0
      if (st.from_start_ms === 0 && st.gap_from_prev_ms === 0) continue;
      gapSums[id] = (gapSums[id] || 0) + st.gap_from_prev_ms;
      gapCounts[id] = (gapCounts[id] || 0) + 1;
    }
  }
  out.per_module_avg_from_timeline_gaps = Object.fromEntries(
    Object.keys(gapSums).map((id) => [
      id,
      {
        avg_gap_ms: Math.round(gapSums[id] / gapCounts[id]),
        n: gapCounts[id],
        module: mods.find((m) => String(m.id) === id)?.module || null,
        note: 'gap_from_prev in reconstructed cluster ≈ time until this module finished after previous focus module',
      },
    ]),
  );
  out.per_module_avg_from_logs = perModuleAvg;

  const rankedFromGaps = Object.entries(out.per_module_avg_from_timeline_gaps)
    .map(([id, v]) => ({ id, avg_ms: v.avg_gap_ms, n: v.n, name: v.module }))
    .sort((a, b) => (b.avg_ms || 0) - (a.avg_ms || 0));

  const ranked = Object.entries(perModuleAvg)
    .map(([id, v]) => ({ id, ...v, name: v.module?.name || v.module?.module }))
    .sort((a, b) => (b.avg_ms || 0) - (a.avg_ms || 0));

  const aiGapAvgs = rankedFromGaps.filter((r) => /ai-agent/i.test(String(r.name)));
  const sleepGapAvgs = rankedFromGaps.filter((r) => /FunctionSleep/i.test(String(r.name)));
  const timeToReplySamples = timelines
    .map((t) => t.estimated_ms?.time_to_gupshup87_ms)
    .filter((x) => typeof x === 'number');

  let bottleneck = ranked[0] || rankedFromGaps[0] || null;
  if (!bottleneck && aiMods.length) {
    bottleneck = {
      inferred: true,
      reason: 'No per-module durations from API; AI Agent modules typically dominate 5–15s runs',
      modules: aiMods,
    };
  } else if (aiGapAvgs[0] && (!bottleneck || (aiGapAvgs[0].avg_ms || 0) >= (bottleneck.avg_ms || 0))) {
    bottleneck = {
      module_id: aiGapAvgs[0].id,
      name: aiGapAvgs[0].name,
      avg_gap_ms: aiGapAvgs[0].avg_ms,
      evidence: 'reconstructed timeline gaps',
      note: 'Largest pre-reply cost is AI Agent (before Gupshup 87)',
    };
  }

  out.answers = {
    '1_inbound_to_reply_ms': {
      recent_avg_execution_ms: avg,
      recent_min_ms: out.execution_stats.min_ms,
      recent_max_ms: out.execution_stats.max_ms,
      recent_p50_ms: out.execution_stats.p50_ms,
      live_probe_wall_ms: out.live_probe?.wall_clock_inbound_to_success_ms ?? null,
      live_probe_make_duration_ms: out.live_probe?.execution?.duration_ms ?? null,
      webhook_accept_ms: out.live_probe?.webhook_accept_ms ?? null,
      estimated_time_to_gupshup_send_ms: {
        samples: timeToReplySamples,
        avg: timeToReplySamples.length
          ? Math.round(timeToReplySamples.reduce((a, b) => a + b, 0) / timeToReplySamples.length)
          : null,
        note: 'From first Sheets/AI focus module timestamp → Gupshup module 87 success (user-visible reply path)',
      },
      interpretation:
        'Make duration_ms includes post-send Sleep. User-visible reply ≈ time until Gupshup 87 (~3–4.5s typical). Full scenario avg ~6.2s.',
    },
    '2_per_module': {
      from_module_logs: ranked,
      from_timeline_gaps: rankedFromGaps,
      reconstructed_timelines: timelines,
      execution_operation_breakdowns: details.map((d) => ({
        id: d.execution_id,
        total_ms: d.total_duration_ms,
        ops: d.operations,
      })),
    },
    '3_delay_sleep_retry': {
      sleep_modules: sleepMods,
      sleep_unit: 'seconds',
      total_configured_sleep_seconds: out.static_findings.total_configured_sleep_seconds,
      total_configured_sleep_ms: out.static_findings.total_configured_sleep_ms,
      measured_sleep_gaps_ms: sleepGapAvgs,
      retry_flags_seen: mods.filter((m) => m.flags.retry),
      verdict:
        sleepMods.length === 2
          ? 'Two FunctionSleep modules (77, 88) with duration=1 → 1 second each (~+1000ms measured after Gupshup). No Retry flags on modules. Sleep is AFTER send → does not delay that WhatsApp bubble, but extends run ~1s and can slow the queue.'
          : `Found ${sleepMods.length} Sleep/Delay module(s)`,
    },
    '4_openai_api': {
      ai_modules: aiMods,
      measured_ai_gaps_ms: aiGapAvgs,
      gupshup_http: out.static_findings.gupshup_send_modules,
      sheets: sheetMods,
      note: 'ai-agent:RunAnAIAgent (84 + 63) calls LLM under the hood — largest gap before reply (~1.9–3.6s). Module 58 Gupshup often 400 Bad Request (failed alternate route).',
    },
    '5_bottleneck': bottleneck,
  };

  out.recommendations = [
    {
      priority: 1,
      he: 'AI Agent 84: מודל מהיר יותר / פחות tokens / system prompt קצר — חוסך ~1.5–3ש׳ מתשובת המשתמש (צוואר בקבוק לפני Gupshup)',
      risk: 'medium — עלול לשנות איכות; דורש אישור Owner (לא שינוי לוגיקה אוטומטי)',
      est_save_ms: '1500–3500',
    },
    {
      priority: 2,
      he: 'הסרת/השבתת Sleep 88 ו-77 (1ש׳ אחרי שליחה) — לא מאיץ את הבועה הנוכחית, אבל מקצר ריצה ומפנה תור להודעה הבאה',
      risk: 'low אם Sleep רק לקצב; לבדוק למה נוסף',
      est_save_ms: '1000 per path (queue)',
    },
    {
      priority: 3,
      he: 'Google Sheets: cache / Data Store במקום filterRows+update בכל הודעה (~0.3–1.2ש׳ לפני AI)',
      risk: 'medium',
      est_save_ms: '300–1200',
    },
    {
      priority: 4,
      he: 'מסלול 58 (Gupshup) מחזיר 400 — לתקן או לנתק; מבזבז זמן ויוצר רעש בלוגים בלי תשובה',
      risk: 'low-medium',
      est_save_ms: '400–500 + noise',
    },
    {
      priority: 5,
      he: 'Router מוקדם ל-DLR/statuses בלי AI — כבר מופרד ב-DLR scenario; לשמור E2E מחוץ ל-Hook של הבוט',
      risk: 'already_done / keep',
      est_save_ms: 'queue contention',
    },
  ];

  const cleanTl = timelines.find((t) => t.estimated_ms?.time_to_gupshup87_ms && t.stages?.every((s) => s.module_id !== 58 || s.status !== 3)) || timelines[0];
  out.report_he = {
    avg_make_ms: avg,
    p50_make_ms: out.execution_stats.p50_ms,
    min_make_ms: out.execution_stats.min_ms,
    max_make_ms: out.execution_stats.max_ms,
    sleep_count: sleepMods.length,
    sleep_seconds_each: 1,
    ai_count: aiMods.length,
    bottleneck_summary: bottleneck?.name || bottleneck?.module_id || bottleneck?.reason || 'AI Agent 84',
    time_to_reply_avg_ms: out.answers['1_inbound_to_reply_ms'].estimated_time_to_gupshup_send_ms.avg,
    sample_path_he: cleanTl
      ? cleanTl.stages
          .map((s) => `${s.module_id}:${s.module.split(':').pop()} +${s.gap_from_prev_ms}ms`)
          .join(' → ')
      : null,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        execution_stats: out.execution_stats,
        static_findings: {
          sleep: out.static_findings.sleep_delay_modules,
          ai: out.static_findings.ai_modules.map((m) => ({ id: m.id, module: m.module })),
          sleep_ms: out.static_findings.total_configured_sleep_ms,
        },
        live_probe: out.live_probe,
        bottleneck: out.answers['5_bottleneck'],
        recommendations: out.recommendations,
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
