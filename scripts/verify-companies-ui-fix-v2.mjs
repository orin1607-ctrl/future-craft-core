#!/usr/bin/env node
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || 'v3-companies-ui-fix-v2';
const URL = process.env.STAGING_PAGES_URL || `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'companies-ui-fix-v2');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  version: VER,
  stagingUrl: URL.split('&t=')[0],
  checks: {},
  scenarios: {},
  pass: 0,
  fail: 0,
};

function addCheck(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1;
  else report.fail += 1;
}

async function runScenario(name, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/favicon|Failed to load resource.*\.(png|ico|svg|woff)/i.test(txt)) return;
    consoleErrors.push(txt.slice(0, 220));
  });

  const out = { consoleErrors, probes: {} };

  function scoped(key) {
    return `${name}_${key}`;
  }

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard && window.WebsiteBuilderWizard, { timeout: 90000 });

    await page.evaluate(() => goScreen('screen-hub'));
    await page.waitForSelector('#screen-hub .topbar', { timeout: 30000 });
    const hub = await page.evaluate(() => {
      const screen = document.getElementById('screen-hub');
      const content = screen?.querySelector('.content');
      const topbars = [...document.querySelectorAll('#screen-hub .topbar, #screen-hub .tb')].filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      let scrollableCount = 0;
      let stuck = false;
      let downOk = true;
      let scrollRequired = false;
      if (content) {
        const candidates = [content, ...content.querySelectorAll('*')].filter((el) => {
          const cs = getComputedStyle(el);
          if (!/(auto|scroll)/.test(cs.overflowY || '')) return false;
          return el.scrollHeight > el.clientHeight + 8;
        });
        scrollableCount = candidates.length;
        const max = content.scrollHeight - content.clientHeight;
        scrollRequired = max > 8;
        if (scrollRequired) {
          const start = content.scrollTop;
          for (let i = 0; i < 8; i += 1) content.scrollTop += 220;
          const down = content.scrollTop;
          downOk = down > start + 100;
          for (let i = 0; i < 8; i += 1) content.scrollTop -= 220;
          const up = content.scrollTop;
          stuck = up > 10;
        }
      }
      return {
        topbars: topbars.length,
        scrollableCount,
        scrollRequired,
        downOk,
        stuck,
      };
    });
    out.probes.hub = hub;
    addCheck(scoped('hub_smooth_scroll_mobile'), (!hub.scrollRequired) || (hub.downOk && !hub.stuck), JSON.stringify(hub));
    addCheck(scoped('no_duplicate_header'), hub.topbars === 1, `topbars=${hub.topbars}`);
    addCheck(scoped('no_extra_internal_scrollbar'), hub.scrollableCount <= 1, `scrollables=${hub.scrollableCount}`);

    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    const strategyScroll = await page.evaluate(() => {
      const root = document.getElementById('biz-strategy-root');
      if (!root) return { ok: false, reason: 'missing-root' };
      const main = root.querySelector('.main') || root;
      const max = main.scrollHeight - main.clientHeight;
      if (max <= 8) return { ok: true, down: 0, up: 0, scrollRequired: false };
      const start = main.scrollTop;
      for (let i = 0; i < 8; i += 1) main.scrollTop += 200;
      const down = main.scrollTop;
      for (let i = 0; i < 8; i += 1) main.scrollTop -= 200;
      const up = main.scrollTop;
      return {
        ok: down > start + 60 && up <= 8,
        down,
        up,
        scrollRequired: true,
      };
    });
    out.probes.strategyScroll = strategyScroll;
    addCheck(scoped('companies_smooth_scroll'), !!strategyScroll.ok, JSON.stringify(strategyScroll));
    addCheck(scoped('strategy_wizard_smooth_scroll'), !!strategyScroll.ok, JSON.stringify(strategyScroll));

    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.locator('#btn-next').click();
    await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });

    const exportedButtons = await page.evaluate(() => {
      const exported = document.getElementById('exported');
      const wbBtn = [...(exported?.querySelectorAll('button') || [])].find((b) => /צור אתר AI/.test(b.textContent || ''));
      const agentsBtn = [...(exported?.querySelectorAll('button') || [])].find((b) => /מנהל השיווק|עוזרים/.test(b.textContent || ''));
      return {
        wbVisible: !!wbBtn,
        agentsVisible: !!agentsBtn,
        wbText: wbBtn?.textContent || '',
        agentsText: agentsBtn?.textContent || '',
      };
    });
    out.probes.exportedButtons = exportedButtons;
    addCheck(scoped('website_button_visible'), exportedButtons.wbVisible, exportedButtons.wbText);
    addCheck(scoped('agents_button_separate'), exportedButtons.agentsVisible, exportedButtons.agentsText);

    await page.locator('#exported button', { hasText: 'צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });
    const openedBuilder = await page.evaluate(() => ({
      builderVisible: document.getElementById('website-builder-root')?.style.display !== 'none',
      strategyHidden: document.getElementById('biz-strategy-root')?.style.display === 'none',
      agentsActive: document.getElementById('screen-agents')?.classList.contains('active') || false,
    }));
    out.probes.builderOpen = openedBuilder;
    addCheck(scoped('website_button_opens_builder_not_agents'), openedBuilder.builderVisible && !openedBuilder.agentsActive, JSON.stringify(openedBuilder));

    await page.locator('#wb-next').click();
    await page.locator('#wb-next').click();
    await page.locator('#wb-next').click();
    await page.locator('#wb-next').click();
    await page.locator('#wb-next').click();
    await page.locator('#wb-next').click();
    await page.waitForTimeout(200);
    await page.locator('#wb-next').click();
    await page.waitForSelector('#wb-complete', { timeout: 15000, state: 'visible' });
    const completion = await page.evaluate(() => ({
      completeVisible: document.getElementById('wb-complete')?.style.display !== 'none',
      hasIframe: !!document.getElementById('wb-preview-frame'),
      agentsActive: document.getElementById('screen-agents')?.classList.contains('active') || false,
      outputSaved: !!localStorage.getItem('coco-website-builder-last-output-v1'),
      previewSaved: !!localStorage.getItem('coco-website-builder-preview-html-v1'),
    }));
    out.probes.builderCompletion = completion;
    addCheck(scoped('builder_completion_shows_preview'), completion.completeVisible && completion.hasIframe && !completion.agentsActive, JSON.stringify(completion));

    await page.locator('button', { hasText: 'המשך לעוזרים' }).first().click();
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 15000 });
    addCheck(scoped('agents_button_navigates_agents'), true, 'navigated');

    addCheck(scoped('no_scroll_stuck'), hub.downOk && !hub.stuck && strategyScroll.ok, 'hub+strategy');
    addCheck(scoped('console_clean'), consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } catch (e) {
    addCheck(scoped('scenario_completed'), false, e.message || String(e));
  } finally {
    await context.close();
    await browser.close();
  }

  report.scenarios[name] = out;
}

await runScenario('desktop', { viewport: { width: 1366, height: 900 } });
await runScenario('iphone13', { ...devices['iPhone 13'], locale: 'he-IL' });

report.ok = report.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  pass: report.pass,
  fail: report.fail,
  stagingUrl: report.stagingUrl,
}, null, 2));
process.exit(report.ok ? 0 : 1);
