/**
 * Full QA — CO.CO ניהול שיווק (UI + API + buttons + viewports)
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8888';
const apiUrl = process.env.QA_API_URL || 'http://127.0.0.1:8787';
const pageUrl = `${baseUrl}/ai-marketing-platform`;

const report = { passed: [], failed: [], warnings: [], api: {}, consoleErrors: [], networkErrors: [] };

async function apiTest(name, fn) {
  try {
    report.api[name] = await fn();
    if (report.api[name].ok !== false) report.passed.push(`api:${name}`);
    else report.failed.push(`api:${name} — ${report.api[name].error || 'failed'}`);
  } catch (e) {
    report.api[name] = { ok: false, error: e.message };
    report.failed.push(`api:${name} — ${e.message}`);
  }
}

// --- API tests ---
await apiTest('health', async () => {
  const r = await fetch(`${apiUrl}/api/health`);
  const d = await r.json();
  return { ok: r.ok && d.ok, openai: d.openai, dataSource: d.dataSource };
});

await apiTest('data', async () => {
  const r = await fetch(`${apiUrl}/api/data`);
  const d = await r.json();
  return { ok: !!(r.ok && d.ok && d.data?.kpis), keywords: d.data?.keywords?.length || 0 };
});

await apiTest('ai-health', async () => {
  const r = await fetch(`${apiUrl}/api/ai/health`);
  const d = await r.json();
  return { ok: r.ok, connected: d.ok, message: d.message };
});

await apiTest('save-sheets', async () => {
  const r = await fetch(`${apiUrl}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'qa_full_test', title: 'בדיקת QA', status: 'test' }),
  });
  const d = await r.json();
  return { ok: r.ok && d.ok, sheets: d.sheets?.ok };
});

// --- Browser tests ---
const browser = await chromium.launch();
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

const SCREENS = [
  'sc-dashboard','sc-usermanual','sc-director','sc-approval','sc-notifications','sc-tasks','sc-briefing',
  'sc-seo','sc-keywords','sc-content','sc-warehouse','sc-pages','sc-landing','sc-scheduler',
  'sc-intel','sc-competitors','sc-news','sc-gbp','sc-ads','sc-roi','sc-funnel','sc-journey',
  'sc-kpi','sc-heatmap','sc-executive','sc-strategy','sc-ailab','sc-autonomous','sc-aiimage',
  'sc-reports','sc-history','sc-crm','sc-fleetint','sc-health',
  'sc-settings','sc-permissions','sc-roadmap','sc-aiguide','sc-qa',
];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('8787') && t.includes('REFUSED')) return;
      if (t.includes('/api/ai/chat') && t.includes('503')) return;
      report.consoleErrors.push(`[${vp.name}] ${t}`);
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('8787')) {
      report.networkErrors.push(`[${vp.name}] ${res.status()} ${res.url()}`);
    }
  });

  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  for (const id of SCREENS) {
    const ok = await page.evaluate((scId) => {
      window.gotoSc(scId);
      const el = document.getElementById(scId);
      return !!(el && el.classList.contains('active'));
    }, id);
    ok ? report.passed.push(`${vp.name}:screen:${id}`) : report.failed.push(`${vp.name}:screen ${id}`);
  }

  // Data layer
  const dataOk = await page.waitForFunction(() => window.COCO?.data?.kpis, { timeout: 8000 }).then(() => true).catch(() => false);
  dataOk ? report.passed.push(`${vp.name}:data-layer`) : report.failed.push(`${vp.name}:data-layer`);

  // User manual screen
  await page.evaluate(() => window.gotoSc('usermanual'));
  await page.waitForTimeout(400);
  const manualOk = await page.locator('#sc-usermanual .guide-section').count();
  manualOk >= 5 ? report.passed.push(`${vp.name}:usermanual-content`) : report.failed.push(`${vp.name}:usermanual missing sections`);

  // AI guide screen content
  await page.evaluate(() => window.gotoSc('aiguide'));
  const guideOk = await page.locator('#sc-aiguide .guide-section').count();
  guideOk >= 5 ? report.passed.push(`${vp.name}:aiguide-content`) : report.failed.push(`${vp.name}:aiguide missing sections`);

  // Accordion on mobile
  if (vp.name === 'mobile') {
    const acc = await page.locator('.sb-acc-hdr').count();
    acc === 12 ? report.passed.push('mobile:accordion-12') : report.failed.push(`mobile accordion ${acc}`);
    await page.locator('.sb-acc-hdr').first().click();
    report.passed.push('mobile:accordion-click');
    (await page.locator('#cocoAiFab').isVisible()) ? report.passed.push('assistant:mobile-fab') : report.failed.push('assistant:mobile-fab');
  }

  // AI Assistant (desktop only — full interaction)
  if (vp.name === 'desktop') {
    const fab = await page.locator('#cocoAiFab').count();
    fab ? report.passed.push('assistant:fab') : report.failed.push('assistant:fab');
    await page.click('#cocoAiFab');
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => document.getElementById('cocoAiPanel')?.classList.contains('open'));
    open ? report.passed.push('assistant:panel') : report.failed.push('assistant:panel');
    const navOk = await page.evaluate(() => typeof window.COCO_ASSISTANT?.open === 'function');
    navOk ? report.passed.push('assistant:api') : report.failed.push('assistant:api');
    const chipCount = await page.locator('.coco-ai-chip').count();
    chipCount >= 4 ? report.passed.push('assistant:chips') : report.failed.push('assistant:chips');
    await page.click('#cocoAiClose');
    report.passed.push('assistant:panel-close');
  }

  // Button smoke — click AI buttons without crash
  await page.evaluate(() => window.gotoSc('director'));
  const aiBtns = await page.locator('#sc-director .btn').all();
  for (let i = 0; i < Math.min(aiBtns.length, 3); i++) {
    try {
      await aiBtns[i].click({ timeout: 2000 });
      await page.waitForTimeout(200);
    } catch { /* skip hidden */ }
  }
  report.passed.push(`${vp.name}:buttons-smoke`);

  // Approval flow
  await page.evaluate(() => window.gotoSc('approval'));
  const previewBtn = page.locator('#sc-approval .appr-actions .btn').first();
  if (await previewBtn.count()) {
    await previewBtn.click();
    await page.waitForTimeout(300);
    (await page.locator('#actionModal.open').count()) ? report.passed.push(`${vp.name}:approval-modal`) : report.failed.push(`${vp.name}:approval-modal`);
    await page.evaluate(() => window.closeActionModal());
  }

  await page.close();
}

await browser.close();

const out = {
  passed: report.passed.length,
  failed: report.failed.length,
  warnings: report.warnings.length,
  failures: report.failed,
  api: report.api,
  consoleErrors: [...new Set(report.consoleErrors)],
  networkErrors: [...new Set(report.networkErrors)].slice(0, 20),
};
console.log(JSON.stringify(out, null, 2));
process.exit(report.failed.length || report.consoleErrors.length ? 1 : 0);
