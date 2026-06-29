#!/usr/bin/env node
/**
 * Compile approved business-strategy-approved-source.html → scoped CSS + shell + integrated JS
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public/ai-marketing/business-strategy-approved-source.html');
const raw = readFileSync(SRC, 'utf8');

const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = raw.match(/<body>([\s\S]*?)<script>/);
const scriptMatch = raw.match(/<script>([\s\S]*?)<\/script>/);
if (!styleMatch || !bodyMatch || !scriptMatch) throw new Error('parse failed');

let css = styleMatch[1];
css = css
  .replace(/:root\s*\{/g, '#biz-strategy-root.biz-wiz{')
  .replace(/\*\{box-sizing:border-box;margin:0;padding:0;\}/g, '#biz-strategy-root.biz-wiz,#biz-strategy-root.biz-wiz *{box-sizing:border-box;}')
  .replace(/body\{[^}]+\}/g, '')
  .replace(/(@keyframes[\s\S]*?\})/g, '$1')
  .replace(/(^|\n)(\.[a-zA-Z#@][^{;\n]+|\#[a-zA-Z][^{;\n]+)/g, (m, pre, sel) => {
    if (sel.startsWith('@') || sel.includes('#biz-strategy-root')) return m;
    return pre + '#biz-strategy-root ' + sel.trim();
  });

css = css
  .replace(/#biz-strategy-root \.plat-\n#biz-strategy-root \.plat-body\.open/g,
    '#biz-strategy-root .plat-body{display:none;padding:0 14px 14px;border-top:1px solid var(--w10);}\n#biz-strategy-root .plat-body.open')
  .replace(/#biz-strategy-root \.tl-\n#biz-strategy-root \.tl-title/g,
    '#biz-strategy-root .tl-body{flex:1;padding-top:4px;}\n#biz-strategy-root .tl-title');

css += `
#biz-strategy-root.biz-wiz{font-family:'Heebo',sans-serif;background:var(--bg);color:var(--w);min-height:100vh;overflow-x:hidden;margin:0;padding:0;}
#biz-strategy-root .footer{z-index:510;}
#screen-business-strategy.active{display:flex;flex-direction:column;}
#screen-business-strategy .biz-strategy-root{flex:1;overflow:auto;}
`;

const shell = bodyMatch[1].trim()
  .replace(
    "onclick=\"showToast('🚀 עובר למנהל השיווק...')\"",
    "onclick=\"if(typeof goScreen==='function')goScreen('screen-agents');showToast('🚀 עובר למנהל השיווק...')\""
  );

let js = scriptMatch[1];

const integration = `
function applySeedPrefill(seed) {
  if (!seed) return;
  S.data = Object.assign(S.data, seed);
  var set = function(id, val) { var e = document.getElementById(id); if (e && val != null && val !== '') e.value = val; };
  set('b-name', seed.name); set('b-sector', seed.sector); set('b-site', seed.site); set('b-loc', seed.loc);
  set('b-age', seed.age); set('b-size', seed.size); set('b-main', seed.mainService);
  set('b-services', seed.services); set('b-diff', seed.diff); set('b-pain', seed.pain); set('b-usp', seed.usp);
  set('b-ideal', seed.ideal); set('b-bad', seed.bad); set('b-goal', seed.goal); set('b-comp', seed.comp);
  set('b-vs', seed.vs); set('b-budget', seed.budget); set('b-free', seed.free);
  if (seed.site) { S.urls = seed.urls && seed.urls.length ? seed.urls.slice() : [seed.site]; }
  var tcEl = document.getElementById('tb-client');
  if (tcEl && seed.name) tcEl.textContent = seed.name;
  ['sec-chips', 'chal-chips'].forEach(function(cid) {
    var chips = cid === 'sec-chips' ? (seed.sectors || []) : (seed.challenges || []);
    document.querySelectorAll('#' + cid + ' .chip').forEach(function(ch) {
      if (chips.indexOf(ch.textContent.trim()) >= 0) ch.classList.add('on');
    });
  });
  autoConnectPlatforms(seed.connected || []);
}

function autoConnectPlatforms(names) {
  var map = {
    'אתר אינטרנט': 'website', 'Google Search Console': 'gsc', 'Google Analytics 4': 'ga4',
    'Google Business Profile': 'gbp', 'Google Ads': 'gads'
  };
  names.forEach(function(n) {
    var key = map[n];
    if (key) connectPlat(key);
  });
}

function mergedLogSteps() {
  var extra = [];
  if (window.BusinessStrategyModule && BusinessStrategyModule.scanSiteInsights) {
    var sc = BusinessStrategyModule.scanSiteInsights();
    if (sc.log && sc.log.length) extra = sc.log;
  }
  return LOG_STEPS.map(function(s, i) { return extra[i] || s; });
}
`;

js = js.replace(
  'function startAnalysis(){',
  integration + '\nfunction startAnalysis(){'
);

js = js.replace(
  `function connectPlat(key){
  document.getElementById('ps-'+key).outerHTML=`,
  `function connectPlat(key){
  var pel=document.getElementById('ps-'+key); if(!pel) return;
  pel.outerHTML=`
);

js = js.replace(
  '(function buildWiz(){',
  'function buildWiz(){'
).replace(
  /}\)\(\);\s*\n\/\/ ── BUILD PLATFORMS/,
  '}\n\n// ── BUILD PLATFORMS'
).replace(
  '(function buildPlats(){',
  'function buildPlats(){'
).replace(
  /}\)\(\);\s*\n\/\/ ── BUILD AGENTS/,
  '}\n\n// ── BUILD AGENTS'
).replace(
  '(function buildAgents(){',
  'function buildAgents(){'
).replace(
  /}\)\(\);\s*\n\/\/ ── PLATFORM ACTIONS/,
  '}\n\n// ── PLATFORM ACTIONS'
);

js = js.replace(
  /LOG_STEPS\.forEach\(\(_,i\)=>\{/,
  'mergedLogSteps().forEach((_,i)=>{'
);

js = js.replace(
  '}, LOG_STEPS.length*700+1200);',
  '}, mergedLogSteps().length*700+1200);'
);

js = js.replace(
  `function exportData(){
  collect();
  try{localStorage.setItem('dalia_biz',JSON.stringify(S.data));}catch(e){}
  document.getElementById('exported').style.display='block';
  document.getElementById('btn-next').style.display='none';
  showToast('🚀 הועבר לכל העוזרים!');
}`,
  `function exportData(){
  collect();
  try{localStorage.setItem('dalia_biz',JSON.stringify(S.data));}catch(e){}
  var res = window.BusinessStrategyModule ? BusinessStrategyModule.exportToPlatform(S.data) : { ok: false };
  if (!res.ok) { showToast('⚠️ שגיאה בהעברה'); return; }
  document.getElementById('exported').style.display='block';
  document.getElementById('btn-next').style.display='none';
  showToast('🚀 הועבר לכל העוזרים!');
}`
);

if (!js.includes('function openWebsiteBuilder(')) {
  js += `
function openWebsiteBuilder(){
  if(window.WebsiteBuilderWizard && typeof WebsiteBuilderWizard.open==='function'){
    WebsiteBuilderWizard.open();
    return;
  }
  showToast('⚠️ מודול בניית אתר לא זמין כרגע');
}
`;
}

js = js.replace(
  "clientId:'CLT-NEW'",
  "clientId:(window.BusinessStrategyModule&&BusinessStrategyModule.ENABLED_CLIENT)||'dalia-c-official'"
);

js = js.replace(
  `  const ctx={
    clientId:(window.BusinessStrategyModule&&BusinessStrategyModule.ENABLED_CLIENT)||'dalia-c-official',company:d.name,sector:d.sector,site:d.site,location:d.loc,
    mainService:d.mainService,differentiator:d.diff,usp:d.usp,
    idealClient:d.ideal,avoidClient:d.bad,businessGoal:d.goal,
    competitors:d.comp?.split('\\n').filter(Boolean),
    challenges:d.challenges,sectors:d.sectors,budget:d.budget,
    connectedAssets:d.connected,ai_analysed:S.analysed,
    timestamp:new Date().toISOString(),
    strategy:{type:'SEO+PPC',platforms:['Google Ads','SEO','GBP'],budget_tier:parseBudget(d.budget).tier},
  };
  setHTML('ctx-json',JSON.stringify(ctx,null,2));`,
  `  var ctx = window.BusinessStrategyModule ? BusinessStrategyModule.buildBusinessContext(S.data) : {
    clientId:'dalia-c-official',company:d.name,sector:d.sector,site:d.site,location:d.loc,
    mainService:d.mainService,differentiator:d.diff,usp:d.usp,
    idealClient:d.ideal,avoidClient:d.bad,businessGoal:d.goal,
    competitors:d.comp?d.comp.split('\\n').filter(Boolean):[],
    challenges:d.challenges,sectors:d.sectors,budget:d.budget,
    connectedAssets:d.connected,ai_analysed:S.analysed,
    timestamp:new Date().toISOString(),
    strategy:{type:'SEO+PPC',platforms:['Google Ads','SEO','GBP'],budget_tier:parseBudget(d.budget).tier}
  };
  setHTML('ctx-json',JSON.stringify(ctx,null,2));`
);

const wrapper = `/**
 * AI Business Strategy Wizard — compiled from approved design (1:1)
 */
(function () {
  'use strict';
  var rootEl = null;
  var shellHtml = ${JSON.stringify(shell)};

${js}

  window.tc = tc; window.dov = dov; window.dlv = dlv; window.ddr = ddr; window.hf = hf;
  window.addUrl = addUrl; window.togglePlat = togglePlat; window.connectPlat = connectPlat;
  window.disconnectPlat = disconnectPlat; window.goT = goT; window.nextT = nextT; window.prevT = prevT;
  window.startAnalysis = startAnalysis; window.exportData = exportData; window.openWebsiteBuilder = openWebsiteBuilder; window.showToast = showToast;

  function mountWizard() {
    rootEl = document.getElementById('biz-strategy-root');
    if (!rootEl) return Promise.resolve(false);
    if (!window.BusinessStrategyModule || !BusinessStrategyModule.isEnabled()) {
      rootEl.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">מודול זמין ב-Staging לדליה בלבד</div>';
      return Promise.resolve(false);
    }
    return BusinessStrategyModule.whenDataReady().then(function () {
      return BusinessStrategyModule.loadCompetitors();
    }).then(function () {
      rootEl.innerHTML = shellHtml;
      rootEl.classList.add('biz-wiz');
      S.tab = 1; S.max = 1; S.analysed = false; S.files = []; S.urls = []; S.data = {};
      buildWiz();
      buildPlats();
      buildAgents();
      applySeedPrefill(BusinessStrategyModule.buildSeed());
      collect();
      goT(1);
      return true;
    });
  }

  function openWizard() {
    if (!window.BusinessStrategyModule || !BusinessStrategyModule.isEnabled()) {
      if (typeof showToast === 'function') showToast('מודול זמין ב-Staging לדליה בלבד');
      if (typeof goScreen === 'function') goScreen('screen-clients');
      return Promise.resolve();
    }
    return mountWizard().then(function () {
      if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    });
  }

  window.BusinessStrategyWizard = {
    VERSION: '2.0.0-approved',
    open: openWizard,
    mount: mountWizard,
    openWebsiteBuilder: openWebsiteBuilder,
  };
})();
`;

writeFileSync(join(ROOT, 'public/ai-marketing/business-strategy-wizard.css'), css.trim() + '\n');
writeFileSync(join(ROOT, 'public/ai-marketing/business-strategy-wizard.js'), wrapper);
console.log('compiled OK', { css: css.length, shell: shell.length, js: wrapper.length });
