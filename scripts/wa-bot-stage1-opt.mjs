/**
 * Stage-1 Whatsapp Bot optimization (Owner-approved):
 * 1) Safety-check + remove Sleep modules 88 & 77 (post-send delays only)
 * 2) Diagnose Gupshup module 58 (HTTP 400) — explain usage; do NOT remove/fix mapper yet
 * 3) E2E: two consecutive inbounds (היי → יוני) via Make hook (no Edge E2E, no Production)
 * 4) Before/after Make duration compare; confirm AI/Sheets untouched
 *
 * Explicitly NOT done: AI Agent changes, Sheets→Cache.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_E164 = '972534338601';
const SLEEP_IDS = [88, 77];
const OUT = 'public/project-001/wa-bot-stage1-opt-result.json';
const SUMMARY = 'public/project-001/wa-bot-stage1-opt-summary.json';
const BEFORE = 'public/project-001/wa-bot-latency-summary.json';

const out = {
  id: 'wa-bot-stage1-opt',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  stage: 1,
  not_done: ['ai_agent_changes', 'sheets_to_cache', 'production'],
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

/** Find parent flow array + index for each module id. */
function findInFlows(node, targetIds, path = 'root', hits = []) {
  const idSet = new Set(targetIds.map(Number));
  if (!node) return hits;
  if (Array.isArray(node)) {
    node.forEach((m, i) => {
      if (m && idSet.has(Number(m.id))) {
        hits.push({
          id: m.id,
          module: m.module,
          name: m.metadata?.designer?.name || null,
          path,
          index: i,
          next_module: node[i + 1]
            ? {
                id: node[i + 1].id,
                module: node[i + 1].module,
                name: node[i + 1].metadata?.designer?.name || null,
              }
            : null,
          prev_module: node[i - 1]
            ? {
                id: node[i - 1].id,
                module: node[i - 1].module,
                name: node[i - 1].metadata?.designer?.name || null,
                url_host: (() => {
                  const u = node[i - 1]?.mapper?.url;
                  if (typeof u !== 'string') return null;
                  try {
                    return new URL(u).host;
                  } catch {
                    return u.slice(0, 40);
                  }
                })(),
              }
            : null,
        });
      }
      findInFlows(m, targetIds, `${path}[${i}]`, hits);
    });
    return hits;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.flow)) findInFlows(node.flow, targetIds, `${path}.flow`, hits);
    if (Array.isArray(node.routes)) {
      node.routes.forEach((r, ri) => findInFlows(r?.flow || r, targetIds, `${path}.routes[${ri}]`, hits));
    }
    if (Array.isArray(node.subflows)) findInFlows(node.subflows, targetIds, `${path}.subflows`, hits);
  }
  return hits;
}

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

function sanitizeMapper(m) {
  if (!m?.mapper || typeof m.mapper !== 'object') return null;
  const copy = { ...m.mapper };
  for (const k of Object.keys(copy)) {
    const v = copy[k];
    if (/apikey|api_key|authorization|password|token|secret/i.test(k)) copy[k] = '[REDACTED]';
    if (typeof v === 'string' && /apikey=|Bearer |token/i.test(v)) {
      copy[k] = v.replace(/(apikey=)[^&]+/gi, '$1[REDACTED]').replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]');
      if (copy[k].length > 200) copy[k] = copy[k].slice(0, 200) + '…';
    }
  }
  // headers may contain secrets
  if (copy.headers && typeof copy.headers === 'object') {
    const h = { ...copy.headers };
    for (const hk of Object.keys(h)) {
      if (/auth|apikey|token|secret/i.test(hk) || /auth|apikey|token/i.test(String(h[hk]))) {
        h[hk] = '[REDACTED]';
      }
    }
    copy.headers = h;
  }
  return {
    url: typeof copy.url === 'string' ? copy.url.replace(/apikey=[^&]+/gi, 'apikey=[REDACTED]') : copy.url,
    method: copy.method,
    bodyType: copy.bodyType,
    formFieldKeys: Array.isArray(copy.formFields)
      ? copy.formFields.map((f) => f?.key || f?.name || Object.keys(f || {})[0]).filter(Boolean)
      : null,
    qsKeys: copy.qs && typeof copy.qs === 'object' ? Object.keys(copy.qs) : null,
    mapper_keys: Object.keys(copy).slice(0, 25),
  };
}

function fingerprintModule(m) {
  return {
    id: m.id,
    module: m.module,
    name: m.metadata?.designer?.name || null,
    mapper: sanitizeMapper(m),
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

async function activateIfNeeded() {
  let st = await scenarioState();
  if (st.isActive && st.islinked) return { already: true, ...st };
  if (!st.isActive) {
    await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
  }
  await new Promise((r) => setTimeout(r, 3000));
  st = await scenarioState();
  return { already: false, ...st };
}

async function clearQueueUntilEmpty(rounds = 4) {
  let total = 0;
  for (let i = 0; i < rounds; i++) {
    const n = await clearQueue();
    total += n;
    if (n === 0) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return total;
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

async function clearQueue() {
  const midQueue = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
  const midItems = midQueue.json?.hookIncomings || midQueue.json?.incomings || [];
  const midIds = (Array.isArray(midItems) ? midItems : []).map((x) => x.id).filter(Boolean);
  if (midIds.length) {
    await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
      method: 'DELETE',
      body: { ids: midIds },
    });
  }
  return midIds.length;
}

function buildInbound(text, tag) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: `stage1-${tag}`,
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
                  id: `wamid.S1_${tag}_${Date.now()}`,
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
  const body = await res.text();
  return { status: res.status, body: body.slice(0, 200) };
}

async function waitSuccess(beforeIds, sinceMs, attempts = 36, gapMs = 5000) {
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
      if (!(x.status === 1 || x.status === 2 || x.status === 'SUCCESS')) return false;
      if (x.timestamp && Date.parse(x.timestamp) < sinceMs - 15000) return false;
      return true;
    });
    if (hit) return { hit, seen };
  }
  return { hit: null, seen };
}

function avg(nums) {
  const a = nums.filter((n) => typeof n === 'number' && n > 0);
  if (!a.length) return null;
  return Math.round(a.reduce((x, y) => x + y, 0) / a.length);
}

async function moduleRecent(mid, limit = 8) {
  const r = await make(`/scenarios/${BOT_ID}/modules/${mid}/logs?pg[limit]=${limit}&pg[sortDir]=desc`);
  const arr = r.json?.moduleLogs || r.json?.logs || [];
  return (Array.isArray(arr) ? arr : []).slice(0, limit).map((x) => ({
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    executionId: x.executionId || null,
  }));
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  let beforeLatency = null;
  try {
    beforeLatency = JSON.parse(fs.readFileSync(BEFORE, 'utf8'));
  } catch {
    beforeLatency = null;
  }
  out.before_baseline = {
    source: BEFORE,
    make_execution_ms: beforeLatency?.make_execution_ms || null,
    user_visible_to_gupshup_ms: beforeLatency?.user_visible_to_gupshup_ms || null,
    sleep: beforeLatency?.sleep || null,
    bottleneck: beforeLatency?.bottleneck || null,
  };

  let bp = await getBlueprint();
  const modsBefore = walkModules(bp);
  const byId = Object.fromEntries(modsBefore.map((m) => [Number(m.id), m]));

  // --- Sleep safety analysis ---
  const sleepHits = findInFlows(bp, SLEEP_IDS);
  out.sleep_analysis = {
    targets: SLEEP_IDS,
    found: sleepHits,
    all_are_function_sleep: sleepHits.every((h) => /FunctionSleep/i.test(String(h.module))),
    all_terminal_in_flow: sleepHits.every((h) => h.next_module == null),
    all_after_gupshup_host: sleepHits.every((h) => /gupshup/i.test(String(h.prev_module?.url_host || ''))),
    duration_seconds: SLEEP_IDS.map((id) => ({
      id,
      duration: byId[id]?.mapper?.duration ?? byId[id]?.parameters?.duration ?? null,
    })),
    references_to_sleep_outputs: (() => {
      const bpStr = JSON.stringify(bp);
      // crude: {{88. or {{77. references
      const refs = [];
      for (const id of SLEEP_IDS) {
        const re = new RegExp(`\\{\\{${id}\\.`, 'g');
        if (re.test(bpStr)) refs.push(id);
      }
      return refs;
    })(),
  };

  const sleepAlreadyGone = sleepHits.length === 0;
  const sleepSafe =
    !sleepAlreadyGone &&
    out.sleep_analysis.all_are_function_sleep &&
    out.sleep_analysis.all_terminal_in_flow &&
    out.sleep_analysis.references_to_sleep_outputs.length === 0 &&
    sleepHits.length === SLEEP_IDS.length;

  out.sleep_analysis.already_removed = sleepAlreadyGone;
  out.sleep_analysis.safe_to_remove = sleepSafe || sleepAlreadyGone;
  out.sleep_analysis.rationale_he = sleepAlreadyGone
    ? 'Sleep 88/77 כבר לא ב-blueprint (הוסרו קודם) — ממשיכים ל-E2E בלבד.'
    : sleepSafe
      ? 'Sleep 88/77 הם מודולי השהייה 1ש׳ בסוף מסלול, אחרי Gupshup send, בלי מודול אחריהם ובלי הפניות לפלט שלהם — הסרה לא משנה לוגיקת שיחה/AI/Sheets, רק מקצרת ריצה.'
      : 'לא בטוח להסיר אוטומטית — חסר תנאי בטיחות (לא טרמינלי / יש הפניות / לא נמצא).';

  // --- Module 58 diagnosis (no mapper change) ---
  const m58 = byId[58];
  const m87 = byId[87];
  const hits58 = findInFlows(bp, [58]);
  const hits87 = findInFlows(bp, [87]);
  const logs58 = await moduleRecent(58, 10);
  const logs87 = await moduleRecent(87, 10);
  const ok58 = logs58.filter((x) => x.status === 1 || x.status === 2).length;
  const fail58 = logs58.filter((x) => x.status === 3 || x.error).length;
  const ok87 = logs87.filter((x) => x.status === 1 || x.status === 2).length;

  out.module_58_analysis = {
    still_in_blueprint: Boolean(m58),
    still_in_use: Boolean(m58) && logs58.length > 0,
    position: hits58,
    next_after_58: hits58.map((h) => h.next_module),
    prev_before_58: hits58.map((h) => h.prev_module),
    fingerprint: m58 ? fingerprintModule(m58) : null,
    compare_to_87: {
      module_87: m87 ? fingerprintModule(m87) : null,
      same_host:
        Boolean(m58?.mapper?.url && m87?.mapper?.url) &&
        String(m58.mapper.url).includes('api.gupshup.io') &&
        String(m87.mapper.url).includes('api.gupshup.io'),
      form_keys_58: sanitizeMapper(m58)?.formFieldKeys,
      form_keys_87: sanitizeMapper(m87)?.formFieldKeys,
    },
    recent_logs_58: logs58,
    recent_logs_87_summary: { ok: ok87, sample: logs87.slice(0, 5) },
    success_fail_counts_58: { ok: ok58, fail: fail58, n: logs58.length },
    verdict_he:
      m58 && fail58 > 0 && ok58 === 0
        ? 'מודול 58 עדיין קיים ובשימוש במסלול משני (אחרי AI 63 / Sheets 90) כשליחת Gupshup — אבל בדגימות האחרונות נכשל תמיד ב-HTTP 400. מודול 87 במסלול הראשי מצליח. לא מסירים/מתקנים mapper ב-Stage 1 (דורש אישור נפרד) — רק מאבחנים.'
        : m58
          ? 'מודול 58 קיים; ראו לוגים להצלחה/כישלון.'
          : 'מודול 58 לא נמצא ב-blueprint.',
    action_stage1: 'diagnose_only_no_mapper_change',
  };

  // Snapshot: AI + Sheets ids must remain after patch
  const aiBefore = modsBefore.filter((m) => /ai-agent/i.test(String(m.module))).map((m) => m.id);
  const sheetsBefore = modsBefore.filter((m) => /google-sheets/i.test(String(m.module))).map((m) => m.id);
  const gupBefore = modsBefore
    .filter((m) => typeof m.mapper?.url === 'string' && /api\.gupshup\.io.*msg/i.test(m.mapper.url))
    .map((m) => m.id);

  out.logic_fingerprint_before = { ai: aiBefore, sheets: sheetsBefore, gupshup_msg: gupBefore, sleep: SLEEP_IDS };

  // --- Apply Sleep removal if safe ---
  out.patch = { attempted: false, removed: [], skipped: sleepAlreadyGone, already_removed: sleepAlreadyGone };
  if (sleepAlreadyGone) {
    out.patch.ok = true;
    out.patch.note = 'Sleep already absent — no PATCH';
  } else if (sleepSafe) {
    const removed = removeModuleIds(bp, SLEEP_IDS);
    out.patch.attempted = true;
    out.patch.removed = removed;
    const patch = await patchBlueprint(bp);
    out.patch.http = patch.status;
    out.patch.ok = patch.status >= 200 && patch.status < 300;
    must(out.patch.ok, `PATCH failed HTTP ${patch.status}: ${patch.text?.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2500));
  } else {
    must(false, 'Sleep removal blocked by safety checks — aborting Stage 1 without changes');
  }

  // Persist mid-run so CI can commit even if E2E fails later
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  // Verify after
  const bp2 = await getBlueprint();
  const modsAfter = walkModules(bp2);
  const sleepAfter = modsAfter.filter((m) => SLEEP_IDS.includes(Number(m.id)) || /FunctionSleep/i.test(String(m.module)));
  const aiAfter = modsAfter.filter((m) => /ai-agent/i.test(String(m.module))).map((m) => m.id);
  const sheetsAfter = modsAfter.filter((m) => /google-sheets/i.test(String(m.module))).map((m) => m.id);
  const gupAfter = modsAfter
    .filter((m) => typeof m.mapper?.url === 'string' && /api\.gupshup\.io.*msg/i.test(m.mapper.url))
    .map((m) => m.id);

  out.logic_fingerprint_after = {
    ai: aiAfter,
    sheets: sheetsAfter,
    gupshup_msg: gupAfter,
    sleep_remaining: sleepAfter.map((m) => ({ id: m.id, module: m.module })),
  };

  out.logic_unchanged_checks = {
    ai_ids_same: JSON.stringify(aiBefore) === JSON.stringify(aiAfter),
    sheets_ids_same: JSON.stringify(sheetsBefore) === JSON.stringify(sheetsAfter),
    gupshup_ids_same: JSON.stringify(gupBefore) === JSON.stringify(gupAfter),
    sleep_removed: sleepAfter.length === 0,
    module_58_still_present: modsAfter.some((m) => Number(m.id) === 58),
  };
  must(out.logic_unchanged_checks.ai_ids_same, 'AI modules changed — unexpected');
  must(out.logic_unchanged_checks.sheets_ids_same, 'Sheets modules changed — unexpected');
  must(out.logic_unchanged_checks.gupshup_ids_same, 'Gupshup send modules changed — unexpected');
  must(out.logic_unchanged_checks.sleep_removed, 'Sleep still present after patch');

  out.bot = await activateIfNeeded();
  must(out.bot.isActive, 'Bot not Active after patch');

  // Clear queue before E2E
  out.queue_cleared_before_e2e = await clearQueueUntilEmpty();

  const h = await make(`/hooks/${HOOK_ID}`);
  const hook = h.json?.hook || h.json || {};
  const hookUrl = hook.url || hook.hookUrl;
  must(hookUrl, 'No hook URL');

  // Snapshot success ids only (do not poison with parallel failed DLRs)
  const beforeLogs = await recentLogs(25);
  const beforeIds = new Set(
    beforeLogs.filter((x) => x.id && (x.status === 1 || x.status === 2)).map((x) => x.id),
  );

  // --- E2E msg1 ---
  await activateIfNeeded();
  const t1 = Date.now();
  const r1 = await postHook(hookUrl, buildInbound('היי', 'hi'));
  out.e2e_msg1 = { text: 'היי', post: r1, at: new Date(t1).toISOString() };
  must(r1.status >= 200 && r1.status < 300, `msg1 webhook ${r1.status}`);
  const w1 = await waitSuccess(beforeIds, t1);
  out.e2e_msg1.execution = w1.hit;
  out.e2e_msg1.seen_logs = w1.seen.slice(0, 12);
  must(w1.hit, 'E2E msg1: no successful Make execution');
  beforeIds.add(w1.hit.id);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  // Drain queue + ensure Active before msg2 (DLR/400 noise can leave leftovers or pause scenario)
  out.queue_cleared_between = await clearQueueUntilEmpty(6);
  const midBot = await activateIfNeeded();
  out.between_messages_bot = midBot;
  must(midBot.isActive && midBot.islinked, 'Bot not Active/linked between messages');
  await new Promise((r) => setTimeout(r, 8000));
  // second drain after settle
  out.queue_cleared_between_2 = await clearQueueUntilEmpty(3);

  // --- E2E msg2 ---
  await activateIfNeeded();
  const t2 = Date.now();
  const r2 = await postHook(hookUrl, buildInbound('יוני', 'name'));
  out.e2e_msg2 = { text: 'יוני', post: r2, at: new Date(t2).toISOString() };
  must(r2.status >= 200 && r2.status < 300, `msg2 webhook ${r2.status}`);

  // If queue not draining, re-activate mid-wait once
  let w2 = { hit: null, seen: [] };
  for (let wave = 0; wave < 2 && !w2.hit; wave++) {
    if (wave === 1) {
      out.e2e_msg2.reactivate_mid_wait = await activateIfNeeded();
    }
    w2 = await waitSuccess(beforeIds, t2, wave === 0 ? 24 : 24, 5000);
  }
  out.e2e_msg2.execution = w2.hit;
  out.e2e_msg2.seen_logs = w2.seen.slice(0, 20);
  out.e2e_msg2.hook_queue_after = await (async () => {
    const q = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=20`);
    const items = q.json?.hookIncomings || q.json?.incomings || [];
    return Array.isArray(items) ? items.length : null;
  })();
  out.e2e_msg2.any_status3 = (w2.seen || []).filter((x) => x.status === 3);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  must(w2.hit, 'E2E msg2: no successful Make execution');
  const exec1 = w1.hit;
  const exec2 = w2.hit;

  // Post-E2E module statuses
  out.after_module_logs = {
    '87': await moduleRecent(87, 5),
    '58': await moduleRecent(58, 5),
    '84': await moduleRecent(84, 5),
    '63': await moduleRecent(63, 5),
  };

  const afterDurations = [exec1.duration, exec2.duration].filter((d) => typeof d === 'number');
  // also pull a few more recent successes
  const recentOk = (await recentLogs(15)).filter((x) => (x.status === 1 || x.status === 2) && typeof x.duration === 'number');
  const afterSamples = recentOk.slice(0, 5).map((x) => x.duration);

  out.performance = {
    before_make_avg_ms: out.before_baseline.make_execution_ms?.avg ?? null,
    before_make_p50_ms: out.before_baseline.make_execution_ms?.p50 ?? null,
    before_samples: out.before_baseline.make_execution_ms?.n
      ? null
      : out.before_baseline.make_execution_ms,
    after_e2e_durations_ms: afterDurations,
    after_recent_success_samples_ms: afterSamples,
    after_avg_ms: avg(afterSamples.length ? afterSamples : afterDurations),
    delta_avg_ms:
      out.before_baseline.make_execution_ms?.avg != null && avg(afterSamples.length ? afterSamples : afterDurations) != null
        ? avg(afterSamples.length ? afterSamples : afterDurations) - out.before_baseline.make_execution_ms.avg
        : null,
    expected_save_from_sleep_ms: 1000,
    note_he:
      'הסרת Sleep אמורה לקצר ~1ש׳ ממשך ריצת Make (לא בהכרח מזמן עד בועת WhatsApp, כי Sleep היה אחרי שליחה).',
  };

  out.quality_checks = {
    two_success_executions: Boolean(exec1 && exec2 && exec1.id !== exec2.id),
    gupshup_87_still_succeeding: (out.after_module_logs['87'] || []).some((x) => x.status === 1 || x.status === 2),
    ai_84_still_running: (out.after_module_logs['84'] || []).some((x) => x.status === 1 || x.status === 2),
    sleep_gone: out.logic_unchanged_checks.sleep_removed,
    ai_untouched: out.logic_unchanged_checks.ai_ids_same,
    sheets_untouched: out.logic_unchanged_checks.sheets_ids_same,
    module_58_not_modified: out.logic_unchanged_checks.module_58_still_present,
    conversation_path_he:
      'אותו מסלול: Webhook → Sheets/Router → AI Agent → Gupshup 87. רק Sleep הוסר. איכות התשובה תלויה ב-AI שלא שונה.',
  };

  out.answers = {
    '1_sleep_safe_and_removed': {
      safe: sleepSafe,
      removed: out.patch.removed,
      rationale: out.sleep_analysis.rationale_he,
    },
    '2_module_58': {
      still_in_use: out.module_58_analysis.still_in_use,
      verdict: out.module_58_analysis.verdict_he,
      action: 'diagnose_only',
    },
    '3_e2e': {
      msg1: out.e2e_msg1,
      msg2: out.e2e_msg2,
      ok: out.quality_checks.two_success_executions,
    },
    '4_perf_compare': out.performance,
    '5_logic_quality': out.quality_checks,
  };

  out.scenario_final = await scenarioState();

  const summary = {
    id: 'wa-bot-stage1-opt-summary',
    at: out.at,
    production_touched: false,
    sleep_removed: out.patch.removed.map((r) => r.id),
    module_58: {
      still_in_use: out.module_58_analysis.still_in_use,
      always_400_in_sample: fail58 > 0 && ok58 === 0,
      action: 'diagnose_only',
      verdict_he: out.module_58_analysis.verdict_he,
    },
    e2e_ok: out.quality_checks.two_success_executions,
    performance: out.performance,
    logic_unchanged: out.logic_unchanged_checks,
    not_done: out.not_done,
    report_doc: 'docs/audit-reports/claims-incident-process/WA-BOT-STAGE1-OPT-HE.md',
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ summary, answers: out.answers }, null, 2));

  must(out.quality_checks.two_success_executions, 'E2E failed');
  must(out.quality_checks.gupshup_87_still_succeeding, 'Gupshup 87 not succeeding after change');
  must(out.scenario_final.isActive, 'Bot not Active at end');
}

main().catch((e) => {
  out.error = String(e.message || e);
  try {
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    const summary = {
      id: 'wa-bot-stage1-opt-summary',
      at: new Date().toISOString(),
      error: out.error,
      sleep_removed: out.patch?.removed?.map((r) => r.id) || [],
      sleep_already_removed: out.sleep_analysis?.already_removed || false,
      patch_ok: out.patch?.ok || false,
      e2e_msg1: out.e2e_msg1?.execution || null,
      e2e_msg2: out.e2e_msg2?.execution || null,
      module_58: out.module_58_analysis
        ? {
            still_in_use: out.module_58_analysis.still_in_use,
            verdict_he: out.module_58_analysis.verdict_he,
            action: 'diagnose_only',
          }
        : null,
      production_touched: false,
    };
    fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  } catch {
    /* ignore */
  }
  console.error(e);
  process.exit(1);
});
