import fs from 'node:fs';
const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const HOOK = 2567320;
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
async function make(path) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json };
}
function pickIds(obj, acc = []) {
  if (!obj || typeof obj !== 'object') return acc;
  for (const [k, v] of Object.entries(obj)) {
    if (/^(id|gsId|gs_id|messageId|message_id|externalId|wamid)$/i.test(k) && typeof v === 'string') acc.push({ k, v });
    if (typeof v === 'object') pickIds(v, acc);
  }
  return acc;
}
const from = Date.now() - 2 * 60 * 60 * 1000;
const list = await make(`/hooks/${HOOK}/logs?from=${from}&pg[limit]=30&pg[sortBy]=loggedAt&pg[sortDir]=desc`);
const logs = list.json?.hookLogs || [];
const out = { zone, hook: HOOK, list_http: list.status, count: logs.length, details: [] };
for (const log of logs.slice(0, 20)) {
  const detail = await make(`/hooks/${HOOK}/logs/${log.id}`);
  const dlog = detail.json?.hookLog || detail.json?.log || detail.json;
  const data = dlog?.data || {};
  const body = data?.request?.body ?? data?.body ?? dlog?.request?.body ?? data;
  const bodyObj = typeof body === 'string' ? (() => { try { return JSON.parse(body); } catch { return { raw: body }; } })() : body;
  out.details.push({
    id: log.id,
    loggedAt: log.loggedAt,
    statusId: log.statusId,
    ids: pickIds(bodyObj),
    statuses: bodyObj?.entry?.[0]?.changes?.[0]?.value?.statuses || null,
    body_preview: JSON.stringify(bodyObj).slice(0, 1200),
  });
}
console.log('---MAKE_HOOK_DUMP---');
console.log(JSON.stringify(out, null, 2));
console.log('---MAKE_HOOK_DUMP_DONE---');
fs.writeFileSync('/tmp/make-hook-dump.json', JSON.stringify(out, null, 2));
