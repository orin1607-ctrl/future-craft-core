/** Lightweight HTML parsing without extra dependencies */

export function extractTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ').trim()) : '';
}

export function extractMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? decodeEntities((m[1] || m[2] || '').trim()) : '';
}

export function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1].trim() : '';
}

export function extractRobotsMeta(html) {
  return extractMeta(html, 'robots');
}

export function extractHeadings(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const t = decodeEntities(m[1].replace(/<[^>]+>/g, ' ').trim());
    if (t) out.push(t);
  }
  return out;
}

export function extractLinks(html, baseUrl) {
  const out = { internal: [], external: [] };
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m;
  const base = new URL(baseUrl);
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      const href = u.href.replace(/\/$/, '') || u.href;
      if (u.hostname === base.hostname) out.internal.push(href);
      else out.external.push(href);
    } catch { /* skip */ }
  }
  return out;
}

export function extractImages(html, baseUrl) {
  const out = [];
  const re = /<img[^>]+>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const srcM = tag.match(/src=["']([^"']+)["']/i);
    const altM = tag.match(/alt=["']([^"']*)["']/i);
    if (!srcM) continue;
    try {
      out.push({ src: new URL(srcM[1], baseUrl).href, alt: altM ? altM[1] : '' });
    } catch { /* skip */ }
  }
  return out;
}

export function extractSchema(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      out.push({ _parseError: true, raw: m[1].slice(0, 200) });
    }
  }
  return out;
}

export function parsePage(html, url) {
  const title = extractTag(html, 'title');
  const h1 = extractHeadings(html, 'h1');
  const h2 = extractHeadings(html, 'h2');
  const links = extractLinks(html, url);
  const images = extractImages(html, url);
  return {
    url,
    title,
    metaDescription: extractMeta(html, 'description') || extractMeta(html, 'og:description'),
    h1: h1[0] || '',
    h1All: h1,
    h2: h2.slice(0, 10),
    canonical: extractCanonical(html),
    robotsMeta: extractRobotsMeta(html),
    schema: extractSchema(html),
    internalLinks: [...new Set(links.internal)],
    externalLinks: [...new Set(links.external)].slice(0, 30),
    images,
    imagesMissingAlt: images.filter((i) => !i.alt || !i.alt.trim()).length,
    wordCount: html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
    issues: [],
  };
}

export function auditPageIssues(page, status) {
  const issues = [];
  if (status >= 400) issues.push(`HTTP ${status}`);
  if (!page.title) issues.push('missing_title');
  if (!page.metaDescription) issues.push('missing_meta_description');
  if (!page.h1) issues.push('missing_h1');
  if (page.imagesMissingAlt > 0) issues.push(`images_without_alt:${page.imagesMissingAlt}`);
  if (!page.schema?.length) issues.push('missing_schema');
  if (page.canonical && page.canonical !== page.url) issues.push('canonical_mismatch');
  page.issues = issues;
  return page;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) locs.push(m[1].trim());
  return locs;
}
