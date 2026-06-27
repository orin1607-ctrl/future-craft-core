/**
 * Build 33-business-page work plan for Staging marketing system (read-only — no live site changes).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';

const INDEX = join(P001.root, 'public', 'project-001', 'site-pages-index.json');
const AUDIT = join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit', 'report.json');
const OUT = join(P001.root, 'public', 'project-001', 'site-work-plan.json');
const MD = join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit', 'BUSINESS-WORK-PLAN.md');

function normPath(url) {
  try {
    const p = decodeURIComponent(new URL(url).pathname.replace(/\/$/, '') || '/');
    return p.toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function tier(path) {
  const p = path.toLowerCase();
  if (p === '/' || p === '/home') return 1;
  if (/catalog|contact|our-app|about|צור-קשר|השירותים|79-shekels|מגוון-חבילות/.test(p)) return 1;
  if (/service|how-it-works|ניהול-צי|תחזוק|המערכת|האפליקציה|our-app/.test(p)) return 2;
  if (/שאלון|האם-|איך-|תפעול-רכב|ליסינג/.test(p)) return 3;
  if (/my-account|registration|card-provider|עמוד-ספק/.test(p)) return 4;
  return 3;
}

function conversionRole(path) {
  const p = path.toLowerCase();
  if (/contact|צור-קשר|registration|שאלון|79-shekels|card-provider/.test(p)) return 'high';
  if (/catalog|our-app|המערכת|האפליקציה|מגוון|home|\/$/.test(p)) return 'medium';
  return 'low';
}

function contentStatus(page) {
  const issues = page.issues || [];
  const score = page.seoScore || 5;
  if (issues.includes('missing_h1') && !page.h1) return 'חלש — חסר H1';
  if (issues.some((x) => x.startsWith('missing_meta'))) return 'בינוני — חסר Meta';
  if (score >= 6 && page.h1 && page.metaDescription) return 'טוב — בסיס תקין';
  if (score <= 4) return 'חלש — דורש שיפור תוכן';
  return 'בינוני — ניתן לשפר';
}

function conversionStatus(page) {
  const role = conversionRole(page.path || page.url);
  const views = page.ga4Views || 0;
  if (role === 'high') return views > 0 ? `גבוה — ${views} צפיות, דף המרה` : 'פוטנציאל גבוה — דף המרה ללא תנועה';
  if (role === 'medium') return views > 10 ? `בינוני-גבוה — ${views} צפיות` : 'בינוני — דורש CTA חזק יותר';
  return views > 0 ? `נמוך — ${views} צפיות (תוכן)` : 'נמוך — תוכן מידעי';
}

function estimateFixHours(page) {
  let h = 0.5;
  const issues = page.issues || [];
  if (issues.includes('missing_h1')) h += 0.5;
  if (issues.some((x) => x.includes('missing_meta'))) h += 0.5;
  const alt = issues.find((x) => x.startsWith('images_without_alt'));
  if (alt) h += Math.min(2, parseInt(alt.split(':')[1] || '3', 10) * 0.1);
  if (issues.includes('canonical_mismatch')) h += 1;
  if ((page.seoScore || 5) <= 4) h += 2;
  if (tier(page.path) === 1) h += 1;
  return Math.round(h * 2) / 2;
}

function rankScore(page) {
  let s = 0;
  s += (page.ga4Views || 0) * 3;
  s += (page.gsc?.clicks || 0) * 15;
  s += (page.gsc?.impressions || 0) * 0.8;
  s += (10 - (page.seoScore || 5)) * 8;
  s += (5 - tier(page.path)) * 25;
  const cr = conversionRole(page.path);
  if (cr === 'high') s += 40;
  if (cr === 'medium') s += 20;
  return Math.round(s);
}

function missingList(page, ai) {
  const out = [...(ai?.missing || [])];
  if (!page.h1 && !out.some((x) => /h1/i.test(x))) out.push('H1');
  if (!page.metaDescription && !out.some((x) => /meta/i.test(x))) out.push('Meta Description');
  (page.issues || []).forEach((i) => {
    if (i.startsWith('images_without_alt')) out.push('Alt לתמונות (' + i.split(':')[1] + ')');
    if (i === 'canonical_mismatch') out.push('Canonical');
  });
  return [...new Set(out)];
}

function improveList(page, ai) {
  return [...new Set([...(ai?.improvements || []), ...(ai?.opportunities || []).slice(0, 2)])].slice(0, 4);
}

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const audit = JSON.parse(readFileSync(AUDIT, 'utf8'));
const auditMap = new Map(audit.pages.map((p) => [normPath(p.url), p]));

const seen = new Set();
const pages = [];
for (const p of index.pages.business) {
  const key = normPath(p.url);
  if (seen.has(key)) continue;
  seen.add(key);
  const full = auditMap.get(key) || p;
  const ai = full.ai || {};
  const path = p.path || key;
  const item = {
    id: 'page-' + String(pages.length + 1).padStart(2, '0'),
    url: p.url,
    path,
    title: p.title || full.title,
    rank: 0,
    tier: tier(path),
    seoScore: p.seoScore ?? ai.seoScore ?? null,
    contentStatus: contentStatus({ ...p, ...full }),
    conversionStatus: conversionStatus({ ...p, path }),
    missing: missingList({ ...p, ...full }, ai),
    improvements: improveList({ ...p, ...full }, ai),
    estimateHours: estimateFixHours({ ...p, ...full, path }),
    estimateLabel: '',
    gsc: p.gsc || full.gsc,
    ga4Views: p.ga4Views || 0,
    issues: p.issues || full.issues || [],
    aiSummary: ai.summary || '',
    priority: ai.priority || p.priority || 'בינוני',
    _rankScore: rankScore({ ...p, path }),
  };
  item.estimateLabel = item.estimateHours <= 1 ? 'עד שעה' : item.estimateHours <= 2 ? '1–2 שעות' : item.estimateHours <= 4 ? '2–4 שעות' : '4+ שעות';
  pages.push(item);
}

pages.sort((a, b) => b._rankScore - a._rankScore);
pages.forEach((p, i) => {
  p.rank = i + 1;
  delete p._rankScore;
});

const campaign = index.campaign;
const now = new Date().toISOString();

const goals = pages.slice(0, 10).map((p, i) => ({
  id: 'goal-' + p.id,
  title: 'SEO + המרות: ' + (p.title || p.path).slice(0, 60),
  status: i < 3 ? 'active' : 'pending',
  category: 'SEO',
  priority: p.rank <= 5 ? 'גבוה' : p.rank <= 15 ? 'בינוני' : 'נמוך',
  pageId: p.id,
  pagePath: p.path,
}));

const actions = pages.map((p) => ({
  id: 'act-' + p.id,
  title: 'תוכנית עבודה: ' + (p.title || p.path).slice(0, 55),
  status: 'pending',
  urgency: p.rank <= 5 ? 'גבוה' : p.rank <= 15 ? 'בינוני' : 'נמוך',
  source: 'אבחון dalia-c.com',
  category: 'SEO',
  pageId: p.id,
  pagePath: p.path,
  pageUrl: p.url,
  estimateHours: p.estimateHours,
  missing: p.missing,
  improvements: p.improvements,
  campaignId: campaign.id,
}));

const activity = [
  {
    id: 'log-plan-created',
    title: 'נוצרה תוכנית עבודה ל-33 עמודים עסקיים',
    action: 'work_plan_created',
    module: 'SEO',
    detail: 'אבחון read-only — ללא שינוי באתר החי',
    created_at: now,
  },
  {
    id: 'log-campaign-bound',
    title: 'dalia-c.com מחובר לקמפיין: ' + campaign.name,
    action: 'campaign_connected',
    module: 'Marketing',
    detail: 'Project 001 · יוני אטיאס',
    created_at: now,
  },
];

const plan = {
  version: 1,
  generatedAt: now,
  phase: 'planning_only',
  note: 'תוכנית עבודה — אין לבצע שינויים באתר החי עד אישור',
  campaign,
  summary: {
    pageCount: pages.length,
    totalEstimateHours: pages.reduce((s, p) => s + p.estimateHours, 0),
    avgSeoScore: Math.round((pages.reduce((s, p) => s + (p.seoScore || 0), 0) / pages.length) * 10) / 10,
    tier1: pages.filter((p) => p.tier === 1).length,
    tier2: pages.filter((p) => p.tier === 2).length,
    tier3: pages.filter((p) => p.tier === 3).length,
    tier4: pages.filter((p) => p.tier === 4).length,
  },
  pages,
  goals,
  actions,
  activity,
  progressLog: [
    { at: now, event: 'plan_built', pages: pages.length, by: 'system', note: 'תוכנית ראשונית — ממתין לאישור' },
  ],
};

writeFileSync(OUT, JSON.stringify(plan, null, 2));

const md = [
  '# תוכנית עבודה — 33 עמודים עסקיים (dalia-c.com)',
  '',
  `**נוצר:** ${now}`,
  `**שלב:** תכנון בלבד — **לא** בוצעו שינויים באתר החי`,
  `**קמפיין:** ${campaign.name}`,
  `**סה"כ שעות משוערות:** ${plan.summary.totalEstimateHours}`,
  '',
  '## סדר עדיפות',
  '',
  '| # | עמוד | SEO | תוכן | המרות | זמן |',
  '|---|------|-----|------|--------|-----|',
  ...pages.map((p) =>
    `| ${p.rank} | ${p.path} | ${p.seoScore}/10 | ${p.contentStatus.split('—')[0].trim()} | ${p.conversionStatus.split('—')[0].trim()} | ${p.estimateLabel} |`,
  ),
  '',
  ...pages.flatMap((p) => [
    `## ${p.rank}. ${p.title || p.path}`,
    '',
    `- **URL:** ${p.url}`,
    `- **ציון SEO:** ${p.seoScore}/10`,
    `- **מצב תוכן:** ${p.contentStatus}`,
    `- **מצב המרות:** ${p.conversionStatus}`,
    `- **חסר:** ${p.missing.join(' · ') || '—'}`,
    `- **לשפר:** ${p.improvements.join(' · ') || '—'}`,
    `- **זמן משוער:** ${p.estimateLabel} (${p.estimateHours} שעות)`,
    p.aiSummary ? `- **${p.aiSummary}**` : '',
    '',
  ]),
].join('\n');

mkdirSync(join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit'), { recursive: true });
writeFileSync(MD, md, 'utf8');

console.log('Pages (deduped):', pages.length);
console.log('Total hours:', plan.summary.totalEstimateHours);
console.log('Written:', OUT);
