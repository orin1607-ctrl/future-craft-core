/**
 * V4.2 Mobile QA — iPhone + Android screenshots & checks
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';
const pageUrl = `${STAGING}/ai-marketing-platform`;
const OUT = path.join(__dirname, '../docs/screenshots/v4-mobile-qa');
mkdirSync(OUT, { recursive: true });

const V4_CATEGORIES = ['status', 'goals', 'assets', 'assistants', 'actions', 'history', 'decisions', 'reports'];

const report = { url: pageUrl, at: new Date().toISOString(), devices: [], shots: [], ok: true };

async function checkDevice(browser, label, deviceDescriptor) {
  const dev = { label, passed: [], failed: [], shots: [] };
  const ctx = await browser.newContext({
    ...deviceDescriptor,
    locale: 'he-IL',
    colorScheme: 'light',
  });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|404/.test(msg.text())) {
      dev.failed.push(`console: ${msg.text()}`);
    }
  });

  await page.goto(pageUrl + '?v=4.2', { waitUntil: 'networkidle', timeout: 90000 });

  async function shot(name) {
    const file = `${label}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    dev.shots.push(file);
    report.shots.push(file);
  }

  async function noOverflow(ctxLabel) {
    const o = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
      body: document.body.scrollWidth,
    }));
    if (o.doc <= o.win + 2 && o.body <= o.win + 2) {
      dev.passed.push(`${ctxLabel}:no-horizontal-scroll`);
    } else {
      dev.failed.push(`${ctxLabel}:overflow doc=${o.doc} body=${o.body} win=${o.win}`);
    }
  }

  const v4 = await page.evaluate(() => document.body.classList.contains('v4-mode'));
  v4 ? dev.passed.push('v4-mode') : dev.failed.push('v4-mode');

  await shot('01-home-top');
  await noOverflow('home');

  const dashCols = await page.evaluate(() => {
    const g = document.getElementById('v4DashGrid');
    if (!g) return 0;
    return getComputedStyle(g).gridTemplateColumns.split(' ').length;
  });
  dashCols === 1 ? dev.passed.push('dash-single-column') : dev.failed.push(`dash-cols-${dashCols}`);

  const catBtn = await page.evaluate(() => {
    const b = document.querySelector('#v4CategoryGrid .v4-world-btn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  if (catBtn && catBtn.h >= 72 && catBtn.w >= 300) dev.passed.push('cat-btn-size');
  else dev.failed.push(`cat-btn-${JSON.stringify(catBtn)}`);

  await page.evaluate(() => window.scrollTo(0, document.getElementById('v4DashGrid')?.offsetTop || 400));
  await page.waitForTimeout(300);
  await shot('02-dashboard');

  await page.evaluate(() => window.scrollTo(0, document.getElementById('v4CategoryGrid')?.offsetTop || 800));
  await page.waitForTimeout(300);
  await shot('03-categories');

  await page.evaluate(() => document.getElementById('v4Chat')?.scrollIntoView({ block: 'center' }) || window.gotoSc('aichat'));
  await page.waitForTimeout(300);
  await shot('04-chat');

  await page.evaluate(() => window.gotoSc('aichat'));
  await page.waitForTimeout(200);
  await page.fill('#v4ChatInput', 'בדיקת מובייל');
  await page.click('#v4ChatSend');
  await page.waitForTimeout(400);
  const msgs = await page.locator('#v4ChatMsgs .v4-msg').count();
  msgs >= 2 ? dev.passed.push('chat-send') : dev.failed.push('chat-send');

  const sendH = await page.evaluate(() => document.getElementById('v4ChatSend')?.getBoundingClientRect().height);
  sendH >= 48 ? dev.passed.push('chat-send-height') : dev.failed.push(`chat-send-h-${sendH}`);

  for (const catId of V4_CATEGORIES) {
    await page.evaluate((id) => window.HomeV4?.openCategory(id), catId);
    await page.waitForTimeout(250);
    const open = await page.evaluate(() => document.getElementById('sc-category')?.classList.contains('active'));
    const items = await page.locator('#v4CategoryItems .v4-world-btn').count();
    if (open && items > 0) dev.passed.push(`cat-open-${catId}`);
    else dev.failed.push(`cat-open-${catId}`);
    await noOverflow(`cat-${catId}`);
    await page.evaluate(() => window.gotoSc('morning'));
  }

  await page.evaluate(() => window.gotoSc('seo'));
  await page.waitForTimeout(200);
  const backBtn = page.locator('#sc-seo .v4-module-bar .v4-go-home');
  const backVis = await backBtn.isVisible();
  backVis ? dev.passed.push('module-back-visible') : dev.failed.push('module-back-visible');
  const backBox = await backBtn.boundingBox();
  if (backBox && backBox.height >= 48) dev.passed.push('module-back-height');
  else dev.failed.push(`module-back-h-${backBox?.height}`);
  await shot('05-module-seo');
  await noOverflow('module-seo');

  await backBtn.click();
  await page.waitForTimeout(200);
  const homeAgain = await page.evaluate(() => document.getElementById('sc-morning')?.classList.contains('active'));
  homeAgain ? dev.passed.push('back-to-home') : dev.failed.push('back-to-home');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot('06-home-bottom');

  dev.ok = dev.failed.length === 0;
  if (!dev.ok) report.ok = false;
  report.devices.push(dev);
  await ctx.close();
}

const browser = await chromium.launch();
await checkDevice(browser, 'iphone', devices['iPhone 13']);
await checkDevice(browser, 'android', devices['Pixel 5']);
await browser.close();

writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  devices: report.devices.map((d) => ({ label: d.label, passed: d.passed.length, failed: d.failed.length, failures: d.failed })),
  shots: report.shots,
}, null, 2));

process.exit(report.ok ? 0 : 1);
