/**
 * Dalia SEO — export REAL Google data (read-only) for the public staging UI.
 * Uses the existing Project-001 OAuth token (integrations/google/token.json, never committed).
 * Output: public/project-001/seo-google-latest.json — contains only metrics, no tokens.
 *
 *   node scripts/dalia-seo/export-google-data.mjs
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes } from '../project-001/_lib/auth.mjs';

const GSC_SITE = 'sc-domain:dalia-c.com';
const GA4_PROPERTY = 'properties/545246030';
const DAYS = 84; // 12 full weeks, matches the UI history chart
const WEEKS = 12;

const fmt = (d) => d.toISOString().slice(0, 10);
const pathOf = (u) => { try { return decodeURIComponent(new URL(u).pathname); } catch { return u; } };

async function main() {
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const me = await google.oauth2({ version: 'v2', auth }).userinfo.get();
  const out = { version: 1, fetchedAt: new Date().toISOString(), account: me.data.email, gsc: null, ga4: null };

  // ---- Search Console ----
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 2); // GSC data lags ~2 days
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - DAYS + 1);
  const range = { startDate: fmt(start), endDate: fmt(end) };
  try {
    const sc = google.searchconsole({ version: 'v1', auth });
    const q = async (dimensions) => (await sc.searchanalytics.query({ siteUrl: GSC_SITE, requestBody: { ...range, dimensions, rowLimit: 25000 } })).data.rows || [];
    const [byQuery, byPage, byQueryPage, byQueryDate, byDate] = await Promise.all([
      q(['query']), q(['page']), q(['query', 'page']), q(['query', 'date']), q(['date']),
    ]);
    // main page per query = the page with most impressions for it
    const topPage = new Map();
    for (const r of byQueryPage) {
      const [query, page] = r.keys;
      if (!topPage.has(query) || topPage.get(query).impressions < r.impressions) topPage.set(query, { page, impressions: r.impressions });
    }
    // weekly impression-weighted average position per query (null = no impressions that week)
    const weekOf = (d) => Math.min(WEEKS - 1, Math.max(0, Math.floor((Date.parse(d) - Date.parse(range.startDate)) / (7 * 86400000))));
    const hist = new Map();
    for (const r of byQueryDate) {
      const [query, date] = r.keys;
      if (!hist.has(query)) hist.set(query, Array.from({ length: WEEKS }, () => ({ w: 0, p: 0 })));
      const b = hist.get(query)[weekOf(date)];
      b.w += r.impressions; b.p += r.position * r.impressions;
    }
    // last 28 days vs the 28 days before (GSC's own comparison), impression-weighted
    const cut1 = Date.parse(range.endDate) - 27 * 86400000, cut0 = cut1 - 28 * 86400000;
    const win = new Map();
    for (const r of byQueryDate) {
      const [query, date] = r.keys, t = Date.parse(date);
      const key = t >= cut1 ? 'cur' : t >= cut0 ? 'prev' : null;
      if (!key) continue;
      if (!win.has(query)) win.set(query, { cur: { w: 0, p: 0, c: 0 }, prev: { w: 0, p: 0, c: 0 } });
      const b = win.get(query)[key]; b.w += r.impressions; b.p += r.position * r.impressions; b.c += r.clicks;
    }
    const winOf = (q, k) => { const b = win.get(q)?.[k]; return b && b.w ? { position: +(b.p / b.w).toFixed(1), impressions: b.w, clicks: b.c } : null; };
    const weeklyTotals = Array.from({ length: WEEKS }, () => ({ clicks: 0, impressions: 0, posW: 0 }));
    for (const r of byDate) { const b = weeklyTotals[weekOf(r.keys[0])]; b.clicks += r.clicks; b.impressions += r.impressions; b.posW += r.position * r.impressions; }
    const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
    const totClicks = sum(byDate, 'clicks'), totImpr = sum(byDate, 'impressions');
    out.gsc = {
      ok: true, site: GSC_SITE, range,
      totals: { clicks: totClicks, impressions: totImpr, ctr: totImpr ? totClicks / totImpr : 0, position: totImpr ? byDate.reduce((a, r) => a + r.position * r.impressions, 0) / totImpr : null },
      weekly: weeklyTotals.map((b) => ({ clicks: b.clicks, impressions: b.impressions, position: b.impressions ? +(b.posW / b.impressions).toFixed(1) : null })),
      queries: byQuery.map((r) => ({
        query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: +r.position.toFixed(1),
        page: topPage.has(r.keys[0]) ? pathOf(topPage.get(r.keys[0]).page) : '',
        hist: (hist.get(r.keys[0]) || []).map((b) => (b.w ? +(b.p / b.w).toFixed(1) : null)),
        last28: winOf(r.keys[0], 'cur'), prev28: winOf(r.keys[0], 'prev'),
      })).sort((a, b) => b.impressions - a.impressions),
      pages: byPage.map((r) => ({ page: pathOf(r.keys[0]), url: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: +r.position.toFixed(1) }))
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
      note: 'Search Console hides rare/anonymized queries, so query clicks can be lower than page clicks.',
    };
  } catch (e) {
    out.gsc = { ok: false, site: GSC_SITE, error: String(e.message || e).slice(0, 300) };
  }

  // ---- GA4 ----
  try {
    const ga = google.analyticsdata({ version: 'v1beta', auth });
    const r = await ga.properties.runReport({ property: GA4_PROPERTY, requestBody: { dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'activeUsers' }] } });
    const any = await ga.properties.runReport({ property: GA4_PROPERTY, requestBody: { dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }], metrics: [{ name: 'sessions' }] } });
    const v = r.data.rows?.[0]?.metricValues?.map((m) => Number(m.value)) || null;
    const everSessions = Number(any.data.rows?.[0]?.metricValues?.[0]?.value || 0);
    const adm = google.analyticsadmin({ version: 'v1beta', auth });
    const ds = await adm.properties.dataStreams.list({ parent: GA4_PROPERTY });
    out.ga4 = {
      apiOk: true, property: GA4_PROPERTY,
      measurementId: ds.data.dataStreams?.[0]?.webStreamData?.measurementId || null,
      last28d: v ? { sessions: v[0], pageViews: v[1], users: v[2] } : null,
      everSessions,
      hasData: everSessions > 0,
    };
  } catch (e) {
    out.ga4 = { apiOk: false, property: GA4_PROPERTY, error: String(e.message || e).slice(0, 300) };
  }
  // Which GA4 tag the live site really loads (via its GTM container) — read-only.
  try {
    const html = await (await fetch('https://dalia-c.com/')).text();
    const gtm = (html.match(/GTM-[A-Z0-9]+/) || [])[0];
    let ids = [...new Set(html.match(/G-[A-Z0-9]{8,12}/g) || [])];
    if (gtm) ids = [...new Set([...ids, ...((await (await fetch(`https://www.googletagmanager.com/gtm.js?id=${gtm}`)).text()).match(/G-[A-Z0-9]{8,12}/g) || [])])];
    out.ga4 = { ...out.ga4, siteGtm: gtm || null, siteMeasurementIds: ids };
  } catch { /* optional */ }

  const file = join(process.cwd(), 'public', 'project-001', 'seo-google-latest.json');
  writeFileSync(file, JSON.stringify(out));
  console.log(JSON.stringify({
    file, account: out.account,
    gsc: out.gsc.ok ? { queries: out.gsc.queries.length, pages: out.gsc.pages.length, ...out.gsc.totals, range: out.gsc.range } : out.gsc,
    ga4: out.ga4,
  }, null, 2));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
