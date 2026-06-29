#!/usr/bin/env node
/**
 * E2E — Business Strategy + Website Builder integration (desktop + iPhone 13).
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || process.env.VER || 'v3-live-demo-3';
const BASE = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'website-builder-integration');
mkdirSync(OUT, { recursive: true });

let commitHash = '';
try { commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim(); } catch { /* ignore */ }

const report = {
  at: new Date().toISOString(),
  commitHash,
  stagingUrl: BASE.split('&t=')[0],
  version: VER,
  checks: {},
  passed: 0,
  failed: 0,
  openIssues: [],
};

function check(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.passed += 1;
  else {
    report.failed += 1;
    report.openIssues.push(name + ': ' + (detail || 'fail'));
  }
}

async function clickId(page, id) {
  await page.evaluate((sel) => {
    const el = document.getElementById(sel);
    if (el) el.click();
  }, id);
}

async function runScenario(label, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404.*\.(png|ico)/i.test(m.text())) {
      const txt = m.text().slice(0, 250);
      if (/Failed to load resource/i.test(txt)) return;
      errors.push(txt);
    }
  });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 60000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard && window.WebsiteBuilderWizard, { timeout: 60000 });
    check(label + '_modules_loaded', true, 'BusinessStrategy + WebsiteBuilder');

    const hubCard = page.locator('.hub-card', { hasText: 'חברות ועסקים' }).first();
    await hubCard.click();
    await page.waitForFunction(() => document.getElementById('screen-business-strategy')?.classList.contains('active'), { timeout: 30000 });
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });
    check(label + '_strategy_opened', true);

    for (let i = 0; i < 3; i += 1) {
      await page.locator('#btn-next').click();
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => {
      const done = document.getElementById('ana-done');
      return done && done.style.display !== 'none';
    }, { timeout: 30000 });
    check(label + '_analysis_done', true);

    await page.locator('#btn-next').click();
    await page.waitForTimeout(350);
    await page.locator('#btn-next').click();
    await page.waitForTimeout(350);
    await page.locator('#btn-next').click();
    await page.waitForFunction(() => {
      const e = document.getElementById('exported');
      return e && e.style.display !== 'none';
    }, { timeout: 15000 });
    check(label + '_export_success', true);

    const ctaCount = await page.locator('#exported button', { hasText: '🌐 צור אתר AI' }).count();
    check(label + '_website_builder_cta_visible', ctaCount > 0, 'count=' + ctaCount);

    await page.locator('#exported button', { hasText: '🌐 צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });
    const rootsVisibility = await page.evaluate(() => ({
      strategyHidden: document.getElementById('biz-strategy-root')?.style.display === 'none',
      builderVisible: document.getElementById('website-builder-root')?.style.display !== 'none',
    }));
    check(label + '_opens_inside_business_screen', !!rootsVisibility.strategyHidden && !!rootsVisibility.builderVisible, JSON.stringify(rootsVisibility));

    check(label + '_website_steps_7', await page.locator('#wb-steps .step').count() === 7);

    const contextData = await page.evaluate(() => ({
      daliaBiz: JSON.parse(localStorage.getItem('dalia_biz') || 'null'),
      bizCtx: JSON.parse(localStorage.getItem('coco-business-context-v1') || 'null'),
      companyChip: document.getElementById('wb-k-company')?.textContent || '',
    }));
    const dataPasses = !!(contextData.daliaBiz && contextData.bizCtx && contextData.companyChip.trim().length > 0);
    check(label + '_context_passes_to_builder', dataPasses, contextData.companyChip.slice(0, 80));

    for (let i = 1; i < 7; i += 1) {
      await clickId(page, 'wb-next');
      await page.waitForTimeout(180);
    }
    const deployStatus = await page.locator('#wb-deploy-status').innerText();
    check(label + '_builder_reached_step7', /מוכן|✅/.test(deployStatus), deployStatus);

    const scrollCheck = await page.evaluate(() => {
      const root = document.getElementById('website-builder-root');
      if (!root) return { ok: false, reason: 'missing root' };
      const maxRoot = root.scrollHeight - root.clientHeight;
      if (maxRoot > 0) {
        root.scrollTop = maxRoot;
        return { ok: root.scrollTop > 0, mode: 'root', max: maxRoot, top: root.scrollTop };
      }
      const doc = document.scrollingElement || document.documentElement;
      const maxDoc = doc.scrollHeight - doc.clientHeight;
      if (maxDoc > 0) {
        doc.scrollTop = maxDoc;
        return { ok: doc.scrollTop > 0, mode: 'document', max: maxDoc, top: doc.scrollTop };
      }
      return { ok: true, mode: 'none', reason: 'no_scroll_required' };
    });
    check(label + '_scroll_check', !!scrollCheck.ok, JSON.stringify(scrollCheck));

    await clickId(page, 'wb-next');
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 12000 });
    check(label + '_returns_to_agents', true);

    if (errors.length) check(label + '_console_clean', false, errors.slice(0, 5).join(' | '));
    else check(label + '_console_clean', true);
  } catch (e) {
    check(label + '_scenario_run', false, e.message || String(e));
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  await runScenario('desktop', { viewport: { width: 1440, height: 900 } });
  await runScenario('mobile_iphone13', {
    ...devices['iPhone 13'],
    locale: 'he-IL',
  });

  report.ok = report.failed === 0;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
