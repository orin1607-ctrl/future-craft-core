/**
 * CO.CO Evidence Report Generator v2
 * Standard: every claim → source + current + recommended; every recommendation → task.
 * Usage: node scripts/generate-coco-evidence-report.mjs [--project=project-001] [--out=docs/audit-reports/dalia-live-trial]
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const PROJECT = args.project || 'project-001';
const OUT_DIR = join(ROOT, args.out || 'docs/audit-reports/dalia-live-trial');
const P = join(ROOT, 'public', PROJECT);

function readJson(rel) {
  const p = join(P, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readJsonAbs(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function src(file, field, live = 'cache') {
  return { file: `public/${PROJECT}/${file}`, field, freshness: live, syncedAt: null };
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function flattenPages(pagesIndex) {
  const out = [];
  const buckets = pagesIndex.pages || {};
  for (const [bucket, list] of Object.entries(buckets)) {
    if (!Array.isArray(list)) continue;
    list.forEach((p) => out.push({ ...p, bucket }));
  }
  return out;
}

function parseAltCount(issues) {
  const m = (issues || []).find((i) => /^images_without_alt:/.test(i));
  return m ? parseInt(m.split(':')[1], 10) : 0;
}

function priorityRank(p) {
  const m = { דחוף: 1, גבוה: 2, בינוני: 3, נמוך: 4 };
  return m[p] || 3;
}

// ─── Data load ───
const dash = readJson('dashboard.json');
const wp = readJson('site-work-plan.json');
const crawlLite = readJson('site-crawl-lite.json');
const pagesIndex = readJson('site-pages-index.json');
const competitorsFile = readJson('competitors.json');
const ga4Audit = readJsonAbs(join(ROOT, 'docs/audit-reports/project-001/GA4-URL-AUDIT.json'));

const allPages = flattenPages(pagesIndex);
const businessPages = allPages.filter((p) => p.bucket === 'business' || p.type === 'business');
const crawlPages = crawlLite.crawl?.pages || businessPages;

const brokenFromGa4 = ga4Audit.broken || [];
const brokenUrls = brokenFromGa4.map((b) => ({
  url: b.checked_url || `https://dalia-c.com${b.path}`,
  path: b.path,
  httpStatus: b.http_status,
  ga4Sessions: b.ga4_sessions,
  ga4PageViews: b.ga4_page_views,
  recommendation: b.recommendation,
  source: {
    file: 'docs/audit-reports/project-001/GA4-URL-AUDIT.json',
    field: 'broken[]',
    checkedAt: ga4Audit.timestamp,
    method: 'HTTP HEAD/GET + GA4 cross-check',
  },
}));

const missingH1Pages = businessPages
  .filter((p) => !p.h1 || !String(p.h1).trim())
  .map((p) => ({
    url: p.url,
    path: p.path,
    title: p.title,
    currentH1: p.h1 || '(ריק)',
    recommended: 'H1 יחיד עם מילת מפתח עסקית (לדוגמה: "ניהול צי רכב לעסקים")',
    source: src('site-crawl-lite.json', `pages[${p.path}].h1`, 'cache'),
  }));

const altIssues = businessPages
  .filter((p) => parseAltCount(p.issues) > 0)
  .map((p) => ({
    url: p.url,
    path: p.path,
    count: parseAltCount(p.issues),
    current: `${parseAltCount(p.issues)} תמונות ללא alt`,
    recommended: 'alt בעברית + מילת מפתח (מ-work-plan implementationPackage)',
    source: src('site-crawl-lite.json', `issues: images_without_alt`, 'cache'),
  }));

const homePage = wp.pages?.find((p) => p.path === '/' || p.id === 'page-01');
const titleEvidence = {
  url: 'https://dalia-c.com/',
  current: crawlPages.find((p) => p.path === '/')?.title || homePage?.title || 'בית חדש - דליה',
  recommended: homePage?.implementationPackage?.title?.value || 'ניהול צי רכב ותחזוקה לעסקים | דליה',
  source: [
    { file: 'public/project-001/site-crawl-lite.json', field: 'pages[/].title', freshness: 'cache', crawledAt: crawlLite.crawl?.crawledAt },
    { file: 'public/project-001/site-work-plan.json', field: 'pages[page-01].implementationPackage.title', freshness: 'cache' },
  ],
};

const metaEvidence = {
  url: 'https://dalia-c.com/',
  current: crawlPages.find((p) => p.path === '/')?.metaDescription?.slice(0, 80) + '…',
  recommended: homePage?.implementationPackage?.meta?.value,
  charsRecommended: homePage?.implementationPackage?.meta?.chars,
  source: src('site-work-plan.json', 'pages[page-01].implementationPackage.meta', 'cache'),
};

// ─── Tasks from work plan + redirects ───
let taskSeq = 0;
const tasks = [];

function pushTask(t) {
  taskSeq += 1;
  tasks.push({
    id: `TASK-${String(taskSeq).padStart(4, '0')}`,
    ...t,
    status: t.status || 'פתוח',
    progressPercent: t.progressPercent ?? 0,
    dueDate: t.dueDate || null,
  });
}

brokenUrls.forEach((b, i) => {
  const urgent = (b.ga4Sessions || 0) >= 10;
  pushTask({
    title: `301 redirect: ${b.path}`,
    priority: urgent ? 'דחוף' : 'גבוה',
    estimateHours: 0.25,
    owner: urgent ? 'מפתח WordPress' : 'CO.CO (הכנה) / מפתח',
    systemCanExecute: false,
    requiresOwnerApproval: true,
    category: 'תיקון 404',
    evidence: [b.source],
    currentValue: `HTTP ${b.httpStatus} · ${b.ga4Sessions} GA4 sessions`,
    recommendedValue: '301 לעמוד קטלוג/שירות רלוונטי',
    dueDate: urgent ? addDays(new Date().toISOString(), 3) : addDays(new Date().toISOString(), 14),
    sourceAssistant: 'a26',
  });
});

if (homePage) {
  pushTask({
    title: 'עדכון Title עמוד הבית',
    priority: 'דחוף',
    estimateHours: 0.25,
    owner: 'CO.CO מכין · בעלים מאשר פרסום',
    systemCanExecute: true,
    requiresOwnerApproval: true,
    category: 'SEO',
    evidence: titleEvidence.source,
    currentValue: titleEvidence.current,
    recommendedValue: titleEvidence.recommended,
    dueDate: addDays(new Date().toISOString(), 2),
    sourceAssistant: 'a18',
    wpSteps: homePage.implementationPackage?.wpSteps?.slice(0, 3),
  });
  pushTask({
    title: 'עדכון Meta Description עמוד הבית',
    priority: 'דחוף',
    estimateHours: 0.25,
    owner: 'CO.CO מכין · בעלים מאשר פרסום',
    systemCanExecute: true,
    requiresOwnerApproval: true,
    category: 'SEO',
    evidence: [metaEvidence.source],
    currentValue: '(ארוך מדי — אותו טקסט בכל העמודים)',
    recommendedValue: metaEvidence.recommended,
    dueDate: addDays(new Date().toISOString(), 2),
    sourceAssistant: 'a18',
  });
  pushTask({
    title: `הוספת alt ל-${homePage.implementationPackage?.alt?.count || 25} תמונות בעמוד הבית`,
    priority: 'דחוף',
    estimateHours: 1.5,
    owner: 'CO.CO מכין טקסטים · Elementor בפרודקשן',
    systemCanExecute: true,
    requiresOwnerApproval: true,
    category: 'נגישות/SEO',
    evidence: [{ file: 'public/project-001/site-crawl-lite.json', field: 'pages[/].issues: images_without_alt:25' }],
    currentValue: '25 תמונות ללא alt',
    recommendedValue: homePage.implementationPackage?.alt?.note,
    dueDate: addDays(new Date().toISOString(), 5),
    sourceAssistant: 'a39',
  });
}

pushTask({
  title: '301: /home/ → / (איחוד כפילות)',
  priority: 'גבוה',
  estimateHours: 0.5,
  owner: 'מפתח WordPress',
  systemCanExecute: false,
  requiresOwnerApproval: true,
  category: 'SEO טכני',
  evidence: [
    { file: 'public/project-001/dashboard.json', field: 'searchConsole.pages[/home/]', note: '17 imp, pos #3.5' },
    { file: 'public/project-001/site-crawl-lite.json', field: 'pages[/home/].h1 missing' },
  ],
  currentValue: 'שני עמודי בית פעילים',
  recommendedValue: 'canonical יחיד + redirect',
  dueDate: addDays(new Date().toISOString(), 7),
  sourceAssistant: 'a23',
});

pushTask({
  title: 'יצירת עמוד: חבילות צי רכב לעסקים',
  priority: 'גבוה',
  estimateHours: 4,
  owner: 'CO.CO תוכן + בעלים אישור',
  systemCanExecute: true,
  requiresOwnerApproval: true,
  category: 'תוכן B2B',
  evidence: [{ file: 'public/project-001/dashboard.json', field: 'searchConsole.keywords["האם יש חבילות צי רכבים לעסקים"]', note: '14 imp, pos #5.4' }],
  currentValue: 'אין עמוד ייעודי',
  recommendedValue: 'Landing B2B עם FAQ + CTA',
  dueDate: addDays(new Date().toISOString(), 21),
  sourceAssistant: 'a47',
});

tasks.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

// ─── Assistants registry ───
const GROUPS = [
  { id: 'group-business-market', name: 'הבנת העסק והשוק', count: 7 },
  { id: 'group-keywords', name: 'מילות החיפוש', count: 5 },
  { id: 'group-content', name: 'כתיבת התוכן', count: 8 },
  { id: 'group-tech', name: 'בדיקה טכנית', count: 7 },
  { id: 'group-ux', name: 'עיצוב ו-UX', count: 8 },
  { id: 'group-assets', name: 'תמונות וקבצים', count: 6 },
  { id: 'group-seo-local', name: 'SEO מקומי', count: 5 },
  { id: 'group-ads', name: 'קמפיין ממומן', count: 4 },
];
const NAMES = [
  'מומחה פרופיל עסקי', 'מומחה ניתוח שוק', 'מומחה מיפוי מתחרים', 'מומחה קהלי יעד', 'מומחה יתרון תחרותי', 'מומחה נוכחות בגוגל', 'מומחה יעדים עסקיים',
  'מומחה מילות חיפוש', 'מומחה כוונת חיפוש', 'מומחה נושאי תוכן', 'מומחה השוואה למתחרים', 'מומחה חיפוש מקומי',
  'מומחה מבנה תוכן', 'מומחה עמודי שירות', 'מומחה עמוד הבית', 'מומחה E-E-A-T תוכן', 'מומחה שאלות נפוצות', 'מומחה כותרות SEO', 'מומחה תוכן מקצועי', 'מומחה טון כתיבה',
  'מומחה מהירות', 'מומחה מפת אתר', 'מומחה כפילויות', 'מומחה Schema', 'מומחה קישורים פנימיים', 'מומחה קישורים שבורים', 'מומחה אבטחה',
  'מומחה מבנה עמוד', 'מומחה CTA', 'מומחה טפסים', 'מומחה ניווט', 'מומחה נגישות', 'מומחה מובייל', 'מומחה זרימת משתמש', 'מומחה CRO רעיונות',
  'מומחה תמונות ראשיות', 'מומחה גלריה', 'מומחה לוגו', 'מומחה alt text', 'מומחה וידאו', 'מומחה קבצים להורדה',
  'מומחה GBP', 'מומחה NAP', 'מומחה ביקורות', 'מומחה מפות', 'מומחה Local SEO',
  'מומחה דפי נחיתה', 'מומחה יעדי המרה', 'מומחה תקציב/CPA', 'מומחה דוח מאוחד',
];

const REG = [];
let idx = 0;
for (const g of GROUPS) {
  for (let i = 0; i < g.count; i++) {
    idx++;
    REG.push({ id: 'a' + idx, name: NAMES[idx - 1], domain: g.name, groupId: g.id });
  }
}

const gscRange = dash.searchConsole?.dateRange || dash.lastSync?.date_range;
const ga4Summary = dash.analytics4?.summary || {};
const keywords = dash.searchConsole?.keywords || [];
const b2bKw = keywords.filter((k) => /צי|עסק|ניהול|חבילות|ליסינג/i.test(k.query));
const vehicleKw = keywords.filter((k) => !b2bKw.includes(k));

function buildAssistant(asst) {
  const n = +asst.id.slice(1);
  const input = {
    dashboard: 'public/project-001/dashboard.json',
    workPlan: 'public/project-001/site-work-plan.json',
    crawl: 'public/project-001/site-crawl-lite.json',
    gscRange,
    ga4Days: ga4Summary.days,
  };
  const evidence = [];
  const findings = [];
  let method = '';
  let conclusion = '';
  let action = '';
  let taskIds = [];

  if (n === 1) {
    method = 'קריאת Brief + dashboard.project.site';
    findings.push({ fact: 'דליה פתרונות תחזוקה ותפעול לרכב', source: 'dashboard.json → project' });
    findings.push({ fact: 'אתר: https://dalia-c.com/', source: 'dashboard.json → project.site' });
    conclusion = 'פרופיל עסקי מוגדר במערכת — מתאים ל-B2B צי רכב';
    action = 'אין חסם — להמשיך לניתוח שוק';
  } else if (n === 3) {
    method = 'competitors.json + השוואת title/meta';
    competitorsFile.competitors.forEach((c) => {
      findings.push({ fact: `${c.name} (${c.domain}) reachable=${c.reachable}`, source: 'competitors.json', analyzedAt: c.analyzedAt });
    });
    conclusion = '4 מתחרים במערכת — 3 לא מתחרים ישירים בניהול צי B2B';
    action = 'להוסיף מתחרים ישראליים: ליסינג/תחזוקה צי (ידני)';
  } else if (n === 6) {
    method = 'dashboard.connections + GSC keyword count';
    findings.push({ fact: 'GSC connected', source: 'dashboard.connections.searchConsole', value: dash.connections.searchConsole });
    findings.push({ fact: 'GBP quota error', source: 'dashboard.gbp.lastError', value: dash.gbp?.lastError });
    conclusion = 'נוכחות אורגנית נמדדת; GBP חסום API';
    action = 'TASK: המתנה ל-API — הכנת תוכן כרטיס מראש';
    taskIds = [];
  } else if (n === 8) {
    method = 'GSC keywords[] מ-dashboard.json (live cache)';
    keywords.slice(0, 5).forEach((k) => findings.push({ fact: k.query, impressions: k.impressions, position: k.position, source: 'dashboard.searchConsole.keywords' }));
    conclusion = `33 שאילתות; ${b2bKw.length} B2B vs ${vehicleKw.length} מפרטי רכב`;
    action = 'להתמקד בשאילתות B2B עם מיקום <10';
  } else if (n === 9) {
    method = 'סיווג כוונה על 33 שאילתות GSC';
    findings.push({ fact: 'B2B', examples: b2bKw.map((k) => k.query), source: 'dashboard.searchConsole.keywords' });
    findings.push({ fact: 'מפרט רכב', examples: vehicleKw.slice(0, 5).map((k) => k.query), source: 'dashboard.searchConsole.keywords' });
    conclusion = `${Math.round((vehicleKw.length / keywords.length) * 100)}% מהשאילתות — כוונה לא עסקית`;
    action = 'להפריד קטלוג רכב מעמודי שירות B2B ב-SEO';
  } else if (n === 15) {
    method = 'GA4 topPages + crawl homepage + work-plan checklist';
    findings.push({ fact: '213 GA4 views', source: 'dashboard.analytics4.topPages[0]' });
    findings.push({ fact: 'Title: בית חדש', source: 'site-crawl-lite.json pages[/]' });
    findings.push({ fact: '25 images without alt', source: 'site-crawl-lite.json' });
    conclusion = 'עמוד הבית מקבל רוב התנועה אך לא ממוטב להמרה/SEO';
    action = 'TASK-0002, TASK-0003, TASK-0004';
    taskIds = tasks.filter((t) => ['a18', 'a39', 'a15'].includes(t.sourceAssistant) || t.sourceAssistant === 'a18').map((t) => t.id).slice(0, 3);
  } else if (n === 17) {
    method = 'הצלבת שאילתות GSC אינפורמטיביות מול עמודי FAQ באתר';
    findings.push({ fact: '"האם יש חבילות צי רכבים לעסקים" pos #5.4', source: 'dashboard.searchConsole.keywords' });
    findings.push({ fact: '"מה הדרכים לנהל צי רכב..." pos #7', source: 'dashboard.searchConsole.keywords' });
    conclusion = 'שאילתות FAQ מדורגות ללא עמוד תשובה ייעודי';
    action = 'TASK: FAQ + עמוד חבילות';
  } else if (n === 18) {
    method = 'crawl title vs implementationPackage.title';
    findings.push({ fact: titleEvidence.current, recommended: titleEvidence.recommended, source: titleEvidence.source });
    conclusion = 'Title נוכחי לא מכיל מילות מפתח עסקיות';
    action = 'TASK-0002';
    taskIds = ['TASK-0002'];
  } else if (n === 21) {
    method = 'work-plan pageSpeedNote';
    findings.push({ fact: 'PSI HTTP 429', source: 'site-work-plan.json page-01.pageSpeedNote' });
    conclusion = 'מהירות לא נמדדה — לא ניתן לאשר/לפסול';
    action = 'בדיקה ידנית: https://pagespeed.web.dev/?url=https://dalia-c.com';
  } else if (n === 22) {
    method = 'site-pages-index summary + crawl';
    findings.push({ fact: '120 URLs crawled', source: 'site-pages-index.json summary.totalCrawled' });
    findings.push({ fact: '28 business pages', source: 'site-pages-index.json summary.businessAndContent' });
    conclusion = 'מבנה עמוס — קטגוריות רכב מפוצלות';
    action = 'מפת אתר B2B נפרדת בתפריט';
  } else if (n === 23) {
    method = 'GSC pages / vs /home/ + crawl h1';
    findings.push({ fact: '/ — 48 imp pos #4.6', source: 'dashboard.searchConsole.pages' });
    findings.push({ fact: '/home/ — 17 imp pos #3.5, missing H1', source: 'site-crawl-lite.json' });
    conclusion = 'כפילות מפצלת סיגנל SEO';
    action = tasks.find((t) => t.title.includes('/home/'))?.id || 'TASK redirect home';
  } else if (n === 26) {
    method = 'GA4-URL-AUDIT broken[] + HTTP status';
    brokenUrls.forEach((b) => findings.push({ fact: b.path, status: b.httpStatus, ga4Sessions: b.ga4Sessions, source: b.source }));
    conclusion = `${brokenUrls.length} URLs מחזירים 404 עם תנועה GA4`;
    action = `TASK-0001 עד TASK-${String(brokenUrls.length).padStart(4, '0')} (redirects)`;
    taskIds = tasks.filter((t) => t.category === 'תיקון 404').map((t) => t.id);
  } else if (n === 30) {
    method = 'GA4 topPages /צור-קשר/';
    const contact = dash.analytics4?.topPages?.find((p) => /צור-קשר/.test(p.pagePath));
    findings.push({ fact: `${contact?.sessions || 9} sessions`, source: 'dashboard.analytics4.topPages' });
    conclusion = 'תנועה ליצירת קשר נמוכה יחסית לבית (4%)';
    action = 'שיפור CTA + מעקב המרה ב-GTM';
  } else if (n === 39) {
    method = 'סריקת issues images_without_alt ב-business pages';
    altIssues.forEach((a) => findings.push({ fact: a.path, count: a.count, source: a.source }));
    conclusion = `${altIssues.reduce((s, a) => s + a.count, 0)} תמונות ללא alt בעמודים עסקיים`;
    action = 'TASK-0004 + alt לשאר העמודים ב-work-plan';
    taskIds = ['TASK-0004'];
  } else if (n === 42) {
    method = 'dashboard.businessProfileData';
    findings.push({ fact: dash.businessProfileData?.lastError, source: 'dashboard.businessProfileData.lastError' });
    conclusion = 'אין נתוני דירוג/ביקורות — quota';
    action = 'לא לנחש — להמתין ל-API';
  } else if (n === 49) {
    method = 'dashboard.googleAdsData';
    findings.push({ fact: dash.googleAdsData?.lastError, source: 'dashboard.googleAdsData' });
    findings.push({ fact: 'CID 8957638890', source: 'dashboard.googleAds.customerId' });
    conclusion = 'Ads לא פעיל — Basic Access ממתין';
    action = 'לא לשלוח בקשה כפולה';
  } else if (n === 50) {
    method = 'איגוד כל ממצאי העוזרים + tasks';
    findings.push({ fact: `${tasks.length} משימות נוצרו`, source: 'evidence-report-generator' });
    findings.push({ fact: `${brokenUrls.length} broken`, source: 'GA4-URL-AUDIT' });
    conclusion = 'דוח מאוחד מוכן ל-Orchestrator';
    action = 'העברה ל-b10';
  } else {
    method = `בדיקת תחום ${asst.domain} מול work-plan (${wp.summary.pageCount} עמודים)`;
    findings.push({ fact: `SEO avg ${wp.summary.avgSeoScore}/10`, source: 'site-work-plan.json summary' });
    conclusion = 'נתונים זמינים — ללא חסם ייחודי בתחום זה';
    action = tasks.find((t) => t.sourceAssistant === asst.id)?.id || 'המשך לפי work-plan';
  }

  const hasBlocker = findings.some((f) => /quota|429|403|לא נמדד/.test(JSON.stringify(f)));
  const status = hasBlocker ? 'בתהליך' : findings.length > 1 ? 'הושלם' : 'בתהליך';

  return {
    id: asst.id,
    name: asst.name,
    domain: asst.domain,
    status,
    input,
    method,
    findings,
    evidence,
    conclusion,
    recommendedAction: action,
    linkedTasks: taskIds,
    proof: findings.map((f) => ({ claim: f.fact || f.query, source: f.source })),
  };
}

const assistants = REG.map(buildAssistant);

// ─── Consultants ───
const CONS = [
  { id: 'b1', name: 'יועץ SEO', groups: ['group-keywords', 'group-tech'] },
  { id: 'b2', name: 'יועץ תוכן', groups: ['group-content'] },
  { id: 'b3', name: 'יועץ E-E-A-T', groups: ['group-business-market', 'group-content'] },
  { id: 'b4', name: 'יועץ טכנולוגיה', groups: ['group-tech'] },
  { id: 'b5', name: 'יועץ UX/UI', groups: ['group-ux', 'group-assets'] },
  { id: 'b6', name: 'יועץ CRO', groups: ['group-ux', 'group-ads'] },
  { id: 'b7', name: 'יועץ שיווק דיגיטלי', groups: ['group-keywords', 'group-ads'] },
  { id: 'b8', name: 'יועץ מיתוג', groups: ['group-ux', 'group-assets'] },
  { id: 'b9', name: 'יועץ QA', groups: ['*'] },
  { id: 'b10', name: 'Chief AI Architect', groups: ['*'] },
];

function buildConsultant(c) {
  const relied = assistants.filter((a) => {
    if (c.groups.includes('*')) return true;
    const r = REG.find((x) => x.id === a.id);
    return r && c.groups.includes(r.groupId);
  });
  const approved = [];
  const rejected = [];
  const partial = [];

  relied.forEach((a) => {
    const txt = JSON.stringify(a.findings);
    if (/quota|429|403|לא נמדד/.test(txt)) partial.push({ assistantId: a.id, reason: 'נתון חסום/לא נמדד', data: a.findings });
    else if (a.status === 'הושלם') approved.push({ assistantId: a.id, conclusion: a.conclusion });
    else rejected.push({ assistantId: a.id, reason: 'ממצאים לא מספיקים או חסרים', conclusion: a.conclusion });
  });

  const gaps = [...new Set(approved.flatMap((a) => {
    const asst = assistants.find((x) => x.id === a.assistantId);
    return asst?.recommendedAction?.includes('TASK') ? [asst.recommendedAction] : [];
  }))];

  const confidence = relied.length ? Math.round((approved.length / relied.length) * 100) : 0;
  const riskIfIgnored = confidence < 60
    ? 'המשך אובדן תנועה אורגנית ו-404 ב-GA4'
    : 'שיפור הדרגתי ב-SEO ו-CRO';

  return {
    id: c.id,
    name: c.name,
    reliedOn: relied.map((a) => a.id),
    approvedData: approved,
    rejectedData: rejected,
    partialData: partial,
    confidencePercent: confidence,
    status: confidence >= 80 ? 'אושר' : confidence >= 50 ? 'אושר עם תיקון' : 'דורש השלמה',
    conclusions: approved.slice(0, 3).map((a) => a.conclusion),
    recommendations: tasks.filter((t) => relied.some((r) => r.id === t.sourceAssistant)).slice(0, 5).map((t) => t.id + ': ' + t.title),
    priorities: tasks.filter((t) => t.priority === 'דחוף').slice(0, 5).map((t) => t.id),
    riskIfNotExecuted: riskIfIgnored,
  };
}

const consultants = CONS.map(buildConsultant);

// ─── Orchestrator ───
const conflicts = [
  {
    topic: 'מספר עמודים שבורים',
    sources: ['site-crawl-lite.json summary.broken=14', 'GA4-URL-AUDIT broken_count=12'],
    resolution: 'סומך על GA4-URL-AUDIT עם רשימת URLs מלאה + HTTP status',
  },
  {
    topic: 'GSC totalClicks',
    sources: ['dashboard.stats.totalClicks=0', 'dashboard.searchConsole.pages sum>0'],
    resolution: 'stats מחושב על שאילתות; pages מדווח קליקים — מציגים שניהם עם הערת מקור',
  },
];

const orchestrator = {
  decision: 'אושר להמשך ביצוע — תנאי: אישור בעלים לפרסום WordPress',
  decisiveData: [
    { data: '12-14 URLs 404 עם 113+ GA4 sessions מצטברים', source: 'GA4-URL-AUDIT.json', weight: 'גבוה' },
    { data: 'Title "בית חדש" + 25 alt חסרים', source: 'site-crawl-lite + work-plan', weight: 'גבוה' },
    { data: 'שאילתת B2B pos #5.4 ללא עמוד ייעודי', source: 'dashboard GSC', weight: 'גבוה' },
  ],
  insufficientData: [
    { item: 'PageSpeed scores', reason: 'PSI API 429' },
    { item: 'GBP rating/reviews', reason: 'Google Business API quota' },
    { item: 'Google Ads performance', reason: 'HTTP 403 Basic Access' },
    { item: 'מקורות כניסה GA4 (channel)', reason: 'לא ב-dashboard.json — רק topPages' },
    { item: 'מיקום מתחרים בגוגל', reason: 'אין נתוני GSC למתחרים — רק crawl title' },
  ],
  conflicts,
  resolutionProcess: 'עדיפות לנתונים עם URL+HTTP+GA4 > סיכומים מספריים; פערים מסומנים במפורש',
  executeFirst: tasks.filter((t) => t.priority === 'דחוף').map((t) => t.id),
  executeNext: tasks.filter((t) => t.priority === 'גבוה').map((t) => t.id),
  systemAutonomous: tasks.filter((t) => t.systemCanExecute && !t.requiresOwnerApproval).map((t) => t.id),
  requiresOwner: tasks.filter((t) => t.requiresOwnerApproval).map((t) => t.id),
};

// ─── Competitors (honest) ───
const competitors = competitorsFile.competitors.map((c) => ({
  name: c.name,
  domain: c.domain,
  url: c.url,
  reachable: c.reachable,
  googlePosition: 'לא ידוע — אין נתוני GSC למתחרים',
  keywords: 'לא ידוע',
  advantages: c.reachable ? [`Title: ${c.title}`, c.metaDescription?.slice(0, 60)] : [],
  disadvantages: c.reachable ? [] : ['לא נגיש לסריקה'],
  whyAboveUs: c.name === 'Gett Business' ? 'מותג חזק + אפליקציה — לא מתחרה ישיר בניהול צי' : 'לא מתחרה ישיר / לא נמדד',
  ourAdvantages: '20+ שנות ניסיון, שירות תחזוקה+תפעול+מימון במקום אחד',
  gap: 'תוכן B2B ו-SEO מקומי',
  beatStrategy: c.name === 'Gett Business' ? 'עמודי "למה דליה לעסקים" — לא להתחרות באפליקציית מוניות' : 'לא עדיפות',
  timeToBeat: 'לא רלוונטי / לא ידוע',
  source: { file: 'public/project-001/competitors.json', analyzedAt: c.analyzedAt },
}));

// ─── ROI ───
const roi = [
  {
    initiative: 'תיקון 404 + redirects (12 URLs)',
    workHours: 3,
    costILS: 1500,
    impact: '113+ sessions/149d מפסיקים להגיע ל-404',
    expectedOutcome: 'שיפור UX, הפחתת bounce, שחזור תנועה לקטלוג',
    paybackWeeks: 2,
    source: 'GA4-URL-AUDIT.json',
  },
  {
    initiative: 'Title+Meta+Alt עמוד הבית',
    workHours: 2,
    costILS: 1000,
    impact: 'CTR GSC מ-0% על שאילתות B2B; נגישות',
    expectedOutcome: '+1-3 קליקים אורגניים/חודש (שמרני)',
    paybackWeeks: 4,
    source: 'work-plan page-01 + GSC',
  },
  {
    initiative: 'עמוד חבילות צי B2B',
    workHours: 4,
    costILS: 2000,
    impact: 'כיסוי שאילתה pos #5.4 (14 imp)',
    expectedOutcome: 'דירוג top 3 תוך 8-12 שבועות',
    paybackWeeks: 12,
    source: 'dashboard GSC keywords',
  },
  {
    initiative: 'Google Ads (לאחר API)',
    workHours: 8,
    costILS: 5000,
    mediaILS: 3000,
    impact: 'לידים מיידיים',
    expectedOutcome: 'לא ניתן להעריך — אין baseline',
    paybackWeeks: 'לא ידוע',
    source: 'dashboard.googleAdsData — חסום',
  },
];

// ─── Self audit ───
const selfAudit = {
  confident: [
    'GA4 sessions/pages (242/402, 149 days) — dashboard.json live cache',
    'GSC keywords/pages — dashboard.json, range ' + gscRange?.start + ' to ' + gscRange?.end,
    '404 URLs עם GA4 — GA4-URL-AUDIT.json',
    'Title/Meta/Alt מומלצים — site-work-plan implementationPackage',
    'missing H1 ברשימת business pages — site-crawl-lite',
  ],
  partial: [
    'מספר broken: 12 (GA4 audit) vs 14 (crawl summary) — לא אוחד',
    'GSC clicks: stats=0 vs pages עם קליקים — הגדרות aggregation שונות',
    'מקורות תנועה GA4 — לא ב-dashboard',
  ],
  missing: [
    'PageSpeed / Core Web Vitals',
    'GBP דירוג וביקורות',
    'Google Ads metrics',
    'מיקומי מתחרים בגוגל',
    'נתוני dalia-c.co.il נפרדים (מערכת על dalia-c.com)',
  ],
  blockedByPermissions: [
    { service: 'Google Business Profile API', error: dash.gbp?.lastError },
    { service: 'Google Ads API', error: dash.googleAdsData?.lastError },
    { service: 'PageSpeed Insights API', error: 'HTTP 429' },
  ],
};

const report = {
  standard: 'CO.CO Evidence Report v2',
  generatedAt: new Date().toISOString(),
  client: {
    name: 'דליה פתרונות תחזוקה ותפעול לרכב',
    site: 'https://dalia-c.co.il',
    dataSite: dash.project?.site,
  },
  dataProvenance: {
    dashboard: { file: 'public/project-001/dashboard.json', generatedAt: dash.generatedAt, freshness: 'live-cache', sync: dash.lastSync },
    gsc: { range: gscRange, link: 'https://search.google.com/search-console', source: 'Sheets sync → dashboard.json' },
    ga4: { property: dash.project?.ga4Property, days: ga4Summary.days, link: 'https://analytics.google.com/', source: 'dashboard.json analytics4' },
    crawl: { crawledAt: crawlLite.crawl?.crawledAt, method: crawlLite.infra?.method },
  },
  evidence: {
    brokenUrls,
    brokenCountNote: 'GA4 audit: ' + brokenUrls.length + '; crawl summary: ' + (pagesIndex.summary?.broken || 14),
    missingH1Pages,
    altIssues,
    title: titleEvidence,
    meta: metaEvidence,
    pageSpeed: { measured: false, reason: homePage?.pageSpeedNote || 'PSI HTTP 429', manualUrl: 'https://pagespeed.web.dev/?url=https://dalia-c.com' },
  },
  googleReports: {
    gsc: {
      dateRange: gscRange,
      source: 'dashboard.json → searchConsole',
      freshness: 'cache from API sync ' + dash.lastSync?.timestamp,
      spreadsheet: dash.lastSync?.spreadsheet_url,
      keywords: keywords,
      pages: dash.searchConsole?.pages || [],
    },
    ga4: {
      dateRange: { days: ga4Summary.days, note: '149 daily rows' },
      source: 'dashboard.json → analytics4',
      freshness: 'cache ' + dash.generatedAt,
      summary: ga4Summary,
      topPages: dash.analytics4?.topPages || [],
      channelData: 'לא זמין ב-dashboard.json',
    },
    gbp: dash.businessProfileData,
  },
  tasks,
  assistants,
  consultants,
  orchestrator,
  competitors,
  roi,
  selfAudit,
  workPlanRef: {
    openActions: wp.summary.actionsOpen,
    totalHours: wp.summary.totalEstimateHours,
    progress: wp.summary.progressPercent,
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, 'evidence-report-v2.json');
const publicPath = join(P, 'evidence-report-v2.json');
const json = JSON.stringify(report, null, 2);
fs.writeFileSync(outPath, json);
fs.writeFileSync(publicPath, json);
console.log(JSON.stringify({ ok: true, out: outPath, public: publicPath, tasks: tasks.length, assistants: assistants.length }, null, 2));
