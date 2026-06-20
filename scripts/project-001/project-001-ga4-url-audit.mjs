import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';

const SITE = 'https://dalia-c.com';
const OUT = join(P001.auditOut, 'GA4-URL-AUDIT.json');
const OUT_MD = join(P001.auditOut, 'GA4-URL-AUDIT.md');

function loadDashboard() {
  const paths = [
    join(P001.root, 'public', 'project-001', 'dashboard.json'),
    join(P001.auditOut, 'dashboard-export.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  return null;
}

async function checkUrl(path) {
  const url = `${SITE}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { url, path, status: res.status, ok: res.ok, finalUrl: res.url };
  } catch (e) {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      return { url, path, status: res.status, ok: res.ok, finalUrl: res.url };
    } catch (e2) {
      return { url, path, status: 0, ok: false, error: String(e2.message || e2) };
    }
  }
}

function recommend(path, status, sessions) {
  if (status === 200 || status === 301 || status === 302) {
    return { action: 'ok', note: 'URL פעיל' };
  }
  if (status === 404) {
    if (sessions >= 5) {
      return { action: 'redirect', note: `301 redirect לעמוד רלוונטי — ${sessions} sessions ב-GA4` };
    }
    return { action: 'ignore_or_redirect', note: '404 עם תנועה נמוכה — redirect או התעלמות' };
  }
  if (path.includes('elementor')) {
    return { action: 'review', note: 'דף Elementor — לבדוק slug עדכני או redirect' };
  }
  return { action: 'review', note: 'לבדוק ידנית' };
}

async function main() {
  const dash = loadDashboard();
  const pages = dash?.analytics4?.topPages || [];
  const results = [];

  for (const p of pages) {
    const r = await checkUrl(p.pagePath);
    const rec = recommend(p.pagePath, r.status, p.sessions || 0);
    results.push({
      path: p.pagePath,
      ga4_sessions: p.sessions,
      ga4_page_views: p.screenPageViews,
      http_status: r.status,
      ok: r.ok,
      recommendation: rec.action,
      note: rec.note,
      checked_url: r.url,
    });
    await new Promise((res) => setTimeout(res, 300));
  }

  const broken = results.filter((r) => r.http_status === 404 || r.http_status === 0);
  const report = {
    timestamp: new Date().toISOString(),
    site: SITE,
    checked: results.length,
    broken_count: broken.length,
    results,
    broken,
  };

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  const md = `# GA4 URL Audit — dalia-c.com

**${report.timestamp}**

| Path | GA4 Sessions | HTTP | המלצה | הערה |
|------|-------------|------|--------|------|
${results.map((r) => `| ${r.path} | ${r.ga4_sessions} | ${r.http_status || 'ERR'} | ${r.recommendation} | ${r.note} |`).join('\n')}

## URLs בעייתיים (${broken.length})

${broken.map((r) => `- **${r.path}** (${r.ga4_sessions} sessions) → ${r.recommendation}: ${r.note}`).join('\n') || 'אין'}
`;
  writeFileSync(OUT_MD, md);
  console.log('Written:', OUT);
  console.log('Broken:', broken.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
