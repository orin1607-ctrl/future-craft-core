import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, loadGoogleFolders, P001 } from './_lib/config.mjs';
import { appendSyncHistory } from './_lib/history.mjs';

function dateRange(days) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function ga4Days(cfg) {
  return cfg.ga4_date_range_days || cfg.date_range_days || 28;
}

async function ensureSpreadsheet(auth, cfg, google) {
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });
  const folders = loadGoogleFolders();
  const folderId = cfg.drive_folder_id || folders.drive_staging_id;

  let spreadsheetId = cfg.spreadsheet_id;
  if (!spreadsheetId) {
    const titles = Object.values(cfg.sheets);
    const create = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: cfg.spreadsheet_title },
        sheets: titles.map((title) => ({ properties: { title } })),
      },
    });
    spreadsheetId = create.data.spreadsheetId;
    if (folderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        fields: 'id, parents',
      });
    }
    const configPath = P001.config;
    const current = JSON.parse(readFileSync(existsSync(configPath) ? configPath : P001.configExample, 'utf8'));
    current.spreadsheet_id = spreadsheetId;
    if (folderId) current.drive_folder_id = folderId;
    writeFileSync(configPath, JSON.stringify(current, null, 2));
    console.log('Created spreadsheet:', spreadsheetId);
  }
  return { sheets, spreadsheetId };
}

async function clearAndWrite(sheets, spreadsheetId, tab, headers, rows) {
  const range = `${tab}!A1`;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] },
  });
}

async function pullGsc(auth, google, cfg) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const { startDate, endDate } = dateRange(cfg.date_range_days);
  const siteUrl = cfg.gsc_site_url;

  const queryRes = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 1000,
    },
  });

  const pageRes = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 1000,
    },
  });

  const queryRows = (queryRes.data.rows || []).map((r) => [
    r.keys[0],
    r.clicks,
    r.impressions,
    r.ctr,
    r.position,
  ]);

  const pageRows = (pageRes.data.rows || []).map((r) => [
    r.keys[0],
    r.clicks,
    r.impressions,
    r.ctr,
    r.position,
  ]);

  return {
    startDate,
    endDate,
    queries: queryRows,
    pages: pageRows,
  };
}

async function pullGa4(auth, google, cfg) {
  const data = google.analyticsdata({ version: 'v1beta', auth });
  const property = cfg.ga4_property_id;
  const days = ga4Days(cfg);
  const { startDate, endDate } = dateRange(days);

  const daily = await data.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 1000,
    },
  });

  const pages = await data.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 500,
    },
  });

  const dailyRows = (daily.data.rows || []).map((r) => [
    r.dimensionValues[0].value,
    r.metricValues[0].value,
    r.metricValues[1].value,
    r.metricValues[2].value,
    r.metricValues[3].value,
  ]);

  const pageRows = (pages.data.rows || []).map((r) => [
    r.dimensionValues[0].value,
    r.metricValues[0].value,
    r.metricValues[1].value,
    r.metricValues[2].value,
  ]);

  return { startDate, endDate, daily: dailyRows, pages: pageRows };
}

async function main() {
  if (!tokenHasP001Scopes()) {
    console.error('\n❌ Run npm run project-001:auth first (Owner Gate)\n');
    process.exit(2);
  }

  const cfg = loadP001Config();
  const hasGa4 = cfg.ga4_property_id?.startsWith('properties/') && !cfg.ga4_property_id.includes('YOUR_');

  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const { sheets, spreadsheetId } = await ensureSpreadsheet(auth, cfg, google);

  console.log('\n=== Project 001 Sync ===\n');
  console.log('Spreadsheet:', spreadsheetId);

  let gsc = { queries: [], pages: [], startDate: '', endDate: '' };
  let ga4 = { daily: [], pages: [], startDate: '', endDate: '' };

  try {
    gsc = await pullGsc(auth, google, cfg);
    console.log('GSC:', gsc.queries.length, 'queries,', gsc.pages.length, 'pages');
  } catch (e) {
    console.warn('GSC pull:', e.message?.slice(0, 200));
  }

  if (hasGa4) {
    try {
      ga4 = await pullGa4(auth, google, cfg);
      console.log('GA4:', ga4.daily.length, 'days,', ga4.pages.length, 'pages');
    } catch (e) {
      console.warn('GA4 pull:', e.message?.slice(0, 200));
    }
  } else {
    console.warn('GA4: skipped (no property_id — run project-001:setup)');
  }

  await clearAndWrite(
    sheets,
    spreadsheetId,
    cfg.sheets.gsc_queries,
    ['query', 'clicks', 'impressions', 'ctr', 'position'],
    gsc.queries,
  );
  await clearAndWrite(
    sheets,
    spreadsheetId,
    cfg.sheets.gsc_pages,
    ['page', 'clicks', 'impressions', 'ctr', 'position'],
    gsc.pages,
  );
  await clearAndWrite(
    sheets,
    spreadsheetId,
    cfg.sheets.ga4_daily,
    ['date', 'activeUsers', 'sessions', 'newUsers', 'screenPageViews'],
    ga4.daily,
  );
  await clearAndWrite(
    sheets,
    spreadsheetId,
    cfg.sheets.ga4_pages,
    ['pagePath', 'activeUsers', 'sessions', 'screenPageViews'],
    ga4.pages,
  );

  const meta = [
    ['key', 'value'],
    ['synced_at', new Date().toISOString()],
    ['gsc_site', cfg.gsc_site_url],
    ['ga4_property', hasGa4 ? cfg.ga4_property_id : '(pending)'],
    ['date_range', `${gsc.startDate} → ${gsc.endDate}`],
    ['gsc_query_rows', String(gsc.queries.length)],
    ['gsc_page_rows', String(gsc.pages.length)],
    ['ga4_daily_rows', String(ga4.daily.length)],
    ['ga4_page_rows', String(ga4.pages.length)],
    ['spreadsheet_id', spreadsheetId],
  ];
  await clearAndWrite(sheets, spreadsheetId, cfg.sheets.meta, meta[0], meta.slice(1));

  const report = {
    timestamp: new Date().toISOString(),
    ok: true,
    spreadsheet_id: spreadsheetId,
    spreadsheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    counts: {
      gsc_queries: gsc.queries.length,
      gsc_pages: gsc.pages.length,
      ga4_daily: ga4.daily.length,
      ga4_pages: ga4.pages.length,
    },
    date_range: { start: gsc.startDate, end: gsc.endDate },
  };

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/last-sync.json`, JSON.stringify(report, null, 2));
  appendSyncHistory({ ok: true, ...report.counts, date_range: report.date_range, spreadsheet_url: report.spreadsheet_url });

  console.log('\n✓ Sync complete');
  console.log(report.spreadsheet_url, '\n');
}

main().catch((e) => {
  console.error('\nSync failed:', e.message || e);
  if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
