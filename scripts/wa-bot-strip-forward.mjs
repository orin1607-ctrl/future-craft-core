/**
 * Re-remove HTTP Forward from Whatsapp Bot if CI re-injected it,
 * keep bot Active, then two consecutive inbounds (no Edge E2E).
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const BOT_ID = 5797671;
const OUT = 'public/project-001/wa-bot-strip-forward-result.json';

const out = { id: 'wa-bot-strip-forward', at: new Date().toISOString(), production_touched: false };

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

function removeForward(node, removed = []) {
  if (!node) return removed;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const m = node[i];
      const url = m?.mapper?.url || '';
      if (m && typeof url === 'string' && /gupshup-webhook/i.test(url)) {
        removed.push({ id: m.id, name: m.metadata?.designer?.name || null, url: url.slice(0, 80) });
        node.splice(i, 1);
      } else removeForward(m, removed);
    }
    return removed;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.flow)) removeForward(node.flow, removed);
    if (Array.isArray(node.routes)) {
      for (const r of node.routes) removeForward(r?.flow || r, removed);
    }
  }
  return removed;
}

async function main() {
  if (!token) throw new Error('MAKE_API_TOKEN missing');

  const br = await make(`/scenarios/${BOT_ID}/blueprint`);
  if (br.status !== 200) throw new Error(`blueprint ${br.status}`);
  let bp = br.json?.response?.blueprint || br.json?.blueprint || br.json;
  if (typeof bp === 'string') bp = JSON.parse(bp);

  const before = walkModules(bp).filter((m) => /gupshup-webhook/i.test(String(m.mapper?.url || '')));
  out.forward_before = before.map((m) => ({ id: m.id, name: m.metadata?.designer?.name }));

  const removed = removeForward(bp);
  out.removed = removed;

  if (removed.length) {
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
    out.patch_http = patch.status;
    out.patch_ok = patch.status >= 200 && patch.status < 300;
    if (!out.patch_ok) throw new Error(`PATCH failed ${patch.status}`);
  } else {
    out.patch_ok = true;
    out.note = 'No forward module present';
  }

  await new Promise((r) => setTimeout(r, 2000));
  const br2 = await make(`/scenarios/${BOT_ID}/blueprint`);
  let bp2 = br2.json?.response?.blueprint || br2.json?.blueprint || br2.json;
  if (typeof bp2 === 'string') bp2 = JSON.parse(bp2);
  out.forward_after = walkModules(bp2)
    .filter((m) => /gupshup-webhook/i.test(String(m.mapper?.url || '')))
    .map((m) => m.id);

  // Keep Active
  const sc = await make(`/scenarios/${BOT_ID}?cols[]=id&cols[]=isActive&cols[]=islinked`);
  const s = sc.json?.scenario || sc.json || {};
  if (s.isActive !== true) {
    await make(`/scenarios/${BOT_ID}/start`, { method: 'POST', body: {} });
  }
  await new Promise((r) => setTimeout(r, 2000));
  const sc2 = await make(`/scenarios/${BOT_ID}?cols[]=id&cols[]=isActive&cols[]=islinked`);
  const s2 = sc2.json?.scenario || sc2.json || {};
  out.bot = { isActive: s2.isActive === true, islinked: s2.islinked === true };

  if (out.forward_after.length) throw new Error('Forward still present after strip');
  if (!out.bot.isActive) throw new Error('Bot not Active');

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
