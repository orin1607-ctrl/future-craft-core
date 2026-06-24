/**
 * Verify Staging matches Claude source (1:1 visual baseline)
 */
import { chromium, devices } from 'playwright';

const URL = process.env.QA_URL || 'http://127.0.0.1:8888/ai-marketing-platform.html?v=v3-claude-1to1-2';
const EXPECT_VERSION = 'v3-claude-1to1-2';
const DALIA_URL = process.env.DALIA_URL || '';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(5000);

const state = await page.evaluate(() => {
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const root = document.getElementById('coco-claude-root');
  const hub = document.getElementById('screen-hub');
  const cards = document.querySelectorAll('#screen-hub .hub-card');
  const legacyCss = !!document.querySelector('link[href*="home-v4"]');
  const claudeCss = !!document.querySelector('link[href*="coco-claude-main"]');
  const flowBar = !!document.querySelector('.flow-next-bar');
  const ctxBar = !!document.getElementById('coco-flow-context-bar');
  const card = document.querySelector('#screen-hub .card');
  const cardBg = card ? getComputedStyle(card).backgroundColor : '';
  return {
    ui: document.querySelector('meta[name=ui-version]')?.content,
    bodyBg,
    rootW: root?.offsetWidth || 0,
    hubActive: hub?.classList.contains('active'),
    hubCards: cards.length,
    legacyCss,
    claudeCss,
    flowBar,
    ctxBar,
    cardBg,
    hasGoScreen: typeof window.goScreen === 'function',
    hasCocoClaude: !!window.CocoClaude,
  };
});

const checks = [
  ['ui-version', state.ui === EXPECT_VERSION, state.ui],
  ['no-legacy-css', !state.legacyCss, state.legacyCss],
  ['claude-css', state.claudeCss, state.claudeCss],
  ['dark-body', state.bodyBg === 'rgb(4, 9, 26)' || state.bodyBg === 'rgb(4, 9, 26)', state.bodyBg],
  ['hub-9-cards', state.hubCards === 9, state.hubCards],
  ['no-flow-bar', !state.flowBar, state.flowBar],
  ['no-context-bar', !state.ctxBar, state.ctxBar],
  ['mobile-visible', state.rootW > 300, state.rootW],
  ['no-js-errors', errors.length === 0, errors],
];

console.log(JSON.stringify({ url: URL, daliaUrl: DALIA_URL || null, state, checks, errors }, null, 2));
await ctx.close();

if (process.env.QA_DALIA_IFRAME === '1') {
  const stagingBase = URL.replace(/\/ai-marketing-platform\.html.*$/, '');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const outer = await ctx2.newPage();
  const iframeSrc = stagingBase + '/ai-marketing-platform.html?fullscreen=1&v=' + EXPECT_VERSION;
  await outer.setContent('<!DOCTYPE html><html><body style="margin:0"><iframe id="f" style="width:100%;height:100vh;border:0" src="' + iframeSrc + '"></iframe></body></html>');
  await outer.waitForTimeout(8000);
  const frame = outer.frames().find((f) => f.url().includes('ai-marketing-platform'));
  if (frame) {
    const dalia = await frame.evaluate(() => ({
      ui: document.querySelector('meta[name=ui-version]')?.content,
      hub: !!document.getElementById('screen-hub'),
      rootW: document.getElementById('coco-claude-root')?.offsetWidth || 0,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }));
    console.log(JSON.stringify({ daliaIframe: dalia, iframeSrc, ok: dalia.ui === EXPECT_VERSION && dalia.hub && dalia.rootW > 300 }, null, 2));
    if (!(dalia.ui === EXPECT_VERSION && dalia.hub && dalia.rootW > 300)) process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ daliaIframe: 'frame missing', iframeSrc }, null, 2));
    process.exitCode = 1;
  }
  await ctx2.close();
}

await browser.close();
process.exit(checks.every((c) => c[1]) ? (process.exitCode || 0) : 1);
