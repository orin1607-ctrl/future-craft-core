import { parsePage, auditPageIssues, parseSitemapLocs } from './html-parse.mjs';

const DEFAULT_UA = 'DaliaCO-CO-Crawler/1.0 (+https://dalia-c.com)';

export async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': DEFAULT_UA, Accept: 'text/html,application/xml,text/xml,*/*' },
      redirect: 'follow',
    });
    const text = await res.text();
    return { status: res.status, url: res.url, text, headers: Object.fromEntries(res.headers.entries()) };
  } finally {
    clearTimeout(t);
  }
}

export function normalizeSiteUrl(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/`;
}

export async function discoverUrls(siteUrl, maxFromSitemap = 500) {
  const base = normalizeSiteUrl(siteUrl);
  const discovered = new Set([base]);
  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    try {
      const { status, text } = await fetchText(new URL(path, base).href);
      if (status !== 200) continue;
      for (const loc of parseSitemapLocs(text).slice(0, maxFromSitemap)) {
        try {
          const u = new URL(loc);
          if (u.hostname === new URL(base).hostname) discovered.add(u.href.replace(/\/$/, '') || u.href);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return [...discovered];
}

export async function crawlSite(siteUrl, options = {}) {
  const {
    maxPages = 200,
    maxDepth = 4,
    seedUrls = [],
    sameHostOnly = true,
  } = options;

  const origin = new URL(normalizeSiteUrl(siteUrl));
  const queue = [];
  const seen = new Set();
  const pages = [];
  const errors = [];

  for (const u of [...seedUrls, ...(await discoverUrls(siteUrl))]) {
    queue.push({ url: u, depth: 0 });
  }
  if (!queue.length) queue.push({ url: origin.href, depth: 0 });

  while (queue.length && pages.length < maxPages) {
    const { url, depth } = queue.shift();
    const key = url.replace(/\/$/, '') || url;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const { status, url: finalUrl, text } = await fetchText(url);
      const parsed = auditPageIssues(parsePage(text, finalUrl), status);
      pages.push({
        ...parsed,
        httpStatus: status,
        finalUrl,
        depth,
        crawledAt: new Date().toISOString(),
      });

      if (status < 400 && depth < maxDepth) {
        for (const link of parsed.internalLinks) {
          try {
            const u = new URL(link);
            if (sameHostOnly && u.hostname !== origin.hostname) continue;
            const lk = u.href.replace(/\/$/, '') || u.href;
            if (!seen.has(lk)) queue.push({ url: u.href, depth: depth + 1 });
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      errors.push({ url, error: e.message || String(e) });
    }
  }

  const duplicates = findDuplicateTitles(pages);
  return {
    site: origin.href,
    crawledAt: new Date().toISOString(),
    pageCount: pages.length,
    errorCount: errors.length,
    pages,
    errors,
    duplicates,
    summary: summarizeCrawl(pages, errors, duplicates),
  };
}

function findDuplicateTitles(pages) {
  const map = new Map();
  for (const p of pages) {
    const t = (p.title || '').trim().toLowerCase();
    if (!t) continue;
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(p.url);
  }
  return [...map.entries()].filter(([, urls]) => urls.length > 1).map(([title, urls]) => ({ title, urls }));
}

function summarizeCrawl(pages, errors, duplicates) {
  const broken = pages.filter((p) => p.httpStatus >= 400);
  const missingTitle = pages.filter((p) => p.issues.includes('missing_title'));
  const missingMeta = pages.filter((p) => p.issues.includes('missing_meta_description'));
  const missingH1 = pages.filter((p) => p.issues.includes('missing_h1'));
  const noAlt = pages.filter((p) => p.imagesMissingAlt > 0);
  const noSchema = pages.filter((p) => p.issues.includes('missing_schema'));
  return {
    okPages: pages.filter((p) => p.httpStatus < 400).length,
    brokenPages: broken.length,
    missingTitle: missingTitle.length,
    missingMetaDescription: missingMeta.length,
    missingH1: missingH1.length,
    imagesWithoutAlt: noAlt.length,
    missingSchema: noSchema.length,
    duplicateTitles: duplicates.length,
    crawlErrors: errors.length,
  };
}

export async function fetchRobotsSitemap(siteUrl) {
  const base = normalizeSiteUrl(siteUrl);
  const report = { site: base, fetchedAt: new Date().toISOString(), robots: null, sitemaps: [] };

  try {
    const robots = await fetchText(new URL('/robots.txt', base).href);
    report.robots = {
      status: robots.status,
      url: new URL('/robots.txt', base).href,
      content: robots.text.slice(0, 8000),
      sitemapRefs: [...robots.text.matchAll(/^Sitemap:\s*(.+)$/gim)].map((m) => m[1].trim()),
    };
  } catch (e) {
    report.robots = { error: e.message };
  }

  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', ...(report.robots?.sitemapRefs || [])]) {
    try {
      const url = path.startsWith('http') ? path : new URL(path, base).href;
      const sm = await fetchText(url);
      const locs = parseSitemapLocs(sm.text);
      report.sitemaps.push({ url, status: sm.status, locCount: locs.length, sample: locs.slice(0, 5) });
    } catch { /* skip */ }
  }

  return report;
}
