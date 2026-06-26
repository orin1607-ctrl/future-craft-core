/**
 * Build 1:1 Claude UI assets from claude-source.html
 * - CSS/JS: exact extract from source
 * - Screens: source body (complete v4 includes all 10 modules)
 * - Integration hooks only (ids for live data) — no visual changes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, '../public/ai-marketing');
const src = fs.readFileSync(path.join(base, 'claude-source.html'), 'utf8');
const currentScreens = fs.existsSync(path.join(base, 'coco-claude-screens.html'))
  ? fs.readFileSync(path.join(base, 'coco-claude-screens.html'), 'utf8')
  : '';
let bridgeSource = '';
const bridgePath = path.join(base, 'coco-claude-bridge.js');
if (fs.existsSync(bridgePath) && fs.statSync(bridgePath).size > 1000) {
  bridgeSource = fs.readFileSync(bridgePath, 'utf8');
} else {
  const legacyJs = fs.readFileSync(path.join(base, 'coco-claude-main.js'), 'utf8');
  const bridgeIdx = legacyJs.indexOf('// ===== COCO CLAUDE INTEGRATION');
  if (bridgeIdx >= 0) bridgeSource = legacyJs.slice(bridgeIdx);
}

const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
const bodyMatch = src.match(/<body>([\s\S]*?)<script>/);

if (!styleMatch || !scriptMatch || !bodyMatch) {
  console.error('Failed to parse claude-source.html');
  process.exit(1);
}

const sourceCss = styleMatch[1].trim();
let sourceJs = scriptMatch[1].trim();
let sourceBody = bodyMatch[1].trim();

const isCompleteV4 =
  sourceBody.includes('id="screen-crm"') &&
  sourceBody.includes('id="screen-ai-center"') &&
  sourceBody.includes('id="screen-agents"');

// Legacy path: inject Phase-B screens from prior build
if (!isCompleteV4) {
  function extractScreen(html, id) {
    const re = new RegExp(
      `<!-- =+ SCREEN: [^=]+ =+ -->\\s*<div class="screen" id="${id}"[\\s\\S]*?</div>\\s*(?=<!-- =+ SCREEN:|<!-- =+ MODALS)`,
      'm'
    );
    const m = html.match(re);
    if (!m) {
      const re2 = new RegExp(
        `<div class="screen" id="${id}"[\\s\\S]*?</div>\\s*(?=<div class="screen" id="|<div class="screen" id="screen-reports"|<!-- =+ MODALS)`,
        'm'
      );
      return html.match(re2)?.[0] || '';
    }
    return m[0];
  }

  const extraScreens = ['screen-history', 'screen-ai-decisions', 'screen-reports'];
  const extraHtml = extraScreens.map((id) => extractScreen(currentScreens, id)).filter(Boolean);

  if (extraHtml.length !== 3) {
    console.error('Missing Phase-B screens in current coco-claude-screens.html', extraHtml.length);
    process.exit(1);
  }

  const newHubCards = `
      <div class="hub-card" onclick="goScreen('screen-history')">
        <div class="hub-icon">📚</div>
        <div class="hub-name">היסטוריה</div>
        <div class="hub-desc">תיעוד פעולות ושינויים</div>
        <div class="hub-count">18 בוצעו החודש</div>
      </div>
      <div class="hub-card" onclick="goScreen('screen-assets')">
        <div class="hub-icon">🌐</div>
        <div class="hub-name">הנכסים הדיגיטליים</div>
        <div class="hub-desc">שליטה בכל הנכסים</div>
        <div class="hub-count">9 נכסים מחוברים</div>
      </div>
      <div class="hub-card" onclick="goScreen('screen-ai-decisions')">
        <div class="hub-icon">🧠</div>
        <div class="hub-name">AI / קבלת החלטות</div>
        <div class="hub-desc">ישיבת צוות AI מרכזית</div>
        <div class="hub-count">23 המלצות</div>
      </div>
      <div class="hub-card" onclick="goScreen('screen-reports')">
        <div class="hub-icon">📄</div>
        <div class="hub-name">דוחות</div>
        <div class="hub-desc">הפקה אוטומטית ללקוח</div>
        <div class="hub-count">6 סוגי דוחות</div>
      </div>`;

  sourceBody = sourceBody.replace(
    /(<div class="hub-card" onclick="goScreen\('screen-actions'\)">[\s\S]*?<\/div>\s*)\s*<div class="hub-card" onclick="goScreen\('screen-assets'\)">[\s\S]*?<\/div>/,
    `$1${newHubCards}`
  );

  const modalsIdx = sourceBody.indexOf('<!-- ============================= MODALS');
  if (modalsIdx < 0) {
    console.error('MODALS marker not found');
    process.exit(1);
  }
  sourceBody = sourceBody.slice(0, modalsIdx) + extraHtml.join('\n\n') + '\n\n' + sourceBody.slice(modalsIdx);
}

// Integration hooks — ids only, no visual change
sourceBody = sourceBody.replace(
  '<div style="font-size:18px;font-weight:800;color:var(--white);">🏢 גרין-טק פתרונות בע"מ</div>',
  '<div id="coco-hub-client-name" style="font-size:18px;font-weight:800;color:var(--white);">🏢 גרין-טק פתרונות בע"מ</div>'
);
sourceBody = sourceBody.replace(
  '<div style="font-size:12px;color:var(--white50);margin-top:3px;">ניהול שיווק + ניהול צי • מאז ינואר 2024</div>',
  '<div id="coco-hub-client-sub" style="font-size:12px;color:var(--white50);margin-top:3px;">ניהול שיווק + ניהול צי • מאז ינואר 2024</div>'
);
sourceBody = sourceBody.replace(
  /(<!-- KPI mini strip -->[\s\S]*?<div class="grid grid-4") style="gap:10px;"/,
  '$1 id="coco-live-hub-kpis" style="gap:10px;"'
);

// Hidden mount for live Dalia CRM embed (does not change visible Claude CRM UI)
if (isCompleteV4 && !sourceBody.includes('coco-marketing-crm-mount-screen')) {
  sourceBody = sourceBody.replace(
    /(<div class="screen" id="screen-crm">[\s\S]*?<div class="content">)/,
    '$1<div id="coco-marketing-crm-mount-screen" style="display:none!important" aria-hidden="true"></div>'
  );
}

sourceBody = sourceBody
  .replace(/<!-- 9 מודולים[\s\S]*?-->\s*/g, '')
  .replace(/<!-- עוזרים — מחוץ לשרשרת[\s\S]*?<\/button>\s*<\/div>\s*/g, '');

// Patch goScreen in extracted JS for CRM + root scoping (integration only)
sourceJs = sourceJs.replace(
  /function clearNestedActiveScreens[\s\S]*?function goScreen\(id\) \{[\s\S]*?\n\}/,
  `function clearNestedActiveScreens(root) {
  if (!root) return;
  root.querySelectorAll('.screen .screen.active').forEach(function (s) {
    s.classList.remove('active');
  });
}

function goScreen(id) {
  if (id === 'screen-ai-decisions') id = 'screen-ai-center';
  var root = document.getElementById('coco-claude-root');
  var screens = root ? root.querySelectorAll(':scope > .screen') : document.querySelectorAll('.screen');
  screens.forEach(function (s) { s.classList.remove('active'); });
  var el = null;
  if (root) {
    screens.forEach(function (s) { if (s.id === id) el = s; });
  } else {
    el = document.getElementById(id);
  }
  if (el) { el.classList.add('active'); el.querySelector('.content')?.scrollTo(0, 0); }
  if (id !== 'screen-crm') clearNestedActiveScreens(root);
  if (id === 'screen-crm') document.body.classList.add('coco-crm-active');
  else document.body.classList.remove('coco-crm-active');
  document.querySelectorAll('.bottom-nav .bnav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-screen') === id);
  });
  if (id === 'screen-crm' && window.CocoMarketingCrm && CocoMarketingCrm.ensureVisible) {
    CocoMarketingCrm.ensureVisible();
  }
}`
);
if (!sourceJs.includes('clearNestedActiveScreens')) {
  sourceJs = sourceJs.replace(
    /function goScreen\(id\) \{[\s\S]*?\n\}/,
    `function clearNestedActiveScreens(root) {
  if (!root) return;
  root.querySelectorAll('.screen .screen.active').forEach(function (s) {
    s.classList.remove('active');
  });
}

function goScreen(id) {
  if (id === 'screen-ai-decisions') id = 'screen-ai-center';
  var root = document.getElementById('coco-claude-root');
  var screens = root ? root.querySelectorAll(':scope > .screen') : document.querySelectorAll('.screen');
  screens.forEach(function (s) { s.classList.remove('active'); });
  var el = null;
  if (root) {
    screens.forEach(function (s) { if (s.id === id) el = s; });
  } else {
    el = document.getElementById(id);
  }
  if (el) { el.classList.add('active'); el.querySelector('.content')?.scrollTo(0, 0); }
  if (id !== 'screen-crm') clearNestedActiveScreens(root);
  if (id === 'screen-crm') document.body.classList.add('coco-crm-active');
  else document.body.classList.remove('coco-crm-active');
  document.querySelectorAll('.bottom-nav .bnav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-screen') === id);
  });
  if (id === 'screen-crm' && window.CocoMarketingCrm && CocoMarketingCrm.ensureVisible) {
    CocoMarketingCrm.ensureVisible();
  }
}`
  );
}

// Clean bridge: no visual injections (flow bars, context bar)
const bridgeClean = bridgeSource
  .replace(/wireFlowNav: function \(\) \{[\s\S]*?wireContextListeners/, `wireFlowNav: function () { /* 1:1 Claude UI */ },
    wireContextListeners`)
  .replace(/ensureContextBar\(\);?\s*/g, '')
  .replace(/function ensureContextBar[\s\S]*?function updateContextBar[\s\S]*?}\n\n/, '')
  .replace(/updateContextBar\(\);?\s*/g, '')
  .replace(/onScreenChange: function \(id\) \{[\s\S]*?CocoData\.bindScreen\(id\);\s*\},/, `onScreenChange: function (id) {
      applyContextGlobally();
      if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen(id);
    },`);

// Update FLOW_CHAIN for v4 when present in bridge
const v4Flow = `var FLOW_CHAIN = [
    'screen-hub',
    'screen-status',
    'screen-clients',
    'screen-agents',
    'screen-goals',
    'screen-actions',
    'screen-crm',
    'screen-assets',
    'screen-ai-center',
    'screen-history',
    'screen-reports'
  ];`;

let bridgeOut = bridgeClean;
if (isCompleteV4) {
  bridgeOut = bridgeOut.replace(/var FLOW_CHAIN = \[[\s\S]*?\];/, v4Flow);
  if (!bridgeOut.includes("'screen-ai-center'")) {
    bridgeOut = bridgeOut.replace(
      /'screen-ai-decisions'/g,
      "'screen-ai-center'"
    );
  }
  // GOTO_MAP aliases
  if (!bridgeOut.includes("'screen-ai-center':")) {
    bridgeOut = bridgeOut.replace(
      /'ai-decisions': 'screen-ai-decisions'/,
      "'ai-decisions': 'screen-ai-center',\n    'screen-ai-decisions': 'screen-ai-center'"
    );
    bridgeOut = bridgeOut.replace(
      /'sc-mkt-ai-decisions': 'screen-ai-decisions'/,
      "'sc-mkt-ai-decisions': 'screen-ai-center'"
    );
  }
  const goWrap = `var _goScreen = window.goScreen;
  window.goScreen = function (id) {
    if (id === 'screen-ai-decisions') id = 'screen-ai-center';`;
  if (!bridgeOut.includes("id === 'screen-ai-decisions'")) {
    bridgeOut = bridgeOut.replace(
      /var _goScreen = window\.goScreen;\s*window\.goScreen = function \(id\) \{/,
      goWrap
    );
  }
}

const integrationCssPath = path.join(base, 'coco-claude-integration.css');
const integrationCss = fs.existsSync(integrationCssPath)
  ? fs.readFileSync(integrationCssPath, 'utf8')
  : `/* Orin Car — integration only (no visual overrides) */
#legacy-dalia-root { display: none !important; }
body.coco-boot-active { background: #04091a; }
#coco-claude-root.coco-boot-active {
  display: block !important;
  position: fixed;
  inset: 0;
  z-index: 100000;
  min-height: 100vh;
  background: #04091a;
}
`;

fs.writeFileSync(path.join(base, 'coco-claude-main.css'), sourceCss + '\n', 'utf8');
if (!fs.existsSync(integrationCssPath)) {
  fs.writeFileSync(integrationCssPath, integrationCss, 'utf8');
}
fs.writeFileSync(path.join(base, 'coco-claude-main.js'), sourceJs + '\n', 'utf8');
fs.writeFileSync(path.join(base, 'coco-claude-bridge.js'), bridgeOut, 'utf8');
fs.writeFileSync(path.join(base, 'coco-claude-screens.html'), sourceBody + '\n', 'utf8');

console.log('Built 1:1 Claude UI:', isCompleteV4 ? '(complete v4)' : '(legacy merge)');
console.log('  css:', sourceCss.length);
console.log('  js:', sourceJs.length);
console.log('  screens:', sourceBody.length);
console.log('  bridge:', bridgeOut.length);
