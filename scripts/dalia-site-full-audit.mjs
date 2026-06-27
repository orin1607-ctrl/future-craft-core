/**
 * Full dalia-c.com audit — Playwright crawl + GSC/GA4 merge + ChatGPT per-page analysis.
 * Read-only. No site changes.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parsePage, auditPageIssues } from './project-001/_lib/html-parse.mjs';
import { loadOpenAIKey } from './ai-marketing/_lib/openai-env.mjs';
import { P001 } from './project-001/_lib/config.mjs';

const SITE = 'https://dalia-c.com';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'dalia-site-full-audit');
mkdirSync(OUT, { recursive: true });

function loadDashboard() {
  const p = join(P001.root, 'public', 'project-001', 'dashboard.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

function normalizeUrl(u) {
  try {
    const url = new URL(u, SITE);
    if (url.hostname.replace(/^www\./, '') !== 'dalia-c.com') return null;
    return url.href.replace(/\/$/, '') || url.href;
  } catch {
    return null;
  }
}

function ga4PathToUrl(path) {
  if (!path || path === '/') return `${SITE}/`;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE}${encodeURI(decodeURI(p))}`.replace(/\/$/, '') || `${SITE}/`;
}

function mergeMetrics(pages, dash) {
  const gscMap = new Map();
  for (const row of dash.searchConsole?.pages || []) {
    gscMap.set(normalizeUrl(row.page), row);
  }
  const ga4Map = new Map();
  for (const row of dash.analytics4?.topPages || []) {
    ga4Map.set(normalizeUrl(ga4PathToUrl(row.pagePath)), row);
  }
  for (const p of pages) {
    const key = normalizeUrl(p.url);
    p.gsc = gscMap.get(key) || null;
    p.ga4 = ga4Map.get(key) || null;
    p.clicks = p.gsc?.clicks ?? 0;
    p.impressions = p.gsc?.impressions ?? 0;
    p.position = p.gsc?.position ?? null;
    p.ga4Views = p.ga4?.screenPageViews ?? 0;
    p.ga4Sessions = p.ga4?.screenPageViews ?? p.ga4?.sessions ?? 0;
  }
  return pages;
}

function scorePriority(p) {
  let s = 0;
  s += (p.clicks || 0) * 10;
  s += (p.impressions || 0) * 0.5;
  s += (p.ga4Views || 0) * 2;
  if (p.position != null && p.position <= 10) s += 20;
  if (p.issues?.length) s += p.issues.length * 3;
  if (/\/(home|catalog|our-app|contact|about|form|צור-קשר|עלינו)/i.test(p.url)) s += 15;
  if (/elementor|category|mdsl|skoda|hyundai|seat|santa/i.test(p.url)) s += 5;
  return Math.round(s);
}

async function crawlWithPlaywright(seedUrls, maxPages = 120) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; DaliaCO-CO-Crawler/1.0; +https://dalia-c.com)',
    locale: 'he-IL',
  });
  const page = await context.newPage();
  const seen = new Set();
  const queue = [...new Set([SITE + '/', ...seedUrls])];
  const pages = [];
  const errors = [];

  while (queue.length && pages.length < maxPages) {
    const raw = queue.shift();
    const key = normalizeUrl(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    try {
      const res = await page.goto(raw, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = res?.status() || 0;
      const html = await page.content();
      const finalUrl = page.url();
      const parsed = auditPageIssues(parsePage(html, finalUrl), status);
      pages.push({
        ...parsed,
        httpStatus: status,
        finalUrl,
        crawledAt: new Date().toISOString(),
      });

      if (status < 400) {
        for (const link of parsed.internalLinks) {
          const lk = normalizeUrl(link);
          if (lk && !seen.has(lk)) queue.push(link);
        }
      }
      process.stdout.write(`  crawled ${pages.length}: ${finalUrl.slice(0, 70)}\n`);
    } catch (e) {
      errors.push({ url: raw, error: e.message });
    }
  }

  await browser.close();
  return { pages, errors, pageCount: pages.length };
}

async function chatgptAnalyzePage(page, key) {
  const payload = {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    h1: page.h1,
    h2: page.h2?.slice(0, 5),
    issues: page.issues,
    wordCount: page.wordCount,
    gsc: page.gsc ? { clicks: page.clicks, impressions: page.impressions, position: page.position } : null,
    ga4Views: page.ga4Views,
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: `אתה מומחה SEO ל-dalia-c.com (ניהול צי רכב B2B). ענה בעברית בלבד. JSON בלבד:
{"seoScore":1-10,"status":"טוב|בינוני|חלש","missing":[],"improvements":[],"opportunities":[],"priority":"גבוה|בינוני|נמוך","summary":"משפט אחד"}`,
        },
        {
          role: 'user',
          content: `נתח עמוד:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content || '';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { summary: text.slice(0, 200), parseError: true };
  } catch {
    return { summary: text.slice(0, 300), parseError: true };
  }
}

async function chatgptWorkPlan(pages, key) {
  const top = pages.slice(0, 20).map((p) => ({
    url: p.url,
    title: p.title,
    priority: p.priorityScore,
    seoScore: p.ai?.seoScore,
    issues: p.issues,
    opportunities: p.ai?.opportunities,
  }));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: 'מנהל SEO ל-dalia-c.com. ענה בעברית. תוכנית עבודה מסודרת ל-30 יום — שלבים, עדיפויות, KPI. Markdown.',
        },
        { role: 'user', content: `עמודים מנותחים (${pages.length}):\n${JSON.stringify(top, null, 2)}` },
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function buildMarkdown(report) {
  const lines = [
    '# דוח אבחון מלא — dalia-c.com',
    '',
    `**תאריך:** ${report.generatedAt}`,
    `**עמודים שנסרקו:** ${report.pageCount}`,
    `**GSC מחובר:** ${report.connections.gsc ? '✅' : '❌'} | **GA4:** ${report.connections.ga4 ? '✅' : '❌'}`,
    '',
    '## סיכום מנהלים',
    '',
    report.executiveSummary,
    '',
    '## מדדים כלליים',
    '',
    `| מדד | ערך |`,
    `|-----|-----|`,
    ...Object.entries(report.summary).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## עמודים לפי עדיפות קידום (Top 15)',
    '',
  ];
  for (const p of report.pages.slice(0, 15)) {
    lines.push(`### ${p.title || p.url}`);
    lines.push(`- **URL:** ${p.url}`);
    lines.push(`- **ציון SEO (AI):** ${p.ai?.seoScore ?? '—'}/10 · **סטטוס:** ${p.ai?.status ?? '—'}`);
    lines.push(`- **GSC:** ${p.clicks} קליקים, ${p.impressions} חשיפות, מיקום ${p.position ?? '—'}`);
    lines.push(`- **GA4:** ${p.ga4Views} צפיות`);
    lines.push(`- **בעיות טכניות:** ${p.issues?.join(', ') || 'אין'}`);
    lines.push(`- **חסר:** ${(p.ai?.missing || []).join('; ') || '—'}`);
    lines.push(`- **לשפר:** ${(p.ai?.improvements || []).join('; ') || '—'}`);
    lines.push(`- **הזדמנויות:** ${(p.ai?.opportunities || []).join('; ') || '—'}`);
    lines.push(`- **${p.ai?.summary || ''}**`);
    lines.push('');
  }
  lines.push('## כל העמודים שנמצאו', '');
  lines.push('| # | עמוד | GSC קליקים | חשיפות | GA4 | בעיות |');
  lines.push('|---|------|------------|--------|-----|-------|');
  report.pages.forEach((p, i) => {
    lines.push(`| ${i + 1} | ${p.url.replace(SITE, '')} | ${p.clicks} | ${p.impressions} | ${p.ga4Views} | ${p.issues?.length || 0} |`);
  });
  lines.push('', '## תוכנית עבודה (ChatGPT)', '', report.workPlan);
  return lines.join('\n');
}

console.log('\n=== dalia-c.com Full Site Audit ===\n');

const dash = loadDashboard();
const seedUrls = [
  ...(dash.searchConsole?.pages || []).map((r) => r.page),
  ...(dash.analytics4?.topPages || []).map((r) => ga4PathToUrl(r.pagePath)),
];

console.log('1. Playwright crawl...');
const { pages, errors, pageCount } = await crawlWithPlaywright(seedUrls);
console.log(`   Found ${pageCount} pages, ${errors.length} errors\n`);

let merged = mergeMetrics(pages, dash);
merged.forEach((p) => { p.priorityScore = scorePriority(p); });
merged.sort((a, b) => b.priorityScore - a.priorityScore);

const key = loadOpenAIKey();
if (!key) {
  console.error('OPENAI_API_KEY missing');
  process.exit(1);
}

console.log('2. ChatGPT analysis per page...');
for (let i = 0; i < merged.length; i++) {
  process.stdout.write(`   AI ${i + 1}/${merged.length}...\r`);
  try {
    merged[i].ai = await chatgptAnalyzePage(merged[i], key);
  } catch (e) {
    merged[i].ai = { summary: `שגיאת AI: ${e.message}`, error: true };
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`\n   Done ${merged.length} pages\n`);

console.log('3. Work plan...');
const workPlan = await chatgptWorkPlan(merged, key);

const summary = {
  'עמודים תקינים (200)': merged.filter((p) => p.httpStatus < 400).length,
  'עמודים שbroken': merged.filter((p) => p.httpStatus >= 400).length,
  'חסר Title': merged.filter((p) => p.issues?.includes('missing_title')).length,
  'חסר Meta Description': merged.filter((p) => p.issues?.includes('missing_meta_description')).length,
  'חסר H1': merged.filter((p) => p.issues?.includes('missing_h1')).length,
  'חסר Schema': merged.filter((p) => p.issues?.includes('missing_schema')).length,
  'תמונות ללא Alt': merged.filter((p) => p.issues?.some((x) => x.startsWith('images_without_alt'))).length,
};

const executiveSummary = [
  `נסרקו **${pageCount}** עמודים ב-dalia-c.com (Playwright + GSC/GA4).`,
  `**${merged.filter((p) => (p.ai?.priority === 'גבוה' || p.priorityScore >= 30)).length}** עמודים בעדיפות קידום גבוהה.`,
  `GSC: ${dash.searchConsole?.pages?.length || 0} עמודים עם נתוני חיפוש · GA4: ${dash.analytics4?.topPages?.length || 0} עמודים עם תנועה.`,
  errors.length ? `⚠️ ${errors.length} שגיאות סריקה.` : 'סריקה הושלמה ללא שגיאות קריטיות.',
].join(' ');

const report = {
  generatedAt: new Date().toISOString(),
  site: SITE,
  pageCount,
  connections: {
    gsc: dash.connections?.searchConsole?.ok,
    ga4: dash.connections?.analytics4?.ok,
    marketingUi: 'dalia-c-official',
  },
  summary,
  executiveSummary,
  pages: merged,
  crawlErrors: errors,
  workPlan,
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'REPORT.md'), buildMarkdown(report), 'utf8');
writeFileSync(join(P001.root, 'public', 'project-001', 'site-crawl.json'), JSON.stringify({
  infra: { site: SITE + '/', fetchedAt: report.generatedAt, method: 'playwright' },
  crawl: {
    site: SITE + '/',
    crawledAt: report.generatedAt,
    pageCount,
    pages: merged,
    errors,
    summary,
  },
}, null, 2));

console.log('Written:', join(OUT, 'REPORT.md'));
console.log('Pages analyzed:', merged.length);
