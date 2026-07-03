/**
 * Phase 0 smoke: legacy default + ?flow=coco shell + adapter file present.
 * Usage: node scripts/verify-coco-phase0.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/$/, '');
const isLocal = BASE.includes('127.0.0.1') || BASE.includes('localhost');

const report = { base: BASE, at: new Date().toISOString(), checks: [], ok: true };

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
  console.log('OK', name, detail || '');
}

function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  report.ok = false;
  console.error('FAIL', name, detail || '');
}

async function fetchText(url) {
  const r = await fetch(url, { redirect: 'follow' });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}

function checkLocalFiles() {
  const root = process.cwd();
  const platform = readFileSync(join(root, 'public/ai-marketing-platform.html'), 'utf8');
  const adapter = readFileSync(join(root, 'public/ai-marketing/coco-data-adapter.js'), 'utf8');
  const shell = readFileSync(join(root, 'public/coco-dalia/index.html'), 'utf8');

  if (platform.includes("flowMode === 'coco'") && platform.includes('coco-dalia/index.html')) {
    pass('local: flow router in ai-marketing-platform.html');
  } else fail('local: flow router missing');

  if (adapter.includes('CocoDataAdapter') && adapter.includes('dalia_part_a') && adapter.includes('dalia_biz')) {
    pass('local: coco-data-adapter.js fields');
  } else fail('local: coco-data-adapter.js incomplete');

  if (shell.includes('abc-app') && shell.includes('coco-legacy-back') && shell.includes('coco-data-adapter.js')) {
    pass('local: coco-dalia shell + legacy link');
  } else fail('local: coco-dalia shell incomplete');
}

async function checkRemote() {
  const legacyUrl = `${BASE}/ai-marketing-platform.html`;
  const cocoUrl = `${BASE}/ai-marketing-platform.html?flow=coco`;
  const directCoco = `${BASE}/coco-dalia/index.html?flow=coco`;

  const legacy = await fetchText(legacyUrl);
  if (legacy.status === 200 && legacy.text.includes('coco-claude-root')) {
    pass('remote: legacy loads Orin shell', legacyUrl);
  } else {
    fail('remote: legacy shell', `${legacy.status} ${legacyUrl}`);
  }

  const coco = await fetchText(cocoUrl);
  if (coco.text.includes("flowMode === 'coco'") && coco.text.includes('coco-dalia/index.html')) {
    pass('remote: ?flow=coco router present (client redirect)', cocoUrl);
  } else {
    fail('remote: ?flow=coco router', cocoUrl);
  }

  const direct = await fetchText(directCoco);
  if (direct.status === 200 && direct.text.includes('coco-legacy-back')) {
    pass('remote: direct coco-dalia/index.html', directCoco);
  } else {
    fail('remote: direct coco shell', `${direct.status}`);
  }
}

checkLocalFiles();

if (isLocal) {
  try {
    await checkRemote();
  } catch (e) {
    fail('remote checks skipped', String(e.message || e));
  }
} else {
  await checkRemote();
}

console.log('\n' + JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
