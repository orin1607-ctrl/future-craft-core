/**
 * Delete any residual Make incomings after E2E (DLR from the test send only).
 * No WA send. No scenario/webhook delete.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const HOOK_ID = 2567320;
const MAKE_BASE = `https://${zone}.make.com/api/v2`;

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
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, json, text: text.slice(0, 800) };
}

const out = { id: 'make-queue-residual-clear', at: new Date().toISOString(), production_touched: false };

const list = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=50`);
const items = list.json?.hookIncomings || list.json?.incomings || [];
out.before = { count: items.length, ids: items.map((x) => x.id) };

if (items.length) {
  const del = await make(`/hooks/${HOOK_ID}/incomings?confirmed=true`, {
    method: 'DELETE',
    body: { ids: items.map((x) => x.id) },
  });
  out.delete = { http: del.status, deleted: del.json?.incomings || null, ok: del.status >= 200 && del.status < 300 };
}

await new Promise((r) => setTimeout(r, 2000));
const stats = await make(`/hooks/${HOOK_ID}/incomings/stats`);
const list2 = await make(`/hooks/${HOOK_ID}/incomings?pg[limit]=20`);
const items2 = list2.json?.hookIncomings || list2.json?.incomings || [];
out.after = {
  stats_queue: stats.json?.incomingStat?.queue ?? null,
  list_count: items2.length,
};
out.queue_empty = out.after.stats_queue === 0 && out.after.list_count === 0;

console.log('---MAKE_RESIDUAL_CLEAR---');
console.log(JSON.stringify(out, null, 2));
console.log('---MAKE_RESIDUAL_CLEAR_DONE---');
fs.writeFileSync('/tmp/make-residual-clear.json', JSON.stringify(out, null, 2));
if (!out.queue_empty) process.exit(1);
