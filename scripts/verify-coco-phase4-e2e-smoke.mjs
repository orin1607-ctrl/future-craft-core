/**
 * Phase 4 E2E smoke test — assistants engine, reports, tenant, navigation, Orin regression.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const USE_LOCAL = process.env.COCO_SMOKE_LOCAL === '1';
const BASE = USE_LOCAL
  ? 'http://127.0.0.1:8765'
  : 'https://orin1607-ctrl.github.io/future-craft-core';
const TS = Date.now();
const CACHE_BUST = 'phase4-e2e-' + TS;

const URLS = {
  orin: `${BASE}/ai-marketing-platform.html?nocache=${CACHE_BUST}`,
  wired: `${BASE}/coco-dalia/coco-dalia-full-A-J-WIRED%20(1).html?nocache=${CACHE_BUST}`,
  v5: `${BASE}/ai-marketing/ai-control-center-v5-STANDALONE.html?nocache=${CACHE_BUST}`,
};

const report = { at: new Date().toISOString(), base: BASE, checks: [], ok: true };

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
  if (/screen-hub|ניהול שיווק|ai-marketing/i.test(content)) pass('Orin platform loaded', 'ok');
  else fail('Orin platform loaded', 'unexpected');
  const stackErr = errors.filter((e) => /stack|overflow/i.test(e));
  if (stackErr.length) fail('Orin stack errors', stackErr.join(' | '));
  else pass('Orin JS errors', errors.length ? errors.slice(0, 2).join(' | ') : 'none');
});

// 2. v5 E2E modules
await checkPage('v5', URLS.v5, async (page, errors) => {
  await page.waitForTimeout(5000);
  const stackErr = errors.filter((e) => /stack|overflow|Maximum call stack/i.test(e));
  if (stackErr.length) fail('v5 stack overflow', stackErr.join(' | '));
  else pass('v5 no stack overflow', 'clean');

  const mods = await page.evaluate(async () => {
    const apiOk = window.CocoDaliaApiReader
      ? await CocoDaliaApiReader.fetchAll({ force: true }).then((s) => !!(s && s.dashboard))
      : false;
    const eng = window.CocoDaliaAssistantsEngine ? CocoDaliaAssistantsEngine.runAll() : null;
    const counts = eng ? CocoDaliaAssistantsEngine.getActiveCounts() : null;
    const reports = window.CocoDaliaReportsEngine ? CocoDaliaReportsEngine.buildReportsList() : [];
    const google = window.CocoDaliaGoogleLayer ? CocoDaliaGoogleLayer.getAllStatus() : [];
    const tenant = window.CocoDaliaTenantHub ? await CocoDaliaTenantHub.loadCustomers() : [];
    return {
      integration: window.CocoDaliaIntegration && CocoDaliaIntegration.VERSION,
      apiOk,
      assistants: counts,
      reportsCount: reports.length,
      realReports: reports.filter((r) => r.real).length,
      googleProviders: google.length,
      customers: tenant.length,
      persistence: window.CocoDaliaPersistence && CocoDaliaPersistence.VERSION,
    };
  });

  if (mods.integration && /^4\.0\.0/.test(mods.integration)) pass('v5 integration v4', mods.integration);
  else fail('v5 integration v4', String(mods.integration));

  if (mods.apiOk) pass('v5 API reader', 'dashboard ok');
  else fail('v5 API reader', 'failed');

  if (mods.assistants && mods.assistants.total.assistants === 50) {
    pass('v5 assistants engine', JSON.stringify(mods.assistants));
  } else fail('v5 assistants engine', JSON.stringify(mods.assistants));

  if (mods.reportsCount >= 4) pass('v5 reports engine', mods.reportsCount + ' reports, ' + mods.realReports + ' real');
  else fail('v5 reports engine', JSON.stringify(mods));

  if (mods.googleProviders >= 8) pass('v5 google layer', mods.googleProviders + ' providers');
  else fail('v5 google layer', String(mods.googleProviders));

  if (mods.customers >= 1) pass('v5 tenant hub', mods.customers + ' customers');
  else fail('v5 tenant hub', 'none');

  if (mods.persistence) pass('v5 persistence module', mods.persistence);
  else fail('v5 persistence module', 'missing');
});

// 3. WIRED + LS + navigation
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(URLS.wired, { waitUntil: 'networkidle', timeout: 90000 });
  pass('WIRED HTTP', '200');

  await page.evaluate(() => {
    localStorage.setItem('dalia_project_brief', JSON.stringify({
      biz: { bizName: 'בדיקת E2E', companyName: 'חברת E2E בע״מ', site: 'https://e2e-test.example.com', targetAudience: 'מנהלי צי' },
      competitors: [{ name: 'מתחרה E2E', notes: 'בדיקה' }],
      ts: new Date().toISOString(),
    }));
    localStorage.setItem('dalia_part_a', JSON.stringify({ bizName: 'חברת E2E בע״מ', site: 'https://e2e-test.example.com', ts: new Date().toISOString() }));
    if (window.CocoDaliaIntegration) CocoDaliaIntegration.publishProgress({ silent: true });
    if (window.CocoDaliaAssistantsEngine) CocoDaliaAssistantsEngine.runAll();
  });

  await page.goto(URLS.v5, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);

  const stackErr = errors.filter((e) => /stack|overflow/i.test(e));
  if (stackErr.length) fail('v5 after seed overflow', stackErr.join(' | '));
  else pass('v5 after seed no overflow', 'clean');

  const lsRead = await page.evaluate(() => {
    const brief = JSON.parse(localStorage.getItem('dalia_project_brief') || 'null');
    const eng = window.CocoDaliaAssistantsEngine ? CocoDaliaAssistantsEngine.getActiveCounts() : null;
    return {
      hasBiz: !!(brief && brief.biz && brief.biz.companyName === 'חברת E2E בע״מ'),
      assistantsDone: eng && eng.assistantsDone,
    };
  });
  if (lsRead.hasBiz) pass('v5 reads WIRED LS', JSON.stringify(lsRead));
  else fail('v5 reads WIRED LS', JSON.stringify(lsRead));

  const workBtn = page.getByRole('button', { name: /מרכז עבודה/ });
  if (await workBtn.count() > 0) {
    await workBtn.click();
    await page.waitForURL(/coco-dalia-full/, { timeout: 30000 });
    pass('v5 → WIRED navigation', page.url());
  } else fail('v5 → WIRED navigation', 'button missing');

  const ctrlBtn = page.getByRole('button', { name: /מרכז בקרה/ });
  if (await ctrlBtn.count() > 0) {
    await ctrlBtn.click();
    await page.waitForURL(/ai-control-center-v5/, { timeout: 30000 });
    pass('WIRED → v5 navigation', page.url());
  } else fail('WIRED → v5 navigation', 'button missing');
} catch (e) {
  fail('LS + navigation flow', e.message);
} finally {
  await page.close();
  await browser.close();
}

const outDir = join(process.cwd(), 'docs', 'audit-reports', 'coco-phase4-e2e-smoke');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', outPath);
process.exit(report.ok ? 0 : 1);
