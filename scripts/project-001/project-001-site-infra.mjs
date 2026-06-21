import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { fetchRobotsSitemap } from './_lib/site-crawler.mjs';

async function main() {
  const cfg = loadP001Config();
  const site = cfg.official_site || cfg.gsc_site_url;
  const report = await fetchRobotsSitemap(site);
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'site-infra.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(P001.root, 'public', 'project-001', 'site-infra.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
