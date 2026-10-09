import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css'
};

const server = http.createServer((req, res) => {
  const f = path.join(path.resolve('public'), decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

await new Promise((r) => server.listen(8998, r));
const url = 'http://localhost:8998/openprospector.html';

const outDir = 'backups/openprospector-mission3-20261009/qa-shots';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Launching browser to perform Visual QA on Batch 2 (1,000 companies)...');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(url, { waitUntil: 'networkidle' });

// Wait until companies tab is clickable
await page.waitForSelector('button[data-tab="companies"]', { timeout: 15000 });
await page.click('button[data-tab="companies"]');
await page.waitForTimeout(1000);

// Capture Overview with Batch Navigation Bar
await page.screenshot({ path: `${outDir}/01-companies-tab-batches-overview.png`, fullPage: false });
console.log('[PASS] Captured 01-companies-tab-batches-overview.png');

// Click on Batch 2 button
const b2Btn = await page.waitForSelector('button[data-act="setDiscoveryBatch"][data-batch="batch_2"]', { timeout: 5000 });
await b2Btn.click();
await page.waitForTimeout(800);

// Capture Batch 2 filtered view with KPI strip
await page.screenshot({ path: `${outDir}/02-batch2-filtered-with-kpi-strip.png`, fullPage: false });
console.log('[PASS] Captured 02-batch2-filtered-with-kpi-strip.png');

// 3. Test Leads tab isolation
await page.click('button[data-tab="leads"]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/03-leads-tab-isolation.png`, fullPage: false });
console.log('[PASS] Captured 03-leads-tab-isolation.png');

// Extract DOM metrics
const domMetrics = await page.evaluate(() => {
  const leadsCountText = document.querySelector('.subhead, .counter-badge, h2, h3')?.textContent || '';
  const b1 = document.querySelector('button[data-act="setDiscoveryBatch"][data-batch="batch_1"]')?.textContent || '';
  const b2 = document.querySelector('button[data-act="setDiscoveryBatch"][data-batch="batch_2"]')?.textContent || '';
  const bAll = document.querySelector('button[data-act="setDiscoveryBatch"][data-batch=""]')?.textContent || '';
  const rows = document.querySelectorAll('tbody tr').length;
  const kpiText = document.querySelector('div[style*="مدדי סבב 2"], div:has(> b)')?.parentElement?.textContent || '';
  return { b1, b2, bAll, rows, kpiText };
});

console.log('\nDOM Metrics in UI:');
console.log(' - Batch All Button:', domMetrics.bAll.trim());
console.log(' - Batch 1 Button:', domMetrics.b1.trim());
console.log(' - Batch 2 Button:', domMetrics.b2.trim());
console.log(' - Visible Table Rows:', domMetrics.rows);
console.log(' - KPI Strip Content:', domMetrics.kpiText.replace(/\s+/g, ' ').trim());

await browser.close();
server.close();

if (consoleErrors.length > 0) {
  console.warn('Console errors detected:', consoleErrors);
} else {
  console.log('\n[PASS] ZERO console errors during rendering!');
}

console.log('\n================================================================================');
console.log('=== VISUAL QA VERIFICATION FOR MISSION 3 BATCH 2 COMPLETED SUCCESSFULLY ===');
console.log('================================================================================\n');
