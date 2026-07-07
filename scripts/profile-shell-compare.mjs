import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../docs/audit-reports/staging-performance-profile');
mkdirSync(OUT, { recursive: true });

const modes = [
  { label: 'lite', url: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?hub=lite' },
  { label: 'full', url: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?hub=full' },
];

const browser = await chromium.launch({ headless: true });
const results = {};

for (const mode of modes) {
  const page = await browser.newPage();
  const t0 = Date.now();
  const reqs = [];
  page.on('request', (r) => reqs.push({ type: r.resourceType(), url: r.url() }));
  await page.goto(mode.url + '&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('screen-hub') && !document.body.classList.contains('coco-boot-active'), { timeout: 120000 }).catch(() => {});
  const bootMs = Date.now() - t0;
  const m = await page.evaluate(() => ({
    heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    dom: document.getElementsByTagName('*').length,
    scripts: document.querySelectorAll('script[src]').length,
    styles: document.querySelectorAll('link[rel="stylesheet"]').length,
    screens: Array.from(document.querySelectorAll('#coco-claude-root > .screen')).map((s) => s.id),
    lite: document.body.classList.contains('coco-hub-lite'),
  }));
  results[mode.label] = {
    bootMs,
    metrics: m,
    scriptRequests: reqs.filter((r) => r.type === 'script').length,
    cssRequests: reqs.filter((r) => r.type === 'stylesheet').length,
    totalRequests: reqs.length,
  };
  await page.close();
}

writeFileSync(join(OUT, 'shell-compare.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
