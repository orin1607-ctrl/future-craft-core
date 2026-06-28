/**
 * Build copy-paste implementation package for a page (Staging only — no live site edits).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';
import { CHECKLIST_KEYS, runChecklist } from './page-checklist-runner.mjs';

const PLAN_PATH = join(P001.root, 'public', 'project-001', 'site-work-plan.json');
const OUT_DIR = join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit');

const PACKAGES = {
  'page-01': {
    title: 'ניהול צי רכב ותחזוקה לעסקים | דליה',
    meta: 'דליה — פתרונות ניהול צי, תחזוקה ותפעול רכב לעסקים וחברות בישראל. מעל 20 שנות ניסיון. ייעוץ מקצועי חינם + חודש ראשון במתנה. צרו קשר.',
    wp: [
      'WordPress → עמוד הבית → Yoast SEO (או Rank Math)',
      'Title: הדבק את ה-Title המומלץ',
      'Meta Description: הדבק את ה-Meta המומלץ',
      'Elementor: לכל תמונה ללא alt → Advanced → Alt Text (25 תמונות)',
      'שמור ופרסם — הרץ: npm run project-001:checklist -- --page=page-01',
    ],
    altNote: '25 תמונות ללא alt — עדכון ב-Elementor Image widget, בלי שינוי עיצוב',
  },
};

function charCount(s) {
  return [...s].length;
}

function appendLog(plan, entry) {
  plan.progressLog = plan.progressLog || [];
  plan.progressLog.unshift({ ...entry, at: entry.at || new Date().toISOString() });
  plan.activity = plan.activity || [];
  plan.activity.unshift({
    id: entry.id || 'log-' + Date.now(),
    title: entry.event,
    action: entry.type || 'implementation',
    module: 'SEO',
    detail: entry.detail || '',
    created_at: entry.at || new Date().toISOString(),
  });
}

function buildImplementationMd(page, pkg) {
  const titleLen = charCount(pkg.title);
  const metaLen = charCount(pkg.meta);
  return [
    `# חבילת יישום — ${page.path}`,
    '',
    `**עמוד:** ${page.url}`,
    `**סטטוס checklist:** ${page.checklistSummary?.pass}/${page.checklistSummary?.total}`,
    '',
    '## Title (Yoast)',
    '',
    '```',
    pkg.title,
    '```',
    `(${titleLen} תווים — יעד 30–60)`,
    '',
    '## Meta Description (Yoast)',
    '',
    '```',
    pkg.meta,
    '```',
    `(${metaLen} תווים — יעד 120–155)`,
    '',
    '## Alt תמונות',
    '',
    pkg.altNote || '—',
    '',
    '## שלבי WordPress',
    '',
    ...pkg.wp.map((s, i) => `${i + 1}. ${s}`),
    '',
    '---',
    '*לא משנה עיצוב — SEO בלבד*',
  ].join('\n');
}

function main() {
  const pageId = process.argv.find((a) => a.startsWith('--page='))?.split('=')[1] || 'page-01';
  const pkg = PACKAGES[pageId];
  if (!pkg) {
    console.error('No package for', pageId);
    process.exit(1);
  }

  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  const page = plan.pages.find((p) => p.id === pageId);
  if (!page) {
    console.error('Page not found', pageId);
    process.exit(1);
  }

  page.implementationPackage = {
    readyAt: new Date().toISOString(),
    title: { value: pkg.title, chars: charCount(pkg.title) },
    meta: { value: pkg.meta, chars: charCount(pkg.meta) },
    alt: { count: 25, note: pkg.altNote },
    wpSteps: pkg.wp,
  };
  page.executionStatus = 'awaiting_implementation';
  page.fixes = {
    ...page.fixes,
    title: pkg.title,
    meta: pkg.meta,
  };

  appendLog(plan, {
    id: 'impl-' + pageId + '-' + Date.now(),
    type: 'implementation_ready',
    event: `חבילת תיקון מוכנה: ${page.path}`,
    detail: `Title ${charCount(pkg.title)} תווים · Meta ${charCount(pkg.meta)} תווים · ממתין ליישום WP`,
  });

  plan.lastUpdated = new Date().toISOString();
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));

  const fixDir = join(OUT_DIR, 'page-fixes');
  mkdirSync(fixDir, { recursive: true });
  writeFileSync(join(fixDir, `${pageId}-IMPLEMENT.md`), buildImplementationMd(page, pkg), 'utf8');

  console.log('Implementation package ready:', pageId);
  console.log('Title:', pkg.title, `(${charCount(pkg.title)} chars)`);
  console.log('Meta:', pkg.meta, `(${charCount(pkg.meta)} chars)`);
}

const reaudit = process.argv.includes('--reaudit');
if (reaudit) {
  const pageId = process.argv.find((a) => a.startsWith('--page='))?.split('=')[1];
  runChecklist({ singlePageId: pageId, maxPages: 1, stopOnIncomplete: true }).then(() => process.exit(0));
} else {
  main();
}
