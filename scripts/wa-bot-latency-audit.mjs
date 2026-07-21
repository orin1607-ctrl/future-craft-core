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
  let sleepMs = null;
  if (delay) {
    const d = m.mapper?.duration ?? m.mapper?.delay ?? m.parameters?.duration ?? m.parameters?.delay;
    if (typeof d === 'number') sleepMs = d;
    else if (typeof d === 'string' && /^\d+$/.test(d)) sleepMs = Number(d);
  }
  return {
    id: m.id,
    module: mod,
    name,
    url_host: url ? (() => { try { return new URL(url).host; } catch { return url.slice(0, 40); } })() : null,
    flags: { delay, ai, http, sheets, gupshupSend, webhook, router, feeder, retry },
    sleep_ms_configured: sleepMs,
    mapper_keys: m.mapper && typeof m.mapper === 'object' ? Object.keys(m.mapper).slice(0, 20) : [],
  };
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
  out.static_findings = {
    sleep_delay_modules: mods.filter((m) => m.flags.delay),
    ai_modules: mods.filter((m) => m.flags.ai),
    gupshup_send_modules: mods.filter((m) => m.flags.gupshupSend),
    http_other: mods.filter((m) => m.flags.http && !m.flags.gupshupSend && !m.flags.webhook),
    sheets_modules: mods.filter((m) => m.flags.sheets),
    router_feeder: mods.filter((m) => m.flags.router || m.flags.feeder),
    total_configured_sleep_ms: mods
      .filter((m) => m.sleep_ms_configured != null)
      .reduce((a, m) => a + (m.sleep_ms_configured || 0), 0),
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
        ? arr.slice(0, 5).map((x) => ({
            id: x.id,
            status: x.status ?? x.statusId,
            timestamp: x.timestamp || x.loggedAt,
            duration_ms: x.duration ?? x.executionTime ?? null,
            error: x.error?.message || x.error || null,
            keys: x && typeof x === 'object' ? Object.keys(x).slice(0, 15) : [],
          }))
        : JSON.stringify(r.json).slice(0, 400),
    };
  }

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
  out.per_module_avg_from_logs = perModuleAvg;

  const ranked = Object.entries(perModuleAvg)
    .map(([id, v]) => ({ id, ...v, name: v.module?.name || v.module?.module }))
    .sort((a, b) => (b.avg_ms || 0) - (a.avg_ms || 0));

  let bottleneck = ranked[0] || null;
  if (!bottleneck && aiMods.length) {
    bottleneck = {
      inferred: true,
      reason: 'No per-module durations from API; AI Agent modules typically dominate 5–15s runs',
      modules: aiMods,
    };
  }

  out.answers = {
    '1_inbound_to_reply_ms': {
      recent_avg_execution_ms: avg,
      recent_min_ms: out.execution_stats.min_ms,
      recent_max_ms: out.execution_stats.max_ms,
      live_probe_wall_ms: out.live_probe?.wall_clock_inbound_to_success_ms ?? null,
      live_probe_make_duration_ms: out.live_probe?.execution?.duration_ms ?? null,
      interpretation:
        'Make duration_ms is time inside scenario until finish (includes AI + Gupshup send). Wall clock adds webhook delivery + log visibility lag.',
    },
    '2_per_module': {
      from_module_logs: ranked,
      execution_operation_breakdowns: details.map((d) => ({
        id: d.execution_id,
        total_ms: d.total_duration_ms,
        ops: d.operations,
      })),
    },
    '3_delay_sleep_retry': {
      sleep_modules: sleepMods,
      total_configured_sleep_ms: out.static_findings.total_configured_sleep_ms,
      retry_flags_seen: mods.filter((m) => m.flags.retry),
      verdict: sleepMods.length
        ? `Found ${sleepMods.length} Sleep/Delay module(s) — likely intentional pacing; sum configured≈${out.static_findings.total_configured_sleep_ms}ms`
        : 'No Sleep/Delay modules found in blueprint walk',
    },
    '4_openai_api': {
      ai_modules: aiMods,
      gupshup_http: out.static_findings.gupshup_send_modules,
      sheets: sheetMods,
      note: 'AI Agent (Make) usually calls LLM under the hood — often the largest share of 6–10s runs',
    },
    '5_bottleneck': bottleneck,
  };

  out.recommendations = [
    {
      priority: 1,
      he: 'לבדוק/להקטין מודולי Sleep (אם קיימים) — הורדה מיידית של שניות קבועות בלי לגעת בלוגיקת AI',
      risk: 'low',
    },
    {
      priority: 2,
      he: 'AI Agent: מודל מהיר יותר / פחות tokens / system prompt קצר יותר — צוואר בקבוק עיקרי בריצות ~6–8ש׳',
      risk: 'medium — עלול לשנות איכות תשובה; לא לשנות לוגיקה בלי אישור',
    },
    {
      priority: 3,
      he: 'Google Sheets: cache / Data Store במקום filterRows בכל הודעה אם יש קריאות חוזרות',
      risk: 'medium',
    },
    {
      priority: 4,
      he: 'Router מוקדם: DLR/statuses → יציאה מיידית בלי AI (חוסך תורים ורעש)',
      risk: 'low-medium',
    },
    {
      priority: 5,
      he: 'לא להריץ E2E/Forward על אותו Hook — מפחית תור ומרוצי ריצה',
      risk: 'already_done',
    },
  ];

  out.report_he = {
    avg_make_ms: avg,
    sleep_count: sleepMods.length,
    ai_count: aiMods.length,
    bottleneck_summary: bottleneck?.name || bottleneck?.reason || 'AI Agent (inferred)',
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
