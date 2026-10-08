/**
 * Dalia SEO — READ-ONLY scan of dalia-c.com for the public staging UI.
 * GET requests only, sequential with a small delay. Never writes to the site.
 * Output: public/project-001/seo-scan-latest.json (consumed by public/openseo.html).
 *
 *   node scripts/dalia-seo/scan-site-readonly.mjs [--max 300]
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { fetchText, fetchRobotsSitemap } from '../project-001/_lib/site-crawler.mjs';
import { parsePage, auditPageIssues, extractHeadings, parseSitemapLocs } from '../project-001/_lib/html-parse.mjs';

const SITE = 'https://dalia-c.com/';
const MAX = Number(process.argv[process.argv.indexOf('--max') + 1]) || 300;
const LINK_CHECK_MAX = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (u) => { try { const x = new URL(u); x.hash = ''; return x.href.replace(/\/$/, ''); } catch { return null; } };
const pathOf = (u) => { try { return decodeURIComponent(new URL(u).pathname) || '/'; } catch { return u; } };

async function sitemapUrls() {
  // Expand sitemap indexes (WordPress / Yoast) into page URLs, remembering which sitemap each came from.
  const out = new Map();
  const visited = new Set();
  const queue = [new URL('/sitemap_index.xml', SITE).href, new URL('/sitemap.xml', SITE).href, new URL('/wp-sitemap.xml', SITE).href];
  const sitemaps = [];
  while (queue.length) {
    const sm = queue.shift();
    if (visited.has(sm)) continue;
    visited.add(sm);
    try {
      const { status, text } = await fetchText(sm);
      if (status !== 200) { sitemaps.push({ url: sm, status, urls: 0 }); continue; }
      const locs = parseSitemapLocs(text);
      const isIndex = /<sitemapindex/i.test(text);
      sitemaps.push({ url: sm, status, urls: isIndex ? 0 : locs.length, index: isIndex, children: isIndex ? locs.length : 0 });
      for (const loc of locs) {
        if (isIndex) queue.push(loc);
        else if (new URL(loc).hostname === new URL(SITE).hostname) out.set(norm(loc), sm);
      }
    } catch (e) {
      sitemaps.push({ url: sm, error: e.message });
    }
  }
  return { urls: [...out.keys()].filter(Boolean), sitemaps };
}

async function main() {
  const startedAt = new Date().toISOString();
  const infra = await fetchRobotsSitemap(SITE);
  const sm = await sitemapUrls();
  const targets = sm.urls.slice(0, MAX);
  if (!targets.includes(norm(SITE))) targets.unshift(norm(SITE));

  const pages = [];
  const linkTargets = new Set();
  for (const url of targets) {
    try {
      const { status, url: finalUrl, text } = await fetchText(url);
      const p = auditPageIssues(parsePage(text, finalUrl), status);
      const h2 = extractHeadings(text, 'h2');
      const h3 = extractHeadings(text, 'h3');
      for (const l of p.internalLinks) { const n = norm(l); if (n) linkTargets.add(n); }
      pages.push({
        url: finalUrl, path: pathOf(finalUrl), httpStatus: status,
        title: p.title || '', titleLen: (p.title || '').length,
        meta: p.metaDescription || '', metaLen: (p.metaDescription || '').length,
        h1: p.h1 || '', h1Count: (p.h1All || []).length, h2Count: h2.length, h3Count: h3.length,
        canonical: p.canonical || '', robotsMeta: p.robotsMeta || '',
        noindex: /noindex/i.test(p.robotsMeta || ''),
        internalLinks: p.internalLinks.length, imagesMissingAlt: p.imagesMissingAlt,
        wordsApprox: p.wordCount, issues: p.issues,
      });
    } catch (e) {
      pages.push({ url, path: pathOf(url), httpStatus: 0, error: e.message, issues: ['fetch_error'] });
    }
    await sleep(150);
  }

  // Broken internal links: linked from scanned pages but not themselves scanned.
  const scanned = new Set(pages.map((p) => norm(p.url)));
  const unchecked = [...linkTargets].filter((u) => !scanned.has(u) && !/\.(jpe?g|png|webp|gif|svg|pdf|zip)$/i.test(u) && !/wp-(admin|login|json)|\?|#/.test(u));
  const linkResults = [];
  for (const u of unchecked.slice(0, LINK_CHECK_MAX)) {
    try { const { status } = await fetchText(u, 10000); linkResults.push({ url: u, status }); }
    catch (e) { linkResults.push({ url: u, status: 0, error: e.message }); }
    await sleep(120);
  }
  const brokenLinks = [
    ...pages.filter((p) => p.httpStatus >= 400 || p.httpStatus === 0).map((p) => ({ url: p.url, status: p.httpStatus, source: 'sitemap' })),
    ...linkResults.filter((r) => r.status >= 400 || r.status === 0).map((r) => ({ ...r, source: 'internal_link' })),
  ];

  const ok = pages.filter((p) => p.httpStatus > 0 && p.httpStatus < 400);
  const titleCount = new Map();
  for (const p of ok) if (p.title) titleCount.set(p.title.trim(), (titleCount.get(p.title.trim()) || 0) + 1);
  const summary = {
    sitemapUrls: sm.urls.length,
    scanned: pages.length,
    ok: ok.length,
    broken: pages.length - ok.length,
    missingTitle: ok.filter((p) => !p.title).length,
    titleTooLong: ok.filter((p) => p.titleLen > 60).length,
    titleTooShort: ok.filter((p) => p.title && p.titleLen < 30).length,
    duplicateTitles: [...titleCount.values()].filter((n) => n > 1).length,
    missingMeta: ok.filter((p) => !p.meta).length,
    metaTooLong: ok.filter((p) => p.metaLen > 160).length,
    missingH1: ok.filter((p) => !p.h1Count).length,
    multipleH1: ok.filter((p) => p.h1Count > 1).length,
    noH2: ok.filter((p) => !p.h2Count).length,
    imagesMissingAltPages: ok.filter((p) => p.imagesMissingAlt > 0).length,
    noindex: ok.filter((p) => p.noindex).length,
    internalLinksChecked: linkResults.length,
    internalLinksUnchecked: Math.max(0, unchecked.length - LINK_CHECK_MAX),
    brokenLinks: brokenLinks.length,
  };

  const out = {
    version: 1,
    source: 'scripts/dalia-seo/scan-site-readonly.mjs (GET only)',
    site: SITE,
    startedAt,
    scannedAt: new Date().toISOString(),
    robots: infra.robots ? { status: infra.robots.status, url: infra.robots.url, sitemapRefs: infra.robots.sitemapRefs || [], error: infra.robots.error } : null,
    sitemaps: sm.sitemaps,
    summary,
    brokenLinks,
    pages,
  };
  const file = join(process.cwd(), 'public', 'project-001', 'seo-scan-latest.json');
  writeFileSync(file, JSON.stringify(out));
  console.log(JSON.stringify({ file, ...summary }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
