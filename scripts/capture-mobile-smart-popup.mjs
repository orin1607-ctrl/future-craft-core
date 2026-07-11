/**
 * Mobile Playwright: small «בחירה…» button → checkbox multi-select popup + category filter.
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

const SITE_ONLY_MARKERS = ['אינדוקס', 'מצב בגוגל', 'בריאות המערכת'];
const ADS_CATS = ['מצב הקמפיינים', 'לידים ממודעות', 'השקעה מול תוצאה', 'מילות מפתח במודעות', 'המלצות לשיפור'];

async function runAgainst(page, label) {
  const result = { label, checks: [] };
  const ok = (name, pass, detail) => result.checks.push({ name, pass: !!pass, detail: detail || '' });

  await page.goto(page._gotoTarget, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#btnAssets', { timeout: 15000 });

  const viewport = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute('content') : '';
  });
  ok('viewport', /width=device-width/.test(viewport || ''), viewport);

  const bar = await page.evaluate(() => {
    const btn = document.getElementById('btnAssets');
    const select = document.getElementById('fAssetType');
    const radios = document.querySelectorAll('input[type=radio]');
    const rect = btn?.getBoundingClientRect();
    return {
      hasSelect: !!select,
      radioCount: radios.length,
      btnText: (btn?.textContent || '').trim(),
      btnWidth: rect ? Math.round(rect.width) : 0,
      viewportWidth: window.innerWidth,
    };
  });
  ok('no fAssetType select', !bar.hasSelect, JSON.stringify(bar));
  ok('no radios in page', bar.radioCount === 0, String(bar.radioCount));
  ok('small button text', /בחירה/.test(bar.btnText), bar.btnText);
  ok('button not full-width', bar.btnWidth > 0 && bar.btnWidth < bar.viewportWidth * 0.55, `${bar.btnWidth}/${bar.viewportWidth}`);

  await page.click('#btnAssets');
  await page.waitForSelector('#assetModal.on', { timeout: 5000 });

  const sitePanel = await page.evaluate(() => {
    const modal = document.getElementById('assetModal');
    const panel = document.getElementById('catsPanel');
    const assetBoxes = Array.from(document.querySelectorAll('input[name=asset]'));
    const labels = Array.from(panel?.querySelectorAll('label') || []).map((l) => l.textContent.trim());
    const catBoxes = Array.from(panel?.querySelectorAll('input[type=checkbox]') || []);
    const rect = modal?.getBoundingClientRect();
    return {
      on: modal?.classList.contains('on'),
      focus: panel?.getAttribute('data-focus-asset') || '',
      labels,
      assetCheckboxCount: assetBoxes.length,
      assetAllCheckbox: assetBoxes.every((i) => i.type === 'checkbox'),
      catAllCheckbox: catBoxes.every((i) => i.type === 'checkbox') && catBoxes.length > 0,
      visible: !!(rect && rect.width > 200 && rect.height > 100),
      title: document.getElementById('assetModalTitle')?.textContent || '',
    };
  });
  ok('site modal open', sitePanel.on && sitePanel.visible, JSON.stringify(sitePanel));
  ok('site focus', sitePanel.focus === 'site-main', sitePanel.focus);
  ok('multi asset checkboxes', sitePanel.assetCheckboxCount >= 3 && sitePanel.assetAllCheckbox, String(sitePanel.assetCheckboxCount));
  ok('category checkboxes', sitePanel.catAllCheckbox, sitePanel.labels.join('|'));
  ok('site has keyword cats', SITE_ONLY_MARKERS.every((t) => sitePanel.labels.some((l) => l.includes(t))), sitePanel.labels.join('|'));
  ok('site no ads-only lead cat', !sitePanel.labels.some((l) => l.includes('לידים ממודעות')), sitePanel.labels.join('|'));
  await page.screenshot({ path: join(DAILY, 'mobile-smart-popup-site.png'), fullPage: false });

  // Multi-asset: check Ads, switch focus, assert ads-only cats
  await page.check('input[name=asset][value="google-ads"]');
  await page.waitForFunction(() => {
    const panel = document.getElementById('catsPanel');
    return panel?.getAttribute('data-focus-asset') === 'google-ads';
  }, { timeout: 3000 });

  const adsPanel = await page.evaluate(() => {
    const panel = document.getElementById('catsPanel');
    const labels = Array.from(panel?.querySelectorAll('label') || []).map((l) => l.textContent.trim());
    const tabs = Array.from(document.querySelectorAll('#assetTabs button')).map((b) => b.textContent.trim());
    return {
      on: document.getElementById('assetModal')?.classList.contains('on'),
      focus: panel?.getAttribute('data-focus-asset') || '',
      labels,
      tabs,
      checkedAssets: Array.from(document.querySelectorAll('input[name=asset]:checked')).map((i) => i.value),
    };
  });
  ok('ads focus after check', adsPanel.focus === 'google-ads', adsPanel.focus);
  ok('multi assets checked', adsPanel.checkedAssets.includes('site-main') && adsPanel.checkedAssets.includes('google-ads'), adsPanel.checkedAssets.join(','));
  ok('tabs for multi', adsPanel.tabs.length >= 2, adsPanel.tabs.join('|'));
  ok('ads has ads cats', ADS_CATS.every((t) => adsPanel.labels.some((l) => l.includes(t))), adsPanel.labels.join('|'));
  ok('ads no site-only cats', !SITE_ONLY_MARKERS.some((t) => adsPanel.labels.some((l) => l.includes(t))), adsPanel.labels.join('|'));
  await page.screenshot({ path: join(DAILY, 'mobile-smart-popup-ads.png'), fullPage: false });

  // Uncheck one category and apply
  await page.uncheck('#catsPanel input[data-cat-id="ads-leads"]');
  await page.click('#modalOk');
  await page.waitForFunction(() => !document.getElementById('assetModal')?.classList.contains('on'), { timeout: 3000 });

  const after = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-asset-section]'))
      .filter((el) => el.style.display !== 'none')
      .map((el) => el.getAttribute('data-asset-section'));
    const hiddenLead = document.querySelector('.cat-block[data-asset-cat="google-ads"][data-cat="ads-leads"]');
    const compare = document.getElementById('compareBlock');
    return {
      sections,
      leadHidden: !hiddenLead || hiddenLead.style.display === 'none',
      compareVisible: compare && compare.style.display !== 'none',
    };
  });
  ok('both assets shown after OK', after.sections.includes('site-main') && after.sections.includes('google-ads'), after.sections.join(','));
  ok('unchecked category hidden', after.leadHidden, JSON.stringify(after));
  ok('compare when multi', after.compareVisible, JSON.stringify(after));

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
