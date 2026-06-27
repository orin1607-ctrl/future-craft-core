/**
 * Page SEO checklist runner — read-only audit of dalia-c.com pages.
 * Updates site-work-plan.json + PROGRESS-REPORT.md (Staging SSOT).
 * Does NOT modify the live site.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parsePage } from './_lib/html-parse.mjs';
import { P001 } from './_lib/config.mjs';

const PLAN_PATH = join(P001.root, 'public', 'project-001', 'site-work-plan.json');
const OUT_DIR = join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit');
const PROGRESS_MD = join(OUT_DIR, 'PROGRESS-REPORT.md');

export const CHECKLIST_KEYS = [
  'title', 'meta', 'h1', 'h2', 'canonical', 'alt', 'internalLinks', 'schema', 'cta', 'mobile', 'pageSpeed', 'seo',
];

const LABELS = {
  title: 'Title',
  meta: 'Meta Description',
  h1: 'H1',
  h2: 'H2',
  canonical: 'Canonical',
  alt: 'Alt תמונות',
  internalLinks: 'קישורים פנימיים',
  schema: 'Schema',
  cta: 'CTA',
  mobile: 'Mobile',
  pageSpeed: 'PageSpeed',
  seo: 'SEO כללי',
};

function normUrl(u) {
  try {
    const url = new URL(u);
    return url.href.replace(/\/$/, '') || url.href;
  } catch {
    return u;
  }
}

function evaluateChecklist(parsed, html, finalUrl, isConversion) {
  const checks = {};
  const fixes = {};

  const title = parsed.title || '';
  checks.title = title.length >= 15 && title.length <= 70 ? 'pass' : title ? 'fail' : 'fail';
  if (checks.title === 'fail') {
    fixes.title = 'ניהול צי רכב ותחזוקה לעסקים | דליה — dalia-c.com';
  }

  const meta = parsed.metaDescription || '';
  checks.meta = meta.length >= 50 && meta.length <= 165 ? 'pass' : meta ? 'fail' : 'fail';
  if (checks.meta === 'fail') {
    fixes.meta = meta
      ? 'לקצר/למקד Meta ל-120–155 תווים עם CTA'
      : 'דליה — פתרונות תפעול, תחזוקה וניהול צי רכב לעסקים. ניסיון של 20+ שנה. ייעוץ ללא עלות.';
  }

  checks.h1 = parsed.h1 && parsed.h1.trim().length > 3 ? 'pass' : 'fail';
  if (checks.h1 === 'fail') {
    fixes.h1 = 'דליה — פתרונות תפעול ותחזוקה לרכב לעסקים';
  }

  checks.h2 = (parsed.h2 || []).length >= 2 ? 'pass' : (parsed.h2 || []).length === 1 ? 'fail' : 'fail';
  if (checks.h2 === 'fail') {
    fixes.h2 = 'להוסיף לפחות 2 כותרות H2 עם מילות מפתח (שירותים, יתרונות, CTA)';
  }

  const canon = parsed.canonical || '';
  const canonOk = canon && normUrl(canon) === normUrl(finalUrl);
  checks.canonical = canonOk ? 'pass' : canon ? 'fail' : 'fail';
  if (checks.canonical === 'fail') {
    fixes.canonical = finalUrl.split('?')[0];
  }

  const missingAlt = parsed.imagesMissingAlt || 0;
  checks.alt = missingAlt === 0 ? 'pass' : missingAlt <= 3 ? 'fail' : 'fail';
  if (checks.alt === 'fail') {
    fixes.alt = `להוסיף alt ל-${missingAlt} תמונות (תיאור בעברית + מילת מפתח)`;
  }

  const internalCount = (parsed.internalLinks || []).length;
  checks.internalLinks = internalCount >= 5 ? 'pass' : internalCount >= 2 ? 'fail' : 'fail';
  if (checks.internalLinks === 'fail') {
    fixes.internalLinks = 'להוסיף קישורים פנימיים ל: /catalog/, /contact/, /our-app/, /about/, שירותים';
  }

  checks.schema = (parsed.schema || []).length > 0 ? 'pass' : 'fail';
  if (checks.schema === 'fail') {
    fixes.schema = 'WebPage + Organization JSON-LD (WordPress/Yoast)';
  }

  const ctaRx = /צור קשר|התקשר|whatsapp|tel:|השאר פרטים|שלח|לקבלת|הצטרפ|טופס|form|wpcf7|elementor-button/i;
  checks.cta = ctaRx.test(html) ? 'pass' : 'fail';
  if (checks.cta === 'fail' && isConversion) {
    fixes.cta = 'כפתור CTA בולט + טופס/טלפון מעל הקיפול';
  }

  checks.mobile = /viewport/i.test(html) ? 'pass' : 'fail';
  if (checks.mobile === 'fail') {
    fixes.mobile = '<meta name="viewport" content="width=device-width, initial-scale=1">';
  }

  checks.pageSpeed = 'pending';

  const seoPass = ['title', 'meta', 'h1', 'canonical'].every((k) => checks[k] === 'pass');
  checks.seo = seoPass && checks.schema === 'pass' ? 'pass' : 'fail';

  return { checks, fixes, stats: { internalCount, missingAlt, h2Count: (parsed.h2 || []).length } };
}

async function fetchPageSpeed(url) {
  try {
    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    const res = await fetch(api, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return { status: 'pending', score: null, note: `PSI HTTP ${res.status}` };
    const data = await res.json();
    const score = data.lighthouseResult?.categories?.performance?.score;
    const pct = score != null ? Math.round(score * 100) : null;
    return {
      status: pct != null && pct >= 50 ? 'pass' : pct != null ? 'fail' : 'pending',
      score: pct,
      note: pct != null ? `Mobile performance ${pct}/100` : 'no score',
    };
  } catch (e) {
    return { status: 'pending', score: null, note: e.message };
  }
}

async function auditPage(browser, pageDef) {
  const context = await browser.newContext({ locale: 'he-IL', userAgent: 'DaliaCO-Checklist/1.0' });
  const tab = await context.newPage();
  const res = await tab.goto(pageDef.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const status = res?.status() || 0;
  const html = await tab.content();
  const finalUrl = tab.url();
  await context.close();

  if (status >= 400) {
    return { httpStatus: status, error: `HTTP ${status}`, checks: Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, 'fail'])) };
  }

  const parsed = parsePage(html, finalUrl);
  const isConversion = /contact|צור-קשר|79-shekels|שאלון|registration|form|catalog|our-app/i.test(pageDef.path || '');
  const { checks, fixes, stats } = evaluateChecklist(parsed, html, finalUrl, isConversion);

  const psi = await fetchPageSpeed(finalUrl);
  checks.pageSpeed = psi.status;
  if (psi.status === 'fail') fixes.pageSpeed = `לשפר ביצועים (נוכחי ${psi.score}/100): דחיסת תמונות, lazy-load, CSS קריטי`;
  if (psi.status === 'pending') fixes.pageSpeed = fixes.pageSpeed || 'להריץ PageSpeed Insights ידנית לאחר יישום תיקונים';

  return {
    httpStatus: status,
    finalUrl,
    parsed: { title: parsed.title, metaDescription: parsed.metaDescription, h1: parsed.h1, h2Count: stats.h2Count },
    checks,
    fixes,
    pageSpeedScore: psi.score,
    pageSpeedNote: psi.note,
  };
}

function countChecks(checks) {
  const total = CHECKLIST_KEYS.length;
  const pass = CHECKLIST_KEYS.filter((k) => checks[k] === 'pass').length;
  const fail = CHECKLIST_KEYS.filter((k) => checks[k] === 'fail').length;
  const pending = CHECKLIST_KEYS.filter((k) => checks[k] === 'pending').length;
  return { total, pass, fail, pending, pct: Math.round((pass / total) * 100) };
}

function allPassed(checks) {
  return CHECKLIST_KEYS.every((k) => checks[k] === 'pass');
}

function writeFixSpec(plan, pageDef) {
  const dir = join(OUT_DIR, 'page-fixes');
  mkdirSync(dir, { recursive: true });
  const lines = [
    `# תיקונים נדרשים — ${pageDef.path}`,
    '',
    `**עמוד:** ${pageDef.url}`,
    `**סטטוס:** ${pageDef.executionStatus}`,
    `**Checklist:** ${pageDef.checklistSummary?.pass}/${pageDef.checklistSummary?.total}`,
    '',
    '## Checklist',
    '',
  ];
  for (const k of CHECKLIST_KEYS) {
    const st = pageDef.checklist?.[k] || 'pending';
    const icon = st === 'pass' ? '✅' : st === 'fail' ? '❌' : '⏳';
    lines.push(`- ${icon} **${LABELS[k]}**`);
    if (pageDef.fixes?.[k]) lines.push(`  - → ${pageDef.fixes[k]}`);
  }
  lines.push('', '---', '*יישום ב-WordPress/Yoast — ללא שינוי עיצוב*');
  const fp = join(dir, `${pageDef.id}.md`);
  writeFileSync(fp, lines.join('\n'), 'utf8');
  return fp;
}

function buildProgressMarkdown(plan) {
  const s = plan.summary;
  const lines = [
    '# דוח התקדמות — עמודים עסקיים',
    '',
    `**עודכן:** ${plan.lastUpdated || plan.generatedAt}`,
    `**שלב:** ${plan.phase}`,
    `**התקדמות כוללת:** ${s.progressPercent || 0}% (${s.pagesCompleted || 0}/${s.pageCount} עמודים הושלמו · ${s.pagesInProgress || 0} בביצוע)`,
    `**Checklist:** ${s.checklistPass || 0}/${s.checklistTotal || 0} בדיקות עברו`,
    '',
    '## עמודים לפי סדר עדיפות',
    '',
    '| # | עמוד | סטטוס | Checklist | PageSpeed |',
    '|---|------|--------|-----------|-----------|',
  ];
  for (const p of plan.pages.sort((a, b) => a.rank - b.rank)) {
    const c = p.checklistSummary || {};
    lines.push(`| ${p.rank} | ${p.path} | ${p.executionStatus || 'pending'} | ${c.pass || 0}/${c.total || 12} (${c.pct || 0}%) | ${p.pageSpeedScore ?? '—'} |`);
  }
  lines.push('', '## עמוד נוכחי', '');
  const cur = plan.pages.find((p) => p.executionStatus === 'in_progress' || p.executionStatus === 'blocked');
  if (cur) {
    lines.push(`**${cur.path}** — ${cur.title || ''}`, '');
    for (const k of CHECKLIST_KEYS) {
      const st = cur.checklist?.[k] || 'pending';
      const icon = st === 'pass' ? '✅' : st === 'fail' ? '❌' : '⏳';
      lines.push(`- ${icon} **${LABELS[k]}:** ${st}${cur.fixes?.[k] ? ' → ' + cur.fixes[k] : ''}`);
    }
  } else {
    lines.push('אין עמוד בביצוע כרגע.');
  }
  lines.push('', '---', '*Read-only audit — שינויים באתר החי דורשים יישום ב-WordPress*');
  return lines.join('\n');
}

function appendLog(plan, entry) {
  plan.progressLog = plan.progressLog || [];
  plan.progressLog.unshift(entry);
  plan.activity = plan.activity || [];
  plan.activity.unshift({
    id: entry.id || 'log-' + Date.now(),
    title: entry.event || entry.title,
    action: entry.type || 'checklist',
    module: 'SEO',
    detail: entry.detail || entry.pagePath || '',
    created_at: entry.at || new Date().toISOString(),
  });
}

function recomputeSummary(plan) {
  const pages = plan.pages || [];
  let checklistPass = 0;
  let checklistTotal = 0;
  let pagesCompleted = 0;
  let pagesInProgress = 0;
  for (const p of pages) {
    const c = p.checklistSummary || countChecks(p.checklist || {});
    p.checklistSummary = c;
    checklistPass += c.pass;
    checklistTotal += c.total;
    if (p.executionStatus === 'done') pagesCompleted++;
    if (p.executionStatus === 'in_progress' || p.executionStatus === 'blocked') pagesInProgress++;
  }
  plan.summary = {
    ...plan.summary,
    checklistPass,
    checklistTotal,
    pagesCompleted,
    pagesInProgress,
    progressPercent: pages.length ? Math.round((pagesCompleted / pages.length) * 100) : 0,
  };
}

/** Priority batch: conversion + core (ranks 1–7) */
export function priorityPageIds(plan) {
  return plan.pages.filter((p) => p.rank <= 7).sort((a, b) => a.rank - b.rank);
}

export async function runChecklist(options = {}) {
  const { singlePageId, maxPages = 1, stopOnIncomplete = true } = options;
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  plan.phase = 'execution_audit';
  plan.note = 'ביצוע checklist read-only — תיקונים מתועדים, יישום ב-WordPress';

  let targets = plan.pages.sort((a, b) => a.rank - b.rank);
  if (singlePageId) targets = targets.filter((p) => p.id === singlePageId);
  else targets = targets.filter((p) => p.executionStatus !== 'done').slice(0, maxPages);

  if (!targets.length) {
    console.log('No pages to process.');
    return plan;
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let processed = 0;

  for (const pageDef of targets) {
    console.log(`\nAuditing #${pageDef.rank} ${pageDef.path} ...`);
    pageDef.executionStatus = 'in_progress';
    pageDef.startedAt = new Date().toISOString();

    const result = await auditPage(browser, pageDef);
    pageDef.lastAuditAt = new Date().toISOString();
    pageDef.checklist = result.checks || {};
    pageDef.fixes = result.fixes || {};
    pageDef.pageSpeedScore = result.pageSpeedScore;
    pageDef.pageSpeedNote = result.pageSpeedNote;
    pageDef.checklistSummary = countChecks(pageDef.checklist);
    writeFixSpec(plan, pageDef);

    appendLog(plan, {
      id: 'audit-' + pageDef.id + '-' + Date.now(),
      type: 'checklist_audit',
      event: `Checklist: ${pageDef.path}`,
      pagePath: pageDef.path,
      detail: `${pageDef.checklistSummary.pass}/${pageDef.checklistSummary.total} pass`,
      at: pageDef.lastAuditAt,
    });

    const action = plan.actions.find((a) => a.pageId === pageDef.id);
    if (action) {
      action.checklist = pageDef.checklist;
      action.checklistSummary = pageDef.checklistSummary;
      action.status = allPassed(pageDef.checklist) ? 'done' : 'in_progress';
    }

    if (allPassed(pageDef.checklist)) {
      pageDef.executionStatus = 'done';
      pageDef.completedAt = new Date().toISOString();
      appendLog(plan, {
        type: 'page_complete',
        event: `הושלם: ${pageDef.path}`,
        pagePath: pageDef.path,
        detail: 'כל הבדיקות עברו',
        at: pageDef.completedAt,
      });
      console.log(`  ✅ ALL PASS — page marked done`);
    } else {
      pageDef.executionStatus = 'blocked';
      pageDef.blockers = CHECKLIST_KEYS.filter((k) => pageDef.checklist[k] === 'fail' || pageDef.checklist[k] === 'pending');
      console.log(`  ⏸ ${pageDef.checklistSummary.pass}/${pageDef.checklistSummary.total} pass — blocked: ${pageDef.blockers.join(', ')}`);
      if (stopOnIncomplete) {
        console.log('  Stopping — next page only after all checks pass.');
        processed++;
        break;
      }
    }
    processed++;
  }

  await browser.close();

  plan.lastUpdated = new Date().toISOString();
  recomputeSummary(plan);
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PROGRESS_MD, buildProgressMarkdown(plan), 'utf8');
  console.log(`\nProgress: ${plan.summary.progressPercent}% | Checklist ${plan.summary.checklistPass}/${plan.summary.checklistTotal}`);
  console.log('Written:', PROGRESS_MD);
  return plan;
}

const isMain = process.argv[1]?.includes('page-checklist-runner');
if (isMain) {
  const pageId = process.argv.find((a) => a.startsWith('--page='))?.split('=')[1];
  const all = process.argv.includes('--all');
  runChecklist({ singlePageId: pageId, maxPages: all ? 28 : 1, stopOnIncomplete: !all }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
