/**
 * Workflow V2 UX smoke — local files + optional remote.
 * Usage: node scripts/verify-workflow-v2-ux.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

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
  return { status: r.status, text: await r.text() };
}

function checkLocalFiles() {
  const root = process.cwd();
  const mod = readFileSync(join(root, 'public/ai-marketing/project-brief-module.js'), 'utf8');
  const ux = readFileSync(join(root, 'public/ai-marketing/workflow-v2-ux.js'), 'utf8');
  const css = readFileSync(join(root, 'public/ai-marketing/workflow-v2-ux.css'), 'utf8');
  const shell = readFileSync(join(root, 'public/coco-dalia/index.html'), 'utf8');

  [
    ['validateGateA', mod.includes('validateGateA')],
    ['validateGateB', mod.includes('validateGateB')],
    ['gateAApproved', mod.includes('gateAApproved')],
    ['GATE_A_KEY', mod.includes('coco-gate-a-approved-v1')],
    ['approveGateA', mod.includes('approveGateA')],
    ['isGateAApproved', mod.includes('isGateAApproved')],
  ].forEach(([name, ok]) => (ok ? pass : fail)(`local: brief ${name}`));

  [
    ['CocoWorkflowV2', ux.includes('CocoWorkflowV2')],
    ['onboarding steps', ux.includes('ONBOARDING_STEPS')],
    ['campaign picker after gate', ux.includes('isGateAApproved')],
    ['no launchCampaign early', !ux.includes('launchCampaign')],
    ['breadcrumb', ux.includes('v2-breadcrumb')],
    ['companies entry', ux.includes('MOCK_CLIENTS')],
    ['Gate-A button', ux.includes('v2-btn-gate-a')],
  ].forEach(([name, ok]) => (ok ? pass : fail)(`local: ux ${name}`));

  if (css.includes('#coco-v2-app') && css.includes('v2-stepper')) pass('local: workflow-v2-ux.css');
  else fail('local: workflow-v2-ux.css');

  [
    ['workflow-v2-ux.js load', shell.includes('workflow-v2-ux.js')],
    ['workflow-v2 meta', shell.includes('workflow-v2-ux')],
    ['v2GoOnboarding', shell.includes('v2GoOnboarding')],
    ['Gate ד stepper', shell.includes('50 עוזרים') && shell.includes('Blueprint')],
    ['brief gate modes', shell.includes('brief-mode-b')],
    ['validateGateA in refresh', shell.includes('validateGateA')],
  ].forEach(([name, ok]) => (ok ? pass : fail)(`local: shell ${name}`));

  // Part A iframe still has campaign picker for v1 iframe path — hidden by v2 shell
  if (shell.includes("selectCampaignType('seo')")) pass('local: legacy Part A iframe preserved (hidden in V2)');
  else fail('local: Part A iframe');
}

async function checkRemote() {
  const cocoUrl = `${BASE}/coco-dalia/index.html?flow=coco`;
  const direct = await fetchText(cocoUrl);
  if (direct.status === 200 && direct.text.includes('workflow-v2-ux.js')) {
    pass('remote: coco V2 assets linked', cocoUrl);
  } else fail('remote: coco V2 shell', String(direct.status));

  const uxJs = await fetchText(`${BASE}/ai-marketing/workflow-v2-ux.js`);
  if (uxJs.status === 200 && uxJs.text.includes('approveGateA')) {
    pass('remote: workflow-v2-ux.js served');
  } else fail('remote: workflow-v2-ux.js');

  const legacy = await fetchText(`${BASE}/ai-marketing-platform.html`);
  if (legacy.status === 200 && !legacy.text.includes('workflow-v2-ux.js')) {
    pass('remote: legacy Orin unchanged (no v2 bundle in platform.html)');
  } else fail('remote: legacy should not load v2 bundle');
}

function runSubScript(script) {
  try {
    const r = spawnSync(process.execPath, [join(process.cwd(), script), BASE], {
      encoding: 'utf8',
      cwd: process.cwd(),
      timeout: 120000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    const out = (r.stdout || '') + (r.stderr || '');
    const ok = r.status === 0 || /"ok":\s*true/.test(out);
    (ok ? pass : fail)(`sub: ${script}`, ok ? 'passed' : out.slice(0, 300));
  } catch (e) {
    fail(`sub: ${script}`, String(e.message || e));
  }
}

checkLocalFiles();

if (isLocal) {
  try { await checkRemote(); } catch (e) { fail('remote checks skipped', String(e.message || e)); }
} else {
  await checkRemote();
}

runSubScript('scripts/verify-project-brief-phase1.mjs');
runSubScript('scripts/verify-coco-phase0.mjs');

console.log('\n' + JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
