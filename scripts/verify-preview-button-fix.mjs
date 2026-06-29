/**
 * Verify preview button opens visible modal (desktop + iPhone 13).
 * Checks computed display, not just inline style.
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { extname } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'audit-reports', 'preview-button-fix');
const VER = process.env.PREVIEW_VER || 'v3-live-demo-3';
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/ai-marketing-platform.html';
      const file = join(ROOT, 'public', p.replace(/^\//, ''));
      try {
        const data = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runProbe(label, contextOpts, baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(contextOpts);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const url = `${baseUrl}/ai-marketing-platform.html?v=${VER}&page=page-07`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => typeof goScreen === 'function', { timeout: 90000 });
  await page.evaluate(() => {
    document.querySelector('.bnav-btn:nth-child(3)')?.click();
  });
  await page.waitForFunction(
    () => document.getElementById('coco-live-actions-pending')?.getAttribute('data-coco-act-ready') === 'true',
    { timeout: 90000 }
  );
  await page.waitForTimeout(1500);

  const wired = await page.evaluate(() => ({
    handlerBound: !!document.getElementById('coco-live-actions-pending')?._actWorkbenchBound,
    btn: !!document.querySelector('[data-act-lite-preview="page-07"]'),
    liveOnly: document.body.classList.contains('dalia-live-only'),
  }));

  await page.click('[data-act-lite-preview="page-07"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  const modal = await page.evaluate(() => {
    const m = document.getElementById('coco-act-lite-preview-modal');
    const cs = m ? getComputedStyle(m) : null;
    const r = m?.getBoundingClientRect();
    const tabs = Array.from(document.querySelectorAll('[data-lite-preview-mode]')).map((b) => b.textContent.trim());
    return {
      exists: !!m,
      parent: m?.parentElement?.id || m?.parentElement?.tagName,
      inlineDisplay: m?.style.display,
      computedDisplay: cs?.display,
      zIndex: cs?.zIndex,
      visible: cs?.display !== 'none' && !!(r && r.width > 0 && r.height > 0),
      rect: r ? { w: r.width, h: r.height } : null,
      tabs,
    };
  });

  await browser.close();
  return { label, url, wired, modal, errors };
}

const server = await startStaticServer();
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const desktop = await runProbe('desktop', { viewport: { width: 1400, height: 900 } }, baseUrl);
const mobile = await runProbe('iphone13', { ...devices['iPhone 13'] }, baseUrl);
server.close();

const report = {
  at: new Date().toISOString(),
  ver: VER,
  localUrl: `${baseUrl}/ai-marketing-platform.html?v=${VER}&page=page-07`,
  stagingUrl: `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&page=page-07`,
  investigation: {
    onclickWired: 'yes — root click delegation on [data-act-lite-preview]',
    modalOpens: 'was broken — inline flex set but CSS display:none !important on screen-actions child',
    jsErrors: 'none observed',
    desktopOnly: 'no — same CSS rule on mobile and desktop',
    cssZIndex: 'z-index 500 ok once modal mounted on body',
    buttonModalConnection: 'openLitePreview wired; modal parent was #screen-actions (hidden by dalia-live-only rule)',
  },
  fix: 'Mount preview overlay on document.body; deep-link auto goScreen(screen-actions)',
  desktop,
  mobile,
  ok: desktop.modal.visible && mobile.modal.visible &&
    desktop.modal.tabs.length >= 3 && mobile.modal.tabs.length >= 3,
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('OK:', report.ok);
process.exit(report.ok ? 0 : 1);
