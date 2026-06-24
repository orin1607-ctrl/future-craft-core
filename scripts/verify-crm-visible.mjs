/**
 * Visual proof — CRM visible on normal marketing manager entry
 */
import { chromium, devices } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../docs/screenshots/crm-visible-proof');
const URL = process.env.VERIFY_URL
  || 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?fullscreen=1&v=v3-unified-3c';

import fs from 'fs';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const viewports = [
  { name: 'desktop', size: { width: 1280, height: 900 } },
  { name: 'mobile', device: devices['iPhone 13'] },
];

const report = [];

for (const vp of viewports) {
  const page = vp.device
    ? await browser.newPage({ ...vp.device })
    : await browser.newPage({ viewport: vp.size });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.body.classList.contains('coco-claude-layout'), { timeout: 30000 });
  await page.waitForTimeout(2000);

  const entry = await page.evaluate(() => ({
    version: document.querySelector('meta[name=ui-version]')?.content,
    hubCard: !!document.getElementById('coco-hub-crm-card'),
    topbarBtn: !!document.querySelector('.coco-topbar-crm-btn'),
    contextBtn: !!document.getElementById('coco-open-crm-btn'),
    bottomNav: !!document.querySelector('.coco-bnav-crm'),
  }));

  await page.screenshot({ path: path.join(OUT, `${vp.name}-01-hub-entry.png`) });

  await page.evaluate(() => {
    if (window.CocoUnified && CocoUnified.openCrm) CocoUnified.openCrm();
  });
  await page.waitForTimeout(2500);

  const opened = await page.evaluate(() => ({
    screenActive: document.getElementById('screen-crm')?.classList.contains('active'),
    crmMounted: !!document.querySelector('#coco-marketing-crm-root .coco-marketing-crm-inner, #coco-marketing-crm-root .screen'),
  }));

  await page.screenshot({ path: path.join(OUT, `${vp.name}-02-crm-screen.png`) });
  report.push({ viewport: vp.name, entry, opened });
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ url: URL, report }, null, 2));
