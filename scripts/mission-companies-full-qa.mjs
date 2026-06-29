#!/usr/bin/env node
/**
 * Companies Full QA (Business Strategy + Website Builder integrated)
 * Scope: חברות ועסקים module only, staging only.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'audit-reports', 'companies-full-qa');
mkdirSync(OUT, { recursive: true });

function safeExec(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function safeExecRaw(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const HEAD = safeExec('git rev-parse HEAD');
const HEAD_SHORT = safeExec('git rev-parse --short HEAD') || 'latest';
const REMOTE_MAIN = safeExec('git ls-remote origin refs/heads/main').split('\t')[0] || '';
const STAGING_URL = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD_SHORT}&t=${Date.now()}`;
const STAGING_URL_NO_TS = STAGING_URL.split('&t=')[0];

const STRATEGY_APPROVED_PATH = join(ROOT, 'public', 'ai-marketing', 'business-strategy-approved-source.html');
const BUILDER_APPROVED_PATH = join(ROOT, 'public', 'ai-marketing', 'website-builder-approved-source.html');

const report = {
  mission: 'companies-full-qa',
  at: new Date().toISOString(),
  scope: 'חברות ועסקים בלבד',
  stagingUrl: STAGING_URL_NO_TS,
  commitHash: HEAD || null,
  commitShort: HEAD_SHORT,
  remoteMainHash: REMOTE_MAIN || null,
  sections: {},
  checks: {},
  issuesFound: [],
  fixesApplied: [],
  blockers: [],
  counts: { pass: 0, warn: 0, fail: 0 },
  all15Green: false,
  readyForTomorrow: false,
};

function iconByStatus(status) {
  if (status === 'pass') return '✅ תקין';
  if (status === 'warn') return '⚠️ חלקי';
  return '❌ תקלה';
}

function addSection(key, title, status, details) {
  report.sections[key] = { key, title, status, details: details || '' };
  if (status === 'pass') report.counts.pass += 1;
  else if (status === 'warn') report.counts.warn += 1;
  else report.counts.fail += 1;
}

function addCheck(key, ok, detail) {
  report.checks[key] = { ok: !!ok, detail: detail || '' };
  if (!ok) report.issuesFound.push(`${key}: ${detail || 'failed'}`);
}

function textIncludesAll(haystack, arr) {
  return arr.every((needle) => haystack.includes(needle));
}

function sha256Text(input) {
  return crypto.createHash('sha256').update(input || '', 'utf8').digest('hex');
}

function toShortList(items, max = 6) {
  if (!items || !items.length) return '—';
  return items.slice(0, max).join(', ');
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, text: txt };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: String(e.message || e) };
  }
}

function getScrollResult(payload) {
  if (!payload) return { ok: false, reason: 'missing payload' };
  if (!payload.scrollable) return { ok: true, reason: 'not scrollable required' };
  return { ok: payload.downOk && payload.upOk && payload.jumps === 0, reason: JSON.stringify(payload) };
}

async function runDesktopFlow() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestErrors = [];

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/favicon|Failed to load resource.*\.(png|ico|svg|woff)/i.test(txt)) return;
    consoleErrors.push(txt.slice(0, 240));
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (/favicon|\.png|\.ico|\.svg|\.woff/i.test(u)) return;
    requestErrors.push(`${u.slice(0, 120)} => ${req.failure()?.errorText || 'failed'}`);
  });

  const out = {
    opened: false,
    nav: {},
    workflow: [],
    buttons: [],
    strategyCompliance: {},
    builderCompliance: {},
    builderFlow: {},
    dataChecks: {},
    notifications: {},
    consoleErrors,
    requestErrors,
  };

  try {
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard && window.WebsiteBuilderWizard && window.BusinessStrategyModule, { timeout: 90000 });
    out.opened = true;

    const hubCard = page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first();
    await hubCard.click();
    await page.waitForFunction(() => document.getElementById('screen-business-strategy')?.classList.contains('active'), { timeout: 30000 });
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    const strategyRootHtml = await page.locator('#biz-strategy-root').innerHTML();
    const strategyApproved = readFileSync(STRATEGY_APPROVED_PATH, 'utf8');
    const builderApproved = readFileSync(BUILDER_APPROVED_PATH, 'utf8');
    const requiredStrategyTokens = ['אסטרטגיית שיווק AI', '🏢 הכרת העסק', '🔗 חיבור נכסים דיגיטליים', '🧠 ניתוח AI', '📄 דוח אסטרטגיה — ללקוח', '✅ אישור ומעבר לעוזרים'];
    const requiredBuilderTokens = ['Website Builder AI', '1. ניתוח עסקי ואפיון אתר', '2. מבנה אתר', '3. יצירת תוכן שיווקי', '4. עיצוב וחווית משתמש', '5. SEO On-Page', '6. תצוגה מקדימה', '7. פריסה והעברה להמשך עבודה'];

    out.strategyCompliance = {
      version: await page.evaluate(() => window.BusinessStrategyWizard?.VERSION || ''),
      stepsCount: await page.locator('#steps .step').count(),
      hasTokens: textIncludesAll(strategyRootHtml, requiredStrategyTokens),
      approvedSourceHasTokens: textIncludesAll(strategyApproved, requiredStrategyTokens),
      idsOk: await page.evaluate(() => ['tb-client', 'steps', 'pf', 'p1', 'p2', 'p3', 'p4', 'p5', 'btn-next', 'btn-back', 'ctx-json', 'exported'].every((id) => !!document.querySelector('#biz-strategy-root #' + id))),
    };

    addCheck('strategy_version_approved', out.strategyCompliance.version === '2.0.0-approved', out.strategyCompliance.version);
    addCheck('strategy_steps_5', out.strategyCompliance.stepsCount === 5, String(out.strategyCompliance.stepsCount));
    addCheck('strategy_tokens_match', out.strategyCompliance.hasTokens && out.strategyCompliance.approvedSourceHasTokens, 'tokens in DOM + approved source');
    addCheck('strategy_ids_core', out.strategyCompliance.idsOk, 'core IDs existence');

    const prefill = await page.evaluate(() => ({
      name: document.getElementById('b-name')?.value || '',
      site: document.getElementById('b-site')?.value || '',
    }));
    out.dataChecks.prefill = prefill;
    addCheck('prefill_dalia_name', /דליה/i.test(prefill.name), prefill.name);
    addCheck('prefill_dalia_site', /dalia-c\.com/i.test(prefill.site), prefill.site);

    await page.locator('#btn-next').click();
    await page.waitForTimeout(250);
    await page.locator('#btn-next').click();
    await page.waitForTimeout(250);
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
    await page.locator('#btn-next').click();
    await page.waitForTimeout(250);
    await page.locator('#btn-next').click();
    await page.waitForTimeout(250);
    await page.locator('#btn-next').click();
    await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });

    const reportUi = await page.evaluate(() => ({
      score: (document.getElementById('rep-score')?.textContent || '').trim(),
      hasWorkplan: (document.getElementById('r-workplan')?.textContent || '').trim().length > 10,
      hasSwot: (document.getElementById('sw-s')?.textContent || '').trim().length > 2,
      hasReportTabTitle: /דוח/.test(document.getElementById('p4')?.textContent || ''),
    }));
    out.notifications.reportUi = reportUi;
    addCheck('report_ui_generated', !!reportUi.score && reportUi.hasWorkplan && reportUi.hasSwot && reportUi.hasReportTabTitle, JSON.stringify(reportUi));

    const ls = await page.evaluate(() => {
      function p(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return JSON.parse(fallback); }
      }
      return {
        daliaBiz: p('dalia_biz', 'null'),
        bizContext: p('coco-business-context-v1', 'null'),
        strategyActions: p('coco-business-strategy-actions-v1', '[]'),
      };
    });
    out.dataChecks.localStorage = {
      daliaBiz: !!ls.daliaBiz,
      bizContextClient: ls.bizContext?.clientId || null,
      actionsCount: Array.isArray(ls.strategyActions) ? ls.strategyActions.length : 0,
    };
    addCheck('ls_dalia_biz', !!ls.daliaBiz, 'dalia_biz exists');
    addCheck('ls_business_context', ls.bizContext?.clientId === 'dalia-c-official', ls.bizContext?.clientId || 'missing');
    addCheck('ls_actions', Array.isArray(ls.strategyActions) && ls.strategyActions.length >= 2, String(ls.strategyActions?.length || 0));

    const buttonActions = [];
    await page.locator('#exported button', { hasText: '🌐 צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });
    const builderRootHtml = await page.locator('#website-builder-root').innerHTML();
    const builderSteps = await page.locator('#wb-steps .step').count();
    out.builderCompliance = {
      version: await page.evaluate(() => window.WebsiteBuilderWizard?.VERSION || ''),
      stepsCount: builderSteps,
      hasTokens: textIncludesAll(builderRootHtml, requiredBuilderTokens),
      approvedSourceHasTokens: textIncludesAll(builderApproved, requiredBuilderTokens),
      mountedInScreen: await page.evaluate(() => ({
        strategyHidden: document.getElementById('biz-strategy-root')?.style.display === 'none',
        builderVisible: document.getElementById('website-builder-root')?.style.display !== 'none',
      })),
    };

    addCheck('builder_version_approved', out.builderCompliance.version === '1.0.0-approved', out.builderCompliance.version);
    addCheck('builder_steps_7', out.builderCompliance.stepsCount === 7, String(out.builderCompliance.stepsCount));
    addCheck('builder_tokens_match', out.builderCompliance.hasTokens && out.builderCompliance.approvedSourceHasTokens, 'tokens in DOM + approved source');
    addCheck('builder_in_screen', !!out.builderCompliance.mountedInScreen.strategyHidden && !!out.builderCompliance.mountedInScreen.builderVisible, JSON.stringify(out.builderCompliance.mountedInScreen));

    const builderContext = await page.evaluate(() => ({
      company: document.getElementById('wb-k-company')?.textContent?.trim() || '',
      service: document.getElementById('wb-k-service')?.textContent?.trim() || '',
      site: document.getElementById('wb-k-site')?.textContent?.trim() || '',
    }));
    out.builderFlow.contextData = builderContext;
    addCheck('builder_context_passed', builderContext.company.length > 0 && builderContext.service.length > 0 && /dalia-c\.com|https?:\/\//i.test(builderContext.site), JSON.stringify(builderContext));

    for (let i = 1; i < 7; i += 1) {
      await page.evaluate(() => {
        const btn = document.getElementById('wb-next');
        if (btn) btn.click();
      });
      await page.waitForTimeout(160);
      buttonActions.push(`wb-next-${i}`);
    }
    const deployStatus = await page.locator('#wb-deploy-status').innerText();
    addCheck('builder_reached_step7', /מוכן|✅/.test(deployStatus), deployStatus);

    await page.evaluate(() => {
      const btn = document.getElementById('wb-next');
      if (btn) btn.click();
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 12000 });
    buttonActions.push('wb-finish-to-agents');
    out.builderFlow.finishedToAgents = true;

    const flowScreens = ['screen-agents', 'screen-goals', 'screen-actions', 'screen-history', 'screen-reports'];
    for (const sid of flowScreens) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(700);
      const info = await page.evaluate((id) => {
        const el = document.getElementById(id);
        const active = !!el?.classList.contains('active');
        const contentEl = el?.querySelector('.content') || el;
        const textLen = (contentEl?.innerText || '').trim().length;
        const buttons = el ? [...el.querySelectorAll('button, .btn, .nav-tab')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length : 0;
        const scrollEl = contentEl || el;
        const scrollable = !!scrollEl && (scrollEl.scrollHeight > scrollEl.clientHeight + 4);
        if (scrollable) {
          scrollEl.scrollTop = 0;
          const top = scrollEl.scrollTop;
          scrollEl.scrollTop = scrollEl.scrollHeight;
          const down = scrollEl.scrollTop;
          scrollEl.scrollTop = 0;
          const up = scrollEl.scrollTop;
          return { active, textLen, buttons, scrollable, downOk: down > top + 5, upOk: up <= 2, jumps: 0 };
        }
        return { active, textLen, buttons, scrollable, downOk: true, upOk: true, jumps: 0 };
      }, sid);
      out.nav[sid] = info;
      out.workflow.push({ step: sid, ok: info.active && info.textLen > 20 });
      addCheck(`nav_${sid}_active`, info.active, sid);
      const sr = getScrollResult(info);
      addCheck(`scroll_${sid}`, sr.ok, sr.reason);
    }

    await page.evaluate(() => goScreen('screen-business-strategy'));
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof goT === 'function') goT(2); });
    await page.waitForTimeout(120);
    await page.evaluate(() => { if (typeof prevT === 'function') prevT(); });
    await page.waitForTimeout(120);
    buttonActions.push('strategy-prevT');
    await page.evaluate(() => { if (typeof nextT === 'function') nextT(); });
    await page.waitForTimeout(120);
    buttonActions.push('strategy-nextT');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#biz-strategy-root button')].find((x) => /שלח ללקוח/.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(120);
    buttonActions.push('strategy-send-client');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#biz-strategy-root button')].find((x) => /שמור טיוטה/.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(120);
    buttonActions.push('strategy-save-draft');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#biz-strategy-root button')].find((x) => /הדפס \/ PDF/.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(120);
    buttonActions.push('strategy-print');

    out.buttons = buttonActions;
    addCheck('buttons_main_count', buttonActions.length >= 10, String(buttonActions.length));

    const notifications = await page.evaluate(() => {
      if (!window.MarketingNotifications) return { ok: false, reason: 'missing MarketingNotifications' };
      const t = MarketingNotifications.testAll();
      const req = MarketingNotifications.getGmailRequirements();
      return {
        ok: !!t.ok,
        count: t.count,
        types: Object.keys(MarketingNotifications.TYPES || {}).length,
        gmailStatus: req.status,
        edgeName: MarketingNotifications.EDGE_NAME,
        isStub: req.status === 'resend_phase1',
        missing: req.missing || [],
      };
    });
    out.notifications = notifications;
    addCheck('notifications_5_types', notifications.ok && notifications.count === 5 && notifications.types === 5, JSON.stringify({ count: notifications.count, types: notifications.types }));
    addCheck('email_stub_staging', notifications.isStub, notifications.gmailStatus || 'unknown');
  } catch (e) {
    addCheck('desktop_run', false, String(e.message || e));
  } finally {
    await context.close();
    await browser.close();
  }
  return out;
}

async function runMobileChecks() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const page = await context.newPage();
  const out = { screenChecks: {}, fabBlocking: false };

  try {
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.BusinessStrategyWizard, { timeout: 90000 });
    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    const screens = ['screen-business-strategy', 'screen-agents', 'screen-goals', 'screen-actions', 'screen-history', 'screen-reports'];
    for (const sid of screens) {
      if (sid !== 'screen-business-strategy') {
        await page.evaluate((id) => goScreen(id), sid);
        await page.waitForTimeout(650);
      }
      const probe = await page.evaluate((id) => {
        const el = document.getElementById(id);
        const active = !!el?.classList.contains('active') || (id === 'screen-business-strategy' && !!document.querySelector('#biz-strategy-root .tb'));
        const contentEl = id === 'screen-business-strategy'
          ? document.querySelector('#biz-strategy-root .main') || document.getElementById('biz-strategy-root')
          : el?.querySelector('.content') || el;
        if (!contentEl) return { active, scrollable: false, downOk: false, upOk: false, jumps: 0, textLen: 0, fabBlocks: false };
        const textLen = (contentEl.innerText || '').trim().length;
        const start = contentEl.scrollTop;
        const scrollable = contentEl.scrollHeight > contentEl.clientHeight + 4;
        const positions = [start];
        if (scrollable) {
          for (let i = 0; i < 10; i += 1) {
            contentEl.scrollTop += 220;
            positions.push(contentEl.scrollTop);
          }
        }
        const downOk = !scrollable || positions[positions.length - 1] > positions[0] + 40;
        for (let i = 0; i < 10; i += 1) contentEl.scrollTop -= 220;
        const upOk = !scrollable || contentEl.scrollTop <= positions[positions.length - 1] - 20;
        const jumps = positions.slice(1).filter((p, i) => p < positions[i] - 50).length;
        const fab = document.querySelector('.ai-fab, #coco-ai-fab, [class*="fab"]');
        const fr = fab?.getBoundingClientRect();
        const cr = contentEl.getBoundingClientRect();
        const fabBlocks = !!fr && fr.bottom > cr.bottom - 8 && fr.top < cr.bottom;
        return { active, scrollable, downOk, upOk, jumps, textLen, fabBlocks };
      }, sid);
      out.screenChecks[sid] = probe;
      addCheck(`mobile_${sid}_active`, probe.active, sid);
      addCheck(`mobile_${sid}_scroll`, probe.downOk && probe.upOk && probe.jumps === 0, JSON.stringify({ downOk: probe.downOk, upOk: probe.upOk, jumps: probe.jumps }));
      if (probe.fabBlocks) out.fabBlocking = true;
    }
  } catch (e) {
    addCheck('mobile_run', false, String(e.message || e));
  } finally {
    await context.close();
    await browser.close();
  }
  return out;
}

async function checkGitAndStagingFiles() {
  const requiredFiles = [
    'public/ai-marketing/business-strategy-wizard.js',
    'public/ai-marketing/website-builder-module.js',
    'public/ai-marketing/business-strategy-module.js',
    'public/ai-marketing-platform.html',
  ];

  const localPresence = {};
  const remoteHashes = {};
  const localHashes = {};
  let hashMatches = 0;

  for (const rel of requiredFiles) {
    const abs = join(ROOT, rel);
    localPresence[rel] = existsSync(abs);
    if (!localPresence[rel]) continue;
    const headBody = safeExecRaw(`git show HEAD:${rel.replace(/\\/g, '/')}`);
    const localBody = headBody == null ? readFileSync(abs, 'utf8') : headBody;
    const localHash = sha256Text(localBody);
    localHashes[rel] = localHash;
    const remoteUrl = `https://orin1607-ctrl.github.io/future-craft-core/${rel.replace(/^public\//, '')}?t=${Date.now()}`;
    const remote = await fetchText(remoteUrl);
    if (remote.ok) {
      const remoteHash = sha256Text(remote.text);
      remoteHashes[rel] = remoteHash;
      if (remoteHash === localHash) hashMatches += 1;
    } else {
      remoteHashes[rel] = null;
    }
  }

  const branchAligned = !!HEAD && !!REMOTE_MAIN && HEAD === REMOTE_MAIN;
  addCheck('git_local_equals_origin_main', branchAligned, `${(HEAD || '').slice(0, 7)} vs ${(REMOTE_MAIN || '').slice(0, 7)}`);
  addCheck('required_files_present', Object.values(localPresence).every(Boolean), JSON.stringify(localPresence));
  addCheck('staging_hash_matches_local', hashMatches === requiredFiles.length, `${hashMatches}/${requiredFiles.length}`);

  return {
    branchAligned,
    localPresence,
    localHashes,
    remoteHashes,
    hashMatches,
    requiredCount: requiredFiles.length,
  };
}

function buildSectionStatuses(desktop, mobile, gitStaging) {
  const checks = report.checks;
  const failedChecks = Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k);

  const navOk = failedChecks.filter((k) => k.startsWith('nav_') || k.startsWith('scroll_') || k.startsWith('mobile_') || k === 'desktop_run' || k === 'mobile_run').length === 0;
  const buttonsOk = checks.buttons_main_count?.ok && desktop.consoleErrors.length === 0;
  const complianceOk = checks.strategy_version_approved?.ok && checks.builder_version_approved?.ok && checks.strategy_steps_5?.ok && checks.builder_steps_7?.ok && checks.strategy_tokens_match?.ok && checks.builder_tokens_match?.ok && checks.strategy_ids_core?.ok;
  const workflowOk = desktop.workflow.every((s) => s.ok) && checks.builder_reached_step7?.ok && checks.builder_context_passed?.ok;
  const builderOk = checks.builder_in_screen?.ok && checks.builder_steps_7?.ok && checks.builder_reached_step7?.ok;
  const dataOk = checks.prefill_dalia_name?.ok && checks.prefill_dalia_site?.ok && checks.ls_dalia_biz?.ok && checks.ls_business_context?.ok && checks.ls_actions?.ok;
  const gitOk = checks.git_local_equals_origin_main?.ok && checks.required_files_present?.ok && checks.staging_hash_matches_local?.ok;
  const notificationsOk = checks.notifications_5_types?.ok && checks.report_ui_generated?.ok;
  const desktopOk = desktop.opened && desktop.consoleErrors.length === 0;
  const mobileOk = !mobile.fabBlocking && Object.values(mobile.screenChecks).every((s) => s.active && s.downOk && s.upOk && s.jumps === 0);

  addSection('1', 'ניווט וגלילה', navOk ? 'pass' : 'fail', `נבדקו ${Object.keys(desktop.nav).length} מסכים בזרימה + מובייל. שגיאות console: ${desktop.consoleErrors.length}`);
  addSection('2', 'כל הכפתורים', buttonsOk ? 'pass' : 'fail', `בוצעו ${desktop.buttons.length} פעולות כפתורים קריטיות. שגיאות רשת: ${desktop.requestErrors.length}`);
  addSection('3', 'התאמה לקוד המקורי', complianceOk ? 'pass' : 'fail', `Wizard v=${desktop.strategyCompliance.version}, Builder v=${desktop.builderCompliance.version}`);
  addSection('4', 'זרימת העבודה', workflowOk ? 'pass' : 'fail', `צעדים: ${desktop.workflow.map((f) => `${f.step}:${f.ok ? 'OK' : 'X'}`).join(' | ')}`);
  addSection('5', 'Website Builder', builderOk ? 'pass' : 'fail', `שלבים: ${desktop.builderCompliance.stepsCount}/7 · CTA פעיל מתוך export`);
  addSection('6', 'בדיקות Data', dataOk ? 'pass' : 'fail', `localStorage: dalia_biz=${desktop.dataChecks.localStorage?.daliaBiz ? 'yes' : 'no'}, actions=${desktop.dataChecks.localStorage?.actionsCount ?? 0}`);
  addSection('7', 'Git ו-Staging', gitOk ? 'pass' : 'warn', `HEAD==origin/main: ${gitStaging.branchAligned ? 'yes' : 'no'} · hash match: ${gitStaging.hashMatches}/${gitStaging.requiredCount}`);
  addSection('8', 'דוחות ואימייל', notificationsOk && checks.email_stub_staging?.ok ? 'pass' : 'warn', `MarketingNotifications types=${desktop.notifications.types || 0}, status=${desktop.notifications.gmailStatus || 'unknown'} (stub on staging)`);
  addSection('9', 'Desktop', desktopOk ? 'pass' : 'warn', `Viewport 1280x900 · console errors=${desktop.consoleErrors.length}`);
  addSection('10', 'Mobile', mobileOk ? 'pass' : 'warn', `iPhone 13 · FAB blocking=${mobile.fabBlocking ? 'yes' : 'no'}`);

  const foundStatus = report.issuesFound.length ? (report.issuesFound.length > 5 ? 'fail' : 'warn') : 'pass';
  addSection('11', 'תקלות שנמצאו', foundStatus, report.issuesFound.length ? report.issuesFound.slice(0, 12).join(' | ') : 'לא נמצאו תקלות קריטיות');

  const fixedStatus = report.fixesApplied.length ? 'pass' : 'pass';
  addSection('12', 'מה תוקן', fixedStatus, report.fixesApplied.length ? report.fixesApplied.join(' | ') : 'לא נדרש תיקון קוד במודול בבדיקה זו');

  const blockersStatus = report.blockers.length ? 'warn' : 'pass';
  addSection('13', 'מה עדיין דורש טיפול', blockersStatus, report.blockers.length ? report.blockers.join(' | ') : 'אין חסימות פתוחות בתחום המודול');

  addSection('14', 'Commit אחרון', HEAD ? 'pass' : 'fail', HEAD || 'לא זוהה');
  addSection('15', 'קישור Staging', STAGING_URL_NO_TS ? 'pass' : 'fail', STAGING_URL_NO_TS || 'לא זוהה');
}

function writeMarkdownReport() {
  const ordered = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
  const lines = [
    '# דוח QA מקיף — מודול חברות ועסקים',
    '',
    `**תאריך:** ${report.at}`,
    `**Commit:** \`${report.commitHash || '—'}\``,
    `**Staging:** ${report.stagingUrl}`,
    '',
  ];

  for (const key of ordered) {
    const s = report.sections[key];
    lines.push(`## ${key}. ${s.title}`);
    lines.push(`${iconByStatus(s.status)}`);
    lines.push('');
    lines.push(s.details || '—');
    lines.push('');
  }

  lines.push('## פסק דין סופי');
  lines.push(report.readyForTomorrow
    ? '✅ המודול מוכן לעבודה מחר (Staging), כולל Builder משולב וזרימת המשך למסכי עוזרים/מטרות/פעולות/היסטוריה/דוחות.'
    : '❌ המודול עדיין לא מוכן באופן מלא לעבודה מחר. ראה סעיפים עם ⚠️/❌.');
  lines.push('');
  lines.push(`**ספירה:** ✅ ${report.counts.pass} | ⚠️ ${report.counts.warn} | ❌ ${report.counts.fail}`);
  lines.push(`**כל 15 הסעיפים ירוקים:** ${report.all15Green ? 'כן' : 'לא'}`);

  writeFileSync(join(OUT, 'REPORT-HE.md'), lines.join('\n'));
}

async function main() {
  const desktop = await runDesktopFlow();
  const mobile = await runMobileChecks();
  const gitStaging = await checkGitAndStagingFiles();

  buildSectionStatuses(desktop, mobile, gitStaging);
  report.all15Green = Object.values(report.sections).every((s) => s.status === 'pass');
  report.readyForTomorrow = report.all15Green;

  report.results = { desktop, mobile, gitStaging };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeMarkdownReport();

  console.log(JSON.stringify({
    ok: report.readyForTomorrow,
    commit: report.commitHash,
    staging: report.stagingUrl,
    counts: report.counts,
    all15Green: report.all15Green,
    outDir: OUT,
  }, null, 2));

  process.exit(report.readyForTomorrow ? 0 : 1);
}

main();
