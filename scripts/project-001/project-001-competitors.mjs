import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { fetchText } from './_lib/site-crawler.mjs';

const DEFAULT_COMPETITORS = [
  { name: 'FleetOS', domain: 'fleetos.co.il' },
  { name: 'Optibus', domain: 'optibus.com' },
  { name: 'Moovit', domain: 'moovit.com' },
  { name: 'Gett Business', domain: 'gett.com' },
  { name: 'dalia.co.il', domain: 'dalia.co.il' },
];

async function analyzeCompetitor(comp) {
  const url = `https://${comp.domain}/`;
  try {
    const { status, text } = await fetchText(url, 12000);
    const title = (text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
    const meta = (text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '';
    const h1 = (text.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1] || '';
    return {
      ...comp,
      url,
      httpStatus: status,
      reachable: status < 400,
      title: title.trim(),
      metaDescription: meta.trim(),
      h1: h1.trim(),
      analyzedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ...comp, url, reachable: false, error: e.message, analyzedAt: new Date().toISOString() };
  }
}

async function main() {
  const cfg = loadP001Config();
  const competitors = cfg.competitors || DEFAULT_COMPETITORS;
  const results = [];
  for (const c of competitors) results.push(await analyzeCompetitor(c));

  const report = {
    timestamp: new Date().toISOString(),
    ourSite: cfg.official_site || cfg.gsc_site_url,
    competitors: results,
    summary: {
      total: results.length,
      reachable: results.filter((r) => r.reachable).length,
    },
  };

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'competitors.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(P001.root, 'public', 'project-001', 'competitors.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
