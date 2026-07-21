/**
 * READ-ONLY realtime monitor while Owner sends a manual WhatsApp message.
 * NO blueprint patch. NO activate/deactivate. NO queue delete. NO Production.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OUT = 'public/project-001/wa-bot-manual-watch-result.json';
const SUMMARY = 'public/project-001/wa-bot-manual-watch-summary.json';
const WATCH_MS = Number(process.env.WATCH_MS || 180000); // 3 min
const POLL_MS = Number(process.env.POLL_MS || 4000);

const out = {
  id: 'wa-bot-manual-watch',
  at: new Date().toISOString(),
  mode: 'read_only_monitor',
  production_touched: false,
  no_changes: true,
  owner_phone_test: '0546500305 / inbound to business line',
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function make(path) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json };
}

async function scenarioState() {
  const sc = await make(
    `/scenarios/${BOT_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=hookId`,
  );
  const s = sc.json?.scenario || sc.json || {};
  return {
    http: sc.status,
    isActive: s.isActive === true,
    islinked: s.islinked === true,
    name: s.name,
    hookId: s.hookId,
    at: new Date().toISOString(),
  };
}

async function recentLogs(limit = 12) {
  const r = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.scenarioLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt || x.createdAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null) || null,
    duration: x.duration ?? null,
  }));
}

async function moduleLogs(mid, limit = 5) {
  const r = await make(`/scenarios/${BOT_ID}/modules/${mid}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.moduleLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).slice(0, limit).map((x) => ({
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    executionId: x.executionId || null,
  }));
}

async function hookQueue() {
  const q = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=20`);
  const items = q.json?.hookIncomings || q.json?.incomings || [];
  return Array.isArray(items) ? items.length : null;
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');
  const t0 = Date.now();
  out.watch_started_at = new Date(t0).toISOString();
  out.watch_ms = WATCH_MS;

  const baselineState = await scenarioState();
  const baselineLogs = await recentLogs(15);
  const baselineIds = new Set(baselineLogs.map((x) => x.id).filter(Boolean));
  out.baseline = {
    scenario: baselineState,
    log_ids: [...baselineIds],
    latest_logs: baselineLogs.slice(0, 5),
    queue_len: await hookQueue(),
  };

  const samples = [];
  let firstNewLog = null;
  let successLog = null;
  let failedLog = null;

  console.log(
    JSON.stringify({
      phase: 'watching',
      baseline_active: baselineState.isActive,
      baseline_linked: baselineState.islinked,
      watch_ms: WATCH_MS,
    }),
  );

  while (Date.now() - t0 < WATCH_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = await scenarioState();
    const logs = await recentLogs(15);
    const qlen = await hookQueue();
    const fresh = logs.filter((x) => x.id && !baselineIds.has(x.id));
    for (const f of fresh) {
      if (!firstNewLog) firstNewLog = f;
      if ((f.status === 1 || f.status === 2) && !f.error && !successLog) successLog = f;
      if ((f.status === 3 || f.error) && !failedLog) failedLog = f;
      baselineIds.add(f.id);
    }
    const snap = {
      at: new Date().toISOString(),
      elapsed_ms: Date.now() - t0,
      isActive: st.isActive,
      islinked: st.islinked,
      queue_len: qlen,
      fresh_count: fresh.length,
      fresh: fresh.slice(0, 5),
    };
    samples.push(snap);
    console.log(
      JSON.stringify({
        elapsed_s: Math.round(snap.elapsed_ms / 1000),
        active: snap.isActive,
        linked: snap.islinked,
        queue: snap.queue_len,
        fresh: snap.fresh.map((x) => ({ id: x.id, status: x.status, duration: x.duration, error: x.error })),
      }),
    );
    // If we already have a success and waited a bit after it, can continue until window ends for stability
  }

  const finalState = await scenarioState();
  const logs87 = await moduleLogs(87, 6);
  const logs58 = await moduleLogs(58, 6);
  const logs84 = await moduleLogs(84, 4);

  // Correlate Gupshup 87 success near successLog time
  let replyEvidence = null;
  if (successLog?.timestamp) {
    const tSucc = Date.parse(successLog.timestamp);
    const near87 = logs87.find((x) => {
      if (!(x.status === 1 || x.status === 2)) return false;
      if (!x.timestamp) return false;
      const dt = Math.abs(Date.parse(x.timestamp) - tSucc);
      return dt < 15000;
    });
    replyEvidence = {
      gupshup_87_near_success: Boolean(near87),
      gupshup_87: near87 || logs87[0] || null,
      make_duration_ms: successLog.duration ?? null,
    };
  }

  const activeAlways = samples.every((s) => s.isActive) && finalState.isActive;
  const linkedAlways = samples.every((s) => s.islinked) && finalState.islinked;
  const moduleErrorsDuringWatch = [];
  for (const [mid, arr] of [
    [87, logs87],
    [58, logs58],
    [84, logs84],
  ]) {
    for (const x of arr) {
      if (!x.timestamp) continue;
      const ts = Date.parse(x.timestamp);
      if (ts >= t0 - 5000 && (x.status === 3 || x.error)) {
        moduleErrorsDuringWatch.push({ module_id: mid, ...x });
      }
    }
  }

  out.samples = samples;
  out.first_new_execution = firstNewLog;
  out.success_execution = successLog;
  out.failed_execution = failedLog;
  out.final_scenario = finalState;
  out.module_logs = { 87: logs87, 58: logs58, 84: logs84 };
  out.reply_evidence = replyEvidence;
  out.module_errors_during_watch = moduleErrorsDuringWatch;

  // Wall timing: from first new log appearance in our poll vs its Make duration
  // Better: if success has duration, inbound→reply ≈ duration (Make internal) + webhook accept
  let timing = null;
  if (successLog) {
    timing = {
      make_execution_duration_ms: successLog.duration ?? null,
      first_seen_in_monitor_at: samples.find((s) => s.fresh?.some((f) => f.id === successLog.id))?.at || null,
      note_he:
        'משך Make (duration) ≈ זמן מתוך התרחיש עד סיום (כולל AI+שליחה). זמן טלפון≈זה + רשת WhatsApp.',
    };
  }

  out.answers = {
    '1_stayed_active': {
      yes: activeAlways && linkedAlways,
      baseline: baselineState,
      final: finalState,
      dipped_inactive: samples.some((s) => !s.isActive || !s.islinked),
    },
    '2_message_entered_scenario': {
      yes: Boolean(firstNewLog || successLog),
      first_new_execution: firstNewLog,
    },
    '3_bot_replied': {
      yes: Boolean(successLog && replyEvidence?.gupshup_87_near_success),
      success_execution: successLog,
      gupshup_87: replyEvidence?.gupshup_87 || null,
      note_he: successLog
        ? replyEvidence?.gupshup_87_near_success
          ? 'ריצת Make הצליחה + מודול Gupshup 87 הצליח בקרבת הזמן — סימן חזק שהתשובה נשלחה.'
          : 'ריצת Make הצליחה; לא נמצא לוג 87 צמוד — בדוק בטלפון אם הגיעה הודעה.'
        : 'לא זוהתה ריצת הצלחה בחלון הניטור — אולי ההודעה עדיין לא נשלחה / לא הגיעה.',
    },
    '4_timing_ms': timing,
    '5_module_errors': {
      any: moduleErrorsDuringWatch.length > 0,
      items: moduleErrorsDuringWatch,
      failed_execution: failedLog,
    },
    '6_stable_after_reply': {
      yes: finalState.isActive && finalState.islinked && !samples.slice(-3).some((s) => !s.isActive),
      final: finalState,
    },
  };

  const summary = {
    id: 'wa-bot-manual-watch-summary',
    at: out.at,
    watch_started_at: out.watch_started_at,
    no_changes: true,
    answers: {
      stayed_active: out.answers['1_stayed_active'].yes,
      message_entered: out.answers['2_message_entered_scenario'].yes,
      bot_replied: out.answers['3_bot_replied'].yes,
      timing_make_ms: timing?.make_execution_duration_ms ?? null,
      module_errors: out.answers['5_module_errors'].any,
      stable_after: out.answers['6_stable_after_reply'].yes,
    },
    success_execution: successLog,
    detail_he: out.answers['3_bot_replied'].note_he,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log('---SUMMARY---');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
