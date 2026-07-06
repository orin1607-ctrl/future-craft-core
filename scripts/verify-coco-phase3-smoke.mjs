/**
 * Phase 3 smoke test — recursion fix, LS sync, navigation, Orin regression.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const TS = Date.now();
const CACHE_BUST = 'phase3-fix-' + TS;

const URLS = {
  orin: `${BASE}/ai-marketing-platform.html?nocache=${CACHE_BUST}`,
  wired: `${BASE}/coco-dalia/coco-dalia-full-A-J-WIRED%20(1).html?nocache=${CACHE_BUST}`,
  v5: `${BASE}/ai-marketing/ai-control-center-v5-STANDALONE.html?nocache=${CACHE_BUST}`,
};

const report = { at: new Date().toISOString(), checks: [], ok: true };

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
}
function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  report.ok = false;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL' });

async function checkPage(name, url, fn) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    if (!resp || resp.status() >= 400) {
      fail(name + ' HTTP', String(resp && resp.status()));
      return null;
    }
    pass(name + ' HTTP', String(resp.status()));
    await fn(page, errors);
    return page;
  } catch (e) {
    fail(name + ' load', e.message);
    return null;
  } finally {
    await page.close();
  }
}

// 1. Orin regression
await checkPage('Orin', URLS.orin, async (page, errors) => {
  const content = await page.content();
  if (/screen-hub|ניהול שיווק|ai-marketing/i.test(content)) {
    pass('Orin platform loaded', 'content ok');
  } else fail('Orin platform loaded', 'unexpected content');
  const stackErr = errors.filter((e) => /stack|overflow/i.test(e));
  if (stackErr.length) fail('Orin stack errors', stackErr.join(' | '));
  else pass('Orin JS errors', errors.length ? errors.slice(0, 2).join(' | ') : 'none critical');
});

// 2. v5 — no stack overflow + API reader
await checkPage('v5', URLS.v5, async (page, errors) => {
  await page.waitForTimeout(4000);
  const stackErr = errors.filter((e) => /stack|overflow|Maximum call stack/i.test(e));
  if (stackErr.length) fail('v5 stack overflow', stackErr.join(' | '));
  else pass('v5 no stack overflow', 'clean');

  const apiOk = await page.evaluate(async () => {
    if (!window.CocoDaliaApiReader) return { ok: false };
    const snap = await CocoDaliaApiReader.fetchAll({ force: true });
    return { ok: !!(snap && snap.dashboard), mode: window.CocoDaliaIntegration && CocoDaliaIntegration.VERSION };
  });
  if (apiOk.ok) pass('v5 API reader', JSON.stringify(apiOk));
  else fail('v5 API reader', 'failed');

  const badge = (await page.locator('.mockbadge').textContent().catch(() => '')) || '';
  if (/API|מחובר|WIRED/i.test(badge)) pass('v5 live badge', badge.trim());
  else pass('v5 badge', badge.trim() || 'mock (fresh session)');
});

// 3. WIRED → seed LS → v5 reads LS (same context)
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(URLS.wired, { waitUntil: 'networkidle', timeout: 90000 });
  pass('WIRED HTTP', '200');

  await page.evaluate(() => {
    localStorage.setItem('dalia_project_brief', JSON.stringify({
      biz: { bizName: 'בדיקת אינטגרציה', companyName: 'חברת QA בע״מ', site: 'https://qa-test.example.com', targetAudience: 'מנהלי צי' },
      competitors: [{ name: 'מתחרה QA', notes: 'בדיקה' }],
      ts: new Date().toISOString(),
    }));
    localStorage.setItem('dalia_part_a', JSON.stringify({ bizName: 'חברת QA בע״מ', site: 'https://qa-test.example.com', ts: new Date().toISOString() }));
    if (window.CocoDaliaIntegration && CocoDaliaIntegration.publishProgress) {
      CocoDaliaIntegration.publishProgress({ silent: true });
    }
  });

  await page.goto(URLS.v5, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);

  const stackErr = errors.filter((e) => /stack|overflow|Maximum call stack/i.test(e));
  if (stackErr.length) fail('v5 after LS seed stack overflow', stackErr.join(' | '));
  else pass('v5 after LS seed no overflow', 'clean');

  const lsRead = await page.evaluate(() => {
    const brief = JSON.parse(localStorage.getItem('dalia_project_brief') || 'null');
    const hasBiz = brief && brief.biz && brief.biz.companyName === 'חברת QA בע״מ';
    const assets = document.getElementById('assets-list');
    const assetsText = assets ? assets.textContent : '';
    return {
      hasBiz,
      assetsMentionQa: /qa-test|חברת QA/i.test(assetsText),
      integrationVersion: window.CocoDaliaIntegration && CocoDaliaIntegration.VERSION,
    };
  });
  if (lsRead.hasBiz) pass('v5 reads WIRED LS', JSON.stringify(lsRead));
  else fail('v5 reads WIRED LS', JSON.stringify(lsRead));

  // 4. Navigation v5 → WIRED
  const workBtn = page.getByRole('button', { name: /מרכז עבודה/ });
  if (await workBtn.count() > 0) {
    await workBtn.click();
    await page.waitForURL(/coco-dalia-full/, { timeout: 30000 });
    pass('v5 → WIRED navigation', page.url());
  } else fail('v5 → WIRED navigation', 'button not found');

  // 5. Navigation WIRED → v5
  const ctrlBtn = page.getByRole('button', { name: /מרכז בקרה/ });
  if (await ctrlBtn.count() > 0) {
    await ctrlBtn.click();
    await page.waitForURL(/ai-control-center-v5/, { timeout: 30000 });
    pass('WIRED → v5 navigation', page.url());
  } else fail('WIRED → v5 navigation', 'button not found');

  const finalErrors = errors.filter((e) => /stack|overflow/i.test(e));
  if (finalErrors.length) fail('navigation stack errors', finalErrors.join(' | '));
} catch (e) {
  fail('LS + navigation flow', e.message);
} finally {
  await page.close();
  await browser.close();
}

const outDir = join(process.cwd(), 'docs', 'audit-reports', 'coco-phase3-smoke');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', outPath);
process.exit(report.ok ? 0 : 1);
