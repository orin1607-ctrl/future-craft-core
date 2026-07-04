/**
 * Phase 1a smoke: Project Brief SSOT + coco-dalia gate (local files + optional remote).
 * Usage: node scripts/verify-project-brief-phase1.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

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
  const adapter = readFileSync(join(root, 'public/ai-marketing/coco-data-adapter.js'), 'utf8');
  const shell = readFileSync(join(root, 'public/coco-dalia/index.html'), 'utf8');
  const platform = readFileSync(join(root, 'public/ai-marketing-platform.html'), 'utf8');

  const modChecks = [
    ['ProjectBrief export', mod.includes('window.ProjectBrief')],
    ['KEY coco-project-brief-v1', mod.includes('coco-project-brief-v1')],
    ['APPROVAL_KEY', mod.includes('coco-project-brief-approved-v1')],
    ['envelope helper', mod.includes('function envelope')],
    ['mergeFromLegacy', mod.includes('mergeFromLegacy')],
    ['validate gate', mod.includes('GATE_MIN_KEYWORDS')],
    ['exportForAssistant', mod.includes('exportForAssistant')],
    ['applyAssistantReport stub', mod.includes('applyAssistantReport')],
    ['auditLog', mod.includes('auditLog')],
  ];
  modChecks.forEach(([name, ok]) => (ok ? pass : fail)(`local: ${name}`, ok ? '' : 'missing'));

  if (adapter.includes('mergeBriefFromLegacy') && adapter.includes('BRIEF_WATCH_KEYS')) {
    pass('local: adapter brief merge on init/storage');
  } else {
    fail('local: adapter brief merge');
  }

  const shellChecks = [
    ['project-brief-app panel', shell.includes('id="project-brief-app"')],
    ['project-brief-module.js load', shell.includes('project-brief-module.js')],
    ['approveProjectBrief', shell.includes('approveProjectBrief')],
    ['scrollToProjectBrief', shell.includes('scrollToProjectBrief')],
    ['gate showStage block', shell.includes('ProjectBrief.isApproved()')],
    ['postMessage part-a', shell.includes('dalia-coco-part-a-save')],
    ['postMessage part-b', shell.includes('dalia-coco-part-b-approve')],
    ['brief before dj-app', shell.indexOf('project-brief-app') < shell.indexOf('id="dj-app"')],
  ];
  shellChecks.forEach(([name, ok]) => (ok ? pass : fail)(`local: shell ${name}`, ok ? '' : 'missing'));

  if (platform.includes("flowMode === 'coco'") && !platform.includes('project-brief-module')) {
    pass('local: legacy platform unchanged (no brief in Orin boot)');
  } else if (!platform.includes("flowMode === 'coco'")) {
    fail('local: legacy flow router');
  } else {
    fail('local: legacy should not load project-brief-module in platform.html');
  }
}

function checkModuleRuntime() {
  const root = process.cwd();
  const modSrc = readFileSync(join(root, 'public/ai-marketing/project-brief-module.js'), 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
  });
  const { window } = dom;
  window.localStorage.clear();
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = modSrc;
  window.document.body.appendChild(scriptEl);

  if (!window.ProjectBrief) {
    fail('runtime: ProjectBrief loaded');
    return;
  }

  window.localStorage.setItem('dalia_biz', JSON.stringify({
    name: 'דליה טסט',
    sector: 'ניהול צי',
    site: 'dalia-c.com',
    mainService: 'FleetOS',
    usp: 'USP test',
    ideal: 'עסקים',
    goal: 'לידים',
    budget: '5000',
    comp: 'מתחרה א\nמתחרה ב',
    files: [{ name: 'logo.png', type: 'logo' }],
  }));
  window.localStorage.setItem('dalia_part_a', JSON.stringify({ bizName: 'דליה', campaignType: 'seo', site: 'dalia-c.com' }));
  window.localStorage.setItem('dalia_part_b', JSON.stringify({
    approved: true,
    kw_count: 6,
    seoPack: { approvedAt: new Date().toISOString(), goals: ['SEO'], geo: ['מרכז'] },
  }));
  window.localStorage.setItem('coco-strategic-briefing-v1', JSON.stringify({
    keywordsApproved: ['kw1', 'kw2', 'kw3', 'kw4', 'kw5'],
    competitorsManual: ['מתחרה ג'],
  }));

  window.ProjectBrief.mergeFromLegacy();
  const brief = window.ProjectBrief.get();
  const v = window.ProjectBrief.validate(brief);

  if (window.ProjectBrief.envVal(brief.business.name)) pass('runtime: merge business.name');
  else fail('runtime: merge business.name');

  if ((window.ProjectBrief.envVal(brief.keywords.approved) || []).length >= 5) {
    pass('runtime: keywords.approved >= 5');
  } else fail('runtime: keywords.approved');

  if ((brief.competitors || []).length >= 1) pass('runtime: competitors >= 1');
  else fail('runtime: competitors');

  if ((window.ProjectBrief.envVal(brief.files.logo) || []).length >= 1) pass('runtime: logo present');
  else fail('runtime: logo');

  if (!v.ok) fail('runtime: validate complete before approve', v.missing.join(', '));
  else pass('runtime: validate complete');

  const ap = window.ProjectBrief.approve('smoke-test');
  if (ap.ok && window.ProjectBrief.isApproved()) pass('runtime: approve + isApproved');
  else fail('runtime: approve', JSON.stringify(ap));

  const exp = window.ProjectBrief.exportForAssistant();
  if (exp && exp.business && exp.keywords) pass('runtime: exportForAssistant');
  else fail('runtime: exportForAssistant');

  const stub = window.ProjectBrief.applyAssistantReport({});
  if (stub && stub.reason === 'not_implemented') pass('runtime: applyAssistantReport stub');
  else fail('runtime: applyAssistantReport stub');
}

async function checkRemote() {
  const cocoUrl = `${BASE}/coco-dalia/index.html?flow=coco`;
  const legacyUrl = `${BASE}/ai-marketing-platform.html`;
  const direct = await fetchText(cocoUrl);
  if (direct.status === 200 && direct.text.includes('project-brief-app')) {
    pass('remote: coco-dalia has brief panel', cocoUrl);
  } else {
    fail('remote: coco-dalia brief panel', String(direct.status));
  }
  const legacy = await fetchText(legacyUrl);
  if (legacy.status === 200 && !legacy.text.includes('project-brief-app')) {
    pass('remote: legacy entry has no brief panel');
  } else {
    fail('remote: legacy should not include brief panel');
  }
  const mod = await fetchText(`${BASE}/ai-marketing/project-brief-module.js`);
  if (mod.status === 200 && mod.text.includes('ProjectBrief')) {
    pass('remote: project-brief-module.js served');
  } else {
    fail('remote: project-brief-module.js', String(mod.status));
  }
}

checkLocalFiles();
checkModuleRuntime();

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
