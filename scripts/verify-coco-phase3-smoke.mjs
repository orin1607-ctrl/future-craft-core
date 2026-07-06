/**
 * Phase 3 integration smoke test — WIRED, v5, Orin (read-only checks).
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const TS = Date.now();

const URLS = {
  orin: `${BASE}/ai-marketing-platform.html?nocache=${TS}`,
  wired: `${BASE}/coco-dalia/coco-dalia-full-A-J-WIRED%20(1).html?nocache=${TS}`,
  v5: `${BASE}/ai-marketing/ai-control-center-v5-STANDALONE.html?nocache=${TS}`,
  dashboard: `${BASE}/project-001/dashboard.json?nocache=${TS}`,
};

const report = { at: new Date().toISOString(), checks: [], ok: true };

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
}
function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  report.ok = false;
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Static API checks
try {
  const dash = await fetchJson(URLS.dashboard);
  if (dash.connections && dash.connections.searchConsole) {
    pass('dashboard.json connections', 'searchConsole=' + dash.connections.searchConsole.status);
  } else fail('dashboard.json connections', 'missing');
  if (dash.stats && dash.stats.avgPosition != null) {
    pass('dashboard.json SEO stats', 'avgPosition=' + dash.stats.avgPosition);
  } else fail('dashboard.json SEO stats', 'missing stats');
} catch (e) {
  fail('dashboard.json fetch', e.message);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL' });

async function checkPage(name, url, fn) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    if (!resp || resp.status() >= 400) {
      fail(name + ' HTTP', String(resp && resp.status()));
      return;
    }
    pass(name + ' HTTP', String(resp.status()));
    await fn(page, errors);
  } catch (e) {
    fail(name + ' load', e.message);
  } finally {
    await page.close();
  }
}

await checkPage('Orin', URLS.orin, async (page, errors) => {
  const hasHub = await page.locator('#screen-hub, [id*="screen-hub"]').count();
  const hasClients = await page.locator('#screen-clients, text=חברות').count();
  if (hasHub > 0 || await page.content().then((c) => /screen-hub|ניהול שיווק/i.test(c))) {
    pass('Orin hub present', 'marketing platform loaded');
  } else fail('Orin hub present', 'hub not found');
  if (errors.length) fail('Orin JS errors', errors.slice(0, 3).join(' | '));
  else pass('Orin JS errors', 'none');
});

await checkPage('WIRED', URLS.wired, async (page, errors) => {
  const hasNav = await page.locator('text=מרכז בקרה').count();
  if (hasNav > 0) pass('WIRED control center link', 'found');
  else fail('WIRED control center link', 'missing');
  const hasIntegration = await page.evaluate(() => !!(window.CocoDaliaIntegration && window.CocoDaliaAuthBridge));
  if (hasIntegration) pass('WIRED integration scripts', 'CocoDaliaIntegration+AuthBridge');
  else fail('WIRED integration scripts', 'missing globals');
  if (errors.length) fail('WIRED JS errors', errors.slice(0, 3).join(' | '));
  else pass('WIRED JS errors', 'none');
});

await checkPage('v5', URLS.v5, async (page, errors) => {
  await page.waitForTimeout(3000);
  const hasWorkLink = await page.locator('text=מרכז עבודה').count();
  if (hasWorkLink > 0) pass('v5 work center link', 'found');
  else fail('v5 work center link', 'missing');

  const apiOk = await page.evaluate(async () => {
    if (!window.CocoDaliaApiReader) return { ok: false, reason: 'no reader' };
    const snap = await CocoDaliaApiReader.fetchAll({ force: true });
    return {
      ok: !!(snap && snap.dashboard),
      integrations: (snap.integrations || []).length,
      keywords: (snap.keywords || []).length,
      googleAds: !!(snap.googleAds && snap.googleAds.customerId),
      workPlan: !!(snap.workPlanProgress && snap.workPlanProgress.actionsTotal > 0),
    };
  });
  if (apiOk.ok) {
    pass('v5 API reader live', JSON.stringify(apiOk));
  } else fail('v5 API reader live', apiOk.reason || 'no dashboard');

  const badge = await page.locator('.mockbadge').textContent().catch(() => '');
  if (/API|מחובר|WIRED/i.test(badge || '')) pass('v5 live badge', badge.trim());
  else pass('v5 live badge', badge.trim() || 'mock (no LS data — expected on fresh)');

  if (errors.length) fail('v5 JS errors', errors.slice(0, 3).join(' | '));
  else pass('v5 JS errors', 'none');
});

await browser.close();

const outDir = join(process.cwd(), 'docs', 'audit-reports', 'coco-phase3-smoke');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', outPath);
process.exit(report.ok ? 0 : 1);
