const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  await page.goto('https://dalia-car.online/orin-marketing/?v=qa2', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(2500);

  const snap = await page.evaluate(() => {
    const assets = (window.AssetRegistry && AssetRegistry.list()) || window.__PIRSUM_ASSETS || [];
    const before = assets.filter((a) => !a.isMock).length;
    const n = window.AssetRegistry ? AssetRegistry.enableMockFourthAsset(true) : null;
    const after = window.AssetRegistry ? AssetRegistry.list().length : null;
    if (window.AssetRegistry) AssetRegistry.enableMockFourthAsset(false);
    const text = document.body.innerText || '';
    const site = document.getElementById('link-site');
    return {
      labels: assets.map((a) => a.shortLabel || a.label),
      ids: assets.map((a) => a.id),
      count: before,
      mockEnabledCount: n,
      afterMockCount: after,
      hasBrand: /תדמית/.test(text),
      hasApp: /אפליקצ/.test(text),
      hasOld: /האתר הישן|dalia-c\.com/.test(text),
      modeBar: !!(document.getElementById('asset-mode-bar') || document.getElementById('asset-mode')),
      siteHref: site ? site.href : null,
      aiCtx: window.__COCO_AI_CONTEXT
        ? { mode: window.__COCO_AI_CONTEXT.mode, n: (window.__COCO_AI_CONTEXT.assets || []).length }
        : null,
      compareRows: document.querySelectorAll('#compare-body tr').length,
    };
  });

  await page.goto('https://dalia-car.online/orin-marketing/coco-dalia/pirsum-home.html?asset=dalia-brand-site&v=qa3', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(1500);
  const brandLink = await page.evaluate(() => {
    const site = document.getElementById('link-site');
    return site ? site.href : null;
  });

  await page.goto('https://dalia-car.online/orin-marketing/coco-dalia/pirsum-home.html?asset=dalia-car-app&v=qa3', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(1000);
  const appLink = await page.evaluate(() => (document.getElementById('link-site') || {}).href || null);

  await page.goto('https://dalia-car.online/orin-marketing/coco-dalia/pirsum-home.html?asset=dalia-c-com&v=qa3', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForTimeout(1000);
  const oldLink = await page.evaluate(() => (document.getElementById('link-site') || {}).href || null);

  // Also verify redirect keeps query
  const redir = await page.goto('https://dalia-car.online/orin-marketing/?asset=dalia-brand-site&v=qa3', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  const redirUrl = page.url();
  const redirHref = await page.evaluate(() => (document.getElementById('link-site') || {}).href || null);

  await page.goto('https://dalia-car.online/site/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  const siteSnap = await page.evaluate(() => ({
    title: document.title,
    hasGtag: document.documentElement.innerHTML.includes('G-KYDLXY9C39'),
    hasGtm: document.documentElement.innerHTML.includes('GTM-KH38DZ6J'),
  }));

  const out = {
    at: new Date().toISOString(),
    errors,
    snap,
    mySite: { brandLink, appLink, oldLink, redirUrl, redirHref },
    siteSnap,
  };
  const dest = path.join(
    'docs/audit-reports/multi-asset-brand-site',
    'E2E-MULTI-ASSET.json',
  );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
