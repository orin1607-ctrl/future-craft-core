import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { crawlSite, fetchRobotsSitemap } from './_lib/site-crawler.mjs';

async function main() {
  const cfg = loadP001Config();
  const site = cfg.official_site || cfg.gsc_site_url;
  console.log('\n=== Site Crawl ===\n', site);

  const infra = await fetchRobotsSitemap(site);
  const seedUrls = infra.sitemaps.flatMap((s) => s.sample || []);
  const crawl = await crawlSite(site, {
    maxPages: cfg.crawl?.max_pages || 200,
    maxDepth: cfg.crawl?.max_depth || 4,
    seedUrls,
  });

  const report = { infra, crawl };
  mkdirSync(P001.auditOut, { recursive: true });
  const outAudit = join(P001.auditOut, 'site-crawl.json');
  const outPublic = join(P001.root, 'public', 'project-001', 'site-crawl.json');
  writeFileSync(outAudit, JSON.stringify(report, null, 2));
  writeFileSync(outPublic, JSON.stringify(report, null, 2));

  console.log('Pages:', crawl.pageCount, '| Broken:', crawl.summary.brokenPages);
  console.log('Written:', outAudit, '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
