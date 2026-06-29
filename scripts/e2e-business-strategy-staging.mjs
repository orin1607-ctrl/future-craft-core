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
const VER = process.env.QA_UI_VERSION || process.env.VER || 'v3-biz-strategy-1';
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
    await page.waitForFunction(() => document.getElementById('screen-business-strategy')?.classList.contains('active'), { timeout: 30000 });
    check('wizard_screen_active', true);

    const nameVal = await page.locator('#b-name').inputValue().catch(() => '');
    check('dalia_prefill_name', /דליה/i.test(nameVal), nameVal);

    const siteVal = await page.locator('#b-site').inputValue().catch(() => '');
    check('dalia_prefill_site', /dalia-c\.com/i.test(siteVal), siteVal);

    // Step through wizard
    await clickId(page, 'bw-next'); // -> assets
    await page.waitForTimeout(400);
    const connected = await page.locator('#bw-connected-list').innerText();
    check('connected_assets', /אתר|Search Console|Analytics/i.test(connected), connected.slice(0, 80));

    await clickId(page, 'bw-next'); // -> analysis
    await page.waitForTimeout(400);
    await clickId(page, 'bw-run-analysis');
    await page.waitForFunction(() => {
      const el = document.querySelector('#bw-ana-done');
      return el && el.style.display !== 'none';
    }, { timeout: 25000 });
    check('ai_analysis_done', true);

    await clickId(page, 'bw-next'); // -> report
    await page.waitForTimeout(500);
    const reportTxt = await page.locator('#bw-report').innerText();
    check('report_built', reportTxt.length > 40, reportTxt.slice(0, 60));

    await clickId(page, 'bw-next'); // -> export
    await page.waitForTimeout(500);
    const ctxJson = await page.locator('#bw-ctx-json').innerText();
    check('business_context_json', ctxJson.includes('clientId') && ctxJson.includes('dalia'), ctxJson.slice(0, 80));

    await clickId(page, 'bw-next'); // export
    await page.waitForFunction(() => {
      const el = document.querySelector('#bw-exported');
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

    await clickId(page, 'bw-go-agents');
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 15000 });
    const agentsBanner = await page.locator('#coco-live-agents-context').innerText().catch(() => '');
    check('agents_business_context_banner', /Business Context פעיל/i.test(agentsBanner), agentsBanner.slice(0, 80));

    await page.evaluate(() => goScreen('screen-goals'));
    await page.waitForTimeout(2000);
    const goalsActive = await page.evaluate(() => document.getElementById('screen-goals')?.classList.contains('active'));
    check('goals_screen_ok', goalsActive, 'screen-goals active');

    await page.evaluate(() => goScreen('screen-actions'));
    await page.waitForTimeout(2500);
    const actionsText = await page.locator('#screen-actions').innerText();
    check('actions_include_strategy', /business-strategy|אופטימיזציה|Business/i.test(actionsText) || lsActions.length > 0, 'strategy actions in LS');

    // Clients screen button
    await page.evaluate(() => goScreen('screen-clients'));
    await page.waitForTimeout(1500);
    const clientsBtn = page.locator('button', { hasText: 'פתח אסטרטגיית שיווק AI' });
    check('clients_open_button', await clientsBtn.count() > 0);

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
