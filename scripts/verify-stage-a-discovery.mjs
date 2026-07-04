/**
 * Stage א' Business Discovery smoke — Brief fields + wizard UX.
 * Usage: node scripts/verify-stage-a-discovery.mjs [baseUrl]
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
  const ux = readFileSync(join(root, 'public/ai-marketing/workflow-v2-ux.js'), 'utf8');

  [
    ['business.summary in default', mod.includes('summary: envelope')],
    ['business.weaknesses', mod.includes('weaknesses: envelope')],
    ['business.languages', mod.includes('languages: envelope')],
    ['keywords.toPromote', mod.includes('toPromote: envelope')],
    ['keywords.intentMap', mod.includes('intentMap: envelope')],
    ['files.catalogs', mod.includes('catalogs: envelope')],
    ['freeContent.ownerFreeText', mod.includes('ownerFreeText: envelope')],
    ['assets.domains', mod.includes('domains: envelope')],
    ['validateGateA summary', mod.includes("req('סיכום עסק'")],
    ['validateGateA kw OR', mod.includes('fromClientKw.length >= GATE_MIN_KEYWORDS')],
  ].forEach(([name, ok]) => (ok ? pass : fail)(`local: brief ${name}`));

  const gateABody = mod.slice(mod.indexOf('function validateGateA'), mod.indexOf('function validateGateB'));
  if (!gateABody.includes('campaignType')) pass('local: brief no campaignType in validateGateA');
  else fail('local: brief no campaignType in validateGateA');

  [
    ['A1-A9 steps', ux.includes("'a9'") && ux.includes('A9 סיכום')],
    ['Brief Report panel', ux.includes('v2-brief-report')],
    ['dynamic competitors', ux.includes('v2-add-competitor')],
    ['file upload mock', ux.includes('v2-file-inp')],
    ['only SEO + Ads campaigns', ux.includes("id: 'seo'") && ux.includes("id: 'ads'") && !ux.includes("id: 'both'")],
    ['campaign stub', ux.includes('createCampaignStub')],
    ['save step button', ux.includes('v2-btn-save-step')],
    ['gate after gateA', ux.includes('isGateAApproved()')],
    ['breadcrumb היכרות', ux.includes('ניהול שיווק')],
  ].forEach(([name, ok]) => (ok ? pass : fail)(`local: ux ${name}`));
}

function checkGateARuntime() {
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
  const PB = window.ProjectBrief;
  if (!PB) {
    fail('runtime: ProjectBrief loaded');
    return;
  }

  const brief = PB.get();
  PB.setField('business.name', 'טסט Discovery');
  PB.setField('business.sector', 'שירותים');
  PB.setField('business.summary', 'סיכום עסק לבדיקה');
  PB.setField('services.main', 'שירות מרכזי');
  PB.setField('services.usp', 'USP');
  PB.setField('audience.ideal', ['קהל א']);
  PB.setField('goals.businessGoal', 'לידים');
  PB.setField('goals.budget', '5000');
  PB.setField('assets.website', 'https://example.co.il');
  PB.setField('keywords.fromClient', ['kw1', 'kw2', 'kw3', 'kw4', 'kw5']);
  PB.setField('files.logo', [{ name: 'logo.png', type: 'logo', mock: true }]);
  const b2 = PB.get();
  b2.competitors = [{
    id: 'c1',
    name: PB.envelope('מתחרה', { source: 'manual', status: 'from_client', updatedBy: 'test' }),
    website: PB.envelope('', { source: 'manual', status: 'missing', updatedBy: 'test' }),
  }];
  PB.set(b2);

  const vA = PB.validateGateA();
  if (vA.ok) pass('runtime: validateGateA complete (fromClient kw, no campaignType)');
  else fail('runtime: validateGateA', vA.missing.join(', '));

  const apA = PB.approveGateA('test');
  if (apA.ok && PB.isGateAApproved()) pass('runtime: approveGateA');
  else fail('runtime: approveGateA', JSON.stringify(apA));

  PB.setField('business.campaignType', 'seo');
  const vFinal = PB.validate(PB.get());
  if (!vFinal.ok && vFinal.missing.some((m) => m.includes('seoPack'))) {
    pass('runtime: validate() still requires campaign extras before final gate');
  } else {
    fail('runtime: validate() final gate behavior');
  }
}

checkLocalFiles();
checkGateARuntime();

if (!isLocal) {
  try {
    const ux = await fetchText(`${BASE}/ai-marketing/workflow-v2-ux.js`);
    if (ux.status === 200 && ux.text.includes('A9 סיכום')) pass('remote: stage-a wizard served');
    else fail('remote: workflow-v2-ux.js stage-a');
    const mod = await fetchText(`${BASE}/ai-marketing/project-brief-module.js`);
    if (mod.status === 200 && mod.text.includes('ownerFreeText')) pass('remote: expanded brief module');
    else fail('remote: project-brief-module.js');
  } catch (e) {
    fail('remote checks', String(e.message || e));
  }
}

console.log('\n' + JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
