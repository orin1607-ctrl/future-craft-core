#!/usr/bin/env node
/** Verify Multi-AI + Question Engine on Staging */
const STAGING =
  process.env.STAGING_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-multi-ai-1';

async function main() {
  const report = { url: STAGING, at: new Date().toISOString(), checks: [] };
  const html = await (await fetch(STAGING, { cache: 'no-store' })).text();
  const base = STAGING.replace(/ai-marketing-platform\.html.*$/, '');
  const ver = 'v3-multi-ai-1';

  function pass(name, detail) { report.checks.push({ name, ok: true, detail }); }
  function fail(name, detail) { report.checks.push({ name, ok: false, detail }); }

  if (html.includes('v3-multi-ai-1')) pass('ui-version', 'v3-multi-ai-1 in HTML');
  else fail('ui-version', 'missing v3-multi-ai-1');

  for (const mod of ['multi-ai-orchestrator.js', 'ai-question-engine.js', 'ai-control-center-bridge.js']) {
    const url = base + 'ai-marketing/' + mod + '?v=' + ver;
    const r = await fetch(url, { cache: 'no-store' });
    const text = await r.text();
    if (r.ok && text.includes('function')) pass('module-' + mod, text.length + ' bytes');
    else fail('module-' + mod, 'HTTP ' + r.status);
  }

  const orchUrl = base + 'ai-marketing/multi-ai-orchestrator.js?v=' + ver;
  const orch = await (await fetch(orchUrl)).text();
  if (orch.includes('MultiAiOrchestrator')) pass('export-MultiAiOrchestrator', 'found');
  else fail('export-MultiAiOrchestrator', 'missing');

  const qe = await (await fetch(base + 'ai-marketing/ai-question-engine.js?v=' + ver)).text();
  if (qe.includes('AiQuestionEngine')) pass('export-AiQuestionEngine', 'found');
  else fail('export-AiQuestionEngine', 'missing');

  report.passed = report.checks.filter((c) => c.ok).length;
  report.failed = report.checks.filter((c) => !c.ok).length;
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
