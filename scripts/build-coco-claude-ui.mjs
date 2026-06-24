/**
 * Build 1:1 Claude UI assets from claude-source.html
 * - CSS/JS: exact extract from source
 * - Screens: source body + 3 approved modules (history, ai-decisions, reports)
 * - Hub: original 6 cards + 3 new cards in same hub-card style
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, '../public/ai-marketing');
const src = fs.readFileSync(path.join(base, 'claude-source.html'), 'utf8');
const currentScreens = fs.readFileSync(path.join(base, 'coco-claude-screens.html'), 'utf8');
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
const sourceJs = scriptMatch[1].trim();
let sourceBody = bodyMatch[1].trim();

// Extract Phase-B screens from current build (already Claude-styled)
function extractScreen(html, id) {
  const re = new RegExp(`<!-- =+ SCREEN: [^=]+ =+ -->\\s*<div class="screen" id="${id}"[\\s\\S]*?</div>\\s*(?=<!-- =+ SCREEN:|<!-- =+ MODALS)`, 'm');
  const m = html.match(re);
  if (!m) {
    const re2 = new RegExp(`<div class="screen" id="${id}"[\\s\\S]*?</div>\\s*(?=<div class="screen" id="|<div class="screen" id="screen-reports"|<!-- =+ MODALS)`, 'm');
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

// Hub cards to insert (Claude hub-card pattern)
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

// Insert 3 modules after actions card; keep assets after history per flow
sourceBody = sourceBody.replace(
  /(<div class="hub-card" onclick="goScreen\('screen-actions'\)">[\s\S]*?<\/div>\s*)\s*<div class="hub-card" onclick="goScreen\('screen-assets'\)">[\s\S]*?<\/div>/,
  `$1${newHubCards}`
);

// Insert extra screens before modals section
const modalsIdx = sourceBody.indexOf('<!-- ============================= MODALS');
if (modalsIdx < 0) {
  console.error('MODALS marker not found');
  process.exit(1);
}
sourceBody = sourceBody.slice(0, modalsIdx) + extraHtml.join('\n\n') + '\n\n' + sourceBody.slice(modalsIdx);

// Re-add data-hook ids (no visual change — logic only)
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

// Strip integration-only comment blocks
sourceBody = sourceBody
  .replace(/<!-- 9 מודולים[\s\S]*?-->\s*/g, '')
  .replace(/<!-- עוזרים — מחוץ לשרשרת[\s\S]*?<\/button>\s*<\/div>\s*/g, '');

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

const integrationCss = `/* Orin Car — integration only (no visual overrides) */
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
fs.writeFileSync(path.join(base, 'coco-claude-integration.css'), integrationCss, 'utf8');
fs.writeFileSync(path.join(base, 'coco-claude-main.js'), sourceJs + '\n', 'utf8');
fs.writeFileSync(path.join(base, 'coco-claude-bridge.js'), bridgeClean, 'utf8');
fs.writeFileSync(path.join(base, 'coco-claude-screens.html'), sourceBody + '\n', 'utf8');

console.log('Built 1:1 Claude UI:');
console.log('  css:', sourceCss.length);
console.log('  js:', sourceJs.length);
console.log('  screens:', sourceBody.length);
console.log('  bridge:', bridgeClean.length);
