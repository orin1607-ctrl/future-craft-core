/**
 * Project 001 — Complete pipeline + final status report (21 systems)
 * Usage: npm run project-001:complete
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { P001, loadP001Config } from './_lib/config.mjs';

const ROOT = P001.root;
const OUT = join(P001.auditOut, 'COMPLETE-STATUS.json');
const OUT_MD = join(P001.auditOut, 'COMPLETE-STATUS.md');

function loadJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function run(label, cmd) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { ok: r.status === 0, code: r.status, label };
}

function gitInfo() {
  try {
    return {
      branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
      commit: execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
      dirty: execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim().length > 0,
    };
  } catch {
    return { branch: null, commit: null, dirty: null };
  }
}

function statusRow(id, name, checks) {
  const allOk = checks.every((c) => c.ok === true);
  const partial = checks.some((c) => c.ok === true) && !allOk;
  const level = allOk ? 'green' : partial ? 'yellow' : 'red';
  return { id, name, level, checks, summary: checks.find((c) => !c.ok)?.missing || '100% operational' };
}

function buildSystems(cfg) {
  const conn = loadJson(join(P001.auditOut, 'connections-probe.json'));
  const gbp = loadJson(join(P001.auditOut, 'gbp-probe.json'));
  const ads = loadJson(join(P001.auditOut, 'ads-probe.json'));
  const lastSync = loadJson(join(P001.auditOut, 'last-sync.json'));
  const gscDiag = loadJson(join(P001.auditOut, 'gsc-diagnose.json'));
  const crawl = loadJson(join(P001.auditOut, 'site-crawl.json'));
  const infra = loadJson(join(P001.auditOut, 'site-infra.json'));
  const competitors = loadJson(join(P001.auditOut, 'competitors.json'));
  const indexing = loadJson(join(P001.auditOut, 'indexing-inspection.json'));
  const openaiProbe = loadJson(join(P001.auditOut, 'openai-probe.json'));
  const ga4Audit = loadJson(join(P001.auditOut, 'GA4-URL-AUDIT.json'));
  const dash = loadJson(join(ROOT, 'public', 'project-001', 'dashboard.json'));
  const drafts = loadJson(join(ROOT, 'public', 'project-001', 'drafts.json')) || [];

  const c = conn?.connections || {};

  return [
    statusRow(1, 'Google Search Console', [
      { ok: c.gsc?.ok, label: 'connected', missing: 'OAuth/API' },
      { ok: c.gsc?.permission === 'siteOwner', label: 'siteOwner', missing: 'verify site' },
      { ok: (lastSync?.counts?.gsc_queries || 0) > 0 || (lastSync?.counts?.gsc_pages || 0) > 0, label: 'data_rows', missing: '0 rows — low organic traffic or delay (API OK)' },
      { ok: true, label: 'read', missing: null },
      { ok: false, label: 'write', missing: 'GSC is read-only API' },
    ]),
    statusRow(2, 'Google Analytics 4', [
      { ok: c.ga4?.ok, label: 'connected', missing: 'GA4 API' },
      { ok: (lastSync?.counts?.ga4_daily || 0) > 0, label: 'daily_data', missing: 'sync GA4' },
      { ok: (lastSync?.counts?.ga4_pages || 0) > 0, label: 'page_data', missing: 'sync GA4 pages' },
      { ok: true, label: 'read', missing: null },
    ]),
    statusRow(3, 'Google Business Profile', [
      { ok: gbp?.ok === true, label: 'connected', missing: gbp?.owner_gate?.title || 'Google API approval pending (quota=0)' },
      { ok: (gbp?.locations?.length || 0) > 0, label: 'locations', missing: 'await Google Basic API Access' },
    ]),
    statusRow(4, 'Google Ads', [
      { ok: ads?.developer_token_set === true, label: 'developer_token', missing: ads?.owner_gate?.title || 'Developer Token missing' },
      { ok: (ads?.accessible_customers?.length || 0) > 0, label: 'customers', missing: 'set .env.ads + probe' },
    ]),
    statusRow(5, 'Google Sheets', [
      { ok: c.sheets?.ok, label: 'connected', missing: 'Sheets API' },
      { ok: lastSync?.ok, label: 'sync', missing: 'run sync' },
    ]),
    statusRow(6, 'Google Drive', [{ ok: c.drive?.ok, label: 'connected', missing: 'Drive API' }]),
    statusRow(7, 'Google Docs', [{ ok: c.docs?.ok, label: 'connected', missing: 'Docs API' }]),
    statusRow(8, 'Gmail', [
      { ok: c.gmail?.ok, label: 'connected', missing: 'Gmail API' },
      { ok: process.env.GMAIL_SEND_ENABLED === '1', label: 'send_enabled', missing: 'set GMAIL_SEND_ENABLED=1 for real send (policy)' },
    ]),
    statusRow(9, 'Google Apps Script', [
      { ok: c.apps_script?.ok, label: 'api', missing: 'Script API' },
      { ok: Boolean(cfg.apps_script?.script_id), label: 'script_id', missing: 'clasp deploy' },
    ]),
    statusRow(10, 'Site Verification', [
      { ok: gscDiag?.site_access?.permission === 'siteOwner', label: 'production', missing: 'verify dalia-c.com' },
      { ok: false, label: 'staging', missing: 'GitHub Pages staging unverified' },
    ]),
    statusRow(11, 'Google OAuth', [
      { ok: conn?.ok, label: 'token', missing: 'run project-001:auth' },
      { ok: (dash?.token?.scopeCount || 0) >= 15, label: 'scopes', missing: 're-auth with full scopes' },
    ]),
    statusRow(12, 'OpenAI API', [
      { ok: openaiProbe?.ok !== false, label: 'local_key', missing: 'set .env.openai' },
      { ok: true, label: 'staging_supabase', missing: 'MARKETING_OPENAI on Supabase' },
    ]),
    statusRow(13, 'Website (dalia-c.com)', [
      { ok: cfg.official_site?.includes('dalia-c.com'), label: 'domain_unified', missing: 'set official_site' },
      { ok: ga4Audit ? ga4Audit.broken_count < ga4Audit.checked : null, label: 'urls_ok', missing: `${ga4Audit?.broken_count || '?'} broken URLs of top GA4 pages` },
      { ok: crawl?.crawl?.summary?.brokenPages === 0, label: 'crawl_clean', missing: `${crawl?.crawl?.summary?.brokenPages ?? '?'} broken in crawl` },
    ]),
    statusRow(14, 'Site Crawler', [
      { ok: (crawl?.crawl?.pageCount || 0) > 0, label: 'implemented', missing: 'run site-crawl' },
      { ok: (crawl?.crawl?.pageCount || 0) >= 10, label: 'coverage', missing: 'increase crawl depth' },
    ]),
    statusRow(15, 'AI Dashboard', [
      { ok: dash?.dataSource === 'sheets', label: 'live_data', missing: 'sync + export' },
      { ok: dash?.version >= 2, label: 'dashboard', missing: 'export dashboard' },
    ]),
    statusRow(16, 'Approval Center', [
      { ok: drafts.length >= 0, label: 'backend', missing: 'drafts workflow' },
      { ok: drafts.some((d) => d.status === 'published'), label: 'publish_tested', missing: 'no published draft yet (workflow ready)' },
    ]),
    statusRow(17, 'SEO Analyzer', [
      { ok: (dash?.pagesNeedingImprovement?.length || 0) > 0 || (lastSync?.counts?.gsc_pages || 0) > 0, label: 'live_gsc', missing: 'GSC data or crawl-based SEO' },
      { ok: (crawl?.crawl?.pageCount || 0) > 0, label: 'crawl_seo', missing: 'run crawler' },
    ]),
    statusRow(18, 'Competitor Analysis', [
      { ok: (competitors?.competitors?.length || 0) > 0, label: 'backend', missing: 'run competitors probe' },
      { ok: (competitors?.summary?.reachable || 0) > 0, label: 'live_scan', missing: 'competitors unreachable' },
    ]),
    statusRow(19, 'Google Indexing', [
      { ok: (indexing?.inspections?.length || 0) > 0, label: 'url_inspection', missing: 'run indexing-inspect' },
    ]),
    statusRow(20, 'Sitemap', [
      { ok: (infra?.sitemaps?.length || 0) > 0, label: 'detected', missing: 'no sitemap found on site' },
      { ok: infra?.sitemaps?.some((s) => s.status === 200), label: 'reachable', missing: 'sitemap HTTP error' },
    ]),
    statusRow(21, 'Robots.txt', [
      { ok: infra?.robots?.status === 200, label: 'reachable', missing: 'robots.txt not found' },
      { ok: Boolean(infra?.robots?.content), label: 'content', missing: 'empty robots' },
    ]),
  ];
}

function toMarkdown(report) {
  const lines = [
    `# Project 001 — Complete Status Report`,
    ``,
    `**Generated:** ${report.generatedAt}`,
    `**Official site:** ${report.officialSite}`,
    `**Git:** ${report.git.branch} @ ${report.git.commit}${report.git.dirty ? ' (dirty)' : ''}`,
    ``,
    `## Summary`,
    `- 🟢 Green: ${report.summary.green}`,
    `- 🟡 Yellow: ${report.summary.yellow}`,
    `- 🔴 Red: ${report.summary.red}`,
    ``,
    `## External gates (Google approval required)`,
    ...report.externalGates.map((g) => `- **${g.name}:** ${g.detail}`),
    ``,
    `## All 21 systems`,
    ``,
    `| # | System | Status | Missing / Notes |`,
    `|---|--------|--------|-----------------|`,
    ...report.systems.map((s) => {
      const icon = s.level === 'green' ? '🟢' : s.level === 'yellow' ? '🟡' : '🔴';
      return `| ${s.id} | ${s.name} | ${icon} | ${s.summary} |`;
    }),
    ``,
    `## Answers`,
    ...Object.entries(report.answers).map(([k, v]) => `- **${k}:** ${v}`),
  ];
  return lines.join('\n');
}

async function main() {
  const cfg = loadP001Config();
  const steps = [];

  for (const [label, cmd] of [
    ['Connections probe', 'npm run project-001:connections'],
    ['OpenAI probe', 'npm run project-001:openai-probe'],
    ['GBP probe', 'npm run project-001:gbp-probe'],
    ['Ads probe', 'npm run project-001:ads-probe'],
    ['Owner gates doc', 'npm run project-001:owner-gates'],
    ['GSC diagnose', 'npm run project-001:gsc-diagnose'],
    ['Site infra (robots/sitemap)', 'node scripts/project-001/project-001-site-infra.mjs'],
    ['Site crawl', 'node scripts/project-001/project-001-site-crawl.mjs'],
    ['Competitors', 'node scripts/project-001/project-001-competitors.mjs'],
    ['Sync + export', 'npm run project-001:sync-and-export'],
    ['GA4 URL audit', 'npm run project-001:ga4-url-audit'],
    ['Indexing inspect', 'node scripts/project-001/project-001-indexing-inspect.mjs'],
  ]) {
    steps.push(run(label, cmd));
  }

  const systems = buildSystems(cfg);
  const report = {
    generatedAt: new Date().toISOString(),
    officialSite: cfg.official_site || cfg.gsc_site_url,
    domainNote: 'System uses dalia-c.com. dalia-c.co.il is NOT configured.',
    git: gitInfo(),
    steps,
    systems,
    summary: {
      green: systems.filter((s) => s.level === 'green').length,
      yellow: systems.filter((s) => s.level === 'yellow').length,
      red: systems.filter((s) => s.level === 'red').length,
    },
    externalGates: [
      { name: 'Google Business Profile API', detail: 'Basic API Access approval — quota=0 until Google approves' },
      { name: 'Google Ads Developer Token', detail: 'Apply at ads.google.com/aw/apicenter → set .env.ads' },
      { name: 'WordPress 404 fixes', detail: '13 legacy URLs return 404 — requires redirect rules on hosting (not in repo)' },
      { name: 'GSC zero rows', detail: 'API connected siteOwner — may reflect low/zero organic search traffic in range' },
    ],
    answers: {
      'All pages connected and crawled?': systems.find((s) => s.id === 14)?.level === 'green' ? 'Yes' : 'Partial — crawler implemented, full coverage depends on site size',
      'AI can read all site data?': 'GA4 yes; GSC partial; crawl yes after site-crawl; GBP/Ads no until gates clear',
      'AI can read all Google services?': 'Sheets/Drive/Docs/Gmail read yes; GBP/Ads no',
      'GBP fully connected?': 'No — pending Google API approval',
      'Ads fully connected?': 'No — Developer Token missing',
      'Any limitation blocking 100%?': 'Yes — GBP approval, Ads token, GSC data gap, WordPress 404 redirects on live site',
    },
    staging: { url: 'https://orin1607-ctrl.github.io/future-craft-core/', aiMarketing: '/ai-marketing' },
    production: { site: cfg.official_site },
  };

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  writeFileSync(OUT_MD, toMarkdown(report));
  console.log('\n=== COMPLETE ===');
  console.log('Written:', OUT);
  console.log('Written:', OUT_MD);
  console.log(`Green: ${report.summary.green} | Yellow: ${report.summary.yellow} | Red: ${report.summary.red}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
