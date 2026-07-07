/**
 * Smoke verify Hub Lite on Orin Staging (GitHub Pages)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const URL = `${BASE}/ai-marketing-platform.html?v=hub-lite-verify&t=${Date.now()}`;
const OUT = join(__dirname, '../docs/audit-reports/hub-lite-staging');

mkdirSync(OUT, { recursive: true });

const report = {
  url: URL,
  at: new Date().toISOString(),
  checks: [],
  consoleErrors: [],
  scriptCount: 0,
  legacyScriptsLoaded: [],
  timingMs: {},
};

function check(name, ok, detail) {
  report.checks.push({ name, ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ': ' + detail : ''));
}

const t0 = Date.now();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') report.consoleErrors.push(msg.text());
});

const navStart = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
report.timingMs.domContentLoaded = Date.now() - navStart;

await page.waitForFunction(() => {
  return document.body.classList.contains('coco-hub-lite') ||
    (window.CocoHubLite && window.CocoHubLite.isActive && window.CocoHubLite.isActive());
}, { timeout: 60000 }).catch(() => {});

await page.waitForFunction(() => document.getElementById('screen-hub') && !document.body.classList.contains('coco-boot-active'), { timeout: 90000 }).catch(() => {});

report.timingMs.ready = Date.now() - t0;

const state = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
  const legacy = [
    'actions-workbench.js',
    'multi-ai-orchestrator.js',
    'ai-control-center.js',
    'business-strategy-wizard.js',
    'website-builder-module.js',
    'marketing-lifecycle-module.js',
  ];
  return {
    liteClass: document.body.classList.contains('coco-hub-lite'),
    cocoHubLite: !!(window.CocoHubLite && window.CocoHubLite.isActive && window.CocoHubLite.isActive()),
    gfcHidden: (() => {
      const c = document.getElementById('coco-gfc-chrome');
      return !c || c.classList.contains('coco-gfc-hidden') || getComputedStyle(c).display === 'none';
    })(),
    pirsumVisible: !!document.querySelector('#screen-hub .hub-card-pirsum'),
    legacyHubCardsVisible: Array.from(document.querySelectorAll('#screen-hub .hub-grid .hub-card')).filter(function (el) {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    }).length,
    hiddenHubBlocks: document.querySelectorAll('#screen-hub .coco-lite-hide').length,
    screenCount: document.querySelectorAll('#coco-claude-root > .screen').length,
    screenIds: Array.from(document.querySelectorAll('#coco-claude-root > .screen')).map((s) => s.id),
    daliaSite: !!(window.DaliaSite && window.DaliaSite.SITE && window.DaliaSite.SITE.clientId),
    clientId: window.DaliaSite && window.DaliaSite.SITE ? window.DaliaSite.SITE.clientId : null,
    scripts,
    legacyLoaded: legacy.filter((n) => scripts.some((s) => s.includes(n))),
    hasGoScreen: typeof window.goScreen === 'function',
    hasPirsumHub: !!(window.CocoPirsumHub && window.CocoPirsumHub.open),
  };
});

report.scriptCount = state.scripts.length;
report.legacyScriptsLoaded = state.legacyLoaded;

check('Lite mode active', state.liteClass, `class=${state.liteClass}`);
check('Global filter chrome hidden', state.gfcHidden);
check('Only פרסום hub card visible in grid', state.pirsumVisible && state.legacyHubCardsVisible === 0, `visibleLegacy=${state.legacyHubCardsVisible}`);
check('Legacy hub blocks hidden', state.hiddenHubBlocks >= 3, `hidden=${state.hiddenHubBlocks}`);
check('Only hub+pirsum screens in DOM', state.screenCount === 2 && state.screenIds.join(',') === 'screen-hub,screen-pirsum', state.screenIds.join(','));
check('Dalia client auto-connect', state.daliaSite && state.clientId === 'dalia-c-official', state.clientId || 'missing');
check('No legacy module scripts loaded', state.legacyLoaded.length === 0, state.legacyLoaded.join(', ') || 'none');
check('goScreen available', state.hasGoScreen);
check('CocoPirsumHub available', state.hasPirsumHub);
check('No console errors', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 3).join(' | '));

// Open פרסום (or wait for auto-open in Lite)
await page.waitForTimeout(2000);
const onPirsum = await page.evaluate(() => document.getElementById('screen-pirsum')?.classList.contains('active'));
if (!onPirsum) await page.click('#screen-hub .hub-card-pirsum');
await page.waitForSelector('#screen-pirsum.active', { timeout: 30000 });
const pirsumActive = await page.evaluate(() => document.getElementById('screen-pirsum')?.classList.contains('active'));
check('פרסום screen opens', pirsumActive);
await page.click('#pirsum-tab-work');
await page.waitForTimeout(3000);
const workFrame = await page.evaluate(() => {
  const f = document.getElementById('pirsum-frame-work');
  return { src: f?.src || '', loaded: !!(f?.src && f.src !== 'about:blank') };
});
check('מרכז העבודה iframe loads', workFrame.loaded, workFrame.src.slice(0, 80));

// Control center tab
await page.click('#pirsum-tab-control');
await page.waitForTimeout(5000);
const ctrlFrame = await page.evaluate(() => {
  const f = document.getElementById('pirsum-frame-control');
  return { src: f?.src || '', loaded: !!(f?.src && f.src !== 'about:blank') };
});
check('מרכז השליטה iframe loads', ctrlFrame.loaded, ctrlFrame.src.slice(0, 80));

await page.screenshot({ path: join(OUT, 'hub-lite-pirsum.png'), fullPage: false, timeout: 10000 }).catch(() => {});
report.timingMs.total = Date.now() - t0;
report.passed = report.checks.every((c) => c.ok);

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();

console.log('\nTiming:', report.timingMs);
console.log('Report:', join(OUT, 'report.json'));
process.exit(report.passed ? 0 : 1);
