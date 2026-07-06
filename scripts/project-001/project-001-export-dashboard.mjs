import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadGoogleAuthLibrary, getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { PATHS } from '../google/_lib/paths.mjs';
import { tokenHasP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { TARGET_PROJECT_ID } from './_lib/legacy-guard.mjs';
import {
  appendAiHistory,
  buildDailyReportFromSync,
  loadAiHistory,
  loadDrafts,
  loadDraftsHistory,
  loadSyncHistory,
  mergeDraftsFromSuggestions,
} from './_lib/history.mjs';

const OUT_PUBLIC = join(P001.root, 'public', 'project-001');
const OUT_AUDIT = join(P001.auditOut, 'dashboard-export.json');

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function connectionStatus(conn, key) {
  const c = conn?.connections?.[key];
  if (!c) return { status: 'unknown', ok: false };
  return {
    status: c.ok ? 'connected' : 'disconnected',
    ok: Boolean(c.ok),
    note: c.note || c.error?.slice(0, 120) || null,
  };
}

function resolveGbpConnection(conn, gbp, gbpSync, tokenMeta) {
  if (gbpSync?.ok && gbpSync?.summary) {
    return { status: 'connected', ok: true, note: gbpSync.location?.title || null };
  }
  if (conn?.connections?.gbp_accounts?.ok) {
    return { status: 'connected', ok: true, note: null };
  }
  const hasOAuth =
    gbpSync?.oauth?.hasBusinessManage ||
    gbp?.oauth?.hasBusinessManage ||
    (tokenMeta?.ok && tokenMeta?.scopeCount >= 15);
  const err = conn?.connections?.gbp_accounts?.error || gbp?.errors?.[0]?.error || gbpSync?.errors?.[0]?.message || '';
  if (
    hasOAuth &&
    (err.includes('Quota exceeded') ||
      err.includes('quota_limit_value') ||
      err.includes('484351148380') ||
      gbpSync?.gaps?.includes('no_location_match'))
  ) {
    return {
      status: 'oauth_connected',
      ok: true,
      note: 'OAuth מחובר — נתוני API ייפתחו לאחר אישור Google Basic API Access (בקשה הוגשה)',
    };
  }
  if (
    err.includes('Quota exceeded') ||
    err.includes('quota_limit_value') ||
    err.includes('484351148380')
  ) {
    return {
      status: 'pending_google_api_approval',
      ok: false,
      note: 'Pending Google API Approval — Basic API Access (quota=0). לא חוסם את הפרויקט.',
    };
  }
  return {
    status: 'disconnected',
    ok: false,
    note: err.slice(0, 120) || null,
  };
}

function resolveAdsConnection(adsProbe, adsSync) {
  if (adsSync?.ok && adsSync?.summary) {
    return {
      status: 'connected',
      ok: true,
      note: adsSync.summary.customerName || adsSync.customerId || null,
    };
  }
  if ((adsProbe?.accessible_customers?.length || 0) > 0 || adsProbe?.ok) {
    const has403 = (adsSync?.errors || []).some((e) =>
      String(e.message || e.error || '').includes('403'),
    );
    if (has403 || adsSync?.owner_gate?.id === 'ads_token_test_or_mcc') {
      return {
        status: 'pending_production_access',
        ok: false,
        note: 'Developer Token Test — בקש Basic/Standard access ב-API Center או הגדר GOOGLE_ADS_LOGIN_CUSTOMER_ID',
      };
    }
    return { status: 'connected', ok: true, note: null };
  }
  if (!adsProbe?.developer_token_set) {
    return {
      status: 'pending_developer_token',
      ok: false,
      note: 'Developer Token missing — https://ads.google.com/aw/apicenter',
    };
  }
  return {
    status: 'disconnected',
    ok: false,
    note: adsProbe?.errors?.[0]?.error?.slice(0, 120) || adsSync?.errors?.[0]?.message?.slice(0, 120) || null,
  };
}

function resolveGtmConnection(gtmProbe) {
  if (gtmProbe?.ok && (gtmProbe?.containers?.length || 0) > 0) {
    const c = gtmProbe.containers[0];
    return {
      status: 'connected',
      ok: true,
      note: c.publicId ? `${c.publicId} — ${c.name}` : c.name || null,
    };
  }
  if (!gtmProbe?.hasTagManagerScope && gtmProbe?.oauth) {
    return {
      status: 'pending_oauth_scope',
      ok: false,
      note: 'חסר scope tagmanager.readonly — npm run project-001:auth -- --force',
    };
  }
  if (gtmProbe && !gtmProbe.ok) {
    return {
      status: 'disconnected',
      ok: false,
      note: gtmProbe.errors?.[0]?.message?.slice(0, 120) || 'ממתין לחיבור',
    };
  }
  return { status: 'pending_oauth_scope', ok: false, note: 'הרץ npm run project-001:gtm-probe לאחר OAuth' };
}

function buildGtmDashboardSlice(gtmProbe, gtmConn, gtmSync) {
  if (!gtmProbe?.ok) {
    return {
      ok: false,
      status: gtmConn.status,
      connectionNote: gtmConn.note,
      containers: [],
    };
  }
  const primary = (gtmSync?.summaries || []).find((s) => s.ok) || null;
  return {
    ok: true,
    status: gtmConn.status,
    syncedAt: gtmSync?.timestamp || gtmProbe.timestamp,
    containers: (gtmProbe.containers || []).slice(0, 10),
    accounts: (gtmProbe.accounts || []).slice(0, 5),
    summary: primary
      ? {
          publicId: primary.publicId,
          containerName: primary.containerName,
          tagCount: primary.tagCount,
          triggerCount: primary.triggerCount,
          variableCount: primary.variableCount,
        }
      : null,
    lastError: gtmSync?.errors?.[0]?.message || gtmProbe.errors?.[0]?.message || null,
  };
}

function buildAdsDashboardSlice(adsSync, adsConn) {
  if (!adsSync?.summary && !adsSync?.campaigns?.length) {
    return {
      ok: false,
      status: adsConn.status,
      pendingToken: adsConn.status === 'pending_developer_token',
      connectionNote: adsConn.note,
    };
  }
  const s = adsSync.summary || {};
  return {
    ok: Boolean(adsSync.ok),
    status: adsConn.status,
    pendingToken: adsConn.status === 'pending_developer_token',
    syncedAt: adsSync.timestamp,
    customerId: adsSync.customerId,
    customerName: s.customerName || adsSync.customer?.descriptiveName || null,
    kpis: {
      impressions: s.impressions ?? null,
      clicks: s.clicks ?? null,
      cost: s.cost ?? null,
      conversions: s.conversions ?? null,
      ctr: s.ctr ?? null,
      cpc: s.cpc ?? null,
      campaignCount: s.campaignCount ?? null,
      currency: s.currency || 'ILS',
    },
    campaigns: (adsSync.campaigns || []).slice(0, 20),
    adGroups: (adsSync.adGroups || []).slice(0, 15),
    keywords: (adsSync.keywords || []).slice(0, 20),
    daily: (adsSync.daily || []).slice(0, 14),
    lastError: adsSync.errors?.[0]?.message || adsConn.note || null,
    policies: {
      publishRequiresApproval: true,
      noAutoPublish: true,
    },
  };
}

function buildGbpDashboardSlice(gbpSync, gbpConn) {
  if (!gbpSync) {
    return {
      ok: false,
      status: gbpConn.status,
      pendingApproval: gbpConn.status === 'pending_google_api_approval',
      connectionNote: gbpConn.note,
    };
  }
  const s = gbpSync.summary || {};
  const perf = gbpSync.performance || {};
  return {
    ok: Boolean(gbpSync.ok),
    status: gbpConn.status,
    pendingApproval: gbpConn.status === 'pending_google_api_approval',
    syncedAt: gbpSync.timestamp,
    location: gbpSync.location || null,
    profile: gbpSync.profile || null,
    kpis: {
      profileViews: s.profileViews ?? null,
      navigations: s.navigations ?? null,
      averageRating: s.averageRating ?? null,
      totalReviews: s.totalReviews ?? null,
      unansweredReviews: s.unansweredReviews ?? null,
      calls: s.calls ?? null,
      messages: s.messages ?? null,
      websiteClicks: perf.websiteClicks ?? null,
      postsCount: s.postsCount ?? null,
    },
    performance: {
      dateRange: perf.dateRange || null,
      metrics: perf.metrics || {},
      searchKeywords: perf.searchKeywords || [],
    },
    reviews: (gbpSync.reviews?.reviews || []).slice(0, 20),
    posts: (gbpSync.posts?.posts || []).slice(0, 20),
    qa: gbpSync.qa?.questions || [],
    gaps: gbpSync.gaps || [],
    apisUsed: gbpSync.apisUsed || [],
    lastError: gbpSync.errors?.[0]?.message || gbpConn.note || null,
    policies: {
      publishRequiresApproval: true,
      noAutoPublish: true,
    },
  };
}

function computeStats(keywords, gscPages, ga4Summary, suggestions, drafts, needing) {
  const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0);
  const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0);
  const avgPosition =
    keywords.length > 0
      ? keywords.reduce((s, k) => s + k.position, 0) / keywords.length
      : gscPages.length > 0
        ? gscPages.reduce((s, p) => s + p.position, 0) / gscPages.length
        : null;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : null;
  return {
    avgPosition: avgPosition != null ? Number(avgPosition.toFixed(1)) : null,
    totalClicks,
    totalImpressions,
    avgCtr: avgCtr != null ? Number((avgCtr * 100).toFixed(2)) : null,
    activeKeywords: keywords.length,
    opportunities: suggestions.length,
    weakPages: needing.length,
    pendingDrafts: drafts.filter((d) => d.status === 'pending_approval').length,
    ga4Sessions: ga4Summary?.totalSessions ?? null,
    ga4PageViews: ga4Summary?.totalPageViews ?? null,
  };
}

function parseGscRows(rows) {
  return rows.map(([query, clicks, impressions, ctr, position]) => ({
    query: String(query),
    clicks: Number(clicks),
    impressions: Number(impressions),
    ctr: Number(ctr),
    position: Number(position),
  }));
}

function parseGscPageRows(rows) {
  return rows.map(([page, clicks, impressions, ctr, position]) => ({
    page: String(page),
    clicks: Number(clicks),
    impressions: Number(impressions),
    ctr: Number(ctr),
    position: Number(position),
  }));
}

function parseGa4Daily(rows) {
  return rows.map(([date, activeUsers, sessions, newUsers, screenPageViews]) => ({
    date: String(date),
    activeUsers: Number(activeUsers),
    sessions: Number(sessions),
    newUsers: Number(newUsers),
    screenPageViews: Number(screenPageViews),
  }));
}

function parseGa4Pages(rows) {
  return rows.map(([pagePath, activeUsers, sessions, screenPageViews]) => ({
    pagePath: String(pagePath),
    activeUsers: Number(activeUsers),
    sessions: Number(sessions),
    screenPageViews: Number(screenPageViews),
  }));
}

function pagesNeedingImprovement(gscPages) {
  return gscPages
    .filter((p) => p.impressions >= 50 && (p.ctr < 0.02 || p.position > 15))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15)
    .map((p) => ({
      page: p.page,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      position: p.position,
      reason:
        p.ctr < 0.02 && p.position > 15
          ? 'CTR נמוך ומיקום גבוה ב-SERP'
          : p.ctr < 0.02
            ? 'CTR נמוך — כותרת/תיאור דורשים שיפור'
            : 'מיקום גבוה — פוטנציאל לעלייה בדירוג',
    }));
}

function aiSeoSuggestions({ keywords, pagesNeeding, connectionsOk }) {
  const suggestions = [];
  if (!connectionsOk.gsc) {
    suggestions.push({
      priority: 'high',
      title: 'הפעל Search Console API',
      detail: 'לאחר הפעלה, הרץ sync כדי למשוך מילות מפתח ועמודים.',
    });
  }
  for (const p of pagesNeeding.slice(0, 5)) {
    suggestions.push({
      priority: 'medium',
      title: `שפר עמוד: ${p.page.replace(/^https?:\/\/[^/]+/, '') || p.page}`,
      detail: `${p.reason}. ${p.impressions} חשיפות, CTR ${(p.ctr * 100).toFixed(1)}%, מיקום ${p.position.toFixed(1)}.`,
    });
  }
  const lowCtrKw = keywords.filter((k) => k.impressions >= 30 && k.ctr < 0.03).slice(0, 5);
  for (const k of lowCtrKw) {
    suggestions.push({
      priority: 'medium',
      title: `מילת מפתח: "${k.query}"`,
      detail: `חשיפות גבוהות (${k.impressions}) עם CTR נמוך — בדוק intent ו-meta tags.`,
    });
  }
  if (!suggestions.length) {
    suggestions.push({
      priority: 'low',
      title: 'ממתין לנתוני GSC',
      detail: 'לאחר חיבור מלא, AI יציע שיפורי כותרות, תוכן וקישורים פנימיים.',
    });
  }
  return suggestions;
}

async function tryReadSheetData(cfg, conn) {
  if (!conn?.connections?.sheets?.ok || !cfg.spreadsheet_id) {
    return null;
  }
  try {
    const auth = await getAuthenticatedClient({ scopes: (await import('./_lib/auth.mjs')).getP001Scopes() });
    const google = await loadGoogleAuthLibrary();
    const sheets = google.sheets({ version: 'v4', auth });
    const id = cfg.spreadsheet_id;
    const tabs = [
      { key: 'queries', tab: cfg.sheets.gsc_queries, range: 'A2:E' },
      { key: 'pages', tab: cfg.sheets.gsc_pages, range: 'A2:E' },
      { key: 'ga4Daily', tab: cfg.sheets.ga4_daily, range: 'A2:E' },
      { key: 'ga4Pages', tab: cfg.sheets.ga4_pages, range: 'A2:D' },
    ];
    const out = {};
    for (const { key, tab, range } of tabs) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${tab}!${range}`,
      });
      out[key] = res.data.values || [];
    }
    return out;
  } catch (e) {
    return { error: e.message?.slice(0, 200) };
  }
}

function buildActivityLog({ lastSync, conn, probe, gbp, syncHistory }) {
  const entries = [];
  const push = (ts, action, status, detail, source) => {
    if (ts) entries.push({ timestamp: ts, action, status, detail, source });
  };
  for (const s of (syncHistory || []).slice(0, 10)) {
    push(
      s.timestamp,
      'Sync',
      s.ok ? 'success' : 'error',
      `GSC ${s.gsc_queries ?? 0} queries · GA4 ${s.ga4_daily ?? 0} days`,
      'Project001 Sync → Google Sheets',
    );
  }
  push(conn?.timestamp, 'Connections probe', conn?.ok ? 'success' : 'warning', 'Google APIs connectivity check', 'GCP / OAuth');
  push(probe?.timestamp, 'Data probe', probe?.ok ? 'success' : 'warning', 'GSC sites + GA4 properties', 'Search Console + GA4');
  push(lastSync?.timestamp, 'Data sync', lastSync?.ok ? 'success' : 'error', lastSync?.spreadsheet_url || '', 'Google Sheets');
  push(
    gbp?.timestamp,
    'GBP probe',
    gbp?.ok ? 'success' : 'warning',
    gbp?.matched_business?.title || gbp?.errors?.[0]?.error?.slice(0, 80) || 'No match',
    'Google Business Profile API',
  );
  return entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function buildDailyReports(lastSync, ga4Daily) {
  const reports = [];
  if (lastSync?.ok && lastSync.counts) {
    reports.push({
      date: lastSync.timestamp?.slice(0, 10),
      label: 'סנכרון אחרון',
      sessions: ga4Daily.reduce((s, r) => s + r.sessions, 0),
      pageViews: ga4Daily.reduce((s, r) => s + r.screenPageViews, 0),
      gscQueries: lastSync.counts.gsc_queries,
      gscPages: lastSync.counts.gsc_pages,
      range: lastSync.date_range,
    });
  }
  return reports;
}

async function main() {
  const cfg = loadP001Config();
  const conn = loadJson(join(P001.auditOut, 'connections-probe.json'));
  const probe = loadJson(join(P001.auditOut, 'probe.json'));
  const lastSync = loadJson(join(P001.auditOut, 'last-sync.json'));
  const gbp = loadJson(join(P001.auditOut, 'gbp-probe.json'));
  const gbpSync = loadJson(join(P001.auditOut, 'gbp-sync.json'));
  const adsProbe = loadJson(join(P001.auditOut, 'ads-probe.json'));
  const adsSync = loadJson(join(P001.auditOut, 'ads-sync.json'));
  const gtmProbe = loadJson(join(P001.auditOut, 'gtm-probe.json'));
  const gtmSync = loadJson(join(P001.auditOut, 'gtm-sync.json'));

  const tokenOk = tokenHasP001Scopes();
  let tokenMeta = { ok: false };
  if (existsSync(PATHS.token)) {
    const t = JSON.parse(readFileSync(PATHS.token, 'utf8'));
    tokenMeta = {
      ok: tokenOk,
      scopeCount: String(t.scope || '').split(/\s+/).filter(Boolean).length,
      hasRefresh: Boolean(t.refresh_token),
      expiry: t.expiry_date ? new Date(t.expiry_date).toISOString() : null,
    };
  }

  const connectionsOk = {
    gsc: conn?.connections?.gsc?.ok === true,
    ga4: conn?.connections?.ga4?.ok === true,
    sheets: conn?.connections?.sheets?.ok === true,
    drive: conn?.connections?.drive?.ok === true,
    docs: conn?.connections?.docs?.ok === true,
    gmail: conn?.connections?.gmail?.ok === true,
    gbp: conn?.connections?.gbp_accounts?.ok === true,
  };

  const sheetRaw = await tryReadSheetData(cfg, conn);
  let keywords = [];
  let gscPages = [];
  let ga4Daily = [];
  let ga4Pages = [];
  let dataSource = 'none';

  if (sheetRaw && !sheetRaw.error) {
    keywords = parseGscRows(sheetRaw.queries || []);
    gscPages = parseGscPageRows(sheetRaw.pages || []);
    ga4Daily = parseGa4Daily(sheetRaw.ga4Daily || []);
    ga4Pages = parseGa4Pages(sheetRaw.ga4Pages || []);
    dataSource = 'sheets';
  } else if (lastSync?.counts?.ga4_daily) {
    dataSource = 'last-sync-metadata-only';
  }

  const needing = pagesNeedingImprovement(gscPages);
  const suggestions = aiSeoSuggestions({ keywords, pagesNeeding: needing, connectionsOk });
  appendAiHistory(suggestions);
  const drafts = mergeDraftsFromSuggestions(suggestions);
  const syncHistory = loadSyncHistory();
  const aiHistory = loadAiHistory();
  const draftsHistory = loadDraftsHistory();
  const dailyReport = buildDailyReportFromSync(lastSync, ga4Daily, keywords, suggestions, drafts);

  const ga4Summary =
    ga4Daily.length > 0
      ? {
          totalSessions: ga4Daily.reduce((s, r) => s + r.sessions, 0),
          totalUsers: ga4Daily.reduce((s, r) => s + r.activeUsers, 0),
          totalPageViews: ga4Daily.reduce((s, r) => s + r.screenPageViews, 0),
          days: ga4Daily.length,
        }
      : lastSync?.counts?.ga4_daily
        ? {
            totalSessions: null,
            totalUsers: null,
            totalPageViews: null,
            days: lastSync.counts.ga4_daily,
            note: 'נתונים במאגר — נדרש sync לאחר הפעלת APIs',
          }
        : null;

  const topKeywords = [...keywords].sort((a, b) => b.clicks - a.clicks).slice(0, 50);
  const topPages = [...gscPages].sort((a, b) => b.clicks - a.clicks).slice(0, 50);
  const stats = computeStats(topKeywords, topPages, ga4Summary, suggestions, drafts, needing);
  const gbpConn = resolveGbpConnection(conn, gbp, gbpSync, tokenMeta);
  const businessProfileData = buildGbpDashboardSlice(gbpSync, gbpConn);
  const adsConn = resolveAdsConnection(adsProbe, adsSync);
  const googleAdsData = buildAdsDashboardSlice(adsSync, adsConn);
  const gtmConn = resolveGtmConnection(gtmProbe);
  const googleTagManagerData = buildGtmDashboardSlice(gtmProbe, gtmConn, gtmSync);

  const dashboard = {
    version: 2,
    generatedAt: new Date().toISOString(),
    project: {
      id: TARGET_PROJECT_ID,
      name: 'Project001AIMarketing',
      account: conn?.account || null,
      site: cfg.gsc_site_url,
      ga4Property: cfg.ga4_property_id,
    },
    token: tokenMeta,
    connections: {
      searchConsole: connectionStatus(conn, 'gsc'),
      analytics4: connectionStatus(conn, 'ga4'),
      businessProfile: gbpConn,
      googleAds: adsConn,
      googleTagManager: gtmConn,
      drive: connectionStatus(conn, 'drive'),
      sheets: connectionStatus(conn, 'sheets'),
      docs: connectionStatus(conn, 'docs'),
      gmail: connectionStatus(conn, 'gmail'),
      appsScript: connectionStatus(conn, 'apps_script'),
    },
    probe: {
      gscSites: probe?.gsc?.sites?.length ?? conn?.connections?.gsc?.sites ?? 0,
      ga4Properties: probe?.ga4?.properties?.length ?? 0,
      configuredGsc: cfg.gsc_site_url,
      configuredGa4: cfg.ga4_property_id,
    },
    gbp: {
      ok: Boolean(gbpSync?.ok || gbp?.ok),
      status: gbpConn.status,
      pendingApproval: gbpConn.status === 'pending_google_api_approval',
      matchedBusiness: gbpSync?.location || gbp?.matched_business || null,
      locations: gbpSync?.location ? 1 : gbp?.locations?.length ?? 0,
      hint: cfg.gbp_business_hint,
      lastError: businessProfileData.lastError,
      summary: gbpSync?.summary || null,
    },
    businessProfileData,
    googleAds: {
      ok: Boolean(adsSync?.ok || adsProbe?.ok),
      status: adsConn.status,
      pendingToken: adsConn.status === 'pending_developer_token',
      customerId: adsSync?.customerId || adsProbe?.customer_id || null,
      lastError: googleAdsData.lastError,
      summary: adsSync?.summary || null,
    },
    googleAdsData,
    googleTagManager: {
      ok: Boolean(gtmProbe?.ok),
      status: gtmConn.status,
      lastError: googleTagManagerData.lastError || gtmConn.note,
      containers: googleTagManagerData.containers || [],
    },
    googleTagManagerData,
    stats,
    dataSource,
    lastSync: lastSync || null,
    searchConsole: {
      keywords: topKeywords,
      pages: topPages,
      dateRange: lastSync?.date_range || null,
    },
    analytics4: {
      summary: ga4Summary,
      daily: ga4Daily.slice(-14),
      topPages: ga4Pages.slice(0, 15),
    },
    pagesNeedingImprovement: needing,
    aiSeoSuggestions: suggestions,
    drafts,
    history: {
      sync: syncHistory.slice(0, 20),
      ai: aiHistory.slice(0, 10),
      drafts: draftsHistory.slice(0, 20),
    },
    activityLog: buildActivityLog({ lastSync, conn, probe, gbp, syncHistory }),
    dailyReports: [dailyReport, ...buildDailyReports(lastSync, ga4Daily)].filter(Boolean),
    appsScript: {
      template: 'integrations/google/apps-script/project001-sync.gs',
      note: 'Deploy via clasp — triggers log sync requests to Sheet _Meta tab',
      spreadsheetId: cfg.spreadsheet_id,
    },
    sync: {
      command: 'npm run project-001:sync-and-export',
      apiDev: '/api/project-001/sync',
      spreadsheetUrl: lastSync?.spreadsheet_url || (cfg.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheet_id}` : null),
    },
    siteCrawl: loadJson(join(P001.auditOut, 'site-crawl.json'))?.crawl?.summary || null,
    siteInfra: loadJson(join(P001.auditOut, 'site-infra.json')) || null,
    competitors: loadJson(join(P001.auditOut, 'competitors.json')) || null,
    indexing: loadJson(join(P001.auditOut, 'indexing-inspection.json')) || null,
    officialSite: cfg.official_site || cfg.gsc_site_url,
    policies: {
      publishRequiresApproval: true,
      aiRecommendationsOnly: true,
      noAutoPublish: true,
    },
  };

  mkdirSync(OUT_PUBLIC, { recursive: true });
  writeFileSync(join(OUT_PUBLIC, 'dashboard.json'), JSON.stringify(dashboard, null, 2));
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(OUT_AUDIT, JSON.stringify(dashboard, null, 2));

  console.log('\n=== Dashboard export ===\n');
  console.log('Written:', join(OUT_PUBLIC, 'dashboard.json'));
  console.log('Data source:', dataSource);
  console.log('Connections OK:', Object.entries(connectionsOk).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none)');
  console.log('\nOpen: /dev/project-001/dashboard\n');
}

main().catch((e) => {
  console.error('Export failed:', e.message || e);
  process.exit(1);
});
