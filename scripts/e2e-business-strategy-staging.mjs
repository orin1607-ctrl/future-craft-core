#!/usr/bin/env node
/**
 * E2E — Business Strategy wizard on live GitHub Pages Staging.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || process.env.VER || 'v3-mission-32';
const BASE = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'business-strategy-staging');
mkdirSync(OUT, { recursive: true });

let commitHash = '';
try { commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim(); } catch { /* */ }

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
  if (ok) report.passed++; else { report.failed++; report.openIssues.push(name + ': ' + (detail || 'fail')); }
}

async function clickId(page, id) {
  await page.evaluate((sel) => {
    const el = document.getElementById(sel);
    if (el) el.click();
  }, id);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404.*\.(png|ico)/i.test(m.text())) errors.push(m.text().slice(0, 200));
  });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard && window.BusinessStrategyModule, { timeout: 60000 });

    check('modules_loaded', true, 'BusinessStrategyWizard + Module');

    const hubCard = page.locator('.hub-card', { hasText: 'חברות ועסקים' });
    check('hub_card_visible', await hubCard.count() > 0, 'חברות ועסקים');

    await hubCard.first().click();
    await page.waitForFunction(() => window.BusinessStrategyWizard, { timeout: 30000 });
    await page.evaluate(() => BusinessStrategyWizard.open());
    await page.waitForFunction(() => document.getElementById('screen-business-strategy')?.classList.contains('active'), { timeout: 30000 });
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });
    check('wizard_screen_active', true);

    check('wizard_steps_5', await page.locator('#steps .step').count() === 5);
    check('platforms_34', await page.locator('#plat-list .plat').count() === 34);

    const nameVal = await page.locator('#b-name').inputValue().catch(() => '');
    check('dalia_prefill_name', /דליה/i.test(nameVal), nameVal);

    const siteVal = await page.locator('#b-site').inputValue().catch(() => '');
    check('dalia_prefill_site', /dalia-c\.com/i.test(siteVal), siteVal);

    await clickId(page, 'btn-next');
    await page.waitForTimeout(400);
    check('step2_active', await page.evaluate(() => document.getElementById('p2').classList.contains('on')));

    const websiteStatus = await page.locator('#ps-website').innerText();
    check('connected_website', /מחובר/.test(websiteStatus), websiteStatus);

    await clickId(page, 'btn-next');
    await page.waitForTimeout(300);
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => {
      const el = document.getElementById('ana-done');
      return el && el.style.display !== 'none';
    }, { timeout: 30000 });
    check('ai_analysis_done', true);

    await clickId(page, 'btn-next');
    await page.waitForTimeout(500);
    const score = await page.locator('#rep-score').innerText();
    check('report_built', score.length > 0, score);

    await clickId(page, 'btn-next');
    await page.waitForTimeout(400);
    check('checklist_8plus', await page.locator('#cl .cl-item').count() >= 8);

    const ctxPreview = await page.locator('#ctx-json').innerText();
    check('business_context_json', ctxPreview.includes('dalia-c-official'), ctxPreview.slice(0, 80));

    await clickId(page, 'btn-next');
    await page.waitForFunction(() => {
      const el = document.querySelector('#exported');
      return el && el.style.display !== 'none';
    }, { timeout: 15000 });
    check('export_ui_success', true);

    const lsCtx = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('coco-business-context-v1') || 'null'); } catch (e) { return null; }
    });
    check('business_context_stored', !!(lsCtx && lsCtx.clientId === 'dalia-c-official'), lsCtx?.company);

    const lsActions = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('coco-business-strategy-actions-v1') || '[]'); } catch (e) { return []; }
    });
    check('strategy_actions_stored', lsActions.length >= 2, String(lsActions.length) + ' actions');

    await page.evaluate(() => {
      const btn = document.querySelector('#exported .btn-p');
      if (btn) btn.click();
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 15000 });
    const agentsBanner = await page.locator('#coco-live-agents-context').innerText().catch(() => '');
    check('agents_business_context_banner', /Business Context פעיל/i.test(agentsBanner), agentsBanner.slice(0, 80));

    await page.evaluate(() => goScreen('screen-goals'));
    await page.waitForTimeout(2000);
    check('goals_screen_ok', await page.evaluate(() => document.getElementById('screen-goals')?.classList.contains('active')));

    await page.evaluate(() => goScreen('screen-actions'));
    await page.waitForTimeout(2500);
    check('actions_screen_ok', await page.evaluate(() => document.getElementById('screen-actions')?.classList.contains('active')));

    await page.evaluate(() => goScreen('screen-clients'));
    await page.waitForTimeout(1500);
    check('clients_open_button', await page.locator('button', { hasText: 'פתח אסטרטגיית שיווק AI' }).count() > 0);

    if (errors.length) report.consoleErrors = errors.slice(0, 10);
  } catch (e) {
    check('e2e_run', false, e.message || String(e));
  } finally {
    await browser.close();
  }

  report.ok = report.failed === 0;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
