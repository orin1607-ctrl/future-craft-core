/**
 * One Staging WhatsApp comparison send to an alternate approved number.
 * Does NOT touch Production. Aborts if destination missing or equals Owner phone.
 *
 * Env:
 *   MAKE_API_TOKEN, MAKE_ZONE, SUPABASE_ACCESS_TOKEN
 *   WA_COMPARE_DEST — local IL (05…) or E.164 (972…)
 * Optional queue: public/project-001/wa-peer-compare-queue.json
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const SCENARIO_ID = 5797671;
const HOOK_ID = 2567320;
const OWNER_EMAIL = 'orin1607@gmail.com';
const OWNER_LOCAL = '0534338601';
const OWNER_E164 = '972534338601';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const QUEUE = 'public/project-001/wa-peer-compare-queue.json';
const OUT = 'public/project-001/wa-peer-compare-result.json';
const GATE = 'public/project-001/wa-peer-compare-gate.json';

const out = {
  id: 'wa-peer-compare-send',
  at: new Date().toISOString(),
  env: 'staging',
  production_touched: false,
  only_one_send: true,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function normalizeIlPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972') && d.length >= 11) return { e164: d, local: `0${d.slice(3)}` };
  if (d.startsWith('0') && d.length === 10) return { e164: `972${d.slice(1)}`, local: d };
  if (d.length === 9 && d.startsWith('5')) return { e164: `972${d}`, local: `0${d}` };
  return null;
}

function loadDest() {
  const fromEnv = (process.env.WA_COMPARE_DEST || '').trim();
  if (fromEnv) return normalizeIlPhone(fromEnv);
  if (fs.existsSync(QUEUE)) {
    const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
    if (q.armed === true && (q.destination_local || q.destination_e164)) {
      return normalizeIlPhone(q.destination_e164 || q.destination_local);
    }
  }
  return null;
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
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text: text.slice(0, 1500) };
}

function extractLogBody(log) {
  const data = log?.data || {};
  const req = data.request || data;
  let body = req?.body ?? req?.parsed ?? data.body ?? '';
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string' && body.trim()) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return null;
}

async function findDlrForMessage(messageId, fromMs) {
  const list = await make(
    `/hooks/${HOOK_ID}/logs?from=${fromMs}&pg[limit]=50&pg[sortBy]=loggedAt&pg[sortDir]=desc`,
  );
  const logs = list.json?.hookLogs || list.json?.logs || [];
  const statuses = [];
  for (const log of (logs || []).slice(0, 40)) {
    let body = extractLogBody(log);
    if (!body) {
      const detail = await make(`/hooks/${HOOK_ID}/logs/${log.id}`);
      body = extractLogBody(detail.json?.hookLog || detail.json?.log || detail.json);
    }
    if (!body) continue;
    const s = JSON.stringify(body);
    if (!s.includes(messageId)) continue;
    const st = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    if (st) {
      statuses.push({
        loggedAt: log.loggedAt,
        status: st.status,
        gs_id: st.gs_id,
        recipient_id: st.recipient_id ?? null,
        error_code: st.errors?.[0]?.code ?? null,
        error_details: st.errors?.[0]?.error_data?.details ?? null,
        conversation_origin: st.conversation?.origin?.type ?? null,
      });
    }
  }
  return statuses;
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');

  const dest = loadDest();
  if (!dest) {
    out.status = 'blocked_waiting_owner_phone';
    out.error =
      'No alternate destination. Reply with «מספר בדיקה מאושר: 05XXXXXXXX» then re-run.';
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    if (fs.existsSync(GATE)) {
      const g = JSON.parse(fs.readFileSync(GATE, 'utf8'));
      g.last_blocked_at = out.at;
      g.send_executed = false;
      fs.writeFileSync(GATE, JSON.stringify(g, null, 2));
    }
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  must(dest.e164 !== OWNER_E164 && dest.local !== OWNER_LOCAL, 'ABORT: destination equals Owner phone — need a DIFFERENT number');
  out.destination = dest;
  out.owner_baseline = {
    local: OWNER_LOCAL,
    e164: OWNER_E164,
    message_id: '346d6d28-9266-42ae-a0c3-6e4f0bd0a06f',
    make_dlr: { sent: true, delivered: false },
  };

  // Ensure Whatsapp Bot active (DLR path)
  const sc0 = await make(`/scenarios/${SCENARIO_ID}?cols[]=id&cols[]=name&cols[]=isActive`);
  const s0 = sc0.json?.scenario || sc0.json || {};
  if (s0.isActive !== true) {
    const start = await make(`/scenarios/${SCENARIO_ID}/start`, { method: 'POST', body: {} });
    out.scenario_start_http = start.status;
  }
  out.scenario_active_check = true;

  process.env.SUPABASE_ACCESS_TOKEN = sbToken;
  try {
    execSync(`npx --yes supabase functions deploy send-whatsapp-message --project-ref ${STAGING} --use-api`, {
      encoding: 'utf8',
      timeout: 180000,
    });
    out.deploy_ok = true;
  } catch (e) {
    out.deploy_ok = false;
    out.deploy_error = String(e.stderr || e.message || e).slice(0, 300);
  }

  async function mgmt(path) {
    const res = await fetch(`https://api.supabase.com/v1${path}`, {
      headers: { Authorization: `Bearer ${sbToken}`, apikey: sbToken },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
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
  const ver = await post(
    base,
    '/auth/v1/verify',
    { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp },
    anon || srk,
    anon || srk,
  );
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'Staging auth failed');

  const message = `CO.CO peer-compare Staging ${new Date().toISOString()} → ${dest.local}`;
  const sendAt = Date.now();
  const send = await post(
    base,
    '/functions/v1/send-whatsapp-message',
    { action: 'send', destination: dest.local, message },
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
  };
  must(out.send.success && messageId, `Send failed: ${out.send.error || 'no message_id'}`);
  must(String(out.send.destination).includes(dest.e164.slice(-9)), 'Destination mismatch vs requested compare number');

  const terminal = new Set(['delivered', 'read', 'failed', 'rejected']);
  let makeStatuses = [];
  let row = null;
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(
      `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${messageId}&channel=eq.whatsapp&select=status,dlr_event,dlr_error_code,error_message,status_history,updated_at&limit=1`,
      { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
    );
    const j = await res.json().catch(() => []);
    row = Array.isArray(j) ? j[0] : null;
    if (i % 2 === 1) makeStatuses = await findDlrForMessage(messageId, sendAt - 5000);
    if (makeStatuses.some((s) => terminal.has(s.status))) break;
    if (row && terminal.has(row.status)) break;
  }
  makeStatuses = await findDlrForMessage(messageId, sendAt - 5000);
  out.make_dlr_statuses = makeStatuses;
  out.db_row = row
    ? {
        status: row.status,
        dlr_event: row.dlr_event,
        dlr_error_code: row.dlr_error_code,
        error_message: row.error_message,
        status_history: row.status_history,
      }
    : null;

  const hasMake = (s) => makeStatuses.some((x) => x.status === s);
  const timeline = {
    submitted: out.send.submitted === true,
    sent: hasMake('sent'),
    delivered: hasMake('delivered') || hasMake('read'),
    read: hasMake('read'),
    failed: hasMake('failed') || hasMake('rejected'),
  };
  out.timeline = timeline;

  let verdict;
  if (timeline.delivered) {
    verdict =
      'ALT_DELIVERED — peer number got delivered. Problem likely specific to Owner phone 0534338601 (device/account/block/SIM). Next: investigate Owner number only.';
  } else if (timeline.sent && !timeline.delivered && !timeline.failed) {
    verdict =
      'ALT_SENT_ONLY — same pattern as Owner (sent without delivered). Problem is NOT Owner device; investigate Meta/business/account pipeline.';
  } else if (timeline.failed) {
    verdict = 'ALT_FAILED — Meta/Gupshup returned failed for peer number. Inspect error_code before concluding device vs pipeline.';
  } else {
    verdict = 'ALT_INCONCLUSIVE — no clear DLR beyond submit within poll window. Re-check Make hook logs.';
  }
  out.verdict = verdict;
  out.compare_vs_owner = {
    owner: { sent: true, delivered: false },
    alt: { sent: timeline.sent, delivered: timeline.delivered, failed: timeline.failed },
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  if (fs.existsSync(GATE)) {
    const g = JSON.parse(fs.readFileSync(GATE, 'utf8'));
    g.status = 'ran';
    g.send_executed = true;
    g.last_result = OUT;
    g.last_verdict = verdict;
    g.at_ran = out.at;
    fs.writeFileSync(GATE, JSON.stringify(g, null, 2));
  }
  if (fs.existsSync(QUEUE)) {
    const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
    q.armed = false;
    q.last_run_at = out.at;
    q.last_message_id = messageId;
    fs.writeFileSync(QUEUE, JSON.stringify(q, null, 2));
  }

  console.log(JSON.stringify({ message_id: messageId, timeline, verdict }, null, 2));
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
