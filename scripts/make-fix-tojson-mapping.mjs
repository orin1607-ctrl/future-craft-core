/**
 * Fix Make HTTP Forward mapping: replace invalid {{toJSON(N)}} with {{createJSON(N)}}.
 * Target: Whatsapp Bot (5797671) primarily; also CO.CO Dalia DLR (9553017) same bug.
 * Activate Whatsapp Bot. Verify no new toJSON errors.
 * NO WhatsApp send. NO Production. NO queue delete / no old replies.
 * Cancels peer-compare gate (Owner stopped alt-number test).
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const DLR_ID = 9553017;
const OUT = 'public/project-001/make-fix-tojson-result.json';

const out = {
  id: 'make-fix-tojson',
  at: new Date().toISOString(),
  env: 'staging_make_only',
  production_touched: false,
  no_whatsapp_send: true,
  peer_compare_cancelled: true,
  mapping_fix: '{{toJSON(N)}} → {{createJSON(N)}}',
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

function replaceToJsonInString(s) {
  if (typeof s !== 'string') return { value: s, changed: false };
  if (!/toJSON/i.test(s)) return { value: s, changed: false };
  // {{toJSON(1)}} → {{createJSON(1)}} ; also bare toJSON(
  const next = s.replace(/toJSON\s*\(/gi, 'createJSON(');
  return { value: next, changed: next !== s };
}

function fixMapperDeep(obj, path = '', hits = []) {
  if (!obj || typeof obj !== 'object') return hits;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) fixMapperDeep(obj[i], `${path}[${i}]`, hits);
    return hits;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /toJSON/i.test(v)) {
      const { value, changed } = replaceToJsonInString(v);
      if (changed) {
        obj[k] = value;
        hits.push({ path: `${path}.${k}`, from: v.slice(0, 60), to: value.slice(0, 60) });
      }
    } else if (v && typeof v === 'object') {
      fixMapperDeep(v, `${path}.${k}`, hits);
    }
  }
  return hits;
}

async function getBlueprint(scenarioId) {
  const br = await make(`/scenarios/${scenarioId}/blueprint`);
  must(br.status === 200, `blueprint GET ${scenarioId} HTTP ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  if (typeof bp === 'string') bp = JSON.parse(bp);
  return bp;
}

async function patchBlueprint(scenarioId, bp) {
  let patch = await make(`/scenarios/${scenarioId}?confirmed=true`, {
    method: 'PATCH',
    body: { blueprint: JSON.stringify(bp) },
  });
  if (patch.status >= 400) {
    patch = await make(`/scenarios/${scenarioId}?confirmed=true`, {
      method: 'PATCH',
      body: { blueprint: bp },
    });
  }
  return patch;
}

async function scenarioState(scenarioId) {
  const sc = await make(
    `/scenarios/${scenarioId}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=hookId&cols[]=scheduling`,
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

async function recentErrors(scenarioId, afterIso) {
  const r = await make(`/scenarios/${scenarioId}/logs?pg[limit]=20&pg[sortDir]=desc`);
  const arr = r.json?.scenarioLogs || r.json?.logs || [];
  const afterMs = afterIso ? Date.parse(afterIso) : 0;
  const rows = (Array.isArray(arr) ? arr : []).slice(0, 15).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt || x.createdAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null) || null,
  }));
  const newRows = rows.filter((x) => {
    if (!x.timestamp) return true;
    const t = Date.parse(x.timestamp);
    return Number.isFinite(t) ? t >= afterMs - 5000 : true;
  });
  const toJsonErrors = newRows.filter(
    (x) => x.error && /toJSON/i.test(String(x.error)),
  );
  return { http: r.status, recent: rows, since_fix: newRows, toJSON_errors_since_fix: toJsonErrors };
}

async function fixScenario(scenarioId, label) {
  const before = await scenarioState(scenarioId);
  const bp = await getBlueprint(scenarioId);
  const modsBefore = walkModules(bp);
  const toJsonMods = modsBefore
    .filter((m) => {
      const d = `${m.mapper?.data || ''} ${m.mapper?.inputRaw || ''}`;
      return /toJSON/i.test(d);
    })
    .map((m) => ({
      id: m.id,
      module: m.module,
      name: m.metadata?.designer?.name || null,
      data: (m.mapper?.data || '').slice(0, 80),
    }));

  const hits = fixMapperDeep(bp, 'bp');
  let patch = { status: null, skipped: true };
  if (hits.length) {
    patch = await patchBlueprint(scenarioId, bp);
    patch.skipped = false;
  }

  // Verify blueprint no longer has toJSON in HTTP data fields
  const bp2 = await getBlueprint(scenarioId);
  const modsAfter = walkModules(bp2);
  const stillToJson = modsAfter.filter((m) => {
    const d = `${m.mapper?.data || ''} ${m.mapper?.inputRaw || ''}`;
    return /toJSON/i.test(d);
  });
  const nowCreateJson = modsAfter.filter((m) => {
    const d = `${m.mapper?.data || ''} ${m.mapper?.inputRaw || ''}`;
    return /createJSON/i.test(d);
  });

  return {
    label,
    scenarioId,
    before,
    toJson_modules_before: toJsonMods,
    remap_hits: hits,
    patch_http: patch.status,
    patch_ok: patch.skipped || (patch.status >= 200 && patch.status < 300),
    patch_error: patch.status >= 300 ? patch.text?.slice(0, 400) : null,
    still_has_toJSON: stillToJson.map((m) => m.id),
    now_has_createJSON: nowCreateJson.map((m) => ({
      id: m.id,
      data: (m.mapper?.data || '').slice(0, 80),
      name: m.metadata?.designer?.name || null,
    })),
  };
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  // Cancel peer-compare
  for (const f of [
    'public/project-001/wa-peer-compare-gate.json',
    'public/project-001/wa-peer-compare-queue.json',
  ]) {
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (f.includes('gate')) {
      j.status = 'cancelled_by_owner';
      j.send_executed = false;
      j.cancelled_at = out.at;
      j.cancel_reason = 'Owner stopped alt-number compare; fix toJSON mapping first';
    } else {
      j.armed = false;
      j.cancelled = true;
      j.destination_local = null;
    }
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
  }

  out.fixes = [];
  out.fixes.push(await fixScenario(BOT_ID, 'Whatsapp Bot'));
  out.fixes.push(await fixScenario(DLR_ID, 'CO.CO Dalia DLR → Staging'));

  // Activate Whatsapp Bot
  const pre = await scenarioState(BOT_ID);
  out.bot_before_activate = pre;
  let activate = { already: false };
  if (!pre.isActive) {
    const start = await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
    let ok = start.status >= 200 && start.status < 300;
    if (!ok) {
      const patch = await make(`/scenarios/${BOT_ID}?confirmed=true`, {
        method: 'PATCH',
        body: { isActive: true },
      });
      ok = patch.status >= 200 && patch.status < 300;
      activate = { start_http: start.status, patch_http: patch.status, ok };
    } else {
      activate = { start_http: start.status, ok: true };
    }
  } else {
    activate = { already: true, ok: true };
  }
  out.bot_activate = activate;
  // brief settle
  await new Promise((r) => setTimeout(r, 3000));
  out.bot_after_activate = await scenarioState(BOT_ID);

  const fixAt = out.at;
  out.verify = {
    whatsapp_bot: await recentErrors(BOT_ID, fixAt),
    dlr_scenario: await recentErrors(DLR_ID, fixAt),
  };

  const botOk =
    out.bot_after_activate.isActive === true &&
    (out.fixes.find((f) => f.scenarioId === BOT_ID)?.still_has_toJSON || []).length === 0 &&
    (out.fixes.find((f) => f.scenarioId === BOT_ID)?.patch_ok === true);

  const noNewToJson =
    (out.verify.whatsapp_bot.toJSON_errors_since_fix || []).length === 0;

  out.checks = {
    whatsapp_bot_active: out.bot_after_activate.isActive === true,
    whatsapp_bot_linked: out.bot_after_activate.islinked === true,
    bot_mapping_no_toJSON: botOk,
    no_new_toJSON_errors_after_fix: noNewToJson,
    no_whatsapp_send: true,
  };

  out.report_he = {
    what_fixed:
      'הוחלף מיפוי HTTP Forward מ-{{toJSON(1)}} (לא קיים ב-Make) ל-{{createJSON(1)}} (פונקציית IML תקינה) בתרחיש Whatsapp Bot; אותו תיקון גם ב-CO.CO Dalia DLR → Staging.',
    bot_active: out.bot_after_activate.isActive,
    bot_linked: out.bot_after_activate.islinked,
    new_toJSON_errors: noNewToJson ? 'אין שגיאות toJSON חדשות מאז התיקון' : 'יש שגיאות toJSON חדשות — ראה verify',
    no_send: 'לא בוצעה שליחת WhatsApp',
    peer_compare: 'בדיקת מספר נוסף בוטלה לפי בקשת Owner',
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ checks: out.checks, report_he: out.report_he, fixes: out.fixes.map((f) => ({
    label: f.label,
    patch_ok: f.patch_ok,
    still_has_toJSON: f.still_has_toJSON,
    now_has_createJSON: f.now_has_createJSON,
  })) }, null, 2));

  must(out.checks.whatsapp_bot_active, 'Whatsapp Bot failed to activate');
  must(out.checks.bot_mapping_no_toJSON, 'Bot still has toJSON after patch');
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
