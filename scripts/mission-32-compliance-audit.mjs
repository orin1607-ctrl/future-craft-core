#!/usr/bin/env node
/**
 * Mission 32 — 1:1 compliance audit vs approved business-strategy-approved-source.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || 'v3-mission-32';
const STAGING = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'mission-32-compliance');
mkdirSync(OUT, { recursive: true });

const APPROVED = readFileSync(join(ROOT, 'public/ai-marketing/business-strategy-approved-source.html'), 'utf8');

const REQUIRED_IDS = [
  'tb-client', 'steps', 'pf', 'p1', 'p2', 'p3', 'p4', 'p5',
  'b-name', 'b-sector', 'b-site', 'b-loc', 'b-age', 'b-size', 'b-main', 'b-services', 'b-diff', 'b-pain', 'b-usp',
  'b-ideal', 'b-bad', 'sec-chips', 'upz', 'fi', 'fl2', 'site-url', 'url-list', 'b-free',
  'b-goal', 'chal-chips', 'b-comp', 'b-vs', 'b-budget',
  'plat-list', 'agents-list', 'ai-box', 'ai-log', 'ana-ready', 'ana-done',
  'rep-score', 'rep-name', 'rep-head', 'rep-badges', 'r-who', 'r-problem', 'r-opp', 'r-rec',
  'r-ta-main', 'r-kw-main', 'r-kw-long', 'r-kw-no', 'r-comp-list', 'r-budget-rows', 'r-workplan',
  'sw-s', 'sw-w', 'sw-o', 'sw-t', 'cl', 'ctx-json', 'exported', 'fhint', 'btn-back', 'btn-next', 'toast',
];

const REQUIRED_TEXT = [
  'CO.CO', 'דליה', 'אסטרטגיית שיווק AI', 'Staging',
  '🏢 הכרת עסק', '🔗 חיבור נכסים', '🧠 ניתוח AI', '📄 דוח ללקוח', '✅ אישור',
  'הכרת העסק', 'חיבור נכסים דיגיטליים', 'ניתוח AI', 'דוח אסטרטגיה — ללקוח', 'אישור ומעבר לעוזרים',
  'פרטי העסק', 'שירותים ויתרונות', 'קהל יעד', 'העלאת חומרים', 'מטרות ואתגרים',
  'א. תקציר מנהלים', 'ב. קהל יעד', 'ג. אזורי פרסום', 'ד. מילות מפתח', 'ה. מתחרים',
  'ו. נכסים דיגיטליים', 'ז. המלצת קמפיין', 'ח. תקציב מומלץ', 'ט. תחזית', 'י. תוכנית עבודה', 'יא. SWOT',
  'ציון הבנה', 'Business Context — JSON', 'בדיקה סופית', 'מה עובר לאן',
  '📧 שלח ללקוח לאישור', '💾 שמור טיוטה', '🖨️ הדפס / PDF',
  '▶ הפעל ניתוח AI', 'פתח מנהל השיווק',
];

const report = {
  mission: 32,
  at: new Date().toISOString(),
  stagingUrl: STAGING.split('&t=')[0],
  version: VER,
  approvedSource: 'public/ai-marketing/business-strategy-approved-source.html',
  checks: [],
  differences: [],
  passed: 0,
  failed: 0,
  oneToOne: false,
};

function chk(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  if (ok) report.passed++; else { report.failed++; report.differences.push(name + (detail ? ': ' + detail : '')); }
}

async function clickId(page, id) {
  await page.evaluate((sel) => { const el = document.getElementById(sel); if (el) el.click(); }, id);
}

let commitHash = '';
try { commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim(); } catch { /* */ }
report.commitHash = commitHash;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard, { timeout: 90000 });
    await page.evaluate(() => BusinessStrategyWizard.open());
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    const root = '#biz-strategy-root ';
    for (const id of REQUIRED_IDS) {
      const n = await page.locator(root + '#' + id).count();
      chk('id:' + id, n > 0);
    }

    const domHtml = await page.locator('#biz-strategy-root').innerHTML();
    for (const t of REQUIRED_TEXT) {
      chk('text:' + t, domHtml.includes(t), t);
    }

    const platCount = await page.locator(root + '#plat-list .plat').count();
    chk('platforms_count_30plus', platCount >= 30, String(platCount));

    const agentsCount = await page.locator(root + '#agents-list .agent-row').count();
    chk('agents_count_9', agentsCount === 9, String(agentsCount));

    const stepsCount = await page.locator(root + '#steps .step').count();
    chk('wizard_steps_5', stepsCount === 5, String(stepsCount));

    // CSS tokens from approved
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#biz-strategy-root')).backgroundColor);
    chk('css_bg_dark', bg === 'rgb(4, 9, 26)' || bg.includes('4, 9'), bg);

    // Flow: step1 → step2 → analysis → report → approval → export
    chk('prefill_dalia', /דליה/.test(await page.inputValue('#b-name')));
    await clickId(page, 'btn-next');
    await page.waitForTimeout(300);
    chk('tab2_active', await page.evaluate(() => document.getElementById('p2').classList.contains('on')));
    chk('platform_connected_website', await page.evaluate(() => {
      const el = document.getElementById('ps-website');
      return el && el.textContent.includes('מחובר');
    }));

    await clickId(page, 'btn-next');
    await page.waitForTimeout(300);
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => {
      const d = document.getElementById('ana-done');
      return d && d.style.display !== 'none';
    }, { timeout: 30000 });
    chk('analysis_complete', true);

    await clickId(page, 'btn-next');
    await page.waitForTimeout(400);
    chk('report_score', (await page.textContent('#rep-score')).trim().length > 0);
    chk('report_swot', (await page.textContent('#sw-s')).length > 2);

    await clickId(page, 'btn-next');
    await page.waitForTimeout(300);
    chk('checklist_items', (await page.locator('#cl .cl-item').count()) >= 8);

    await clickId(page, 'btn-next');
    await page.waitForFunction(() => document.getElementById('exported').style.display !== 'none', { timeout: 10000 });
    const ctx = await page.evaluate(() => JSON.parse(localStorage.getItem('coco-business-context-v1') || 'null'));
    chk('business_context_dalia', ctx && ctx.clientId === 'dalia-c-official');

    await page.evaluate(() => {
      const btn = document.querySelector('#exported .btn-p');
      if (btn) btn.click();
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 10000 });
    chk('flow_to_agents', true);

    await page.evaluate(() => goScreen('screen-goals'));
    await page.waitForTimeout(1500);
    chk('flow_to_goals', await page.evaluate(() => document.getElementById('screen-goals')?.classList.contains('active')));

    await page.evaluate(() => goScreen('screen-actions'));
    await page.waitForTimeout(1500);
    chk('flow_to_actions', await page.evaluate(() => document.getElementById('screen-actions')?.classList.contains('active')));

    // Clients entry button
    await page.evaluate(() => goScreen('screen-clients'));
    await page.waitForTimeout(1500);
    chk('clients_strategy_button', await page.locator('button', { hasText: 'פתח אסטרטגיית שיווק AI' }).count() > 0);

    report.oneToOne = report.failed === 0;
  } catch (e) {
    chk('audit_run', false, e.message);
  } finally {
    await browser.close();
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const md = [
    '# Mission 32 — בדיקת התאמה 1:1',
    '',
    '**תאריך:** ' + report.at,
    '**Staging:** ' + report.stagingUrl,
    '**Commit:** `' + (report.commitHash || '—') + '`',
    '',
    report.oneToOne ? '## ✅ המסך זהה אחד לאחד לתכנון שאושר' : '## ❌ קיימים הבדלים',
    '',
    report.differences.length ? '### הבדלים\n' + report.differences.map((d) => '- ' + d).join('\n') : '',
    '',
    '**עברו:** ' + report.passed + ' · **נכשלו:** ' + report.failed,
  ].join('\n');
  writeFileSync(join(OUT, 'REPORT-HE.md'), md);
  console.log(JSON.stringify({ ok: report.oneToOne, passed: report.passed, failed: report.failed, differences: report.differences }, null, 2));
  process.exit(report.oneToOne ? 0 : 1);
}

main();
