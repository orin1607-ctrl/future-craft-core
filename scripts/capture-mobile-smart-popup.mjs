/**
 * Mobile Playwright: select סוג נכס → assert category-only popup + screenshots.
 */
import { chromium, devices } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DAILY = join(ROOT, 'public', 'coco-reports', 'dalia-c-official', 'daily');
const localHtml = join(DAILY, 'latest.html');
const liveUrl = 'https://orin1607-ctrl.github.io/future-craft-core/coco-reports/dalia-c-official/daily/latest.html';

const SITE_CATS = ['מצב בגוגל', 'מילות מפתח', 'אינדוקס', 'תוכן', 'GSC', 'GA', 'Google Business', 'בריאות המערכת', 'המלצות'];
const ADS_CATS = ['מצב הקמפיינים', 'לידים ממודעות', 'השקעה מול תוצאה', 'מילות מפתח במודעות', 'המלצות לשיפור'];
const SITE_ONLY_MARKERS = ['אינדוקס', 'מצב בגוגל', 'בריאות המערכת'];

async function runAgainst(page, label) {
  const result = { label, checks: [] };
  const ok = (name, pass, detail) => result.checks.push({ name, pass: !!pass, detail: detail || '' });

  await page.goto(page._gotoTarget, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#fAssetType', { timeout: 15000 });

  const viewport = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute('content') : '';
  });
  ok('viewport', /width=device-width/.test(viewport || ''), viewport);

  // Site path
  await page.selectOption('#fAssetType', 'site-main');
  await page.waitForSelector('#assetModal.on', { timeout: 5000 });
  const sitePanel = await page.evaluate(() => {
    const modal = document.getElementById('assetModal');
    const panel = document.getElementById('catsPanel');
    const labels = Array.from(panel?.querySelectorAll('label') || []).map((l) => l.textContent.trim());
    const focus = panel?.getAttribute('data-focus-asset') || '';
    const rect = modal?.getBoundingClientRect();
    return {
      on: modal?.classList.contains('on'),
      focus,
      labels,
      visible: !!(rect && rect.width > 200 && rect.height > 100),
      title: document.getElementById('assetModalTitle')?.textContent || '',
    };
  });
  ok('site modal open', sitePanel.on && sitePanel.visible, JSON.stringify(sitePanel));
  ok('site focus', sitePanel.focus === 'site-main', sitePanel.focus);
  ok('site has keyword cats', SITE_ONLY_MARKERS.every((t) => sitePanel.labels.some((l) => l.includes(t))), sitePanel.labels.join('|'));
  ok('site no ads-only lead cat', !sitePanel.labels.some((l) => l.includes('לידים ממודעות')), sitePanel.labels.join('|'));
  await page.screenshot({ path: join(DAILY, 'mobile-smart-popup-site.png'), fullPage: false });

  await page.click('#modalOk');
  await page.waitForSelector('#assetModal.on', { state: 'detached', timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById('assetModal')?.classList.contains('on'), { timeout: 3000 });

  // Ads path
  await page.selectOption('#fAssetType', 'google-ads');
  await page.waitForSelector('#assetModal.on', { timeout: 5000 });
  const adsPanel = await page.evaluate(() => {
    const panel = document.getElementById('catsPanel');
    const labels = Array.from(panel?.querySelectorAll('label') || []).map((l) => l.textContent.trim());
    return {
      on: document.getElementById('assetModal')?.classList.contains('on'),
      focus: panel?.getAttribute('data-focus-asset') || '',
      labels,
      title: document.getElementById('assetModalTitle')?.textContent || '',
      extraAssets: !!document.getElementById('assetList'),
    };
  });
  ok('ads modal open', adsPanel.on, adsPanel.title);
  ok('ads focus', adsPanel.focus === 'google-ads', adsPanel.focus);
  ok('ads has ads cats', ADS_CATS.every((t) => adsPanel.labels.some((l) => l.includes(t))), adsPanel.labels.join('|'));
  ok('ads no site keyword section', !SITE_ONLY_MARKERS.some((t) => adsPanel.labels.some((l) => l === t || l.includes('אינדוקס') || l.includes('מצב בגוגל') || l.includes('בריאות המערכת'))), adsPanel.labels.join('|'));
  ok('multi asset UI ready', adsPanel.extraAssets, 'assetList');
  await page.screenshot({ path: join(DAILY, 'mobile-smart-popup-ads.png'), fullPage: false });

  result.siteLabels = sitePanel.labels;
  result.adsLabels = adsPanel.labels;
  result.ok = result.checks.every((c) => c.pass);
  return result;
}

async function main() {
  const useLive = process.argv.includes('--live');
  const target = useLive ? liveUrl : pathToFileURL(localHtml).href;
  if (!useLive && !existsSync(localHtml)) {
    console.error('missing latest.html');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'he-IL',
  });
  const page = await context.newPage();
  page._gotoTarget = target;

  const result = await runAgainst(page, useLive ? 'live' : 'local');
  await browser.close();

  const out = {
    at: new Date().toISOString(),
    target,
    screenshots: {
      site: 'public/coco-reports/dalia-c-official/daily/mobile-smart-popup-site.png',
      ads: 'public/coco-reports/dalia-c-official/daily/mobile-smart-popup-ads.png',
    },
    ...result,
  };
  writeFileSync(join(DAILY, 'mobile-smart-popup-verify.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
