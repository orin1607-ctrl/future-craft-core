/**
 * Verify 13 build engines wiring on GitHub Pages v5.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = process.env.COCO_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const V5 = `${BASE}/ai-marketing/ai-control-center-v5-STANDALONE.html`;
const report = { at: new Date().toISOString(), base: BASE, checks: [], ok: true };

function pass(name, detail) { report.checks.push({ name, ok: true, detail }); }
function fail(name, detail) { report.checks.push({ name, ok: false, detail }); report.ok = false; }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const res = await page.goto(V5, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (res && res.status() === 200) pass('v5 HTTP', '200');
  else fail('v5 HTTP', String(res?.status()));

  await page.waitForTimeout(3000);

  const mods = await page.evaluate(() => ({
    engine: window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.VERSION,
    runner: window.CocoDaliaBuildEnginesRunner && CocoDaliaBuildEnginesRunner.VERSION,
    hub: window.CocoDaliaBuildEnginesHub && CocoDaliaBuildEnginesHub.VERSION,
    template: window.ClientSiteTemplate && typeof window.ClientSiteTemplate.buildSite === 'function',
    registry: window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.REGISTRY.length,
  }));

  if (mods.engine) pass('build engines module', mods.engine);
  else fail('build engines module', 'missing');
  if (mods.runner) pass('build engines runner', mods.runner);
  else fail('build engines runner', 'missing');
  if (mods.hub) pass('build engines hub', mods.hub);
  else fail('build engines hub', 'missing');
  if (mods.template) pass('ClientSiteTemplate', 'ok');
  else fail('ClientSiteTemplate', 'missing');
  if (mods.registry === 13) pass('registry count', '13');
  else fail('registry count', String(mods.registry));

  await page.evaluate(() => {
    localStorage.setItem('dalia_project_brief', JSON.stringify({ biz: { companyName: 'דליה QA' } }));
    localStorage.setItem('coco-site-blueprint-v1', JSON.stringify({
      company: 'דליה QA',
      pages: [{ title: 'בית', slug: 'home', purpose: 'test' }],
      pageCount: 1,
    }));
  });

  const localRun = await page.evaluate(async () => {
    if (!window.CocoDaliaBuildEnginesRunner) return { ok: false };
    var ctx = CocoDaliaBuildEnginesEngine.gatherBuildContext();
    var pkg = { brief: {}, version: 'test' };
    var c3 = await CocoDaliaBuildEnginesRunner.runOne('c3', ctx, pkg);
    var c13 = await CocoDaliaBuildEnginesRunner.runOne('c13', ctx, pkg);
    return { c3: c3.status, c13: c13.status };
  });

  if (localRun.c3 === 'הושלם') pass('c3 local run', localRun.c3);
  else fail('c3 local run', JSON.stringify(localRun));
  if (localRun.c13 === 'הושלם' || localRun.c13 === 'ממתין') pass('c13 local run', localRun.c13);
  else fail('c13 local run', JSON.stringify(localRun));

  await page.click('text=סביבת עבודה').catch(() => null);
  await page.waitForTimeout(500);
  const hub = await page.locator('#coco-build-engines-hub').count();
  if (hub > 0) pass('hub mounted in workspace', 'yes');
  else fail('hub mounted in workspace', 'no');
} catch (e) {
  fail('exception', e.message);
} finally {
  await browser.close();
}

const outDir = join(process.cwd(), 'docs', 'audit-reports', 'build-engines');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'verify-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
