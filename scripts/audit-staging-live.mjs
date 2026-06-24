import { chromium, devices } from 'playwright';

const SCENARIOS = [
  { name: 'direct-html', url: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-claude-full-5' },
  { name: 'direct-no-ext', url: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform?fullscreen=1' },
  { name: 'dalia-route', url: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing?fullscreen=1' },
  { name: 'root-spa', url: 'https://orin1607-ctrl.github.io/future-craft-core/' },
];

const browser = await chromium.launch();
for (const sc of SCENARIOS) {
  for (const vp of ['desktop', 'mobile']) {
    const ctx = await browser.newContext(vp === 'mobile' ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const failed = [];
    const consoleErr = [];
    page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText }));
    page.on('response', async (r) => {
      if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
    });
    page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); });
    page.on('pageerror', (e) => consoleErr.push('PAGE: ' + e.message));
    try {
      await page.goto(sc.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(6000);
      const state = await page.evaluate(() => ({
        commit: document.querySelector('meta[name=build-commit]')?.content,
        ui: document.querySelector('meta[name=ui-version]')?.content,
        layout: document.body.classList.contains('coco-claude-layout'),
        hub: !!document.getElementById('screen-hub'),
        rootW: document.getElementById('coco-claude-root')?.offsetWidth || 0,
        bootErr: (document.getElementById('coco-claude-root')?.textContent || '').includes('לא ניתן'),
        pathname: location.pathname,
      }));
      console.log(JSON.stringify({ scenario: sc.name, vp, state, failed: failed.slice(0, 15), consoleErr: consoleErr.slice(0, 10) }));
    } catch (e) {
      console.log(JSON.stringify({ scenario: sc.name, vp, error: e.message, failed: failed.slice(0, 15) }));
    }
    await ctx.close();
  }
}

// iframe like Dalia
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const outer = await ctx.newPage();
await outer.goto('about:blank');
await outer.setContent('<!DOCTYPE html><html><body style="margin:0"><iframe style="width:100%;height:100vh;border:0" src="https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform?fullscreen=1"></iframe></body></html>');
await outer.waitForTimeout(8000);
const frame = outer.frames().find((f) => f.url().includes('ai-marketing-platform'));
if (frame) {
  const state = await frame.evaluate(() => ({
    layout: document.body.classList.contains('coco-claude-layout'),
    hub: !!document.getElementById('screen-hub'),
    rootW: document.getElementById('coco-claude-root')?.offsetWidth || 0,
    bootErr: (document.getElementById('coco-claude-root')?.textContent || '').includes('לא ניתן'),
  }));
  console.log(JSON.stringify({ scenario: 'iframe-fullscreen-mobile', state }));
}
await browser.close();
