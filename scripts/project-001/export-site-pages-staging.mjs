/**
 * Export classified site pages for GitHub Pages Staging (read-only source: audit crawl).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';

const AUDIT = join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit', 'report.json');
const OUT_DIR = join(P001.root, 'public', 'project-001');

const BUSINESS_SLUGS = [
  '/', '/home/', '/catalog/', '/our-app/', '/about/', '/contact/', '/service/', '/how-it-works/',
  '/79-shekels/', '/registration/', '/my-account/', '/card-provider-customer/',
];
const BUSINESS_HE = /צור-קשר|עלינו|השירותים|מה-עומד|ניהול-צי|עמוד-ספק|האפליקציה|תוכנה|תחזוק|ליסינג|מימון|קטלוג|שאלון|תפעול-רכב|ניהול-תחזוק|שירותי-דליה|מערכת|אפליקצ/i;

function pathOf(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/\/$/, '') || '/');
  } catch {
    return url;
  }
}

function classify(page) {
  const p = pathOf(page.url).toLowerCase();
  if (page.httpStatus >= 400) return 'broken';
  if (p.includes('/category/')) return 'category';
  if (
    /elementor-\d|mdsl-|hyundai_|skoda_|seat_|santa-fe_|elantra_|tarraco|enyaq|tucson|4640-2|elementor-4553|elementor-4643|elementor-5000|elementor-2080|elementor-2194|13192|13189/.test(p)
  ) return 'vehicle';
  if (BUSINESS_SLUGS.some((s) => p === s.replace(/\/$/, '') || p + '/' === s || p === '/')) return 'business';
  if (BUSINESS_HE.test(p)) return 'business';
  if (/^\/[a-z0-9_-]+$/.test(p) && !p.includes('category')) {
    if (/form|catalog|contact|about|service|app|account|registration/.test(p)) return 'business';
  }
  if (/האם-|איך-|מה-עדיף|מגוון-חב|תפעול|תחזוק|ניהול|ליסינג|שאלון|מדריך|מאמר|blog/.test(p)) return 'content';
  if (p.startsWith('/category')) return 'category';
  return 'other';
}

function slimPage(p, type) {
  return {
    url: p.url,
    path: pathOf(p.url),
    title: p.title || '',
    type,
    httpStatus: p.httpStatus,
    h1: p.h1 || '',
    metaDescription: p.metaDescription || '',
    issues: p.issues || [],
    seoScore: p.ai?.seoScore ?? null,
    priority: p.ai?.priority || p.priorityScore || null,
    gsc: p.gsc ? { clicks: p.clicks, impressions: p.impressions, position: p.position } : null,
    ga4Views: p.ga4Views || 0,
  };
}

const report = JSON.parse(readFileSync(AUDIT, 'utf8'));
const classified = report.pages.map((p) => ({ ...p, pageType: classify(p) }));

const counts = {};
for (const p of classified) counts[p.pageType] = (counts[p.pageType] || 0) + 1;

const businessRaw = classified.filter((p) => ['business', 'content'].includes(p.pageType) && p.httpStatus < 400);
const seenBiz = new Set();
const business = [];
for (const p of businessRaw) {
  const key = pathOf(p.url).toLowerCase();
  if (seenBiz.has(key)) continue;
  seenBiz.add(key);
  business.push(p);
}
const priority = classified
  .filter((p) => p.httpStatus < 400 && p.pageType !== 'broken')
  .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

const index = {
  version: 1,
  generatedAt: new Date().toISOString(),
  site: 'https://dalia-c.com/',
  campaign: {
    id: 'campaign-dalia-seo-primary',
    name: 'דליה — קידום dalia-c.com',
    owner: 'יוני אטיאס',
    projectId: 'project001aimarketing',
    projectName: 'Project 001 — AI Marketing',
    site: 'dalia-c.com',
    channel: 'seo',
    status: 'active',
    type: 'organic_seo',
  },
  summary: {
    totalCrawled: classified.length,
    ...counts,
    businessAndContent: business.length,
    recommendedStagingLoad: business.length,
    fullCrawlSizeNote: 'Full crawl ~1.9MB — use site-pages-index.json on Staging',
  },
  pages: {
    business: business.map((p) => slimPage(p, p.pageType)),
    all: priority.slice(0, 120).map((p) => slimPage(p, p.pageType)),
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'site-pages-index.json'), JSON.stringify(index, null, 2));

const liteCrawl = {
  infra: { site: 'https://dalia-c.com/', fetchedAt: index.generatedAt, method: 'playwright-lite' },
  crawl: {
    site: 'https://dalia-c.com/',
    crawledAt: index.generatedAt,
    pageCount: business.length,
    mode: 'business-first',
    summary: index.summary,
    pages: business.map((p) => slimPage(p, p.pageType)),
  },
};

writeFileSync(join(OUT_DIR, 'site-crawl-lite.json'), JSON.stringify(liteCrawl, null, 2));

console.log('Classification:', JSON.stringify(counts, null, 2));
console.log('Business+content pages:', business.length);
console.log('Written: site-pages-index.json, site-crawl-lite.json');
console.log('Lite size KB:', (JSON.stringify(liteCrawl).length / 1024).toFixed(1));
