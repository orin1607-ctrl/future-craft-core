/**
 * Verify Staging matches Claude source (1:1 visual baseline)
 */
import { chromium, devices } from 'playwright';

const URL = process.env.QA_URL || 'http://127.0.0.1:8888/coco-marketing-platform.html?v=v3-claude-1to1-1';
const EXPECT_VERSION = 'v3-claude-1to1-1';

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

console.log(JSON.stringify({ url: URL, state, checks, errors }, null, 2));
await browser.close();
process.exit(checks.every((c) => c[1]) ? 0 : 1);
