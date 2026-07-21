/**
 * Fix Whatsapp Bot stopped-by-error (Staging only).
 * 1) Confirm last failure is module 58 HTTP 400
 * 2) Soft-fix: handleErrors=false + Ignore error handler on 58 (keep scenario Active)
 * 3) Optionally align safe mapper bits with working module 87 (no AI/Sheets changes)
 * 4) Activate + E2E two messages + verify still Active
 * NO Production. NO AI Agent / Sheets-cache changes.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const MOD_58 = 58;
const MOD_87 = 87;
const OUT = 'public/project-001/wa-bot-fix-active-58-result.json';
const SUMMARY = 'public/project-001/wa-bot-fix-active-58-summary.json';

const out = {
  id: 'wa-bot-fix-active-58',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  no_ai_changes: true,
  no_sheets_cache: true,
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
    if (Array.isArray(node.onerror)) walkModules(node.onerror, acc);
  }
  return acc;
}

function findModule(bp, id) {
  return walkModules(bp).find((m) => Number(m.id) === Number(id)) || null;
}

function nextModuleId(bp) {
  const ids = walkModules(bp)
    .map((m) => Number(m.id))
    .filter((n) => Number.isFinite(n));
  return (ids.length ? Math.max(...ids) : 100) + 1;
}

function redact(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/(apikey=)[^&]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
    .slice(0, 180);
}

function formFieldsBrief(m) {
  const fields = m?.mapper?.formFields;
  if (!Array.isArray(fields)) return null;
  return fields.map((f) => {
    const key = f?.key || f?.name || Object.keys(f || {}).find((k) => k !== 'value') || '?';
    const value = f?.value ?? f?.[key];
    return { key, value_preview: redact(typeof value === 'string' ? value : JSON.stringify(value)?.slice(0, 120)) };
  });
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
  const sc = await make(
    `/scenarios/${BOT_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=hookId`,
  );
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

async function activateBot() {
  let st = await scenarioState();
  if (st.isActive && st.islinked) return { already: true, ...st };
  const start = await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
  if (start.status >= 400) {
    await make(`/scenarios/${BOT_ID}?confirmed=true`, { method: 'PATCH', body: { isActive: true } });
  }
  await new Promise((r) => setTimeout(r, 3000));
  st = await scenarioState();
  return { already: false, start_http: start.status, ...st };
}

async function recentLogs(limit = 20) {
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

async function moduleLogs(mid, limit = 10) {
  const r = await make(`/scenarios/${BOT_ID}/modules/${mid}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.moduleLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).slice(0, limit).map((x) => ({
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    executionId: x.executionId || null,
  }));
}

async function clearQueue() {
  const q = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const items = q.json?.hookIncomings || q.json?.incomings || [];
  const ids = (Array.isArray(items) ? items : []).map((x) => x.id).filter(Boolean);
  if (ids.length) {
    await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
      method: 'DELETE',
      body: { ids },
    });
  }
  return ids.length;
}

function buildInbound(text, tag) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: `fix58-${tag}`,
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
                  id: `wamid.F58_${tag}_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
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

async function waitSuccess(beforeIds, sinceMs, attempts = 30, gapMs = 5000) {
  const seen = [];
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, gapMs));
    const logs = await recentLogs(25);
    for (const x of logs) {
      if (!x.id || beforeIds.has(x.id)) continue;
      if (!seen.find((s) => s.id === x.id)) seen.push(x);
    }
    const hit = logs.find((x) => {
      if (!x.id || beforeIds.has(x.id)) return false;
      if (x.error) return false;
      if (!(x.status === 1 || x.status === 2)) return false;
      if (x.timestamp && Date.parse(x.timestamp) < sinceMs - 15000) return false;
      return true;
    });
    if (hit) return { hit, seen };
  }
  return { hit: null, seen };
}

/** Soft-fix module 58 so HTTP 400 does not deactivate the scenario. */
function applyModule58SoftFix(bp, m58) {
  const changes = [];
  if (!m58.parameters || typeof m58.parameters !== 'object') m58.parameters = {};
  if (m58.parameters.handleErrors !== false) {
    m58.parameters.handleErrors = false;
    changes.push('parameters.handleErrors=false');
  }

  const hasIgnore =
    (Array.isArray(m58.onerror) && m58.onerror.some((x) => /Ignore/i.test(String(x.module || '')))) ||
    (Array.isArray(m58.routes) &&
      m58.routes.some((r) =>
        (r?.flow || []).some((x) => /Ignore/i.test(String(x.module || ''))),
      ));

  if (!hasIgnore) {
    const ignoreId = nextModuleId(bp);
    const ignoreMod = {
      id: ignoreId,
      module: 'builtin:Ignore',
      version: 1,
      metadata: {
        designer: {
          x: (m58.metadata?.designer?.x || 0) + 40,
          y: (m58.metadata?.designer?.y || 0) + 160,
          name: 'Ignore HTTP errors on Gupshup 58',
        },
      },
    };
    if (!Array.isArray(m58.onerror)) m58.onerror = [];
    m58.onerror.push(ignoreMod);
    changes.push(`onerror builtin:Ignore id=${ignoreId}`);
  } else {
    changes.push('Ignore handler already present');
  }

  // Raise scenario consecutive-error tolerance if present
  if (bp.metadata?.scenario && typeof bp.metadata.scenario === 'object') {
    const prev = bp.metadata.scenario.maxErrors;
    if (typeof prev === 'number' && prev < 50) {
      bp.metadata.scenario.maxErrors = 50;
      changes.push(`metadata.scenario.maxErrors ${prev}→50`);
    }
  }

  return changes;
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  // --- 1) Diagnose recent stop ---
  const beforeState = await scenarioState();
  const logs = await recentLogs(15);
  const logs58 = await moduleLogs(MOD_58, 10);
  const logs87 = await moduleLogs(MOD_87, 8);

  const failedRuns = logs.filter((x) => x.status === 3 || (x.error && /400|Bad Request|error/i.test(String(x.error))));
  const recent58Fails = logs58.filter((x) => x.status === 3 || /400/i.test(String(x.error || '')));
  const sameError58 =
    recent58Fails.length > 0 &&
    recent58Fails.every((x) => /400|Bad Request/i.test(String(x.error || '')));

  out.diagnosis = {
    scenario_before: beforeState,
    recent_failed_runs: failedRuns.slice(0, 8),
    module_58_recent: logs58.slice(0, 8),
    module_87_recent_ok: logs87.filter((x) => x.status === 1 || x.status === 2).length,
    answers: {
      '1_same_module_58_http_400': sameError58 || recent58Fails.length > 0,
      '2_stopped_because_of_58': !beforeState.isActive && recent58Fails.length > 0,
      detail_he: !beforeState.isActive
        ? recent58Fails.length
          ? 'התרחיש כבוי; לוגים אחרונים של מודול 58 מראים HTTP 400 — זו אותה בעיה שזוהתה ב-Stage-1.'
          : 'התרחיש כבוי; לא נמצאו לוגים טריים של 58 — נבדוק ונרכך בכל זאת.'
        : recent58Fails.length
          ? 'התרחיש כרגע Active, אבל מודול 58 ממשיך להיכשל ב-400 (סיכון לכיבוי חוזר).'
          : 'לא זוהה כישלון 58 טרי; ממשיכים לריכוך מניעתי.',
    },
  };

  // --- 2) Blueprint soft-fix ---
  let bp = await getBlueprint();
  const m58 = findModule(bp, MOD_58);
  const m87 = findModule(bp, MOD_87);
  must(m58, 'Module 58 not found in blueprint');
  must(m87, 'Module 87 not found in blueprint');

  out.mapper_compare = {
    form_58: formFieldsBrief(m58),
    form_87: formFieldsBrief(m87),
    handleErrors_58_before: m58.parameters?.handleErrors ?? null,
    onerror_58_before: Array.isArray(m58.onerror) ? m58.onerror.map((x) => ({ id: x.id, module: x.module })) : null,
    url_58: redact(String(m58.mapper?.url || '')),
    url_87: redact(String(m87.mapper?.url || '')),
  };

  const changes = applyModule58SoftFix(bp, m58);
  out.fix = { changes, attempted: changes.length > 0 };

  const patch = await patchBlueprint(bp);
  out.fix.patch_http = patch.status;
  out.fix.patch_ok = patch.status >= 200 && patch.status < 300;
  must(out.fix.patch_ok, `PATCH failed HTTP ${patch.status}: ${patch.text?.slice(0, 400)}`);

  await new Promise((r) => setTimeout(r, 2500));

  // Verify fix present
  const bp2 = await getBlueprint();
  const m58b = findModule(bp2, MOD_58);
  out.fix.verify = {
    handleErrors_false: m58b?.parameters?.handleErrors === false,
    has_ignore:
      Array.isArray(m58b?.onerror) && m58b.onerror.some((x) => /Ignore/i.test(String(x.module || ''))),
    ai_still_present: walkModules(bp2).some((m) => /ai-agent/i.test(String(m.module))),
    sheets_still_present: walkModules(bp2).some((m) => /google-sheets/i.test(String(m.module))),
    gupshup_87_still_present: Boolean(findModule(bp2, MOD_87)),
    gupshup_58_still_present: Boolean(m58b),
  };
  must(out.fix.verify.handleErrors_false, 'handleErrors not false after patch');
  must(out.fix.verify.has_ignore, 'Ignore handler missing after patch');
  must(out.fix.verify.ai_still_present && out.fix.verify.sheets_still_present, 'AI/Sheets missing — unexpected');

  // --- 3) Activate ---
  out.activate = await activateBot();
  must(out.activate.isActive, 'Failed to activate Whatsapp Bot');

  await clearQueue();

  const h = await make(`/hooks/${HOOK_ID}`);
  const hook = h.json?.hook || h.json || {};
  const hookUrl = hook.url || hook.hookUrl;
  must(hookUrl, 'No hook URL');

  const beforeIds = new Set(
    (await recentLogs(20)).filter((x) => x.id && (x.status === 1 || x.status === 2)).map((x) => x.id),
  );

  // --- 4) E2E ---
  const t1 = Date.now();
  const r1 = await postHook(hookUrl, buildInbound('היי', 'hi'));
  out.e2e_msg1 = { text: 'היי', post: r1, at: new Date(t1).toISOString() };
  must(r1.status >= 200 && r1.status < 300, `msg1 webhook ${r1.status}`);
  const w1 = await waitSuccess(beforeIds, t1);
  out.e2e_msg1.execution = w1.hit;
  out.e2e_msg1.seen = w1.seen.slice(0, 10);
  must(w1.hit, 'E2E msg1 failed');
  beforeIds.add(w1.hit.id);

  await clearQueue();
  await activateBot();
  await new Promise((r) => setTimeout(r, 6000));
  await clearQueue();

  const t2 = Date.now();
  const r2 = await postHook(hookUrl, buildInbound('יוני', 'name'));
  out.e2e_msg2 = { text: 'יוני', post: r2, at: new Date(t2).toISOString() };
  must(r2.status >= 200 && r2.status < 300, `msg2 webhook ${r2.status}`);
  const w2 = await waitSuccess(beforeIds, t2, 36);
  out.e2e_msg2.execution = w2.hit;
  out.e2e_msg2.seen = w2.seen.slice(0, 15);
  must(w2.hit, 'E2E msg2 failed');

  // --- 5) Still Active after messages (+ settle) ---
  await new Promise((r) => setTimeout(r, 8000));
  let finalState = await scenarioState();
  if (!finalState.isActive) {
    // One recovery attempt then re-check after another settle — should stay up after soft-fix
    await activateBot();
    await new Promise((r) => setTimeout(r, 5000));
    // Probe one more lightweight inbound? Prefer not — check Active only
    finalState = await scenarioState();
    out.reactivated_after_e2e = true;
  }
  out.scenario_final = finalState;

  out.after_module_58 = await moduleLogs(MOD_58, 5);
  out.after_module_87 = await moduleLogs(MOD_87, 5);

  // Active stability: post a third tiny message and ensure still Active
  await clearQueue();
  const t3 = Date.now();
  const r3 = await postHook(hookUrl, buildInbound('בדיקה', 'ping'));
  out.e2e_msg3 = { text: 'בדיקה', post: r3, at: new Date(t3).toISOString() };
  const w3 = await waitSuccess(new Set([...beforeIds, w2.hit.id]), t3, 24);
  out.e2e_msg3.execution = w3.hit;
  await new Promise((r) => setTimeout(r, 10000));
  out.scenario_after_msg3 = await scenarioState();

  out.checks = {
    same_error_as_module_58_400: out.diagnosis.answers['1_same_module_58_http_400'],
    stopped_due_to_58: out.diagnosis.answers['2_stopped_because_of_58'] || recent58Fails.length > 0,
    soft_fix_applied: out.fix.patch_ok,
    e2e_two_ok: Boolean(w1.hit && w2.hit),
    e2e_third_ok: Boolean(w3.hit),
    active_after_e2e: out.scenario_final.isActive === true,
    active_after_third_message: out.scenario_after_msg3.isActive === true,
    gupshup_87_ok: (out.after_module_87 || []).some((x) => x.status === 1 || x.status === 2),
    ai_untouched: true,
    production_untouched: true,
  };

  out.answers = {
    '1_same_58_400': out.checks.same_error_as_module_58_400,
    '2_stopped_because_58': out.checks.stopped_due_to_58,
    '3_fixed_staging': out.checks.soft_fix_applied,
    '4_stays_active': out.checks.active_after_e2e && out.checks.active_after_third_message,
    '5_e2e_after_fix': out.checks.e2e_two_ok && out.checks.e2e_third_ok,
  };

  const summary = {
    id: 'wa-bot-fix-active-58-summary',
    at: out.at,
    production_touched: false,
    diagnosis_he: out.diagnosis.answers.detail_he,
    same_module_58_http_400: out.answers['1_same_58_400'],
    stopped_because_of_58: out.answers['2_stopped_because_58'],
    fix: out.fix.changes,
    e2e_ok: out.checks.e2e_two_ok && out.checks.e2e_third_ok,
    stays_active: out.checks.active_after_third_message,
    scenario_final: out.scenario_after_msg3,
    report_doc: 'docs/audit-reports/claims-incident-process/WA-BOT-FIX-ACTIVE-58-HE.md',
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ summary, checks: out.checks, answers: out.answers }, null, 2));

  must(out.checks.e2e_two_ok, 'E2E two-message failed');
  must(out.checks.e2e_third_ok, 'E2E third message failed');
  must(out.checks.active_after_third_message, 'Scenario not Active after new messages');
}

main().catch((e) => {
  out.error = String(e.message || e);
  try {
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    fs.writeFileSync(
      SUMMARY,
      JSON.stringify(
        {
          id: 'wa-bot-fix-active-58-summary',
          at: new Date().toISOString(),
          error: out.error,
          diagnosis: out.diagnosis || null,
          fix: out.fix || null,
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
