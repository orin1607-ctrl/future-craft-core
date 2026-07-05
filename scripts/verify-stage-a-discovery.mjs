/**
 * Stage א' Business Discovery smoke — 9-tab wizard UX + Brief fields.
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

  const gateABody = mod.slice(mod.indexOf('function validateGateA'), mod.indexOf('function validateGateB'));

  [
    ['business.legalName', mod.includes('legalName: envelope')],
    ['business.strengths', mod.includes('strengths: envelope')],
    ['business.contact.phone', mod.includes('phone: envelope')],
    ['services.priority', mod.includes('priority: envelope')],
    ['audience.segments', mod.includes('segments: envelope')],
    ['keywords.longTail', mod.includes('longTail: envelope')],
    ['keywords.categories', mod.includes('categories: envelope')],
    ['assets.landingPages', mod.includes('landingPages: envelope')],
    ['files.presentations', mod.includes('presentations: envelope')],
    ['freeContent.strategy', mod.includes('strategy: envelope')],
    ['validateGateA summary', mod.includes("req('סיכום עסק'")],
    ['validateGateA kw OR', mod.includes('fromClientKw.length >= GATE_MIN_KEYWORDS')],
    ['validateGateA no logo req', !gateABody.includes("req('לוגו")],
  ].forEach(([name, ok]) => (ok ? pass : fail)(`local: brief ${name}`));

  if (!gateABody.includes('campaignType')) pass('local: brief no campaignType in validateGateA');
  else fail('local: brief no campaignType in validateGateA');

  [
    ['9 tabs a1-a9', ux.includes("'a9'") && ux.includes('אשר ושמור ל-Project Brief')],
    ['wizard stepper', ux.includes('v2-ob-stepper')],
    ['progress tab X/9', ux.includes('/9')],
    ['שמור והמשך', ux.includes('שמור והמשך')],
    ['הקודם button', ux.includes('הקודם')],
    ['אשר ושמור', ux.includes('אשר ושמור ל-Project Brief')],
    ['tab order: assets before audience', ux.indexOf("'a3'") < ux.indexOf("'a4'")],
    ['tab order: keywords before competitors', ux.indexOf("'a5'") < ux.indexOf("'a6'")],
    ['audience segments', ux.includes('v2-add-segment')],
    ['social telegram', ux.includes("id: 'telegram'")],
    ['dynamic competitors', ux.includes('v2-add-competitor')],
    ['file upload mock', ux.includes('v2-file-inp')],
    ['skip picker to assistants', ux.includes('goToAssistantsAfterGateA')],
    ['saveOnboardingFromForm', ux.includes('saveOnboardingFromForm')],
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

  PB.setField('business.name', 'טסט Discovery');
  PB.setField('business.sector', 'שירותים');
  PB.setField('business.summary', 'סיכום עסק לבדיקה');
  PB.setField('services.main', 'שירות מרכזי');
  PB.setField('audience.ideal', ['קהל א']);
  PB.setField('keywords.fromClient', ['kw1', 'kw2', 'kw3', 'kw4', 'kw5']);
  const b2 = PB.get();
  b2.competitors = [{
    id: 'c1',
    name: PB.envelope('מתחרה', { source: 'manual', status: 'from_client', updatedBy: 'test' }),
    website: PB.envelope('', { source: 'manual', status: 'missing', updatedBy: 'test' }),
  }];
  PB.set(b2);

  const vA = PB.validateGateA();
  if (vA.ok) pass('runtime: validateGateA (no logo, no USP/budget)');
  else fail('runtime: validateGateA', vA.missing.join(', '));

  const apA = PB.approveGateA('test');
  if (apA.ok && PB.isGateAApproved()) pass('runtime: approveGateA');
  else fail('runtime: approveGateA', JSON.stringify(apA));

  PB.setField('business.campaignType', 'seo');
  const vFinal = PB.validate(PB.get());
  if (!vFinal.ok && vFinal.missing.some((m) => m.includes('seoPack') || m.includes('USP') || m.includes('לוגו'))) {
    pass('runtime: validate() still requires campaign extras before final gate');
  } else {
    fail('runtime: validate() final gate behavior', vFinal.missing.join(', '));
  }
}

checkLocalFiles();
checkGateARuntime();

if (!isLocal) {
  try {
    const ux = await fetchText(`${BASE}/ai-marketing/workflow-v2-ux.js`);
    if (ux.status === 200 && ux.text.includes('v2-ob-stepper') && ux.text.includes('שמור והמשך')) {
      pass('remote: stage-a wizard served');
    } else fail('remote: workflow-v2-ux.js stage-a');
    const mod = await fetchText(`${BASE}/ai-marketing/project-brief-module.js`);
    if (mod.status === 200 && mod.text.includes('audience.segments')) pass('remote: expanded brief module');
    else fail('remote: project-brief-module.js');
  } catch (e) {
    fail('remote checks', String(e.message || e));
  }
}

console.log('\n' + JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
