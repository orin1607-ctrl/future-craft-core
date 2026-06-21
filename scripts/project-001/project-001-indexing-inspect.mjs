import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { inspectUrls } from './_lib/gsc-pull.mjs';

async function main() {
  const cfg = loadP001Config();
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const { google } = await import('googleapis');
  const siteUrl = cfg.gsc_site_url;

  let urls = [];
  const crawlPath = join(P001.auditOut, 'site-crawl.json');
  if (existsSync(crawlPath)) {
    const crawl = JSON.parse(readFileSync(crawlPath, 'utf8'));
    urls = (crawl.crawl?.pages || []).map((p) => p.finalUrl || p.url).slice(0, 20);
  }
  if (!urls.length) urls = [siteUrl];

  const inspections = await inspectUrls(auth, google, siteUrl, urls);
  const report = { timestamp: new Date().toISOString(), siteUrl, inspections };
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'indexing-inspection.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
