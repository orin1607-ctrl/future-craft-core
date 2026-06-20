import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';

function dateRange(days) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function main() {
  const cfg = loadP001Config();
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const { google } = await import('googleapis');
  const sc = google.searchconsole({ version: 'v1', auth });
  const siteUrl = cfg.gsc_site_url;
  const days = cfg.date_range_days || 28;

  const report = {
    timestamp: new Date().toISOString(),
    site_url: siteUrl,
    date_range_days: days,
    date_range: dateRange(days),
    site_access: null,
    query_rows: 0,
    page_rows: 0,
    all_sites: [],
    conclusion: [],
  };

  try {
    const sites = await sc.sites.list();
    report.all_sites = (sites.data.siteEntry || []).map((s) => ({
      url: s.siteUrl,
      permission: s.permissionLevel,
    }));
    const entry = report.all_sites.find((s) => s.url === siteUrl);
    report.site_access = entry || { error: 'configured site not in list' };
  } catch (e) {
    report.site_access = { error: e.message?.slice(0, 200) };
  }

  for (const [label, dimensions] of [
    ['queries', ['query']],
    ['pages', ['page']],
  ]) {
    try {
      const { startDate, endDate } = report.date_range;
      const res = await sc.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions,
          rowLimit: 10,
        },
      });
      const count = res.data.rows?.length ?? 0;
      if (label === 'queries') report.query_rows = count;
      else report.page_rows = count;
      report[`sample_${label}`] = (res.data.rows || []).slice(0, 3);
    } catch (e) {
      report[`${label}_error`] = e.message?.slice(0, 200);
    }
  }

  if (report.site_access?.permission === 'siteOwner') {
    report.conclusion.push('חיבור GSC תקין — siteOwner מאומת');
  }
  if (report.query_rows === 0 && report.page_rows === 0) {
    report.conclusion.push('API מחזיר 0 שורות בטווח — לא בהכרח באג');
    report.conclusion.push('סיבות אפשריות: אין תנועה אורגנית ב-Google Search בטווח, אתר חדש/מעט impressions, או delay 48-72h');
    report.conclusion.push(`טווח נבדק: ${report.date_range.startDate} → ${report.date_range.endDate} (${days} ימים)`);
  } else {
    report.conclusion.push(`נמצאו נתונים: ${report.query_rows} queries, ${report.page_rows} pages (sample)`);
  }

  const out = join(P001.auditOut, 'gsc-diagnose.json');
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
