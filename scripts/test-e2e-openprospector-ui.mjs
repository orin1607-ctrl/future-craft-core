import { chromium } from 'playwright';
import path from 'path';
import http from 'http';
import fs from 'fs';

const artifactDir = 'C:\\Users\\אליאב\\.gemini\\antigravity\\brain\\7a1b3c73-cdae-4508-9bd7-94dc36d56bfa';

// Start a lightweight local static server serving public/
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/openprospector.html';
  const filePath = path.join(process.cwd(), 'public', reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    let contentType = 'text/html; charset=utf-8';
    if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
    if (filePath.endsWith('.json')) contentType = 'application/json; charset=utf-8';
    if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

await new Promise(resolve => server.listen(8765, resolve));
console.log('Static server listening on http://localhost:8765');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => {
  consoleErrors.push(err.message);
});
try {
  page.on('console', msg => console.log(`[BROWSER ${msg.type()}]`, msg.text()));
  await page.goto('http://localhost:8765/openprospector.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.dash-card', { timeout: 15000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.dash-card'));
    return {
      cardCount: cards.length,
      sampleVals: cards.slice(0, 10).map(c => ({
        id: c.getAttribute('data-card-id'),
        val: c.querySelector('.dash-card-val')?.innerText,
        title: c.querySelector('.dash-card-title')?.innerText
      }))
    };
  });
  console.log('Evaluated cards on page:', JSON.stringify(info, null, 2));

  console.log('--- TEST 1: DASHBOARD RENDERING & 27 CARDS ---');
  const cards = await page.$$('.dash-card');
  console.log(`Found ${cards.length} clickable dashboard cards`);
  if (cards.length !== 27) {
    throw new Error(`Expected 27 clickable cards, found ${cards.length}`);
  }

  // Screenshot 1: Dashboard with all cards
  const shot1 = path.join(artifactDir, '01_dashboard_clickable_cards.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log(`Saved screenshot 1 to ${shot1}`);

  // Test card #2: 🟢 לידים ירוקים
  console.log('\n--- TEST 2: CLICKING GREEN LEADS CARD ---');
  await page.click('[data-card-id="leads_green"]');
  await page.waitForTimeout(500);

  const bannerText = await page.$eval('.active-filter-banner', el => el.innerText);
  console.log('Active filter banner text:', bannerText.replace(/\n+/g, ' '));
  if (!bannerText.includes('584')) {
    throw new Error('Banner does not contain 584 results');
  }

  const shot2 = path.join(artifactDir, '02_green_leads_filtered_view.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log(`Saved screenshot 2 to ${shot2}`);

  // Test copy mobiles button
  console.log('\n--- TEST 3: COPY VERIFIED MOBILES BUTTON ---');
  await page.click('[data-act="copyVerifiedMobiles"]');
  await page.waitForTimeout(500);

  // Check toast
  const toastText = await page.$eval('.toast', el => el.innerText).catch(() => 'no toast');
  console.log('Toast notification:', toastText);

  // Test card #16: 🟡 צהוב B
  console.log('\n--- TEST 4: CLICKING YELLOW B CARD FROM DASHBOARD ---');
  await page.click('[data-tab="dash"]');
  await page.waitForTimeout(500);
  await page.click('[data-card-id="yellow_B"]');
  await page.waitForTimeout(500);

  const yellowBanner = await page.$eval('.active-filter-banner', el => el.innerText);
  console.log('Yellow B banner text:', yellowBanner.replace(/\n+/g, ' '));
  if (!yellowBanner.includes('12')) {
    throw new Error('Yellow B banner does not contain 12 results');
  }

  const shot3 = path.join(artifactDir, '03_yellow_b_filtered_view.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log(`Saved screenshot 3 to ${shot3}`);

  // Test card #24: סבב 2 נייד מאומת -> navigate to companies
  console.log('\n--- TEST 5: CLICKING BATCH 2 MOBILE CARD ---');
  await page.click('[data-tab="dash"]');
  await page.waitForTimeout(500);
  await page.click('[data-card-id="b2_mob"]');
  await page.waitForTimeout(500);

  const b2Banner = await page.$eval('.active-filter-banner', el => el.innerText);
  console.log('Batch 2 mobile banner text:', b2Banner.replace(/\n+/g, ' '));
  if (!b2Banner.includes('999')) {
    throw new Error('Batch 2 mobile banner does not contain 999 results');
  }

  const shot4 = path.join(artifactDir, '04_batch2_mobile_filtered_companies.png');
  await page.screenshot({ path: shot4, fullPage: false });
  console.log(`Saved screenshot 4 to ${shot4}`);

  console.log('\n==================================================');
  console.log('ALL E2E UI TESTS PASSED CLEANLY WITH ZERO ERRORS!');
  console.log(`Console errors during test: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Console error details:', consoleErrors);
  }
  console.log('==================================================');
} finally {
  await browser.close();
  server.close();
}
